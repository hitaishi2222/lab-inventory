import { Hono } from 'hono'
import { count, desc } from 'drizzle-orm'
import { db } from '../db'
import { auditLogs } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { parsePagination } from '../lib/query'

export const auditRouter = new Hono()

// GET /api/audit - View audit log (paged in SQL; the trail only grows)

auditRouter.get('/', requireAuth, requirePermission('audit:view'), async (c) => {
  const { page, limit, offset } = parsePagination({ limit: '50', ...c.req.query() })

  const [logs, totals] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp), desc(auditLogs.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(auditLogs).get(),
  ])

  return c.json({ logs, total: totals?.n ?? 0, page, limit })
})
