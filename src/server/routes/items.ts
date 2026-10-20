import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, like, or, sql, inArray, count } from 'drizzle-orm'
import { db } from '../db'
import {
  items,
  chemicalDetails,
  equipmentDetails,
  equipmentCheckouts,
  equipmentReservations,
  usageLogs,
} from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { likeContains, parsePagination } from '../lib/query'

export const itemsRouter = new Hono()

// GET /api/items - List items with search + pagination (filter/count/limit all
// pushed into SQL; the response shape is unchanged).
itemsRouter.get('/', requireAuth, async (c) => {
  const { search } = c.req.query()
  const { page, limit, offset } = parsePagination(c.req.query())

  // Name, description and location all match — a search for "shelf 3" used to
  // return nothing even though every item carries that location.
  const where = search?.trim()
    ? or(
        like(items.name, likeContains(search)),
        like(items.description, likeContains(search)),
        like(items.location, likeContains(search)),
      )
    : undefined

  const [rows, totals] = await Promise.all([
    // id is the tiebreaker: createdAt is second-resolution text, so several
    // items created in the same second would otherwise shuffle between pages
    // and could be shown twice or skipped entirely.
    db
      .select()
      .from(items)
      .where(where)
      .orderBy(desc(items.createdAt), desc(items.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(items).where(where).get(),
  ])

  const total = totals?.n ?? 0

  // Attach nested details (same shape as GET /api/items/:id). The list is
  // what Inventory and Equipment render from — without this, item.equipment /
  // item.chemical are undefined and every equipment-aware display
  // (availability badges, stock-badge suppression, expiry filter) breaks.
  // Two queries for the whole page, not two per row.
  const pageIds = rows.map((i) => i.id)
  const [chemicals, equipments] = await Promise.all([
    pageIds.length
      ? db.select().from(chemicalDetails).where(inArray(chemicalDetails.itemId, pageIds))
      : [],
    pageIds.length
      ? db.select().from(equipmentDetails).where(inArray(equipmentDetails.itemId, pageIds))
      : [],
  ])
  const chemicalByItem = new Map(chemicals.map((cd) => [cd.itemId, cd]))
  const equipmentByItem = new Map(equipments.map((ed) => [ed.itemId, ed]))
  const enriched = rows.map((i) => ({
    ...i,
    chemical: chemicalByItem.get(i.id) ?? null,
    equipment: equipmentByItem.get(i.id) ?? null,
  }))

  return c.json({ items: enriched, total, page, limit })
})

// GET /api/items/:id - Get single item
itemsRouter.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')!
  const item = await db.select().from(items).where(eq(items.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)

  const chemical = await db.select().from(chemicalDetails).where(eq(chemicalDetails.itemId, id)).get()
  const equipment = await db.select().from(equipmentDetails).where(eq(equipmentDetails.itemId, id)).get()

  return c.json({ ...item, chemical, equipment })
})

// POST /api/items - Create new item
itemsRouter.post(
  '/',
  requireAuth,
  requirePermission('inventory:create'),
  async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(1).max(200),
    categoryId: z.string(),
    description: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    quantity: z.number().min(0).default(0),
    unit: z.string().max(50).default('pieces'),
    minStockThreshold: z.number().min(0).default(0),
    chemical: z.object({
      casNumber: z.string().optional(),
      hazardClass: z.string().optional(),
      expiryDate: z.string().optional(),
      storageConditions: z.string().optional(),
      sdsUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'URL must be http(s)').optional(),
      molecularFormula: z.string().optional(),
    }).optional(),
    equipment: z.object({
      serialNumber: z.string().optional(),
      condition: z.string().optional(),
      purchaseDate: z.string().optional(),
    }).optional(),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const id = crypto.randomUUID()
  const user = c.get('user') as { id: string }

  // One transaction: an item plus its chemical/equipment detail rows are a
  // single logical record. A failure halfway through used to leave an item
  // with no details (or details pointing at nothing).
  await db.transaction(async (tx) => {
    await tx.insert(items).values({
      id,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId,
      description: parsed.data.description,
      location: parsed.data.location,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      minStockThreshold: parsed.data.minStockThreshold,
    })

    if (parsed.data.chemical) {
      await tx.insert(chemicalDetails).values({
        id: crypto.randomUUID(),
        itemId: id,
        ...parsed.data.chemical,
      })
    }

    if (parsed.data.equipment) {
      await tx.insert(equipmentDetails).values({
        id: crypto.randomUUID(),
        itemId: id,
        ...parsed.data.equipment,
      })
    }
  })

  await logAudit({ userId: user.id, action: 'CREATE', entityType: 'Item', entityId: id, details: { name: parsed.data.name } })

  return c.json({ id, message: 'Item created' }, 201)
})

