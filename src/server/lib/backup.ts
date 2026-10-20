import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { allLabIds, getLabDb } from '../db'
import { log } from './log'

/**
 * In-process SQLite backups.
 *
 * Backups used to be a second container: an alpine image running cron with the
 * sqlite3 CLI against the same bind mount. That meant two images, two things to
 * restart, and a backup job that could not see the app's own lab list. One
 * process can do it: `VACUUM INTO` produces a transactionally consistent,
 * defragmented copy of a live database without stopping anything, so the app
 * schedules it itself and the deployment stays a single container on a single
 * port.
 *
 * Schedule: a light check every hour writes a backup per lab when the newest
 * one is older than BACKUP_INTERVAL_HOURS (default 24). Checking the files on
 * disk instead of keeping a timer means restarts and redeploys do not produce a
 * fresh backup each time.
 */

export interface BackupConfig {
  dir: string
  keep: number
  intervalHours: number
}

export interface BackupResult {
  labId: string
  file: string
  bytes: number
}

const HOUR = 60 * 60 * 1000

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function readBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfig {
  return {
    dir: env.BACKUP_DIR?.trim() || './backups',
    keep: positiveInt(env.BACKUP_KEEP, 14),
    intervalHours: positiveInt(env.BACKUP_INTERVAL_HOURS, 24),
  }
}

export function isBackupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.BACKUP_ENABLED?.trim().toLowerCase()
  return flag !== '0' && flag !== 'false' && flag !== 'off'
}

/** `backup_<lab>_20261020_020000.db` — timestamps sort chronologically as text. */
export function backupFileName(labId: string, when: Date): string {
  const iso = when.toISOString() // 2026-10-20T02:00:00.000Z
  const stamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`
  return `backup_${labId}_${stamp}.db`
}

function backupFiles(labId: string, entries: string[]): string[] {
  const prefix = `backup_${labId}_`
  return entries.filter((name) => name.startsWith(prefix) && name.endsWith('.db')).sort()
}

/** Write one lab's database to `<dir>/backup_<lab>_<timestamp>.db`. */
export async function backupLabDatabase(
  labId: string,
  config: Pick<BackupConfig, 'dir'>,
  when: Date = new Date(),
): Promise<BackupResult> {
  await mkdir(config.dir, { recursive: true })
  const file = join(config.dir, backupFileName(labId, when))

  // VACUUM INTO is the supported way to copy a database that is in use: it
  // takes a read transaction for the duration, so the copy is consistent and
  // the result is compacted (no free pages). Drizzle binds the path as a
  // parameter, so no quoting games are needed.
  await getLabDb(labId).run(sql`VACUUM INTO ${file}`)

  const { size } = await stat(file)
  return { labId, file, bytes: size }
}

/** Delete all but the newest `keep` backups for a lab. */
export async function pruneBackups(
  labId: string,
  config: Pick<BackupConfig, 'dir' | 'keep'>,
): Promise<string[]> {
  const entries = await readdir(config.dir).catch(() => [] as string[])
  const files = backupFiles(labId, entries)
  const excess = files.slice(0, Math.max(0, files.length - config.keep))
  for (const name of excess) {
    await unlink(join(config.dir, name)).catch((err) => log.warn(`Could not remove old backup ${name}:`, err))
  }
  return excess
}

/** Whether the newest backup for a lab is older than the configured interval. */
export async function isBackupDue(
  labId: string,
  config: BackupConfig,
  now: Date = new Date(),
): Promise<boolean> {
  const entries = await readdir(config.dir).catch(() => [] as string[])
  const files = backupFiles(labId, entries)
  if (files.length === 0) return true

  // File name carries the timestamp; fall back to mtime if it was renamed.
  const newest = files[files.length - 1]!
  const match = /_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.db$/.exec(newest)
  const writtenAt = match
    ? Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      )
    : (await stat(join(config.dir, newest)).catch(() => ({ mtimeMs: 0 }))).mtimeMs

  return now.getTime() - writtenAt >= config.intervalHours * HOUR
}

export interface BackupRunResult {
  skipped: boolean
  created: BackupResult[]
  pruned: string[]
}

/** Back up every lab if one is due (used by the scheduler and by hand). */
export async function runBackups(
  config: BackupConfig = readBackupConfig(),
  now: Date = new Date(),
): Promise<BackupRunResult> {
  const due = await Promise.all(allLabIds().map((labId) => isBackupDue(labId, config, now)))
  if (!due.some(Boolean)) return { skipped: true, created: [], pruned: [] }

  const created: BackupResult[] = []
  const pruned: string[] = []
  for (const labId of allLabIds()) {
    if (!(await isBackupDue(labId, config, now))) continue
    try {
      const result = await backupLabDatabase(labId, config, now)
      created.push(result)
      log.info(
        `Database backup written [lab: ${labId}] ${(result.bytes / 1024).toFixed(0)} kB → ${result.file}`,
      )
      pruned.push(...(await pruneBackups(labId, config)))
    } catch (err) {
      // A backup failure must never take the app down; the next tick retries.
      log.warn(`Database backup failed [lab: ${labId}]:`, err)
    }
  }
  return { skipped: false, created, pruned }
}

/**
 * Start the hourly check. Returns a stop function. Timers are unref'd so a
 * script that imports the server can still exit.
 */
export function startBackupScheduler(config: BackupConfig = readBackupConfig()): () => void {
  if (!isBackupEnabled()) {
    log.info('Database backups disabled (BACKUP_ENABLED=0).')
    return () => {}
  }

  const tick = () => {
    void runBackups(config).catch((err) => log.warn('Database backup check failed:', err))
  }

  // Small delay so start-up (migrations, permission seeding) finishes first.
  const first = setTimeout(tick, 5_000)
  const repeat = setInterval(tick, HOUR)
  first.unref()
  repeat.unref()

  return () => {
    clearTimeout(first)
    clearInterval(repeat)
  }
}
