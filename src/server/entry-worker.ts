import app from './app'
import { setEnv } from './env'
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
export default {
  async fetch(request: Request, workerEnv: Record<string, unknown>): Promise<Response> {
    setEnv(workerEnv)
    await ensureLabs()
    return app.fetch(request, workerEnv as never, {} as never)
  },
}
