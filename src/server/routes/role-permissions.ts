import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import { rolePermissions } from '../db/schema'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { setRolePermissions, ROLES, type Role, type Permission } from '../lib/permissions'

export const rolePermissionsRouter = new Hono()

// GET /api/role-permissions - all permissions grouped by role
rolePermissionsRouter.get('/', requireAuth, requireAdmin, async (c) => {
  const rows = await db.select().from(rolePermissions)
  const byRole: Record<string, string[]> = {}
  for (const r of rows) {
    if (!byRole[r.role]) byRole[r.role] = []
    byRole[r.role].push(r.permission)
  }
  return c.json({ byRole })
})

// PUT /api/role-permissions/:role - replace permissions for a role
rolePermissionsRouter.put('/:role', requireAuth, requireAdmin, async (c) => {
  const roleParam = c.req.param('role')
  if (!ROLES.includes(roleParam as Role)) return c.json({ error: 'Unknown role' }, 400)
  const role = roleParam as Role
  const body = await c.req.json()
  const schema = z.object({
    permissions: z.array(z.string()),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  await setRolePermissions(role, parsed.data.permissions as Permission[])
  return c.json({ message: 'Permissions updated' })
})
