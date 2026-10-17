import 'dotenv/config'
import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'
import { LABS, getLab, type LabConfig } from './labs'

/**
 * Multi-lab database routing.
 *
 * Each lab gets its own isolated libSQL client + Drizzle instance
 * (separate .db file), created lazily and cached. The rest of the server
 * keeps importing `{ db }` from here and works unchanged: `db` is a Proxy
 * that forwards every access to the Drizzle instance of the lab attached
 * to the current request.
 *
 * The current lab is carried in an AsyncLocalStorage slot, set once per
 * request by the lab-resolution middleware in src/server/index.ts.
 * Outside a request (seed/migrate scripts, auth hooks without context)
 * it falls back to the first (default) lab.
 */

type LabDb = ReturnType<typeof drizzle<typeof schema>>

const clients = new Map<string, LabDb>()

function createLabDb(lab: LabConfig): LabDb {
  const client = createClient({ url: lab.url })
  const labDb = drizzle(client, { schema })
  clients.set(lab.id, labDb)
  return labDb
}

for (const lab of LABS) {
  createLabDb(lab)
}

/** Register a newly created lab's database client (no restart needed). */
export function registerLabDb(lab: LabConfig): LabDb {
  return clients.get(lab.id) ?? createLabDb(lab)
}

/** Async context holding the current request's lab id. */
export const labStorage = new AsyncLocalStorage<string>()

/** Drizzle instance for a specific lab (or the request's lab by default). */
export function getLabDb(labId?: string): LabDb {
  // SEED_LAB lets scripts target one lab, e.g. `SEED_LAB=lab-2 npm run db:seed`.
  const wanted = labId ?? labStorage.getStore() ?? process.env.SEED_LAB ?? LABS[0].id
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
