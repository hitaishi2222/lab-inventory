import { db } from '../db'
import {
  notifications,
  equipmentCheckouts,
  items,
  chemicalDetails,
  auditLogs,
} from '../db/schema'
import { eq, lt, and } from 'drizzle-orm'

type NotificationType = 'LOW_STOCK' | 'EXPIRY_WARNING' | 'OVERDUE_EQUIPMENT'

export async function createNotification(params: {
  userId?: string
  type: NotificationType
  title: string
  message: string
  link?: string
}) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
  })
}

/**
 * Scheduled notification generation. Safe to run on a cron (or on demand via
 * POST /api/notifications/generate):
 *
 * 1. Overdue equipment: active checkouts past their expected return date are
 *    marked OVERDUE and the checkout owner gets an OVERDUE_EQUIPMENT alert.
 * 2. Expiring chemicals: chemicals whose expiry date falls within the next
 *    `expiryWindowDays` get an EXPIRY_WARNING alert (one per item, skipped if
 *    an unread warning already exists).
 *
 * Returns a summary of what was created so a cron job can log it.
 */
export async function generateScheduledNotifications(params: {
  expiryWindowDays?: number
  now?: string
} = {}) {
  const now = params.now || new Date().toISOString()
  const windowDays = params.expiryWindowDays ?? 90
  const windowDate = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  let overdue = 0
  let expiryWarnings = 0

  // --- 1. Overdue equipment -----------------------------------------------
  const activeCheckouts = await db
    .select({
      id: equipmentCheckouts.id,
      itemId: equipmentCheckouts.itemId,
      userId: equipmentCheckouts.userId,
      expectedReturnAt: equipmentCheckouts.expectedReturnAt,
    })
    .from(equipmentCheckouts)
    .where(eq(equipmentCheckouts.status, 'ACTIVE'))

  for (const co of activeCheckouts) {
    if (!co.expectedReturnAt || co.expectedReturnAt >= now.slice(0, 10)) continue

    await db
      .update(equipmentCheckouts)
      .set({ status: 'OVERDUE' })
      .where(eq(equipmentCheckouts.id, co.id))

    await createNotification({
      userId: co.userId,
      type: 'OVERDUE_EQUIPMENT',
      title: 'Overdue equipment',
      message: 'Equipment is past its expected return date.',
      link: `/inventory/${co.itemId}`,
    })

    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: co.userId,
      action: 'UPDATE',
      entityType: 'Checkout',
      entityId: co.id,
      details: JSON.stringify({ status: 'OVERDUE' }),
    })
    overdue++
  }

  // --- 2. Expiring chemicals ----------------------------------------------
  const expiring = await db
    .select({
      itemId: items.id,
      itemName: items.name,
      expiryDate: chemicalDetails.expiryDate,
    })
    .from(items)
    .innerJoin(chemicalDetails, eq(chemicalDetails.itemId, items.id))
    .where(lt(chemicalDetails.expiryDate, windowDate))

  for (const e of expiring) {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, 'EXPIRY_WARNING'),
          eq(notifications.link, `/inventory/${e.itemId}`),
          eq(notifications.read, 0),
        ),
      )
      .limit(1)
    if (existing.length > 0) continue

    await createNotification({
      userId: undefined,
      type: 'EXPIRY_WARNING',
      title: 'Chemical expiring soon',
      message: `${e.itemName} expires on ${e.expiryDate}.`,
      link: `/inventory/${e.itemId}`,
    })
    expiryWarnings++
  }

  return { overdue, expiryWarnings, at: now }
}
