import { env, getBinding } from '../env'
import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/libsql'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import type { BatchItem, BatchResponse } from 'drizzle-orm/batch'
import { createClient } from '@libsql/client'
import * as schema from './schema'
import { LABS, getLab, type LabConfig } from './labs'

/**
 * Multi-lab database routing.
 *
 * Each lab gets its own isolated libSQL client + Drizzle instance
 * (separate .db file), created on first use and cached. Nothing touches the
 * database at import time: on Workers, a bad DATABASE_URL must still leave the
 * entry point able to explain what is wrong. The rest of the server
 * keeps importing `{ db }` from here and works unchanged: `db` is a Proxy
 * that forwards every access to the Drizzle instance of the lab attached
 * to the current request.
 *
 * The current lab is carried in an AsyncLocalStorage slot, set once per
 * request by the lab-resolution middleware in src/server/index.ts.
 * Outside a request (seed/migrate scripts, auth hooks without context)
 * it falls back to the first (default) lab.
 *
 * Two drivers, one surface: libSQL (a file on Node, Turso remotely) and D1
 * (Cloudflare, no filesystem). Both are SQLite to Drizzle and expose the same
 * query builders and `batch`, so every route is written once. Driver-specific
 * DDL and migrations stay out of the request path: Node runs ./drizzle at
 * boot, D1 is migrated with wrangler.
 */

type LabDb = ReturnType<typeof drizzle<typeof schema>>

const clients = new Map<string, LabDb>()

/**
 * The D1 binding a `file:` lab is served from, or null on Node.
 *
 * A Worker has no filesystem, so the primary lab's `file:` default can only
 * mean "the D1 database bound as DB" (wrangler.jsonc → d1_databases). Extra
 * labs on Workers still address their own database by libsql:// URL.
 */
function d1BindingFor(lab: LabConfig): unknown | null {
  if (lab.id !== LABS[0].id || !lab.url.startsWith('file:')) return null
  return getBinding('DB') ?? null
}

function createLabDb(lab: LabConfig): LabDb {
  const d1 = d1BindingFor(lab)
  // The client argument is typed through @cloudflare/workers-types, which this
  // repo deliberately does not install (the entry point is plain JS shapes).
  const labDb = d1
    ? (drizzleD1(d1 as never, { schema }) as unknown as LabDb)
    : // `url` is `file:...` on Node and `libsql://...` remotely; `token` only for the latter.
      drizzle(createClient(lab.token ? { url: lab.url, authToken: lab.token } : { url: lab.url }), { schema })
  clients.set(lab.id, labDb)
  return labDb
}

/** Register a newly created lab's database client (no restart needed). */
export function registerLabDb(lab: LabConfig): LabDb {
  return clients.get(lab.id) ?? createLabDb(lab)
}

/**
 * Run statements as one all-or-nothing unit, on either driver.
 *
 * D1 rejects an interactive `BEGIN`: each statement is its own auto-commit
 * transaction, and a batch is the only way to get several statements into one.
 * So every write that must not half-happen is a statement list here, and any
 * guard has to come from SQL state — a predicate in a WHERE, or an
 * `INSERT ... SELECT ... WHERE EXISTS (...)`. A statement may rely on what an
 * earlier statement in the same list *wrote*, never on its returned rows.
 */
export function atomic<const T extends BatchItem<'sqlite'>[]>(statements: T): Promise<BatchResponse<T>> {
  if (statements.length === 0) return Promise.resolve([] as unknown as BatchResponse<T>)
  return getLabDb().batch(
    statements as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]],
  ) as unknown as Promise<BatchResponse<T>>
}

/** Async context holding the current request's lab id. */
export const labStorage = new AsyncLocalStorage<string>()

/** Drizzle instance for a specific lab (or the request's lab by default). */
export function getLabDb(labId?: string): LabDb {
  // SEED_LAB lets scripts target one lab, e.g. `SEED_LAB=lab-2 npm run db:seed`.
  const wanted = labId ?? labStorage.getStore() ?? env.SEED_LAB ?? LABS[0].id
  const hit = clients.get(wanted)
  if (hit) return hit
  // Lab known (e.g. added to labs.json while running) but no client yet.
  const lab = getLab(wanted)
  if (lab && lab.id === wanted) return createLabDb(lab)
  return clients.get(LABS[0].id)!
}

/** Run `fn` with `labId` as the current lab (used by seed/migrate scripts). */
export function runWithLab<T>(labId: string, fn: () => T): T {
  const lab = getLab(labId)
  return labStorage.run(lab.id, fn) as T
}

/** All lab ids (used by migrate/seed to cover every database file). */
export function allLabIds(): string[] {
  return LABS.map((l) => l.id)
}

/**
 * Request-scoped `db`. Forwards property access (select/insert/update/delete/
 * query/...) to the current lab's Drizzle instance, binding methods so
 * `this`-sensitive internals keep working.
 */
export const db = new Proxy({} as LabDb, {
  get(_target, prop, _receiver) {
    const target = getLabDb()
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function' ? value.bind(target) : value
  },
}) as LabDb

export type { LabDb }
