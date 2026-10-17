import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc, sql, and, gte } from 'drizzle-orm'
import { db } from '../db'
import { equipmentCheckouts, equipmentDetails, equipmentReservations, items, users } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'

export const equipmentRouter = new Hono()

// NOTE: static /reservations/* routes are registered before /:id/* so they
// can never be shadowed by the param routes.

// GET /api/equipment/reservations/upcoming - all upcoming bookings (for the
// Equipment page badges). Any signed-in user may view them.
equipmentRouter.get('/reservations/upcoming', requireAuth, async (c) => {
  const nowIso = new Date().toISOString()
  const rows = await db
    .select({
      id: equipmentReservations.id,
      itemId: equipmentReservations.itemId,
      itemName: items.name,
      userId: equipmentReservations.userId,
      userName: users.name,
      startsAt: equipmentReservations.startsAt,
      endsAt: equipmentReservations.endsAt,
      notes: equipmentReservations.notes,
    })
    .from(equipmentReservations)
    .innerJoin(items, eq(equipmentReservations.itemId, items.id))
    .innerJoin(users, eq(equipmentReservations.userId, users.id))
    .where(and(eq(equipmentReservations.status, 'UPCOMING'), gte(equipmentReservations.endsAt, nowIso)))
    .orderBy(equipmentReservations.startsAt)
  return c.json({ reservations: rows })
})

// DELETE /api/equipment/reservations/:resId - cancel a booking (owner or admins)
equipmentRouter.delete('/reservations/:resId', requireAuth, async (c) => {
  const resId = c.req.param('resId')!
  const me = c.get('user') as { id: string; role: string }
  const permissions = c.get('permissions')

  const existing = await db.select().from(equipmentReservations).where(eq(equipmentReservations.id, resId)).get()
  if (!existing || existing.status === 'CANCELLED') {
    return c.json({ error: 'Reservation not found' }, 404)
  }
  if (existing.userId !== me.id && !permissions.has('users:manage')) {
    return c.json({ error: 'You can only cancel your own reservations.' }, 403)
  }
  await db.update(equipmentReservations).set({ status: 'CANCELLED' }).where(eq(equipmentReservations.id, resId))
  await logAudit({ userId: me.id, action: 'UPDATE', entityType: 'Reservation', entityId: resId, details: { status: 'CANCELLED' } })
  return c.json({ message: 'Reservation cancelled' })
})

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

  // Respect other users' bookings: equipment reserved right now by someone
  // else cannot be checked out. The reserver's own checkout proceeds.
  const nowMs = Date.now()
  const currentBookings = await db
    .select({
      userId: equipmentReservations.userId,
      userName: users.name,
      startsAt: equipmentReservations.startsAt,
      endsAt: equipmentReservations.endsAt,
    })
    .from(equipmentReservations)
    .innerJoin(users, eq(equipmentReservations.userId, users.id))
    .where(and(eq(equipmentReservations.itemId, id), eq(equipmentReservations.status, 'UPCOMING')))
  const blocking = currentBookings.find(
    (b) => Date.parse(b.startsAt) <= nowMs && nowMs < Date.parse(b.endsAt) && b.userId !== user.id,
  )
  if (blocking) {
    return c.json(
      { error: `${blocking.userName} has reserved this equipment until ${blocking.endsAt}.` },
      409,
    )
  }

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

  await logAudit({ userId: user.id, action: 'CHECKOUT', entityType: 'Equipment', entityId: id, details: { ...parsed.data, itemName: (await db.select({ name: items.name }).from(items).where(eq(items.id, id)).get())?.name } })

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

