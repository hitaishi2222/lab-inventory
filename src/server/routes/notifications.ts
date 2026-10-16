import { Hono } from 'hono'
import { eq, desc, or, isNull } from 'drizzle-orm'
import { db } from '../db'
import { notifications } from '../db/schema'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { generateScheduledNotifications } from '../lib/notifications'

export const notificationsRouter = new Hono()

// GET /api/notifications
notificationsRouter.get('/', requireAuth, async (c) => {
  const user = c.get('user') as { id: string }
  // Personal notifications plus broadcasts (userId IS NULL, e.g. low-stock alerts)
  const userNotifs = await db.select()
    .from(notifications)
    .where(or(eq(notifications.userId, user.id), isNull(notifications.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(50)

  return c.json({ notifications: userNotifs })
})

// POST /api/notifications/generate - run scheduled alert generation (overdue equipment, expiring chemicals)
notificationsRouter.post(
  '/generate',
  requireAuth,
  requireAdmin,
  async (c) => {
  const result = await generateScheduledNotifications()
  return c.json({ message: 'Scheduled notifications generated', ...result })
})

// PUT /api/notifications/:id/read
notificationsRouter.put('/:id/read', requireAuth, async (c) => {
  const id = c.req.param('id')!
  await db.update(notifications).set({ read: 1 }).where(eq(notifications.id, id))
  return c.json({ message: 'Marked as read' })
})

// PUT /api/notifications/read-all
notificationsRouter.put('/read-all', requireAuth, async (c) => {
  const user = c.get('user') as { id: string }
  await db.update(notifications).set({ read: 1 }).where(eq(notifications.userId, user.id))
  return c.json({ message: 'All marked as read' })
})
