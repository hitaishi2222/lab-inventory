import { createMiddleware } from 'hono/factory'
import type { Context, Next } from 'hono'
import { auth } from '../auth'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getRolePermissions, type Permission } from '../lib/permissions'

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: string
      email: string
      name: string
      role: string
    }
    permissions: Set<Permission>
  }
}

export const requireAuth = createMiddleware(async (c: Context, next: Next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Fetch the app profile row to get role + stable id for FK references.
  // Linked by email: better-auth owns the `user` table, the app owns `users`.
  const dbUser = await db.select().from(users).where(eq(users.email, session.user.email)).get()
  if (!dbUser) {
    return c.json({ error: 'User not found' }, 401)
  }

  const permissions = await getRolePermissions(dbUser.role as any)

  c.set('user', {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
  })
  c.set('permissions', permissions)
  await next()
})

/** Grant access only if the user has at least one of the listed permissions. */
export const requirePermission = (...permissions: Permission[]) =>
  createMiddleware(async (c: Context, next: Next) => {
    const userPermissions = c.get('permissions')
    if (!userPermissions || !permissions.some((p) => userPermissions.has(p))) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })

/** Admin-only: requires the permissions:manage permission. */
export const requireAdmin = createMiddleware(async (c: Context, next: Next) => {
  const userPermissions = c.get('permissions')
  if (!userPermissions || !userPermissions.has('permissions:manage')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  await next()
})
