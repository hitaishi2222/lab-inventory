import app from './app'
import { env, setEnv } from './env'
import { ensureLabs } from './db/labs'

/**
 * Cloudflare Workers entry point.
 *
 * Node-only pieces stay in index.ts: dotenv, serve(), ./dist static files
 * (the `assets` binding in wrangler.jsonc replaces them), the backup
 * scheduler, and labs.json. Everything else is the same app.
 *
 * Bindings are copied into the env shim on first use so `env.BETTER_AUTH_URL`
 * etc. read from wrangler vars/secrets exactly like they read from .env.
 *
 * shortcut: no scheduled backups here — point DATABASE_URL at Turso, which
 * keeps point-in-time restore itself. Add a `scheduled` handler writing to R2
 * if you ever need self-hosted dumps on Workers.
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
  if (!hasLabList && !/^(libsql|https?|wss?):/i.test(dbUrl)) {
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
    return app.fetch(request, workerEnv as never, {} as never)
  },
}
