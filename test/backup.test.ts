import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'

/**
 * The backup scheduler replaced a second container (alpine + cron + sqlite3
 * CLI). These tests pin down what that container used to guarantee: a copy that
 * opens as a real database with the data in it, retention, and "don't write a
 * new backup on every restart".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any
let labId: string
let dir: string

const config = () => ({ dir, keep: 2, intervalHours: 24 })

beforeAll(async () => {
  const dbMod = await import('../src/server/db')
  const { ensureLabDatabase } = await import('../src/server/db/ensure')
  const { seedDefaultPermissions } = await import('../src/server/lib/permissions')
  await ensureLabDatabase(dbMod.getLabDb())
  await dbMod.runWithLab(dbMod.allLabIds()[0]!, () => seedDefaultPermissions())
  db = dbMod.db
  schema = await import('../src/server/db/schema')
  labId = dbMod.allLabIds()[0]!

  const cat = { id: crypto.randomUUID(), name: 'Backup Category' }
  await db.insert(schema.categories).values(cat).catch(() => {})
  await db.insert(schema.items).values({
    id: crypto.randomUUID(),
    name: 'Backup Witness Item',
    categoryId: cat.id,
    quantity: 7,
    unit: 'pcs',
    minStockThreshold: 1,
  })

  dir = await mkdtemp(join(tmpdir(), 'lab-backup-test-'))
})

describe('backupFileName', () => {
  it('sorts chronologically as text', async () => {
    const { backupFileName } = await import('../src/server/lib/backup')
    const names = ['2026-01-02T03:04:05Z', '2025-12-31T23:59:59Z', '2026-10-20T02:00:00Z'].map(
      (iso) => backupFileName('lab-1', new Date(iso)),
    )
    expect(names.slice().sort()).toEqual([names[1], names[0], names[2]])
    expect(names[0]).toBe('backup_lab-1_20260102_030405.db')
  })
})

describe('runBackups', () => {
  it('writes a copy that opens as a real database', async () => {
    const { runBackups } = await import('../src/server/lib/backup')
    const result = await runBackups(config(), new Date('2026-10-20T02:00:00Z'))
    expect(result.skipped).toBe(false)
    expect(result.created).toHaveLength(1)
    expect(result.created[0]!.bytes).toBeGreaterThan(0)

    // The copy is self-contained: open it directly and read the witness row.
    const copy = createClient({ url: `file:${result.created[0]!.file}` })
    const rows = await copy.execute("SELECT name, quantity FROM items WHERE name = 'Backup Witness Item'")
    expect(rows.rows).toHaveLength(1)
    expect(Number(rows.rows[0]!.quantity)).toBe(7)
    // ...and it has the schema, not just data.
    const tables = await copy.execute("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'")
    expect(Number(tables.rows[0]!.n)).toBeGreaterThan(5)
  })

  it('does not write another backup while the newest one is fresh', async () => {
    const { runBackups } = await import('../src/server/lib/backup')
    const again = await runBackups(config(), new Date('2026-10-20T04:00:00Z'))
    expect(again).toMatchObject({ skipped: true, created: [] })
  })

  it('keeps only the newest N backups per lab', async () => {
    const { runBackups } = await import('../src/server/lib/backup')
    await runBackups(config(), new Date('2026-10-21T02:00:00Z'))
    const result = await runBackups(config(), new Date('2026-10-22T02:00:00Z'))
    expect(result.pruned.length).toBeGreaterThan(0)

    const files = (await readdir(dir)).filter((f) => f.startsWith(`backup_${labId}_`)).sort()
    expect(files).toHaveLength(2) // BACKUP_KEEP
    expect(files[files.length - 1]).toContain('20261022')
  })

  it('cleans up after itself', async () => {
    await rm(dir, { recursive: true, force: true })
    await expect(stat(dir)).rejects.toThrow()
  })
})
