// Put the same seeded database you get locally into the deployed D1 database.
//
//   npm run db:seed:d1              # remote (needs CLOUDFLARE_API_TOKEN + ACCOUNT_ID)
//   D1_LOCAL=1 npm run db:seed:d1   # into the local miniflare D1 (for testing)
//
// The seed path needs a Node runtime — better-auth hashes the admin password —
// and D1 is only reachable from Cloudflare, so this builds the database in a
// throwaway SQLite file, dumps it as INSERTs and replays them with
// `wrangler d1 execute`. That is Cloudflare's own documented import path, and it
// means the Workers deploy never grows a second seeding code path.
//
// Idempotent: the dump uses INSERT OR IGNORE and scripts/seed.ts skips whatever
// already exists. Run `npm run db:migrate:d1` (or :local) first — this inserts
// rows, it does not create tables.
import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'

const scratch = './data/d1-seed.db'
const dumpFile = './data/d1-seed.sql'
const database = process.env.D1_DATABASE_NAME || 'lab-inventory'
const local = Boolean(process.env.D1_LOCAL)

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(cmd, args, { env, stdio: 'inherit' })
}

/** One SQL literal. Drizzle hands back plain JS values, never expressions. */
function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  // `mode: 'timestamp'` columns hold unix seconds; a Date would print as prose.
  if (value instanceof Date) return String(Math.floor(value.getTime() / 1000))
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

rmSync(scratch, { force: true })
const env = { ...process.env, DATABASE_URL: `file:${scratch}` }

try {
  run('npx', ['tsx', 'src/server/db/migrate.ts'], env)
  run('npx', ['tsx', 'scripts/seed.ts'], env)

  // Imported after DATABASE_URL points at the scratch file; the env shim reads
  // process.env lazily, so this is the database the seed just filled (and not
  // whatever .env points at).
  process.env.DATABASE_URL = `file:${scratch}`
  const [{ db }, schema] = await Promise.all([
    import('../src/server/db/index.ts'),
    import('../src/server/db/schema.ts'),
  ])

  const statements: string[] = []
  const tables = Object.values(schema)
  const nameOf = (table: (typeof tables)[number]) => getTableName(table)

  // A module namespace lists exports alphabetically, so declaration order is not
  // insertion order: `account` would be replayed before `user`. Sort parents
  // before children instead, because D1 auto-commits every statement and a
  // deferred foreign key cannot span the file.
  const parents = new Map<string, Set<string>>(
    tables.map((table) => [
      nameOf(table),
      new Set(
        getTableConfig(table)
          .foreignKeys.map((fk) => nameOf(fk.reference().foreignTable as (typeof tables)[number]))
          .filter((name) => name !== nameOf(table)),
      ),
    ]),
  )
  const ordered: typeof tables = []
  const pending = [...tables]
  while (pending.length > 0) {
    const done = new Set(ordered.map(nameOf))
    // No ready table means a foreign-key cycle: keep the remaining order.
    const index = pending.findIndex((table) => [...parents.get(nameOf(table))!].every((name) => done.has(name)))
    ordered.push(pending.splice(index === -1 ? 0 : index, 1)[0]!)
  }

  for (const table of ordered) {
    const columns = Object.entries(getTableColumns(table))
    const rows = await db.select().from(table)
    for (const row of rows) {
      const values = columns.map(([key]) => literal((row as Record<string, unknown>)[key]))
      const names = columns.map(([, column]) => `"${column.name}"`)
      statements.push(`INSERT OR IGNORE INTO "${getTableName(table)}" (${names.join(', ')}) VALUES (${values.join(', ')});`)
    }
  }

  writeFileSync(dumpFile, statements.join('\n') + '\n')
  console.log(`${statements.length} rows → ${dumpFile}`)

  run('npx', ['wrangler', 'd1', 'execute', database, ...(local ? ['--local'] : ['--remote']), `--file=${dumpFile}`], process.env)
} finally {
  // Both files hold a real password hash; the operator has the SQL output above.
  rmSync(scratch, { force: true })
  if (!process.env.D1_DEBUG) rmSync(dumpFile, { force: true })
}
