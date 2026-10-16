import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, sql, and } from 'drizzle-orm'
import { db } from '../db'
import { equipmentCheckouts, equipmentDetails } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'

export const equipmentRouter = new Hono()

// POST /api/equipment/:id/checkout
equipmentRouter.post(
  '/:id/checkout',
  requireAuth,
  requirePermission('equipment:checkout'),
  async (c) => {
  const id = c.req.param('id')!
  const body = await c.req.json()
  const schema = z.object({
    expectedReturnAt: z.string(),
    notes: z.string().optional(),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const user = c.get('user') as { id: string }

  const equipment = await db.select().from(equipmentDetails).where(eq(equipmentDetails.itemId, id)).get()
  if (!equipment) return c.json({ error: 'Not equipment or not found' }, 404)
  if (equipment.status === 'CHECKED_OUT') return c.json({ error: 'Already checked out' }, 400)

  await db.update(equipmentDetails).set({ status: 'CHECKED_OUT' }).where(eq(equipmentDetails.itemId, id))

  const checkoutId = crypto.randomUUID()
  await db.insert(equipmentCheckouts).values({
    id: checkoutId,
    itemId: id,
    userId: user.id,
    expectedReturnAt: parsed.data.expectedReturnAt,
    notes: parsed.data.notes,
    status: 'ACTIVE',
  })

  await logAudit({ userId: user.id, action: 'CHECKOUT', entityType: 'Equipment', entityId: id, details: parsed.data })

  return c.json({ id: checkoutId, message: 'Equipment checked out' }, 201)
})

// POST /api/equipment/:id/return
equipmentRouter.post(
  '/:id/return',
  requireAuth,
  requirePermission('equipment:return'),
  async (c) => {
  const id = c.req.param('id')!
  const user = c.get('user') as { id: string }

  await db.update(equipmentDetails).set({ status: 'AVAILABLE' }).where(eq(equipmentDetails.itemId, id))

  await db.update(equipmentCheckouts)
    .set({ returnedAt: sql`(datetime('now'))`, status: 'RETURNED' })
    .where(and(eq(equipmentCheckouts.itemId, id), eq(equipmentCheckouts.status, 'ACTIVE')))

  await logAudit({ userId: user.id, action: 'RETURN', entityType: 'Equipment', entityId: id })

  return c.json({ message: 'Equipment returned' })
})

// GET /api/equipment/:id/history
equipmentRouter.get('/:id/history', requireAuth, async (c) => {
  const id = c.req.param('id')!
  const history = await db.select()
    .from(equipmentCheckouts)
    .where(eq(equipmentCheckouts.itemId, id))
    .orderBy(desc(equipmentCheckouts.checkedOutAt))

  return c.json({ history })
})