// GET /api/equipment/:id/reservations - upcoming bookings for one item
equipmentRouter.get('/:id/reservations', requireAuth, async (c) => {
  const id = c.req.param('id')!
  const nowIso = new Date().toISOString()
  const rows = await db
    .select({
      id: equipmentReservations.id,
      userId: equipmentReservations.userId,
      userName: users.name,
      startsAt: equipmentReservations.startsAt,
      endsAt: equipmentReservations.endsAt,
      notes: equipmentReservations.notes,
    })
    .from(equipmentReservations)
    .innerJoin(users, eq(equipmentReservations.userId, users.id))
    .where(and(eq(equipmentReservations.itemId, id), eq(equipmentReservations.status, 'UPCOMING'), gte(equipmentReservations.endsAt, nowIso)))
    .orderBy(equipmentReservations.startsAt)
  return c.json({ reservations: rows })
})

// POST /api/equipment/:id/reservations - book a future slot
equipmentRouter.post(
  '/:id/reservations',
  requireAuth,
  requirePermission('equipment:checkout'),
  async (c) => {
  const id = c.req.param('id')!
  const body = await c.req.json()
  const schema = z.object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    notes: z.string().max(500).optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'StartsAt/endsAt must be ISO datetimes.' }, 400)

  const { startsAt, endsAt, notes } = parsed.data
  const startMs = Date.parse(startsAt)
  const endMs = Date.parse(endsAt)
  if (!(endMs > startMs)) return c.json({ error: 'Booking must end after it starts.' }, 400)
  if (endMs <= Date.now()) return c.json({ error: 'Booking must end in the future.' }, 400)
  if (startMs < Date.now() - 60_000) return c.json({ error: 'Booking cannot start in the past.' }, 400)

  const user = c.get('user') as { id: string }
  const equipment = await db.select().from(equipmentDetails).where(eq(equipmentDetails.itemId, id)).get()
  if (!equipment) return c.json({ error: 'Not equipment or not found' }, 404)
  if (equipment.status === 'MAINTENANCE') {
    return c.json({ error: 'Equipment is under maintenance and cannot be booked.' }, 409)
  }

  // No double-booking: [startsAt, endsAt) must not overlap an existing one.
  const existing = await db
    .select({
      userName: users.name,
      startsAt: equipmentReservations.startsAt,
      endsAt: equipmentReservations.endsAt,
    })
    .from(equipmentReservations)
    .innerJoin(users, eq(equipmentReservations.userId, users.id))
    .where(and(eq(equipmentReservations.itemId, id), eq(equipmentReservations.status, 'UPCOMING')))
  const clash = existing.find((r) => startMs < Date.parse(r.endsAt) && Date.parse(r.startsAt) < endMs)
  if (clash) {
    return c.json(
      { error: `Already booked by ${clash.userName} from ${clash.startsAt} to ${clash.endsAt}.` },
      409,
    )
  }

  // Don't book inside an active checkout's expected window.
  const active = await db
    .select({ expectedReturnAt: equipmentCheckouts.expectedReturnAt })
    .from(equipmentCheckouts)
    .where(and(eq(equipmentCheckouts.itemId, id), eq(equipmentCheckouts.status, 'ACTIVE')))
    .orderBy(desc(equipmentCheckouts.checkedOutAt))
  const expectedBack = active[0]?.expectedReturnAt ? Date.parse(active[0].expectedReturnAt) : NaN
  if (equipment.status === 'CHECKED_OUT' && !Number.isNaN(expectedBack) && startMs < expectedBack) {
    return c.json({ error: `Equipment is checked out, expected back ${active[0]!.expectedReturnAt}.` }, 409)
  }
  if (equipment.status === 'CHECKED_OUT' && Number.isNaN(expectedBack)) {
    return c.json({ error: 'Equipment is checked out with no expected return — ask the holder first.' }, 409)
  }

  const resId = crypto.randomUUID()
  await db.insert(equipmentReservations).values({
    id: resId,
    itemId: id,
    userId: user.id,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    notes,
  })
  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entityType: 'Reservation',
    entityId: resId,
    details: { itemId: id, startsAt, endsAt, notes },
  })
  return c.json({ id: resId, message: 'Equipment reserved' }, 201)
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
