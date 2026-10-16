import { Hono } from 'hono'
import { desc } from 'drizzle-orm'
import { db } from '../db'
import { auditLogs } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'

export const auditRouter = new Hono()

// GET /api/audit - View audit log

auditRouter.get('/', requireAuth, requirePermission('audit:view'), async (c) => {
  const { page = '1', limit = '50' } = c.req.query()
  const offset = (parseInt(page) - 1) * parseInt(limit)

  const allLogs = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp))
  const total = allLogs.length
  const paginated = allLogs.slice(offset, offset + parseInt(limit))

  return c.json({ logs: paginated, total, page: parseInt(page), limit: parseInt(limit) })
})
