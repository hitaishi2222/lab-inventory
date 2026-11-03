import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { labRegistryFile, type LabRegistryStore, type RegistryLab } from './labs'

/**
 * Node/Docker implementation of the lab registry: a `labs.json` file next to
 * the database files. Deliberately synchronous — it is written once when an
 * Admin creates a lab, and read once at boot.
 */
export const fileLabStore: LabRegistryStore = {
  read: async () => {
    const file = labRegistryFile()
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { labs?: RegistryLab[] }
    return Array.isArray(parsed.labs) ? parsed.labs : []
  },

  write: async (labs) => {
    const file = labRegistryFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ labs }, null, 2) + '\n')
  },
}
