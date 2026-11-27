/**
 * One entry point for every wrangler call, so the D1 database id can come from
 * the environment instead of a committed file.
 *
 *   npx tsx scripts/wrangler.ts deploy
 *   D1_DATABASE_ID=<uuid> npx tsx scripts/wrangler.ts deploy
 *
 * With `D1_DATABASE_ID` set (Cloudflare Builds → build secret, or an env var on
 * your machine) the committed config is copied with that id and the copy is
 * used. Without it, the committed config is used unchanged — CI's `--dry-run`
 * and local `dev:worker` keep working with no setup.
 *
 * The wrangler version is pinned here, not resolved per call site: wrangler 4
 * needs Node >= 22 while the app ships on Node 20, so it is deliberately not a
 * dependency (see docs/CLOUDFLARE-FORK.md).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { COMMITTED_CONFIG, GENERATED_CONFIG, withDatabaseId } from './wrangler-config.ts'

const WRANGLER_VERSION = '4.160.0'

const args = process.argv.slice(2)
const databaseId = process.env.D1_DATABASE_ID

let config = COMMITTED_CONFIG
if (databaseId?.trim()) {
  writeFileSync(GENERATED_CONFIG, withDatabaseId(readFileSync(COMMITTED_CONFIG, 'utf8'), databaseId))
  config = GENERATED_CONFIG
}

// Don't fight an explicit -c/--config in the arguments (npm scripts pass none).
const explicitConfig = args.some((a) => a === '-c' || a === '--config' || a.startsWith('--config='))

execFileSync(
  'npx',
  ['--yes', `wrangler@${WRANGLER_VERSION}`, ...args, ...(explicitConfig ? [] : ['-c', config])],
  { stdio: 'inherit' },
)
