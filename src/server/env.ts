/**
 * Environment lookup that works on both runtimes.
 *
 * Docker/Node: `process.env` (dotenv loads .env into it).
 * Workers: the Worker `env` object arrives per-request, so the entry point
 * copies it here once with `setEnv()`. Bindings shadow `process.env`, so the
 * same code reads the same names either way.
 *
 * Lazy on purpose: tests and scripts set `process.env` before importing
 * anything, and a snapshot taken at import time would miss it.
 */
const bindings: Record<string, string | undefined> = {}

export const env = new Proxy(bindings, {
  get(target, key) {
    if (typeof key !== 'string') return undefined
    if (target[key] !== undefined) return target[key]
    return typeof process !== 'undefined' ? process.env?.[key] : undefined
  },
}) as Record<string, string | undefined>

/** Copy Worker bindings (strings only — KV/R2/DO bindings are objects). */
export function setEnv(source: Record<string, unknown> | undefined): void {
  if (!source) return
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') bindings[key] = value
  }
}
