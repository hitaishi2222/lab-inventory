import { rmSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq, isNull } from 'drizzle-orm'

/**
 * End-to-end API tests over Hono's `app.request` — no HTTP server, but the
 * real routes, middleware, better-auth sessions and SQLite file.
 *
 * These cover behaviour that has actually regressed in this repo: pagination
 * that counted the wrong thing, stock that could go negative, a double
 * checkout race, foreign-key crashes on delete, and losing an entire lab's
 * ability to administer itself.
 */

const ADMIN = { email: 'admin@test.local', password: 'AdminPass123!', name: 'Test Admin' }
const POSTDOC = { email: 'postdoc@test.local', password: 'PostdocPass123!', name: 'Post Doc' }
const SUPERVISOR = { email: 'supervisor@test.local', password: 'SupPass123!', name: 'Super Visor' }
const ORIGIN = 'http://localhost:3000'

type Jar = { cookie: string }
const admin: Jar = { cookie: '' }
const postdoc: Jar = { cookie: '' }
const supervisor: Jar = { cookie: '' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authApi: any

async function call(method: string, path: string, body?: unknown, jar: Jar = admin) {
  const headers: Record<string, string> = { Origin: ORIGIN }
  if (jar.cookie) headers.Cookie = jar.cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(';')[0]!
    if (pair.startsWith('better-auth')) jar.cookie = jar.cookie ? `${jar.cookie}; ${pair}` : pair
  }
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: json as any, text }
}

async function signIn(email: string, password: string, jar: Jar) {
  return call('POST', '/api/auth/sign-in/email', { email, password }, jar)
}

async function createUser(body: Record<string, unknown>) {
  const res = await call('POST', '/api/users', body)
  expect(res.status, res.text).toBe(201)
}

async function createItem(body: Record<string, unknown>) {
  const res = await call('POST', '/api/items', {
    name: `Item ${Math.random().toString(36).slice(2, 8)}`,
    quantity: 10,
    unit: 'pcs',
    minStockThreshold: 1,
    ...body,
    categoryId: body.categoryId ?? (await categoryId()),
  })
  expect(res.status, res.text).toBe(201)
  return res.json.id as string
}

async function categoryId(): Promise<string> {
  const res = await call('GET', '/api/categories')
  return res.json.categories[0].id as string
}

beforeAll(async () => {
  rmSync(process.env.DATABASE_URL!.replace('file:', ''), { force: true })

  const dbMod = await import('../src/server/db')
  const { ensureLabDatabase } = await import('../src/server/db/ensure')
  const { seedDefaultPermissions } = await import('../src/server/lib/permissions')
  await ensureLabDatabase(dbMod.getLabDb())
  await dbMod.runWithLab(dbMod.allLabIds()[0]!, () => seedDefaultPermissions())

  schema = await import('../src/server/db/schema')
  db = dbMod.db
  authApi = (await import('../src/server/auth')).auth
  app = (await import('../src/server/index')).default

  // First account, promoted to ADMIN the same way scripts/seed.ts does.
  await authApi.api.signUpEmail({
    body: { name: ADMIN.name, email: ADMIN.email, username: 'admin', password: ADMIN.password },
    headers: new Headers(),
  })
  await db.update(schema.users).set({ role: 'ADMIN', name: ADMIN.name }).where(eq(schema.users.email, ADMIN.email))

  const login = await signIn(ADMIN.email, ADMIN.password, admin)
  expect(login.status, login.text).toBe(200)

  // A category to hang test items on (the seed script normally creates these).
  const cat = await call('POST', '/api/categories', { name: 'General' })
  expect(cat.status, cat.text).toBe(201)
}, 120_000)

describe('auth', () => {
  it('rejects unauthenticated API calls', async () => {
    const res = await call('GET', '/api/items', undefined, { cookie: '' })
    expect(res.status).toBe(401)
  })

  it('returns the caller profile with permissions', async () => {
    const res = await call('GET', '/api/users/me')
    expect(res.status).toBe(200)
    expect(res.json.role).toBe('ADMIN')
    expect(res.json.permissions).toContain('users:manage')
  })
})

