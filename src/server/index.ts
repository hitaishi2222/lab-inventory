import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import app, { setIndexHtmlReader } from './app'
import { allLabIds, runWithLab } from './db'
import { ensureLabs, setLabStore } from './db/labs'
import { fileLabStore } from './db/labs-fs'
import { seedDefaultPermissions } from './lib/permissions'
import { startBackupScheduler } from './lib/backup'
import { log } from './lib/log'

/**
 * Node / Docker entry point. Everything runtime-specific lives here so
 * `app.ts` stays portable:
 *
 *   - dotenv + real env vars
 *   - the ./dist static files and the index.html SPA fallback
 *   - the in-process backup scheduler (fs + timers)
 *   - labs.json next to the database files
 *
 * Same app, same routes, same database code as the Worker entry point.
 */

setLabStore(fileLabStore)
await ensureLabs()

// Serve the Vite production build (./dist) when it exists.
// In dev this directory usually doesn't exist — the Vite dev server
// on :5173 handles static files and proxies /api here instead.
app.use('/*', serveStatic({ root: './dist' }))

// The HTML is cached after the first successful read: in production ./dist is
// baked into the image and never changes at runtime, so re-reading it from disk
// on every navigation (and crashing nothing when it is absent) is pure waste.
let indexHtml: string | null = null
setIndexHtmlReader(async () => {
  if (indexHtml !== null) return indexHtml
  try {
    indexHtml = await readFile('./dist/index.html', 'utf-8')
    return indexHtml
  } catch {
    return null
  }
})

// Ensure every lab has the current default permissions (idempotent,
// adds only missing rows). This is what grants existing ADMINs newly
// introduced permissions such as `labs:manage` after an update.
for (const labId of allLabIds()) {
  await runWithLab(labId, () => seedDefaultPermissions()).catch((err) =>
    log.warn(`Permission ensure failed [lab: ${labId}]:`, err),
  )
}

const port = Number(process.env.PORT || 3000)

// Only listen when run directly (`npm run dev:server`, `npm start`, or the
// bundled `node dist-server/index.js` in the container), so importing this
// module (e.g. in tests) doesn't open a port.
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`API + static server listening on http://localhost:${info.port}`)
  })
  // Backups run in this process — no sidecar container, no second image.
  startBackupScheduler()
}

export default app
