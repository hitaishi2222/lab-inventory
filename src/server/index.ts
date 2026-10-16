import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { auth } from './auth'
import { db } from './db'
import { users } from './db/schema'
import { eq } from 'drizzle-orm'
import { itemsRouter } from './routes/items'
import { equipmentRouter } from './routes/equipment'
import { usageRouter } from './routes/usage'
import { notificationsRouter } from './routes/notifications'
import { auditRouter } from './routes/audit'
import { categoriesRouter } from './routes/categories'
import { usersRouter } from './routes/users'
import { rolePermissionsRouter } from './routes/role-permissions'
import { settingsRouter } from './routes/settings'
import { exportRouter } from './routes/export'

const app = new Hono()

app.use('*', cors())

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
app.route('/api/role-permissions', rolePermissionsRouter)
app.route('/api/settings', settingsRouter)
app.route('/api/export', exportRouter)

// Serve the Vite production build (./dist) when it exists.
// In dev this directory usually doesn't exist — the Vite dev server
// on :5173 handles static files and proxies /api here instead.
app.use('/*', serveStatic({ root: './dist' }))

// SPA fallback: unknown non-API routes get index.html so React Router works.
// Unknown /api/* routes get a JSON 404 instead.
app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404)
  }
  try {
    const html = await readFile('./dist/index.html', 'utf-8')
    return c.html(html)
  } catch {
    return c.json(
      { error: 'Frontend not built — run `npm run dev:client` for dev or `npm run build` for prod' },
      404,
    )
  }
})

const port = Number(process.env.PORT || 3000)

// Only listen when run directly (`npm run dev:server` / `npm start`),
// so importing this module (e.g. in tests) doesn't open a port.
if (process.argv[1]?.endsWith('src/server/index.ts') || process.argv[1]?.endsWith('dist/server/index.js')) {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`API + static server listening on http://localhost:${info.port}`)
  })
}

export default app
