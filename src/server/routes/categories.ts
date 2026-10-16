import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { categories } from '../db/schema'
import { requireAuth, requirePermission } from '../middleware/auth'

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
  await db.update(categories).set(body).where(eq(categories.id, id))
  return c.json({ message: 'Category updated' })
})

// DELETE /api/categories/:id
categoriesRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('categories:manage'),
  async (c) => {
  const id = c.req.param('id')!
  await db.delete(categories).where(eq(categories.id, id))
  return c.json({ message: 'Category deleted' })
})
