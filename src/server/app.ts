import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth } from './auth'
import { db, labStorage } from './db'
import { LABS } from './db/labs'
import { env } from './env'
import { log } from './lib/log'
import { users } from './db/schema'
import { eq } from 'drizzle-orm'
import { itemsRouter } from './routes/items'
import { equipmentRouter } from './routes/equipment'
import { usageRouter } from './routes/usage'
import { notificationsRouter } from './routes/notifications'
import { auditRouter } from './routes/audit'
import { categoriesRouter } from './routes/categories'
import { usersRouter } from './routes/users'
import { dashboardRouter } from './routes/dashboard'
import { rolePermissionsRouter } from './routes/role-permissions'
import { settingsRouter } from './routes/settings'
import { exportRouter } from './routes/export'
import { labsRouter } from './routes/labs'

/**
 * The application itself: routes, middleware, auth. No runtime assumptions —
 * no filesystem, no ports, no timers. Both entry points import this:
 *
 *   src/server/index.ts          Node/Docker: serve(), static files, backups
 *   src/server/entry-worker.ts   Cloudflare Workers: fetch + assets + cron
 */

const app = new Hono()

// Baseline security headers for every response.
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if ((env.BETTER_AUTH_URL || '').startsWith('https://')) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})

// Single place where an unexpected throw is turned into a response.
// Without this Hono answers with a bare text 500: the browser shows nothing
// useful, the server logs nothing, so a failing route is invisible until a
// user reports it. Malformed JSON bodies (c.req.json()) become a 400 instead
// of a 500, since that is a client mistake, not a server fault.
app.onError((err, c) => {
  if (err instanceof SyntaxError) {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  log.error(`Unhandled ${c.req.method} ${c.req.path}:`, err)
  return c.json({ error: 'Internal server error' }, 500)
})

// Liveness probe — used by the Docker healthcheck and handy from a shell.
app.get('/api/health', (c) => c.json({ ok: true }))

// CORS must allow credentials: better-auth authenticates via httpOnly
// cookies, and browsers reject `Access-Control-Allow-Origin: *` on any
// credentialed request (login would "succeed" but the session cookie is
// never stored, bouncing the user back to /login). In prod the frontend is
// served same-origin from this server, so the list only matters for dev
// (:5173 -> :3000) and any trusted cross-origin frontends.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  env.BETTER_AUTH_URL,
  env.FRONTEND_URL,
  ...(env.TRUSTED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
].filter((o): o is string => Boolean(o))

app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-lab-id'],
    maxAge: 86400,
  }),
)

// ---- Multi-lab resolution ---------------------------------------------
// One instance can serve two (or more) fully separate labs, each with its
// own database file. The active lab travels with the request as the
// `x-lab-id` header (sent by the frontend from the login-page selector),
// falling back to the `lab` query param and then the `lab_id` cookie so
// better-auth's own fetch calls (which can't set custom headers) still
// land in the right lab. Unknown/missing values fall back to the default
// lab, so single-lab deployments behave exactly as before.
function resolveLabId(req: Request): string {
  const header = req.headers.get('x-lab-id')?.trim()
  if (header && LABS.some((l) => l.id === header)) return header
  try {
    const url = new URL(req.url)
    const query = url.searchParams.get('lab')?.trim()
    if (query && LABS.some((l) => l.id === query)) return query
  } catch {
    /* ignore malformed URL */
  }
  const cookie = req.headers.get('cookie')
  if (cookie) {
    for (const part of cookie.split(';')) {
      const [k, ...rest] = part.trim().split('=')
      if (k === 'lab_id') {
        try {
          const value = decodeURIComponent(rest.join('=').trim())
          if (value && LABS.some((l) => l.id === value)) return value
        } catch {
          /* ignore malformed cookie */
        }
      }
    }
  }
  return LABS[0].id
}

app.use('*', async (c, next) => {
  const labId = resolveLabId(c.req.raw)
  await labStorage.run(labId, () => next())
  // Echo the resolved lab back as a cookie so better-auth requests
  // (plain cookie fetches without the custom header) stay in sync.
  // Appended, never replacing: auth responses already carry their own
  // Set-Cookie (session) which must survive.
  c.header('Set-Cookie', `lab_id=${encodeURIComponent(labId)}; Path=/; Max-Age=31536000; SameSite=Lax`, { append: true })
})

// Auth routes (better-auth handles its own sub-paths like /sign-in/email).
// NOTE: mounted with app.use, not app.on — Hono's RegExpRouter drops
// app.on multi-method wildcards once middleware-bearing sub-routers are
// mounted (auth silently 404s). The middleware matching path is robust.
app.use('/api/auth/*', async (c) => {
  // Block public self sign-up — only Admin/Supervisor can create accounts
  // via POST /api/users (which creates the Better Auth account internally).
  if (c.req.method === 'POST' && c.req.path.endsWith('/sign-up/email')) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) {
      return c.json(
        { error: 'Self sign-up is disabled. Contact an administrator to create an account.' },
        403,
      )
    }
    const dbUser = await db.select().from(users).where(eq(users.email, session.user.email)).get()
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'SUPERVISOR')) {
      return c.json({ error: 'Only administrators can create accounts.' }, 403)
    }
  }
  return auth.handler(c.req.raw)
})

// API routes
app.route('/api/items', itemsRouter)
app.route('/api/equipment', equipmentRouter)
app.route('/api/usage', usageRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/audit', auditRouter)
app.route('/api/categories', categoriesRouter)
app.route('/api/users', usersRouter)
app.route('/api/dashboard', dashboardRouter)
app.route('/api/role-permissions', rolePermissionsRouter)
app.route('/api/settings', settingsRouter)
app.route('/api/export', exportRouter)
app.route('/api/labs', labsRouter)

/**
 * SPA fallback. On Node the entry point serves ./dist statically and installs
 * a reader for index.html. On Workers the assets binding answers every
 * non-API path with index.html before the Worker is even invoked, so the
 * default (null) leaves just the JSON 404 for unknown /api/* routes.
 */
let readIndexHtml: (() => Promise<string | null>) | null = null

export function setIndexHtmlReader(reader: (() => Promise<string | null>) | null): void {
  readIndexHtml = reader
}

app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404)
  }
  const html = await readIndexHtml?.()
  if (!html) {
    return c.json(
      { error: 'Frontend not built — run `npm run dev:client` for dev or `npm run build` for prod' },
      404,
    )
  }
  return c.html(html)
})

export default app
