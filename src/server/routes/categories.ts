import { Hono } from 'hono'
import { z } from 'zod'
import { eq, count } from 'drizzle-orm'
import { db } from '../db'
import { categories, items } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'
import { logAudit } from '../lib/audit'

export const categoriesRouter = new Hono()

// GET /api/categories
categoriesRouter.get('/', requireAuth, async (c) => {
  const allCategories = await db.select().from(categories)
  return c.json({ categories: allCategories })
})

// POST /api/categories
categoriesRouter.post(
  '/',
  requireAuth,
  requirePermission('categories:manage'),
  async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const id = crypto.randomUUID()
  await db.insert(categories).values({ id, name: parsed.data.name, description: parsed.data.description })

  return c.json({ id, message: 'Category created' }, 201)
})

// PUT /api/categories/:id
categoriesRouter.put(
  '/:id',
  requireAuth,
  requirePermission('categories:manage'),
  async (c) => {
  const id = c.req.param('id')!
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  if (Object.keys(parsed.data).length === 0) return c.json({ error: 'No fields to update' }, 400)
  const updated = await db.update(categories).set(parsed.data).where(eq(categories.id, id)).returning({ id: categories.id })
  if (updated.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json({ message: 'Category updated' })
})

// DELETE /api/categories/:id
categoriesRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('categories:manage'),
  async (c) => {
  const id = c.req.param('id')!
  const me = c.get('user') as { id: string }

  // libsql enforces foreign keys, so deleting a category that still has items
  // raised a SQLITE_CONSTRAINT and surfaced as a raw 500. Say what is wrong
  // instead, and let the admin move or delete those items first.
  const inUse = await db.select({ n: count() }).from(items).where(eq(items.categoryId, id)).get()
  if ((inUse?.n ?? 0) > 0) {
    return c.json(
      { error: `Cannot delete: ${inUse!.n} item(s) still use this category. Reassign them first.` },
      409,
    )
  }

  const deleted = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id })
  if (deleted.length === 0) return c.json({ error: 'Not found' }, 404)

  await logAudit({ userId: me.id, action: 'DELETE', entityType: 'Category', entityId: id })

  return c.json({ message: 'Category deleted' })
})
