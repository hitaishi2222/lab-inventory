import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, like, sql } from 'drizzle-orm'
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

  return c.json({ items: paginated, total, page: parseInt(page), limit: parseInt(limit) })
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
      sdsUrl: z.string().optional(),
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

  const { chemical, equipment, ...base } = body
  if (Object.keys(base).length > 0) {
    await db.update(items).set({ ...base, updatedAt: sql`(datetime('now'))` }).where(eq(items.id, id))
  }

  if (chemical) {
    const existing = await db.select().from(chemicalDetails).where(eq(chemicalDetails.itemId, id)).get()
    if (existing) {
      await db.update(chemicalDetails).set(chemical).where(eq(chemicalDetails.itemId, id))
    } else {
      await db.insert(chemicalDetails).values({ id: crypto.randomUUID(), itemId: id, ...chemical })
    }
  }

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
