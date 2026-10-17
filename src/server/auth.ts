import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins/username'
import { eq } from 'drizzle-orm'
import { getLabDb, db, labStorage, allLabIds } from './db'
import { LABS } from './db/labs'
import { user, session, account, verification, users } from './db/schema'

/**
 * Multi-lab auth routing.
 *
 * One Better Auth instance per lab, each bound to that lab's database —
 * so credentials, sessions and password-reset tokens are fully isolated
 * per lab. The rest of the server keeps importing `{ auth }` from here:
 * `auth` is a Proxy that forwards to the instance of the current request's
 * lab (same AsyncLocalStorage slot as `db`), falling back to the default
 * lab outside a request (scripts).
 */

function makeAuth(labId: string) {
  return betterAuth({
    // Public base URL of the app (used for reset links, origin checks and
    // deciding secure-cookie mode). In prod behind Cloudflare Tunnel this is
    // https://<your-domain>; in dev it stays http://localhost:3000.
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    database: drizzleAdapter(getLabDb(labId), {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    plugins: [
      // Username login: users can sign in with their username as well as
      // their email, and change it themselves in Settings. Usernames are
      // lowercased, 3–30 chars, letters/numbers/dots/underscores.
      // `displayUsername: false` keeps just the single `username` column.
      username({ displayUsername: false }),
    ],
    emailAndPassword: {
      enabled: true,
      // No SMTP configured in this self-hosted lab setup.
      // The reset URL is logged to the server console so an admin
      // can copy-paste it to the user. Configure a real transporter
      // (e.g. nodemailer) here for production email delivery.
      sendResetPassword: async ({ user, url, token }) => {
        const sep = '='.repeat(60)
        console.log('\n' + sep)
        console.log(`PASSWORD RESET REQUEST [lab: ${labId}]`)
        console.log(`User: ${user.name} <${user.email}>`)
        console.log(`Reset URL: ${url}`)
        console.log(`Token: ${token}`)
        console.log(sep + '\n')
      },
    },
    trustedOrigins: [
      'http://localhost:5173',
      'http://localhost:3000',
      // Production URL from the environment (e.g. https://labs.example.com
      // behind Cloudflare Tunnel) must be trusted, otherwise sign-in and
      // password-reset fail with 403 INVALID_ORIGIN / INVALID_REDIRECT_URL.
      ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
      // Extra origins (comma-separated) for previews / alternate domains.
      ...(process.env.TRUSTED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
    ],
    advanced: {
      // Cookie management: httpOnly + Lax by default. `Secure` (and the
      // `__Secure-` cookie prefix) only when served over https, so local
      // http dev keeps working while prod cookies can't leak over http.
      useSecureCookies: (process.env.BETTER_AUTH_URL || '').startsWith('https://'),
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: (process.env.BETTER_AUTH_URL || '').startsWith('https://'),
        httpOnly: true,
        path: '/',
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      // Sliding window: active users get their session + cookie refreshed
      // daily instead of being logged out exactly 7 days after sign-in.
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          // Every auth user gets an app profile row (default role OTHERS).
          // Linked by email; admins promote via PUT /api/users/:id/role.
          // `db` here is the request-scoped proxy, so the profile lands in
          // the same lab database the sign-up was made against.
          after: async (user) => {
            const existing = await db.select().from(users).where(eq(users.email, user.email)).get()
            if (!existing) {
              const now = new Date().toISOString()
              await db.insert(users).values({
                id: crypto.randomUUID(),
                name: user.name,
                email: user.email,
                passwordHash: null,
                role: 'OTHERS',
                createdAt: now,
                updatedAt: now,
              })
            }
          },
        },
      },
    },
  })
}

type AuthInstance = ReturnType<typeof makeAuth>

const instances = new Map<string, AuthInstance>()

function getOrCreateAuth(labId: string): AuthInstance {
  let inst = instances.get(labId)
  if (!inst) {
    inst = makeAuth(labId)
    instances.set(labId, inst)
  }
  return inst
}

for (const lab of LABS) {
  getOrCreateAuth(lab.id)
}

function currentAuth(): AuthInstance {
  // SEED_LAB lets scripts target one lab, e.g. `SEED_LAB=lab-2 npm run db:seed`.
  const id = labStorage.getStore() ?? process.env.SEED_LAB ?? LABS[0].id
  return getOrCreateAuth(instances.has(id) ? id : LABS[0].id)
}

/** Lab ids that have an auth instance (same as all lab ids). */
export function allAuthLabIds(): string[] {
  return allLabIds()
}

/**
 * Request-scoped `auth`. Forwards to the current lab's Better Auth
 * instance. `handler` is pre-bound so `auth.handler(c.req.raw)` keeps
 * working; `api` methods are bound on access.
 */
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop) {
    const target = currentAuth()
    if (prop === 'handler') return target.handler.bind(target)
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    if (typeof value === 'function') return value.bind(target)
    if (value !== null && typeof value === 'object') {
      // `auth.api.*` — bind each method to the api object of this lab.
      return new Proxy(value as object, {
        get(apiTarget, apiProp) {
          const v = (apiTarget as Record<PropertyKey, unknown>)[apiProp]
          return typeof v === 'function' ? v.bind(apiTarget) : v
        },
      })
    }
    return value
  },
}) as AuthInstance
