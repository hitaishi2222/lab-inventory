import { Hono } from 'hono'
import { z } from 'zod'
import { publicLabList } from '../db/labs'
import { provisionLab } from '../db/provision'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'

export const labsRouter = new Hono()

// GET /api/labs - public list for the login-page selector.
// Hidden client-side when there is only one lab. No secrets exposed.
labsRouter.get('/', async (c) => {
  return c.json({ labs: publicLabList() })
})

// POST /api/labs - create a new lab (Admin only).
// The creator's account is copied into the new lab, so they can sign
// straight in with the same email/username/password.
labsRouter.post('/', requireAuth, requirePermission('labs:manage'), async (c) => {
  const me = c.get('user') as { id: string; email: string; name: string; role: string }
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().trim().min(1).max(80),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  try {
    const lab = await provisionLab(parsed.data.name, me.email)
    await logAudit({
      userId: me.id,
      action: 'CREATE',
      entityType: 'Lab',
      entityId: lab.id,
      details: { name: lab.name, createdBy: me.email },
    })
    return c.json(
      {
        message: `Lab "${lab.name}" created.`,
        lab: { id: lab.id, name: lab.name },
      },
      201,
    )
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not create lab.' }, 400)
  }
})
