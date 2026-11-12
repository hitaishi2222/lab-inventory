import app from './app'
import { env, setEnv, getBinding } from './env'
import { ensureLabs } from './db/labs'

/**
 * Cloudflare Workers entry point.
 *
 * Node-only pieces stay in index.ts: dotenv, serve(), ./dist static files
 * (the `assets` binding in wrangler.jsonc replaces them), the backup
 * scheduler, and labs.json. Everything else is the same app.
 *
 * Bindings are copied into the env shim on first use so `env.BETTER_AUTH_URL`
 * etc. read from wrangler vars/secrets exactly like they read from .env. The D1
 * binding is an object, so it is reached through getBinding('DB') instead.
 *
 * shortcut: no scheduled backups here — D1's Time Travel keeps 30 days of
 * point-in-time restore, so add a `scheduled` handler writing to R2 only if you
 * need dumps you own.
 */

/** Placeholder shipped in wrangler.jsonc; logins fail with 403 until it changes. */
const PLACEHOLDER_AUTH_URL = 'https://labs.example.com'

/**
 * The two values a Worker cannot default: a remote database and its own public
 * URL. Report them as one sentence instead of a libSQL stack trace at startup
 * or a 403 INVALID_ORIGIN at the login form.
 */
function configProblem(): string | null {
  const dbUrl = (env.DATABASE_URL ?? '').trim()
  const hasLabList = Boolean(env.LAB_DATABASES?.trim())
  // The primary lab comes from the D1 binding when there is one (wrangler.jsonc
  // → d1_databases); only extra labs need a remote libSQL URL.
  const hasD1 = Boolean(getBinding('DB'))
  if (!hasD1 && !hasLabList && !/^(libsql|https?|wss?):/i.test(dbUrl)) {
    return `DATABASE_URL must be a remote libSQL URL such as libsql://<db>-<org>.turso.io — got "${dbUrl || 'nothing'}". A Worker has no filesystem, so file: databases cannot work. Set it with: npx wrangler secret put DATABASE_URL`
  }
  const authUrl = (env.BETTER_AUTH_URL ?? '').trim()
  if (!authUrl || authUrl === PLACEHOLDER_AUTH_URL) {
    return `BETTER_AUTH_URL must be this Worker's public URL (https://<worker>.<subdomain>.workers.dev or your domain), got "${authUrl || 'nothing'}". Set it in wrangler.jsonc or with: npx wrangler secret put BETTER_AUTH_URL`
  }
  return null
}

export default {
  async fetch(request: Request, workerEnv: Record<string, unknown>): Promise<Response> {
    setEnv(workerEnv)
    const problem = configProblem()
    if (problem) return new Response(`${problem}\n`, { status: 500 })
    await ensureLabs()
    try {
      return await app.fetch(request, workerEnv as never, {} as never)
    } catch (err) {
      // A fresh D1 database has no tables. Say how to fix it instead of leaking
      // "no such table: user" from the auth layer.
      if (/no such table/i.test(String(err))) {
        return new Response(
          'This D1 database has no schema yet. Apply it from your machine: npm run db:migrate:d1\n',
          { status: 500 },
        )
      }
      throw err
    }
  },
}
