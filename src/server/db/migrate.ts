import { getLabDb, allLabIds } from './index'
import { LABS } from './labs'
import { ensureLabDatabase } from './ensure'

// Applies ./drizzle/*.sql migrations to every configured lab database.
// Single-lab: migrates DATABASE_URL (unchanged behaviour).
// Multi-lab: migrates each lab's file so both labs stay on the same schema.
// Usage: npm run db:migrate
for (const labId of allLabIds()) {
  const lab = LABS.find((l) => l.id === labId)!
  await ensureLabDatabase(getLabDb(labId))
  console.log(`Migrations applied [${lab.name} → ${lab.url}].`)
}