describe('items list', () => {
  it('paginates, counts and searches in SQL', async () => {
    const cat = await categoryId()
    const names: string[] = []
    for (let i = 0; i < 5; i++) names.push(await createItem({ categoryId: cat, name: `List Widget ${i}` }))

    const page1 = await call('GET', '/api/items?page=1&limit=2')
    expect(page1.status).toBe(200)
    expect(page1.json.items).toHaveLength(2)
    expect(page1.json.total).toBeGreaterThanOrEqual(5)

    const page2 = await call('GET', '/api/items?page=2&limit=2')
    expect(page2.json.items[0].id).not.toBe(page1.json.items[0].id)

    // The count must describe the filtered set, not the whole table.
    const search = await call('GET', '/api/items?search=List%20Widget%203')
    expect(search.json.total).toBe(1)
    expect(search.json.items).toHaveLength(1)
    expect(search.json.items[0].id).toBe(names[3])

    const miss = await call('GET', '/api/items?search=nothing-matches-this')
    expect(miss.json.total).toBe(0)

    // Unbounded limits and junk params are clamped, not obeyed.
    expect((await call('GET', '/api/items?limit=100000')).json.limit).toBe(200)
    const junk = await call('GET', '/api/items?limit=abc&page=-2')
    expect(junk.status).toBe(200)
    expect(junk.json).toMatchObject({ page: 1, limit: 20 })
  })

  it('404s an update of a missing item instead of pretending success', async () => {
    const res = await call('PUT', '/api/items/does-not-exist', { name: 'ghost' })
    expect(res.status).toBe(404)
  })
})