// PUT /api/items/:id - Update item (plus nested chemical/equipment details)
itemsRouter.put(
  '/:id',
  requireAuth,
  requirePermission('inventory:edit'),
  async (c) => {
  const id = c.req.param('id')!
  const body = await c.req.json()
  const user = c.get('user') as { id: string }

  const baseSchema = z.object({
    name: z.string().min(1).optional(),
    categoryId: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    minStockThreshold: z.number().optional(),
    imageUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'URL must be http(s)').optional(),
  })
  const chemicalSchema = z.object({
    casNumber: z.string().optional(),
    hazardClass: z.string().optional(),
    expiryDate: z.string().optional(),
    storageConditions: z.string().optional(),
    sdsUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'URL must be http(s)').optional(),
    molecularFormula: z.string().optional(),
    hazardPictograms: z.string().optional(),
  }).optional()
  const equipmentSchema = z.object({
    serialNumber: z.string().optional(),
    status: z.enum(['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE']).optional(),
    condition: z.string().optional(),
    purchaseDate: z.string().optional(),
    warrantyExpiry: z.string().optional(),
  }).optional()

  const parsed = z.object({
    chemical: chemicalSchema,
    equipment: equipmentSchema,
  }).passthrough().safeParse(body)
  // Validate base fields separately (strip unknowns).
  const baseParsed = baseSchema.safeParse(
    Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => !['chemical', 'equipment'].includes(k))),
  )
  if (!baseParsed.success || !parsed.success) {
    return c.json({ error: (baseParsed.success ? parsed : baseParsed).error?.flatten() }, 400)
  }

  const existingItem = await db.select({ id: items.id, name: items.name }).from(items).where(eq(items.id, id)).get()
  if (!existingItem) return c.json({ error: 'Not found' }, 404)

  const base = baseParsed.data
  const chemical = parsed.data.chemical
  const equipment = parsed.data.equipment

  // Item + details move together, so a failed detail write cannot leave the
  // row half-updated.
  await db.transaction(async (tx) => {
    if (Object.keys(base).length > 0) {
      await tx.update(items).set({ ...base, updatedAt: sql`(datetime('now'))` }).where(eq(items.id, id))
    }

    if (chemical) {
      const existing = await tx.select({ id: chemicalDetails.id }).from(chemicalDetails)
        .where(eq(chemicalDetails.itemId, id)).get()
      if (existing) {
        await tx.update(chemicalDetails).set(chemical).where(eq(chemicalDetails.itemId, id))
      } else {
        await tx.insert(chemicalDetails).values({ id: crypto.randomUUID(), itemId: id, ...chemical })
      }
    }

    if (equipment) {
      const existing = await tx.select({ id: equipmentDetails.id }).from(equipmentDetails)
        .where(eq(equipmentDetails.itemId, id)).get()
      if (existing) {
        await tx.update(equipmentDetails).set(equipment).where(eq(equipmentDetails.itemId, id))
      } else {
        await tx.insert(equipmentDetails).values({ id: crypto.randomUUID(), itemId: id, ...equipment })
      }
    }
  })

  await logAudit({ userId: user.id, action: 'UPDATE', entityType: 'Item', entityId: id, details: body })

  return c.json({ message: 'Item updated' })
})

// POST /api/items/:id/restock - add to existing stock (chemicals/consumables)
itemsRouter.post(
  '/:id/restock',
  requireAuth,
  requirePermission('inventory:edit'),
  async (c) => {
  const id = c.req.param('id')!
  const body = await c.req.json()
  const schema = z.object({
    quantity: z.number().positive(),
    notes: z.string().max(500).optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Quantity must be a positive number.' }, 400)

  const user = c.get('user') as { id: string }
  const item = await db.select().from(items).where(eq(items.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)

  const isEquipment = await db.select({ id: equipmentDetails.id }).from(equipmentDetails).where(eq(equipmentDetails.itemId, id)).get()
  if (isEquipment) {
    return c.json({ error: 'Equipment stock is tracked by check-out / return, not restocking.' }, 400)
  }

  const newQuantity = item.quantity + parsed.data.quantity
  await db.update(items).set({ quantity: newQuantity, updatedAt: sql`(datetime('now'))` }).where(eq(items.id, id))
  await logAudit({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'Item',
    entityId: id,
    details: { name: item.name, quantityAdded: parsed.data.quantity, unit: item.unit, newQuantity, notes: parsed.data.notes },
  })
  return c.json({ message: 'Stock added', newQuantity }, 201)
})

// DELETE /api/items/:id - Delete item (hard delete + audit)
itemsRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('inventory:delete'),
  async (c) => {
  const id = c.req.param('id')!
  const user = c.get('user') as { id: string }

  const item = await db.select().from(items).where(eq(items.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)

  // Hard delete: remove child rows first (no DB-level cascades). Reservations
  // are part of that set — libsql runs with foreign_keys=1, so a booking that
  // outlives its item turns the delete into a 500 instead of a cleanup.
  await db.transaction(async (tx) => {
    await tx.delete(chemicalDetails).where(eq(chemicalDetails.itemId, id))
    await tx.delete(equipmentDetails).where(eq(equipmentDetails.itemId, id))
    await tx.delete(equipmentReservations).where(eq(equipmentReservations.itemId, id))
    await tx.delete(equipmentCheckouts).where(eq(equipmentCheckouts.itemId, id))
    await tx.delete(usageLogs).where(eq(usageLogs.itemId, id))
    await tx.delete(items).where(eq(items.id, id))
  })

  await logAudit({ userId: user.id, action: 'DELETE', entityType: 'Item', entityId: id, details: { name: item.name } })

  return c.json({ message: 'Item deleted' })
})
