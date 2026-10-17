import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'

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
  const raw = process.env.LAB_DATABASES?.trim()
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Array<{ id?: string; name?: string; url?: string }>
      const labs = arr
        .filter((l) => l && typeof l.url === 'string' && l.url.length > 0)
        .map((l, i) => ({
          id: slug(l.id || l.name || `lab-${i + 1}`) || `lab-${i + 1}`,
          name: (l.name || `Lab ${i + 1}`).trim().slice(0, 80),
          url: (l.url as string).trim(),
        }))
      const seen = new Set<string>()
      const deduped = labs.filter((l) => {
        if (seen.has(l.id)) return false
        seen.add(l.id)
        return true
      })
      if (deduped.length > 0) return deduped
      console.warn('LAB_DATABASES parsed but contained no usable entries — falling back to single-lab mode.')
    } catch (err) {
      console.warn('Could not parse LAB_DATABASES JSON — falling back to single-lab mode:', err)
    }
  }

  const primary = process.env.DATABASE_URL || 'file:./data/lab.db'
  const second = process.env.LAB2_DATABASE_URL?.trim()
  if (second) {
    return [
      {
        id: slug(process.env.LAB1_ID || process.env.LAB1_NAME || 'lab-1') || 'lab-1',
        name: (process.env.LAB1_NAME || 'Lab 1').trim().slice(0, 80),
        url: primary,
      },
      {
        id: slug(process.env.LAB2_ID || process.env.LAB2_NAME || 'lab-2') || 'lab-2',
        name: (process.env.LAB2_NAME || 'Lab 2').trim().slice(0, 80),
        url: second,
      },
    ]
  }

  return [
    {
      id: 'lab',
      name: (process.env.LAB1_NAME || 'Lab').trim().slice(0, 80),
      url: primary,
    },
  ]
}

/** Directory that holds the database files (derived from the primary DB). */
export function labsDataDir(): string {
  const primary = process.env.DATABASE_URL || 'file:./data/lab.db'
  if (primary.startsWith('file:')) {
    const path = primary.slice('file:'.length).split('?')[0]
    const dir = dirname(path)
    if (dir && dir !== '.') return dir
  }
  return process.env.LAB_DATA_DIR || './data'
}

export function labRegistryFile(): string {
  return process.env.LAB_REGISTRY_FILE || join(labsDataDir(), 'labs.json')
}

interface RegistryLab {
  id: string
  name: string
  /** Database filename inside the data dir (never a path — no traversal). */
  file: string
}

function isSafeFile(file: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,38}\.db$/.test(file) && basename(file) === file
}

function loadRegistryLabs(): LabConfig[] {
  const file = labRegistryFile()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { labs?: RegistryLab[] }
    if (!Array.isArray(parsed.labs)) return []
    const dir = labsDataDir()
    const seen = new Set<string>()
    const out: LabConfig[] = []
    for (const l of parsed.labs) {
      if (!l || typeof l.id !== 'string' || typeof l.name !== 'string' || typeof l.file !== 'string') continue
      const id = slug(l.id)
      const name = l.name.trim().slice(0, 80)
      if (!id || !name || !isSafeFile(l.file) || seen.has(id)) continue
      seen.add(id)
      out.push({ id, name, url: `file:${join(dir, l.file)}` })
    }
    return out
  } catch (err) {
    console.warn(`Could not read lab registry ${file} — ignoring:`, err)
    return []
  }
}

/**
 * The live lab list: env labs first, then registry (Admin-created) labs.
 * Mutated in place by addRegistryLab() so the running server picks up
 * newly created labs without a restart.
 */
export const LABS: LabConfig[] = [...parseEnvLabs(), ...loadRegistryLabs()]

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
 * Record a new Admin-created lab. Synchronous file update (atomic enough
 * for a single Node process) + in-memory registration. Throws on bad input.
 */
export function addRegistryLab(name: string): LabConfig {
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('Lab name is required.')
  let base = slug(clean) || 'lab'
  let id = base
  let n = 2
  const taken = new Set(LABS.map((l) => l.id))
  while (taken.has(id)) id = `${base}-${n++}`
  const file = `${id}.db`
  if (!isSafeFile(file)) throw new Error('Could not derive a safe database filename.')

  const registryPath = labRegistryFile()
  mkdirSync(dirname(registryPath), { recursive: true })
  const current = loadRegistryLabs()
  const next: { labs: RegistryLab[] } = {
    labs: [
      ...current.map((l) => ({
        id: l.id,
        name: l.name,
        file: basename(l.url.split('?')[0].replace(/^file:/, '')),
      })),
      { id, name: clean, file },
    ],
  }
  writeFileSync(registryPath, JSON.stringify(next, null, 2) + '\n')

  const config: LabConfig = { id, name: clean, url: `file:${join(labsDataDir(), file)}` }
  LABS.push(config)
  return config
}
