import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, like, sql, inArray } from 'drizzle-orm'
import { db } from '../db'
import { items, chemicalDetails, equipmentDetails, equipmentCheckouts, usageLogs } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'

export const itemsRouter = new Hono()

// GET /api/items - List all items with filters
itemsRouter.get('/', requireAuth, async (c) => {
  const { search, page = '1', limit = '20' } = c.req.query()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let query
  if (search) {
    query = db.select().from(items).where(like(items.name, `%${search}%`)).orderBy(desc(items.createdAt))
  } else {
    query = db.select().from(items).orderBy(desc(items.createdAt))
  }

  const allItems = await query
  const total = allItems.length
  const paginated = allItems.slice(offset, offset + parseInt(limit))

  // Attach nested details (same shape as GET /api/items/:id). The list is
  // what Inventory, Dashboard and Equipment render from — without this,
  // item.equipment / item.chemical are undefined and every equipment-aware
  // display (availability badges, stock-badge suppression, expiry filter)
  // silently breaks.
  const pageIds = paginated.map((i) => i.id)
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
  const enriched = paginated.map((i) => ({
    ...i,
    chemical: chemicalByItem.get(i.id) ?? null,
    equipment: equipmentByItem.get(i.id) ?? null,
  }))

  return c.json({ items: enriched, total, page: parseInt(page), limit: parseInt(limit) })
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
    name: z.string().min(1),
    categoryId: z.string(),
    description: z.string().optional(),
    location: z.string().optional(),
    quantity: z.number().default(0),
    unit: z.string().default('pieces'),
    minStockThreshold: z.number().default(0),
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

  await db.insert(items).values({
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
    await db.insert(chemicalDetails).values({
      id: crypto.randomUUID(),
      itemId: id,
      ...parsed.data.chemical,
    })
  }

  if (parsed.data.equipment) {
    await db.insert(equipmentDetails).values({
      id: crypto.randomUUID(),
      itemId: id,
      ...parsed.data.equipment,
    })
  }

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

  const base = baseParsed.data
  if (Object.keys(base).length > 0) {
    await db.update(items).set({ ...base, updatedAt: sql`(datetime('now'))` }).where(eq(items.id, id))
  }

  const chemical = parsed.data.chemical
  if (chemical) {
    const existing = await db.select().from(chemicalDetails).where(eq(chemicalDetails.itemId, id)).get()
    if (existing) {
      await db.update(chemicalDetails).set(chemical).where(eq(chemicalDetails.itemId, id))
    } else {
      await db.insert(chemicalDetails).values({ id: crypto.randomUUID(), itemId: id, ...chemical })
    }
  }

  const equipment = parsed.data.equipment
  if (equipment) {
    const existing = await db.select().from(equipmentDetails).where(eq(equipmentDetails.itemId, id)).get()
    if (existing) {
      await db.update(equipmentDetails).set(equipment).where(eq(equipmentDetails.itemId, id))
    } else {
      await db.insert(equipmentDetails).values({ id: crypto.randomUUID(), itemId: id, ...equipment })
    }
  }

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

  // Hard delete: remove child rows first (no DB-level cascades)
  await db.delete(chemicalDetails).where(eq(chemicalDetails.itemId, id))
  await db.delete(equipmentDetails).where(eq(equipmentDetails.itemId, id))
  await db.delete(equipmentCheckouts).where(eq(equipmentCheckouts.itemId, id))
  await db.delete(usageLogs).where(eq(usageLogs.itemId, id))
  await db.delete(items).where(eq(items.id, id))

  await logAudit({ userId: user.id, action: 'DELETE', entityType: 'Item', entityId: id, details: { name: item.name } })

  return c.json({ message: 'Item deleted' })
})
