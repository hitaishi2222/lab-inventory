import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, sql, and, count } from 'drizzle-orm'
import { db, atomic } from '../db'
import { usageLogs, items, equipmentDetails } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { createNotification } from '../lib/notifications'
import { parsePagination } from '../lib/query'

export const usageRouter = new Hono()

// POST /api/usage - Log usage
usageRouter.post(
  '/',
  requireAuth,
  requirePermission('usage:log'),
  async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    itemId: z.string(),
    quantityUsed: z.number().positive(),
    notes: z.string().optional(),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const user = c.get('user') as { id: string }

  const item = await db.select().from(items).where(eq(items.id, parsed.data.itemId)).get()
  if (!item) return c.json({ error: 'Item not found' }, 404)

  // Equipment is tracked by checkout/return, not by consumable quantity —
  // logging usage here would corrupt availability and fire bogus low-stock
  // alerts for expensive one-off instruments.
  const isEquipment = await db.select({ id: equipmentDetails.id }).from(equipmentDetails).where(eq(equipmentDetails.itemId, item.id)).get()
  if (isEquipment) {
    return c.json({ error: 'Cannot log consumable usage for equipment. Use check-out / return instead.' }, 400)
  }

  // Atomic decrement: the guard lives in both statements, so two people logging
  // usage at the same moment cannot both pass it, and stock cannot silently go
  // negative. The log row is an INSERT ... SELECT that only produces a row when
  // stock allows it; the UPDATE returns the new quantity, and no rows there is
  // the 409 (nothing was written: a batch is one transaction).
  const logId = crypto.randomUUID()
  const [, updated] = await atomic([
    db.insert(usageLogs).select(sql`
      SELECT ${logId}, ${item.id}, ${user.id}, ${parsed.data.quantityUsed},
             datetime('now'), ${parsed.data.notes ?? null}, datetime('now')
      FROM items WHERE id = ${item.id} AND quantity >= ${parsed.data.quantityUsed}
    `),
    db.update(items)
      .set({ quantity: sql`${items.quantity} - ${parsed.data.quantityUsed}`, updatedAt: sql`(datetime('now'))` })
      .where(and(eq(items.id, item.id), sql`${items.quantity} >= ${parsed.data.quantityUsed}`))
      .returning({ quantity: items.quantity }),
  ])

  if (updated.length === 0) {
    return c.json(
      { error: `Not enough stock: ${item.quantity} ${item.unit} available, ${parsed.data.quantityUsed} requested.` },
      409,
    )
  }
  const newQty = updated[0].quantity

  if (newQty <= item.minStockThreshold) {
    await createNotification({
      type: 'LOW_STOCK',
      title: 'Low Stock Alert',
      message: `${item.name} is below threshold (${newQty} ${item.unit} remaining)`,
      link: `/inventory/${item.id}`,
    })
  }

  await logAudit({ userId: user.id, action: 'CREATE', entityType: 'UsageLog', entityId: logId, details: { ...parsed.data, itemName: item.name, unit: item.unit } })

  return c.json({ id: logId, message: 'Usage logged', newQuantity: newQty }, 201)
})

// GET /api/usage - List usage logs (filters + pagination pushed into SQL)
usageRouter.get('/', requireAuth, async (c) => {
  const { itemId, userId } = c.req.query()
  const { page, limit, offset } = parsePagination(c.req.query())

  const filters = [itemId ? eq(usageLogs.itemId, itemId) : undefined, userId ? eq(usageLogs.userId, userId) : undefined]
    .filter((f): f is NonNullable<typeof f> => f !== undefined)
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)

  const [logs, totals] = await Promise.all([
    db
      .select()
      .from(usageLogs)
      .where(where)
      .orderBy(desc(usageLogs.usedAt), desc(usageLogs.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(usageLogs).where(where).get(),
  ])

  return c.json({ logs, total: totals?.n ?? 0, page, limit })
})

// GET /api/usage/:id - Single usage log entry
usageRouter.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')!
  const log = await db.select().from(usageLogs).where(eq(usageLogs.id, id)).get()
  if (!log) return c.json({ error: 'Not found' }, 404)
  return c.json(log)
})
