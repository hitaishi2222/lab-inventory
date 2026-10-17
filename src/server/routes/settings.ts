import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../middleware/auth'
import { getAllSettings, setSetting, SETTING_ALLOWED_VALUES, type AppSettingKey } from '../lib/settings'

export const settingsRouter = new Hono()

// GET /api/settings - all settings
settingsRouter.get('/', requireAuth, requirePermission('settings:manage'), async (c) => {
  const settings = await getAllSettings()
  return c.json({ settings })
})

// PUT /api/settings/:key - update a single setting
settingsRouter.put('/:key', requireAuth, requirePermission('settings:manage'), async (c) => {
  const key = c.req.param('key') as AppSettingKey
  if (!Object.values(DEFAULT_SETTINGS_KEYS).includes(key)) {
    return c.json({ error: 'Unknown setting key' }, 400)
  }

  const body = await c.req.json()
  const schema = z.object({
    value: z.string().min(1).max(200),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const allowed = SETTING_ALLOWED_VALUES[key]
  if (allowed && !allowed.includes(parsed.data.value)) {
    return c.json({ error: `Invalid value. Allowed: ${allowed.join(', ')}` }, 400)
  }

  await setSetting(key, parsed.data.value)
  return c.json({ message: 'Setting updated', key, value: parsed.data.value })
})

const DEFAULT_SETTINGS_KEYS: AppSettingKey[] = ['software_name', 'date_format', 'time_format']
