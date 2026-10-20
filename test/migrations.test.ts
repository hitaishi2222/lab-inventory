import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

const DRIZZLE = join(process.cwd(), 'drizzle')

/**
 * Regression tests for the migration plumbing itself. Both checks below guard
 * bugs that were live in this repo and are invisible until someone installs
 * the app from scratch:
 *
 * 1. 0001_role_permissions and 0002_app_settings existed on disk but were
 *    missing from _journal.json, so the migrator skipped them and a
 *    hand-written CREATE TABLE workaround lived in db/ensure.ts.
 * 2. Any migration file that starts with a `--> statement-breakpoint`, or has a
 *    comment-only chunk between breakpoints, makes libsql's migration runner
 *    throw `SQLITE_UNKNOWN_0: not an error`.
 */
describe('drizzle migrations', () => {
  const files = readdirSync(DRIZZLE).filter((f) => f.endsWith('.sql')).sort()
  const journal = JSON.parse(readFileSync(join(DRIZZLE, 'meta', '_journal.json'), 'utf-8')) as {
    entries: { idx: number; tag: string; when: number }[]
  }

  it('lists every migration file in the journal, in order', () => {
    const tags = journal.entries.map((e) => e.tag)
    expect(tags).toEqual(files.map((f) => f.replace(/\.sql$/, '')))
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i))
    const whens = journal.entries.map((e) => e.when)
    expect(whens).toEqual([...whens].sort((a, b) => a - b))
  })

  it('has no empty or comment-only chunks (libsql chokes on them)', () => {
    for (const file of files) {
      const sql = readFileSync(join(DRIZZLE, file), 'utf-8')
      expect(sql.startsWith('--> statement-breakpoint'), `${file} starts with a breakpoint`).toBe(false)
      for (const chunk of sql.split('--> statement-breakpoint')) {
        if (chunk.trim() === '') continue
        const meaningful = chunk
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l !== '' && !l.startsWith('--'))
        expect(meaningful.length, `${file} has a chunk with no SQL`).toBeGreaterThan(0)
      }
    }
  })

  it('applies cleanly to a fresh database (twice) and creates the full schema', async () => {
    const path = join(tmpdir(), `lab-migrations-${process.pid}.db`)
    rmSync(path, { force: true })
    try {
      const db = drizzle(createClient({ url: `file:${path}` }))
      await migrate(db, { migrationsFolder: DRIZZLE })
      await migrate(db, { migrationsFolder: DRIZZLE }) // idempotent

      const client = createClient({ url: `file:${path}` })
      const objects = async (type: string) =>
        (await client.execute(`SELECT name FROM sqlite_master WHERE type='${type}'`)).rows.map(
          (r) => String(r.name),
        )

      const tables = await objects('table')
      for (const table of [
        'users',
        'items',
        'chemical_details',
        'equipment_details',
        'equipment_checkouts',
        'equipment_reservations',
        'usage_logs',
        'audit_logs',
        'notifications',
        'role_permissions',
        'app_settings',
        'session',
        'account',
        'verification',
      ]) {
        expect(tables, `missing table ${table}`).toContain(table)
      }

      const indexes = await objects('index')
      expect(indexes).toContain('usage_logs_item_idx')
      expect(indexes).toContain('audit_logs_timestamp_idx')

      // The 0006 rebuild must leave user references nullable with SET NULL.
      const ddl = (
        await client.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_logs'")
      ).rows[0]!.sql as string
      expect(ddl).toContain('ON DELETE set null')
      expect(ddl).not.toMatch(/`user_id` text NOT NULL/)
    } finally {
      rmSync(path, { force: true })
    }
  })
})
