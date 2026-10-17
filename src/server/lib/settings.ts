import { db } from '../db'
import { appSettings } from '../db/schema'
import { eq } from 'drizzle-orm'

export type AppSettingKey = 'software_name' | 'date_format' | 'time_format'

export const DEFAULT_SETTINGS: Record<AppSettingKey, string> = {
  software_name: 'Labs',
  date_format: 'DD MMM YYYY',
  time_format: '24-hour',
}

export const DATE_FORMAT_OPTIONS = ['DD MMM YYYY', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const

export const TIME_FORMAT_OPTIONS = ['24-hour', '12-hour'] as const

/** Allowed values per setting (settings without an entry accept any string). */
export const SETTING_ALLOWED_VALUES: Partial<Record<AppSettingKey, readonly string[]>> = {
  date_format: DATE_FORMAT_OPTIONS,
  time_format: TIME_FORMAT_OPTIONS,
}

/** Get a setting value by key. Falls back to default if not set. */
export async function getSetting(key: AppSettingKey): Promise<string> {
  const row = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get()
  return row?.value ?? DEFAULT_SETTINGS[key]
}

/** Batch-fetch several settings with defaults applied (single query). */
export async function getSettings<K extends AppSettingKey>(keys: K[]): Promise<Record<K, string>> {
  const rows = await db.select().from(appSettings)
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const out = {} as Record<K, string>
  for (const key of keys) {
    out[key] = byKey.get(key) ?? DEFAULT_SETTINGS[key]
  }
  return out
}

/** Get all settings as a key-value map. */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings)
  const out: Record<string, string> = {}
  for (const r of rows) {
    out[r.key] = r.value ?? DEFAULT_SETTINGS[r.key as AppSettingKey] ?? ''
  }
  return out
}

/** Set a setting value (upsert). */
export async function setSetting(key: AppSettingKey, value: string) {
  const existing = await db
    .select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get()

  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(appSettings.id, existing.id))
  } else {
    await db.insert(appSettings).values({
      id: crypto.randomUUID(),
      key,
      value,
    })
  }
}
