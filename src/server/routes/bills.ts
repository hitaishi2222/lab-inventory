import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, like, or, inArray, sql } from 'drizzle-orm'
import { db, atomic } from '../db'
import { bills, billItems, items, users } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { likeContains } from '../lib/query'

export const billsRouter = new Hono()

const lineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().min(0),
  amount: z.number().min(0),
})

const billSchema = z.object({
  billNumber: z.string().min(1).max(100),
  vendorName: z.string().min(1).max(200),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  amount: z.number().min(0),
  notes: z.string().max(5000).optional(),
  items: z.array(lineSchema).max(200).default([]),
})

type BillRow = typeof bills.$inferSelect

/** Attach "who ticked it" names without a join per column. */
async function withTickerNames(rows: BillRow[]) {
  const ids = [
    ...new Set(rows.flatMap((b) => [b.receivedFromVendorBy, b.submittedToUniversityBy])),
  ].filter((id): id is string => Boolean(id))
  if (ids.length === 0) return rows
  const people = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids))
  const nameById = new Map(people.map((p) => [p.id, p.name]))
  return rows.map((b) => ({
    ...b,
    receivedFromVendorByName: b.receivedFromVendorBy ? nameById.get(b.receivedFromVendorBy) ?? null : null,
    submittedToUniversityByName: b.submittedToUniversityBy ? nameById.get(b.submittedToUniversityBy) ?? null : null,
  }))
}

// GET /api/bills — list (newest bill date first). Search hits bill number,
// vendor and notes; the table itself only shows date, number and vendor.
billsRouter.get('/', requireAuth, requirePermission('bills:view'), async (c) => {
  const { search } = c.req.query()
  const where = search?.trim()
    ? or(
        like(bills.billNumber, likeContains(search)),
        like(bills.vendorName, likeContains(search)),
        like(bills.notes, likeContains(search)),
      )
    : undefined

  const rows = await db
    .select()
    .from(bills)
    .where(where)
    // id breaks ties: bill_date is day-resolution text.
    .orderBy(desc(bills.billDate), desc(bills.createdAt), desc(bills.id))

  return c.json({ bills: await withTickerNames(rows) })
})

// GET /api/bills/:id — bill + printed lines + the inventory items it created.
billsRouter.get('/:id', requireAuth, requirePermission('bills:view'), async (c) => {
  const id = c.req.param('id')!
  const bill = await db.select().from(bills).where(eq(bills.id, id)).get()
  if (!bill) return c.json({ error: 'Not found' }, 404)

  const [lines, linked, enriched] = await Promise.all([
    db.select().from(billItems).where(eq(billItems.billId, id)),
    db
      .select({
        id: items.id,
        name: items.name,
        categoryId: items.categoryId,
        quantity: items.quantity,
        unit: items.unit,
      })
      .from(items)
      .where(eq(items.billId, id)),
    withTickerNames([bill]),
  ])

  return c.json({ ...enriched[0], items: lines, inventoryItems: linked })
})

// POST /api/bills
billsRouter.post('/', requireAuth, requirePermission('bills:manage'), async (c) => {
  const parsed = billSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { items: lines, ...bill } = parsed.data
  const id = crypto.randomUUID()
  const user = c.get('user') as { id: string }

  await atomic([
    db.insert(bills).values({ id, ...bill }),
    ...(lines.length
      ? [db.insert(billItems).values(lines.map((l) => ({ id: crypto.randomUUID(), billId: id, ...l })))]
      : []),
  ])

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entityType: 'Bill',
    entityId: id,
    details: { billNumber: bill.billNumber, vendorName: bill.vendorName, amount: bill.amount },
  })

  return c.json({ id, message: 'Bill created' }, 201)
})

// PUT /api/bills/:id — fields and printed lines are replaced together.
billsRouter.put('/:id', requireAuth, requirePermission('bills:manage'), async (c) => {
  const id = c.req.param('id')!
  const parsed = billSchema.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const existing = await db.select({ id: bills.id }).from(bills).where(eq(bills.id, id)).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const { items: lines, ...bill } = parsed.data
  const user = c.get('user') as { id: string }

  await atomic([
    db.update(bills).set({ ...bill, updatedAt: sql`(datetime('now'))` }).where(eq(bills.id, id)),
    db.delete(billItems).where(eq(billItems.billId, id)),
    ...(lines.length
      ? [db.insert(billItems).values(lines.map((l) => ({ id: crypto.randomUUID(), billId: id, ...l })))]
      : []),
  ])

  await logAudit({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'Bill',
    entityId: id,
    details: { billNumber: bill.billNumber, vendorName: bill.vendorName, amount: bill.amount },
  })

  return c.json({ message: 'Bill updated' })
})

// POST /api/bills/:id/tick — tick or untick a checkpoint, recording who did it.
billsRouter.post('/:id/tick', requireAuth, requirePermission('bills:manage'), async (c) => {
  const id = c.req.param('id')!
  const parsed = z
    .object({ checkpoint: z.enum(['RECEIVED', 'SUBMITTED']), ticked: z.boolean() })
    .safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const existing = await db.select().from(bills).where(eq(bills.id, id)).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const user = c.get('user') as { id: string; name: string }
  const { checkpoint, ticked } = parsed.data
  const at = ticked ? new Date().toISOString() : null

  await db
    .update(bills)
    .set(
      checkpoint === 'RECEIVED'
        ? { receivedFromVendorBy: ticked ? user.id : null, receivedFromVendorAt: at, updatedAt: sql`(datetime('now'))` }
        : { submittedToUniversityBy: ticked ? user.id : null, submittedToUniversityAt: at, updatedAt: sql`(datetime('now'))` },
    )
    .where(eq(bills.id, id))

  await logAudit({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'Bill',
    entityId: id,
    details: {
      billNumber: existing.billNumber,
      checkpoint,
      ticked,
    },
  })

  return c.json({ message: ticked ? 'Tick recorded' : 'Tick cleared' })
})

// DELETE /api/bills/:id — inventory items survive and lose the link.
billsRouter.delete('/:id', requireAuth, requirePermission('bills:manage'), async (c) => {
  const id = c.req.param('id')!
  const existing = await db.select().from(bills).where(eq(bills.id, id)).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const user = c.get('user') as { id: string }

  // Explicit child cleanup instead of relying on ON DELETE: same pattern as
  // the item delete, which libsql's foreign_keys enforcement makes necessary.
  await atomic([
    db.delete(billItems).where(eq(billItems.billId, id)),
    db.update(items).set({ billId: null }).where(eq(items.billId, id)),
    db.delete(bills).where(eq(bills.id, id)),
  ])

  await logAudit({
    userId: user.id,
    action: 'DELETE',
    entityType: 'Bill',
    entityId: id,
    details: { billNumber: existing.billNumber, vendorName: existing.vendorName },
  })

  return c.json({ message: 'Bill deleted' })
})
