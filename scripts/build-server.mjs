/**
 * Bundles the server into plain JavaScript for the production image.
 *
 * Why: the runtime image used to ship the whole toolchain and start the server
 * with `npx tsx`, which means a TypeScript compiler (plus its own dependency
 * tree) sitting in production and a cold start that transpiles every request.
 * Bundling with the esbuild that already arrives via Vite gives three small
 * ESM entry points that run on bare `node`.
 *
 * `packages: 'external'` keeps npm imports as-is — better-auth, drizzle, hono
 * and libsql still come from node_modules (installed with --omit=dev in the
 * image), so nothing large is duplicated into the bundle.
 */
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: {
    index: 'src/server/index.ts',
    migrate: 'src/server/db/migrate.ts',
    seed: 'scripts/seed.ts',
  },
  outdir: 'dist-server',
})
