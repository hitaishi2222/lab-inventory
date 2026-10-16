import { db } from '../db'
import { appSettings } from '../db/schema'
import { eq } from 'drizzle-orm'

export type AppSettingKey = 'software_name'

export const DEFAULT_SETTINGS: Record<AppSettingKey, string> = {
  software_name: 'LabStock',
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
