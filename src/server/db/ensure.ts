import { migrate } from 'drizzle-orm/libsql/migrator'
import { sql } from 'drizzle-orm'
import type { LabDb } from './index'

/**
 * Bring one lab database file up to the current schema. Used by
 * `npm run db:migrate` for every lab and when an Admin creates a new lab
 * from the UI (fresh file → full schema).
 */
export async function ensureLabDatabase(labDb: LabDb): Promise<void> {
  await migrate(labDb, { migrationsFolder: './drizzle' })
  // Robustness: drizzle/0001 (role_permissions) and 0002 (app_settings)
  // are not listed in drizzle/meta/_journal.json, so the migrator skips
  // them on fresh databases. Ensure they exist (no-op when present).
  await labDb.run(sql`
    CREATE TABLE IF NOT EXISTS \`role_permissions\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`role\` text NOT NULL,
      \`permission\` text NOT NULL,
      \`created_at\` text DEFAULT (datetime('now')) NOT NULL
    )`)
  await labDb.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS \`role_permissions_role_permission_unique\`
    ON \`role_permissions\` (\`role\`, \`permission\`)`)
  await labDb.run(sql`
    CREATE TABLE IF NOT EXISTS \`app_settings\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`key\` text NOT NULL,
      \`value\` text,
      \`updated_at\` text DEFAULT (datetime('now')) NOT NULL
    )`)
  await labDb.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS \`app_settings_key_unique\`
    ON \`app_settings\` (\`key\`)`)
}
