import { env } from '../env'
import { dirname, join } from 'node:path'
import { log } from '../lib/log'

/**
 * Multi-lab configuration.
 *
 * Two ways to get more labs:
 *
 *   1. Environment (fixed, set before starting the server):
 *      DATABASE_URL=file:./data/lab1.db
 *      LAB2_DATABASE_URL=file:./data/lab2.db
 *      LAB1_NAME="Photonics Lab"   (optional, default "Lab 1")
 *      LAB2_NAME="Quantum Lab"     (optional, default "Lab 2")
 *      ...or the explicit JSON list LAB_DATABASES (see below).
 *
 *   2. Admin UI (runtime): Administration → Labs → "New lab".
 *      Created labs are recorded in <data-dir>/labs.json next to the
 *      database files, so they survive restarts and work in Docker.
 *
 * Each lab gets a completely isolated database file: its own users,
 * inventory, equipment, audit log and settings. Nothing is shared.
 * Whoever creates a lab automatically gets the same Admin account
 * (same email/username/password) inside the new lab.
 */

export interface LabConfig {
  id: string
  name: string
  url: string
  /** libSQL auth token (Turso). Omitted for local `file:` databases. */
  token?: string
}

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function parseEnvLabs(): LabConfig[] {
  const raw = env.LAB_DATABASES?.trim()
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Array<{ id?: string; name?: string; url?: string; token?: string }>
      const labs = arr
        .filter((l) => l && typeof l.url === 'string' && l.url.length > 0)
        .map((l, i) => ({
          id: slug(l.id || l.name || `lab-${i + 1}`) || `lab-${i + 1}`,
          name: (l.name || `Lab ${i + 1}`).trim().slice(0, 80),
          url: (l.url as string).trim(),
          token: typeof l.token === 'string' && l.token.trim() ? l.token.trim() : undefined,
        }))
      const seen = new Set<string>()
      const deduped = labs.filter((l) => {
        if (seen.has(l.id)) return false
        seen.add(l.id)
        return true
      })
      if (deduped.length > 0) return deduped
      log.warn('LAB_DATABASES parsed but contained no usable entries — falling back to single-lab mode.')
    } catch (err) {
      log.warn('Could not parse LAB_DATABASES JSON — falling back to single-lab mode:', err)
    }
  }

  const primary = env.DATABASE_URL || 'file:./data/lab.db'
  const token = env.DATABASE_AUTH_TOKEN?.trim() || undefined
  const second = env.LAB2_DATABASE_URL?.trim()
  if (second) {
    return [
      {
        id: slug(env.LAB1_ID || env.LAB1_NAME || 'lab-1') || 'lab-1',
        name: (env.LAB1_NAME || 'Lab 1').trim().slice(0, 80),
        url: primary,
        token,
      },
      {
        id: slug(env.LAB2_ID || env.LAB2_NAME || 'lab-2') || 'lab-2',
        name: (env.LAB2_NAME || 'Lab 2').trim().slice(0, 80),
        url: second,
        token: env.LAB2_DATABASE_AUTH_TOKEN?.trim() || token,
      },
    ]
  }

  return [
    {
      id: 'lab',
      name: (env.LAB1_NAME || 'Lab').trim().slice(0, 80),
      url: primary,
      token,
    },
  ]
}

/** Directory that holds the database files (derived from the primary DB). */
export function labsDataDir(): string {
  const primary = env.DATABASE_URL || 'file:./data/lab.db'
  if (primary.startsWith('file:')) {
    const path = primary.slice('file:'.length).split('?')[0]
    const dir = dirname(path)
    if (dir && dir !== '.') return dir
  }
  return env.LAB_DATA_DIR || './data'
}

export function labRegistryFile(): string {
  return env.LAB_REGISTRY_FILE || join(labsDataDir(), 'labs.json')
}

export interface RegistryLab {
  id: string
  name: string
  /** Database filename inside the data dir (never a path — no traversal). */
  file: string
}

function isSafeFile(file: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,38}\.db$/.test(file) && !file.includes('/') && !file.includes('\\')
}

/**
 * Where Admin-created labs are remembered between restarts.
 *
 * Node/Docker: `labs.json` next to the database files (see labs-fs.ts).
 * Workers: nothing — dynamic labs need a database per lab, and a Worker has
 * nowhere to write the registry, so it reads an empty list and refuses writes.
 */
export interface LabRegistryStore {
  read(): Promise<RegistryLab[]>
  write(labs: RegistryLab[]): Promise<void>
}

let store: LabRegistryStore = {
  read: async () => [],
  write: async () => {
    throw new Error('Creating labs at runtime needs a writable registry — set LAB2_DATABASE_URL instead.')
  },
}

/** Installed by the Node entry point (labs-fs.ts). */
export function setLabStore(next: LabRegistryStore): void {
  store = next
  ensurePromise = null
}

/**
 * The live lab list: env labs first, then registry (Admin-created) labs.
 * Seeds from env synchronously so scripts and tests can import this module
 * and use `LABS` immediately; ensureLabs() appends registry labs at boot.
 * Mutated in place by addRegistryLab() so a new lab needs no restart.
 */
export const LABS: LabConfig[] = parseEnvLabs()

let ensurePromise: Promise<void> | null = null

/** Load persisted labs once. Idempotent; safe to await on every request. */
export function ensureLabs(): Promise<void> {
  ensurePromise ??= (async () => {
    let registry: RegistryLab[]
    try {
      registry = await store.read()
    } catch (err) {
      log.warn('Could not read the lab registry — using env labs only:', err)
      return
    }
    const dir = labsDataDir()
    const seen = new Set(LABS.map((l) => l.id))
    for (const l of registry) {
      if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || typeof l.file !== 'string') continue
      const id = slug(l.id)
      const name = l.name.trim().slice(0, 80)
      if (!id || !name || !isSafeFile(l.file) || seen.has(id)) continue
      seen.add(id)
      LABS.push({ id, name, url: `file:${join(dir, l.file)}` })
    }
  })()
  return ensurePromise
}

export function isMultiLab(): boolean {
  return LABS.length > 1
}

export function getLab(id: string | null | undefined): LabConfig {
  if (!id) return LABS[0]
  return LABS.find((l) => l.id === id) ?? LABS[0]
}

/** Public (unauthenticated) lab list for the login-page selector. No secrets. */
export function publicLabList(): Array<{ id: string; name: string }> {
  return LABS.map((l) => ({ id: l.id, name: l.name }))
}

/**
 * Record a new Admin-created lab: registry write, then in-memory registration.
 * `file` is derived from the id, so the same call works for any store.
 */
export async function addRegistryLab(name: string): Promise<LabConfig> {
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('Lab name is required.')
  let base = slug(clean) || 'lab'
  let id = base
  let n = 2
  const taken = new Set(LABS.map((l) => l.id))
  while (taken.has(id)) id = `${base}-${n++}`
  const file = `${id}.db`
  if (!isSafeFile(file)) throw new Error('Could not derive a safe database filename.')

  const current = await store.read()
  await store.write([...current, { id, name: clean, file }])

  const config: LabConfig = { id, name: clean, url: `file:${join(labsDataDir(), file)}` }
  LABS.push(config)
  return config
}
