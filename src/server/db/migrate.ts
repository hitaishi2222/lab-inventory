// `.env` is loaded here because these commands run outside dist-server/index.js
// (which is the only other place dotenv is imported). Real environment
// variables win: dotenv never overwrites what the shell already set.
import 'dotenv/config'
import { getLabDb, allLabIds } from './index'
import { LABS } from './labs'
import { log } from '../lib/log'
import { ensureLabDatabase } from './ensure'

// Applies ./drizzle/*.sql migrations to every configured lab database.
// Single-lab: migrates DATABASE_URL (unchanged behaviour).
// Multi-lab: migrates each lab's file so both labs stay on the same schema.
// Usage: npm run db:migrate
for (const labId of allLabIds()) {
  const lab = LABS.find((l) => l.id === labId)!
  await ensureLabDatabase(getLabDb(labId))
  // log.info redacts credentials/`authToken=` from the connection URL, so a
  // libsql:// URL with an embedded token can still be logged safely.
  log.info(`Migrations applied [${lab.name} → ${lab.url}].`)
}