describe('stock and checkouts', () => {
  it('refuses to log more usage than there is stock', async () => {
    const itemId = await createItem({ name: 'Reagent X', quantity: 3, unit: 'mL' })

    const over = await call('POST', '/api/usage', { itemId, quantityUsed: 5 })
    expect(over.status).toBe(409)
    expect(over.json.error).toContain('Not enough stock')

    const ok = await call('POST', '/api/usage', { itemId, quantityUsed: 3 })
    expect(ok.status).toBe(201)
    expect(ok.json.newQuantity).toBe(0)

    // A second draw on empty stock is rejected, so stock can never go negative.
    expect((await call('POST', '/api/usage', { itemId, quantityUsed: 1 })).status).toBe(409)
  })

  it('lets exactly one of two concurrent checkouts win', async () => {
    const itemId = await createItem({ name: 'Race Scope', quantity: 1, equipment: { serialNumber: 'SN-1' } })
    const expectedReturnAt = new Date(Date.now() + 86_400_000).toISOString()

    const [a, b] = await Promise.all([
      call('POST', `/api/equipment/${itemId}/checkout`, { expectedReturnAt }),
      call('POST', `/api/equipment/${itemId}/checkout`, { expectedReturnAt }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])

    const history = await call('GET', `/api/equipment/${itemId}/history`)
    expect(history.json.history.filter((h: { status: string }) => h.status === 'ACTIVE')).toHaveLength(1)

    // Returning twice must not silently succeed the second time.
    expect((await call('POST', `/api/equipment/${itemId}/return`)).status).toBe(200)
    expect((await call('POST', `/api/equipment/${itemId}/return`)).status).toBe(409)
  })
})

describe('deletes that used to hit foreign keys', () => {
  it('deletes an item that has a reservation', async () => {
    const itemId = await createItem({ name: 'Booked Scope', quantity: 1, equipment: {} })
    const booked = await call('POST', `/api/equipment/${itemId}/reservations`, {
      startsAt: new Date(Date.now() + 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 7_200_000).toISOString(),
    })
    expect(booked.status, booked.text).toBe(201)

    const del = await call('DELETE', `/api/items/${itemId}`)
    expect(del.status, del.text).toBe(200)
    expect((await call('GET', `/api/items/${itemId}`)).status).toBe(404)
  })

  it('refuses to delete a category that items still use', async () => {
    const cat = await call('POST', '/api/categories', { name: `Temp Cat ${Date.now()}` })
    const itemId = await createItem({ categoryId: cat.json.id, name: 'Categorized Item' })

    const blocked = await call('DELETE', `/api/categories/${cat.json.id}`)
    expect(blocked.status).toBe(409)

    await call('DELETE', `/api/items/${itemId}`)
    expect((await call('DELETE', `/api/categories/${cat.json.id}`)).status).toBe(200)
  })
})

describe('user lifecycle', () => {
  it('deletes a user who has history, keeping the history', async () => {
    const cat = await categoryId()
    const itemId = await createItem({ categoryId: cat, name: 'Shared Reagent', quantity: 20 })

    await createUser({
      name: POSTDOC.name,
      email: POSTDOC.email,
      password: POSTDOC.password,
      username: 'postdoc',
      role: 'POSTDOC',
    })
    expect((await signIn(POSTDOC.email, POSTDOC.password, postdoc)).status).toBe(200)
    expect((await call('POST', '/api/usage', { itemId, quantityUsed: 2 }, postdoc)).status).toBe(201)

    const profile = await db.select().from(schema.users).where(eq(schema.users.email, POSTDOC.email)).get()
    const del = await call('DELETE', `/api/users/${profile.id}`)
    expect(del.status, del.text).toBe(200)

    // The usage row survives, detached from the deleted account.
    const detached = await db.select().from(schema.usageLogs).where(isNull(schema.usageLogs.userId))
    expect(detached.length).toBeGreaterThan(0)

    // And their session is dead.
    expect((await call('GET', '/api/items', undefined, postdoc)).status).toBe(401)
  })

  it('audits role changes and blocks removing the last administrator', async () => {
    await createUser({
      name: SUPERVISOR.name,
      email: SUPERVISOR.email,
      password: SUPERVISOR.password,
      username: 'supervisor',
      role: 'SUPERVISOR',
    })

    // Promote the supervisor to ADMIN: this must leave an audit entry.
    const supProfile = await db.select().from(schema.users).where(eq(schema.users.email, SUPERVISOR.email)).get()
    const promoted = await call('PUT', `/api/users/${supProfile.id}/role`, { role: 'ADMIN' })
    expect(promoted.status).toBe(200)

    const auditRow = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, supProfile.id))
      .get()
    expect(auditRow).toBeTruthy()
    expect(JSON.parse(auditRow.details)).toMatchObject({ roleFrom: 'SUPERVISOR', roleTo: 'ADMIN' })

    // Demote them back, then have them try to remove/demote the only admin.
    expect((await call('PUT', `/api/users/${supProfile.id}/role`, { role: 'SUPERVISOR' })).status).toBe(200)

    const rolePerms = await call('GET', '/api/role-permissions')
    const supervisorPerms: string[] = rolePerms.json.byRole.SUPERVISOR ?? []
    expect(
      (
        await call('PUT', '/api/role-permissions/SUPERVISOR', {
          permissions: [...new Set([...supervisorPerms, 'users:manage'])],
        })
      ).status,
    ).toBe(200)

    expect((await signIn(SUPERVISOR.email, SUPERVISOR.password, supervisor)).status).toBe(200)

    const me = await call('GET', '/api/users/me')
    expect(me.json.role).toBe('ADMIN') // sanity: the only admin left is us

    const selfDelete = await call('DELETE', `/api/users/${me.json.id}`, undefined, supervisor)
    expect(selfDelete.status).toBe(409)

    const selfDemote = await call('PUT', `/api/users/${me.json.id}/role`, { role: 'OTHERS' }, supervisor)
    expect(selfDemote.status).toBe(409)
  })

  it('enforces permissions per role', async () => {
    // A PHD account may add inventory but not delete it.
    const phd = { email: 'phd@test.local', password: 'PhdPass123!', name: 'PhD Student' }
    await createUser({ ...phd, username: 'phd', role: 'PHD' })
    const jar: Jar = { cookie: '' }
    expect((await signIn(phd.email, phd.password, jar)).status).toBe(200)

    const itemId = await createItem({ name: 'Protected Item' })
    expect((await call('POST', '/api/items', { name: 'PhD Made This', categoryId: await categoryId() }, jar)).status).toBe(201)
    expect((await call('DELETE', `/api/items/${itemId}`, undefined, jar)).status).toBe(403)

    expect((await call('DELETE', `/api/items/${itemId}`)).status).toBe(200)
  })
})
