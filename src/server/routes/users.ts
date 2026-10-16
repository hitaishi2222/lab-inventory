import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { auth } from '../auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { getSetting } from '../lib/settings'
import { type Permission } from '../lib/permissions'

export const usersRouter = new Hono()

// GET /api/users/me - Own profile (role + permissions, for UI gating)
usersRouter.get('/me', requireAuth, async (c) => {
  const user = c.get('user') as { id: string; email: string; name: string; role: string }
  const permissions = c.get('permissions') as Set<Permission>
  const softwareName = await getSetting('software_name')
  return c.json({
    ...user,
    permissions: Array.from(permissions),
    softwareName,
  })
})

// GET /api/users
usersRouter.get(
  '/',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users)

  return c.json({ users: allUsers })
})

// POST /api/users - Create a new user (Admin/Supervisor only)
usersRouter.post(
  '/',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum([
        'ADMIN',
        'SUPERVISOR',
        'POSTDOC',
        'PHD',
        'PROJECT_RESEARCH_FELLOW',
        'OTHERS',
      ]),
    })

    const parsed = schema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

    const creator = c.get('user') as { id: string; email: string; name: string; role: string }

    // Check if email already exists in app profile
    const existing = await db.select().from(users).where(eq(users.email, parsed.data.email)).get()
    if (existing) {
      return c.json({ error: 'A user with this email already exists.' }, 409)
    }

    // Create the Better Auth account. The database hook auto-creates the
    // app profile with role OTHERS; we update it to the assigned role below.
    await auth.api.signUpEmail({
      body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password },
      headers: c.req.raw.headers,
    })

    // Update the app profile to the assigned role
    const now = new Date().toISOString()
    await db.update(users)
      .set({ role: parsed.data.role, name: parsed.data.name, updatedAt: now })
      .where(eq(users.email, parsed.data.email))

    await logAudit({
      userId: creator.id,
      action: 'CREATE',
      entityType: 'User',
      entityId: parsed.data.email,
      details: { email: parsed.data.email, role: parsed.data.role, createdBy: creator.email },
    })

    return c.json({ message: 'User created successfully' }, 201)
  },
)

// PUT /api/users/:id/role
usersRouter.put(
  '/:id/role',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
  const id = c.req.param('id')!
  const body = await c.req.json()
  const schema = z.object({
    role: z.enum([
      'ADMIN',
      'SUPERVISOR',
      'POSTDOC',
      'PHD',
      'PROJECT_RESEARCH_FELLOW',
      'OTHERS',
    ]),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  await db.update(users).set({ role: parsed.data.role, updatedAt: new Date().toISOString() }).where(eq(users.id, id))
  return c.json({ message: 'Role updated' })
})

// DELETE /api/users/:id
usersRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
  const id = c.req.param('id')!
  await db.delete(users).where(eq(users.id, id))
  return c.json({ message: 'User deleted' })
})
