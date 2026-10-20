import { migrate } from 'drizzle-orm/libsql/migrator'
import type { LabDb } from './index'

/**
 * Bring one lab database file up to the current schema. Used by
 * `npm run db:migrate` for every lab and when an Admin creates a new lab
 * from the UI (fresh file → full schema).
 *
 * Everything lives in ./drizzle — including 0001/0002, which used to be absent
 * from the journal (a hand-written CREATE TABLE workaround lived here and had
 * to be kept in sync with the schema by hand). New schema changes belong in a
 * new ./drizzle/*.sql migration.
 */
export async function ensureLabDatabase(labDb: LabDb): Promise<void> {
  await migrate(labDb, { migrationsFolder: './drizzle' })
}
