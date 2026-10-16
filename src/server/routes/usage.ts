import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db'
import { usageLogs, items } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { createNotification } from '../lib/notifications'

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

  const newQty = item.quantity - parsed.data.quantityUsed
  await db.update(items).set({ quantity: newQty, updatedAt: sql`(datetime('now'))` }).where(eq(items.id, parsed.data.itemId))

  const logId = crypto.randomUUID()
  await db.insert(usageLogs).values({
    id: logId,
    itemId: parsed.data.itemId,
    userId: user.id,
    quantityUsed: parsed.data.quantityUsed,
    notes: parsed.data.notes,
  })

  if (newQty <= item.minStockThreshold) {
    await createNotification({
      type: 'LOW_STOCK',
      title: 'Low Stock Alert',
      message: `${item.name} is below threshold (${newQty} ${item.unit} remaining)`,
      link: `/inventory/${item.id}`,
    })
  }

  await logAudit({ userId: user.id, action: 'CREATE', entityType: 'UsageLog', entityId: logId, details: parsed.data })

  return c.json({ id: logId, message: 'Usage logged', newQuantity: newQty }, 201)
})

// GET /api/usage - List usage logs
usageRouter.get('/', requireAuth, async (c) => {
  const { itemId, userId, page = '1', limit = '20' } = c.req.query()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  let allLogs = await db.select().from(usageLogs).orderBy(desc(usageLogs.usedAt))

  if (itemId) {
    allLogs = allLogs.filter(l => l.itemId === itemId)
  }
  if (userId) {
    allLogs = allLogs.filter(l => l.userId === userId)
  }

  const total = allLogs.length
  const paginated = allLogs.slice(offset, offset + parseInt(limit))

  return c.json({ logs: paginated, total, page: parseInt(page), limit: parseInt(limit) })
})

// GET /api/usage/:id - Single usage log entry
usageRouter.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')!
  const log = await db.select().from(usageLogs).where(eq(usageLogs.id, id)).get()
  if (!log) return c.json({ error: 'Not found' }, 404)
  return c.json(log)
})
