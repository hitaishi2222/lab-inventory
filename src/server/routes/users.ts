import { Hono } from 'hono'
import { z } from 'zod'
import { count, eq } from 'drizzle-orm'
import { verifyPassword } from 'better-auth/crypto'
import { db } from '../db'
import { users, user as authUser, account as authAccount } from '../db/schema'
import { auth } from '../auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'
import { getSettings } from '../lib/settings'
import { type Permission } from '../lib/permissions'

export const usersRouter = new Hono()

/**
 * Number of ADMIN accounts in the current lab. Used to refuse the two ways an
 * installation can lock itself out: deleting the only admin, or demoting them.
 * The table is tiny and role is not indexed, so a plain COUNT is fine.
 */
async function countAdmins(): Promise<number> {
  const row = await db.select({ n: count() }).from(users).where(eq(users.role, 'ADMIN')).get()
  return row?.n ?? 0
}

// GET /api/users/me - Own profile (role + permissions, for UI gating)
usersRouter.get('/me', requireAuth, async (c) => {
  const user = c.get('user') as { id: string; email: string; name: string; role: string }
  const permissions = c.get('permissions') as Set<Permission>
  const settings = await getSettings(['software_name', 'date_format', 'time_format'])
  return c.json({
    ...user,
    permissions: Array.from(permissions),
    softwareName: settings.software_name,
    dateFormat: settings.date_format,
    timeFormat: settings.time_format,
  })
})

// PUT /api/users/me - Update own name/email.
// The app profile (`users`) and the auth identity (`user`) are linked by
// email, so both rows are updated together and the link never breaks.
// Name changes are free; changing the email requires the current password
// and must be unique across accounts. Sessions stay valid (they point at
// the stable user id, not the email).
usersRouter.put('/me', requireAuth, async (c) => {
  const me = c.get('user') as { id: string; email: string; name: string; role: string }
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(255).optional(),
    currentPassword: z.string().optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const now = new Date().toISOString()
  const changed: string[] = []
  let email = me.email
  let name = me.name

  const nextEmail = parsed.data.email ? parsed.data.email.toLowerCase() : undefined
  if (nextEmail && nextEmail !== me.email) {
    // Email change: confirm the password first (standard account safety —
    // anyone holding a live session alone must not be able to take over
    // the account by swapping its email).
    if (!parsed.data.currentPassword) {
      return c.json({ error: 'Current password is required to change your email.' }, 400)
    }
    const identity = await db.select().from(authUser).where(eq(authUser.email, me.email)).get()
    if (!identity) return c.json({ error: 'Account not found.' }, 404)
    const cred = await db.select().from(authAccount)
      .where(eq(authAccount.userId, identity.id)).get()
    if (!cred?.password) return c.json({ error: 'Password sign-in is not available for this account.' }, 400)
    const ok = await verifyPassword({ hash: cred.password, password: parsed.data.currentPassword })
    if (!ok) return c.json({ error: 'Current password is incorrect.' }, 401)
    // Must be unused in BOTH tables (they are linked by email).
    const clashAuth = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, nextEmail)).get()
    const clashApp = await db.select({ id: users.id }).from(users).where(eq(users.email, nextEmail)).get()
    if ((clashAuth && clashAuth.id !== identity.id) || (clashApp && clashApp.id !== me.id)) {
      return c.json({ error: 'That email is already in use by another account.' }, 409)
    }
    await db.update(authUser)
      .set({ email: nextEmail, emailVerified: false })
      .where(eq(authUser.id, identity.id))
    await db.update(users)
      .set({ email: nextEmail, updatedAt: now })
      .where(eq(users.id, me.id))
    email = nextEmail
    changed.push('email')
    // Log other sessions out on email change; this one stays valid.
    try {
      await auth.api.revokeOtherSessions({ headers: c.req.raw.headers })
    } catch {
      /* non-fatal — the email change itself already succeeded */
    }
  }

  if (parsed.data.name && parsed.data.name !== me.name) {
    const identity = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email)).get()
    if (identity) {
      await db.update(authUser).set({ name: parsed.data.name }).where(eq(authUser.id, identity.id))
    }
    await db.update(users).set({ name: parsed.data.name, updatedAt: now }).where(eq(users.id, me.id))
    name = parsed.data.name
    changed.push('name')
  }

  if (changed.length > 0) {
    await logAudit({
      userId: me.id,
      action: 'UPDATE',
      entityType: 'User',
      entityId: me.id,
      details: { changed, by: me.email },
    })
  }

  return c.json({ id: me.id, email, name, role: me.role, changed })
})

// GET /api/users
usersRouter.get(
  '/',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
  // Username lives on the better-auth identity row (linked by email).
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    username: authUser.username,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).leftJoin(authUser, eq(authUser.email, users.email))

  return c.json({ users: allUsers })
})

// POST /api/users - Create a new user (Admin/Supervisor only)
usersRouter.post(
  '/',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
    const body = await c.req.json()
    // Username rules mirror the better-auth username plugin defaults
    // (lowercased, unique): 3–30 chars, letters/numbers/dots/underscores.
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/).optional(),
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
    // The username (when given) enables username login for the new account.
    await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        ...(parsed.data.username ? { username: parsed.data.username } : {}),
      },
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
      details: { email: parsed.data.email, username: parsed.data.username ?? null, role: parsed.data.role, createdBy: creator.email },
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

  const me = c.get('user') as { id: string; email: string }
  const target = await db.select().from(users).where(eq(users.id, id)).get()
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.role === parsed.data.role) return c.json({ message: 'Role unchanged' })

  // Last admin out locks everyone out of permissions, labs and user management —
  // there is no recovery path short of editing the database by hand.
  if (target.role === 'ADMIN' && (await countAdmins()) <= 1) {
    return c.json(
      { error: 'This is the only administrator. Promote another account first.' },
      409,
    )
  }

  await db.update(users).set({ role: parsed.data.role, updatedAt: new Date().toISOString() }).where(eq(users.id, id))

  // Role changes grant and revoke access, so they belong in the audit trail
  // like every other mutation.
  await logAudit({
    userId: me.id,
    action: 'UPDATE',
    entityType: 'User',
    entityId: id,
    details: { email: target.email, roleFrom: target.role, roleTo: parsed.data.role, by: me.email },
  })

  return c.json({ message: 'Role updated' })
})

// DELETE /api/users/:id
usersRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('users:manage'),
  async (c) => {
  const id = c.req.param('id')!
  const me = c.get('user') as { id: string; email: string }
  if (id === me.id) return c.json({ error: 'You cannot delete your own account.' }, 400)
  const target = await db.select().from(users).where(eq(users.id, id)).get()
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.role === 'ADMIN' && (await countAdmins()) <= 1) {
    return c.json(
      { error: 'This is the only administrator. Promote another account before deleting it.' },
      409,
    )
  }

  // Remove the app profile first, then the better-auth identity (its sessions
  // and accounts cascade via FK). Otherwise the orphaned auth account keeps its
  // sessions alive and the email can never be re-registered. Both rows go in one
  // transaction: a half-deleted account is worse than no deletion at all.
  // History rows (audit, usage, checkouts, reservations) now survive with
  // user_id NULL — see drizzle/0006_user_fk_set_null.sql.
  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, id))
    await tx.delete(authUser).where(eq(authUser.email, target.email))
  })

  await logAudit({
    userId: me.id,
    action: 'DELETE',
    entityType: 'User',
    entityId: id,
    details: { email: target.email, role: target.role, by: me.email },
  })

  return c.json({ message: 'User deleted' })
})
