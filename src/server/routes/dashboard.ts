import { Hono } from 'hono'
import { z } from 'zod'
import { and, count, eq, gte, notExists, sql } from 'drizzle-orm'
import { db } from '../db'
import { usageLogs, equipmentCheckouts, items, equipmentDetails, chemicalDetails } from '../db/schema'
import { requireAuth } from '../middleware/auth'

export const dashboardRouter = new Hono()

const rangeSchema = z.enum(['7d', '30d', '90d', '12m'])

// How many rows each dashboard list shows before "…and N more" is implied.
const LIST_PREVIEW = 8

interface BucketDef {
  key: string
  label: string
  start: number // epoch ms (inclusive)
  end: number // epoch ms (exclusive)
}

const DAY = 24 * 60 * 60 * 1000

function fmtSqlite(dt: Date): string {
  return dt.toISOString().slice(0, 19).replace('T', ' ')
}

function parseDbDate(s: string): number {
  const ms = Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  return Number.isNaN(ms) ? Date.now() : ms
}

function dayLabel(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function monthLabel(ms: number): string {
  const d = new Date(ms)
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    ...(sameYear ? {} : { year: '2-digit' }),
    timeZone: 'UTC',
  })
}

/** Bucket boundaries for a range, ending today (UTC). */
function buildBuckets(range: z.infer<typeof rangeSchema>): { buckets: BucketDef[]; windowStart: Date } {
  const now = new Date()
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const buckets: BucketDef[] = []

  if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30
    for (let i = days - 1; i >= 0; i--) {
      const start = todayStart - i * DAY
      const dt = new Date(start)
      buckets.push({
        key: dt.toISOString().slice(0, 10),
        label: dayLabel(start),
        start,
        end: start + DAY,
      })
    }
  } else if (range === '90d') {
    // 13 rolling 7-day windows ending today.
    const windowStart = todayStart - 90 * DAY
    for (let i = 0; i < 13; i++) {
      const start = windowStart + i * 7 * DAY
      buckets.push({
        key: new Date(start).toISOString().slice(0, 10),
        label: dayLabel(start),
        start,
        end: Math.min(start + 7 * DAY, todayStart + DAY),
      })
    }
  } else {
    // 12 calendar months ending with the current month.
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    for (let i = 0; i < 12; i++) {
      const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)
      const end = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i + 1, 1)
      buckets.push({
        key: new Date(start).toISOString().slice(0, 7),
        label: monthLabel(start),
        start,
        end,
      })
    }
  }

  return { buckets, windowStart: new Date(buckets[0]!.start) }
}

interface Series {
  itemId: string
  name: string
  value: number
}

/** Collapse per-item bucket counts to top-3 + others series. */
function toSeries(
  perBucket: Map<string, number>[],
  names: Map<string, string>,
): { total: number; top: Series[]; columns: number[][] } {
  const totals = new Map<string, number>()
  for (const m of perBucket) {
    for (const [id, n] of m) totals.set(id, (totals.get(id) ?? 0) + n)
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const topIds = ranked.slice(0, 3).map(([id]) => id)
  const top: Series[] = topIds.map((id) => ({
    itemId: id,
    name: names.get(id) ?? 'Unknown item',
    value: totals.get(id) ?? 0,
  }))
  const total = ranked.reduce((s, [, n]) => s + n, 0)

  const columns = perBucket.map((m) => {
    const cells = topIds.map((id) => m.get(id) ?? 0)
    const others = [...m.entries()]
      .filter(([id]) => !topIds.includes(id))
      .reduce((s, [, n]) => s + n, 0)
    return [...cells, others]
  })

  return { total, top, columns }
}

// GET /api/dashboard/summary
//
// The dashboard cards used to be computed in the browser from
// `GET /api/items?limit=500`: every visit shipped up to 500 item rows with
// their chemical/equipment details just to count them, and once a lab passed
// 500 items the totals silently went wrong. These are four indexed COUNTs and
// three preview lists instead.
//
// Dates are compared in SQL with date('now') on purpose: expiry_date is a
// `YYYY-MM-DD` string, so 'expiring within 60 days' means strictly later than
// today and no later than today+60 (same window the client used to compute).
dashboardRouter.get('/summary', requireAuth, async (c) => {
  const notEquipment = notExists(
    db.select({ one: sql`1` }).from(equipmentDetails).where(eq(equipmentDetails.itemId, items.id)),
  )
  const lowStockWhere = and(notEquipment, sql`${items.quantity} <= ${items.minStockThreshold}`)
  const checkedOutWhere = eq(equipmentDetails.status, 'CHECKED_OUT')
  const expiringWhere = and(
    sql`${chemicalDetails.expiryDate} > date('now')`,
    sql`${chemicalDetails.expiryDate} <= date('now', '+60 days')`,
  )

  const [totalRow, lowStockCount, checkedOutCount, expiringCount, lowStock, checkedOut, expiring] = await Promise.all([
    db.select({ n: count() }).from(items).get(),
    db.select({ n: count() }).from(items).where(lowStockWhere).get(),
    db.select({ n: count() }).from(equipmentDetails).where(checkedOutWhere).get(),
    db.select({ n: count() }).from(chemicalDetails).where(expiringWhere).get(),
    db
      .select({
        id: items.id,
        name: items.name,
        quantity: items.quantity,
        unit: items.unit,
        minStockThreshold: items.minStockThreshold,
      })
      .from(items)
      .where(lowStockWhere)
      .orderBy(sql`${items.quantity} - ${items.minStockThreshold}`)
      .limit(LIST_PREVIEW),
    db
      .select({ id: items.id, name: items.name })
      .from(equipmentDetails)
      .innerJoin(items, eq(equipmentDetails.itemId, items.id))
      .where(checkedOutWhere)
      .orderBy(items.name)
      .limit(LIST_PREVIEW),
    db
      .select({ id: items.id, name: items.name, expiryDate: chemicalDetails.expiryDate })
      .from(chemicalDetails)
      .innerJoin(items, eq(chemicalDetails.itemId, items.id))
      .where(expiringWhere)
      .orderBy(chemicalDetails.expiryDate)
      .limit(LIST_PREVIEW),
  ])

  return c.json({
    totalItems: totalRow?.n ?? 0,
    lowStock: { count: lowStockCount?.n ?? 0, items: lowStock },
    checkedOut: { count: checkedOutCount?.n ?? 0, items: checkedOut },
    expiringSoon: { count: expiringCount?.n ?? 0, items: expiring },
  })
})

// GET /api/dashboard/activity?range=7d|30d|90d|12m
// Event counts (not quantities — items use mixed units like mL vs boxes, so
// summed quantities would be meaningless). Any signed-in user may view it,
// mirroring the Dashboard page itself which has no permission gate.
dashboardRouter.get('/activity', requireAuth, async (c) => {
  const parsed = rangeSchema.safeParse(c.req.query('range') ?? '30d')
  if (!parsed.success) return c.json({ error: 'Invalid range (use 7d, 30d, 90d or 12m)' }, 400)
  const range = parsed.data

  const { buckets, windowStart } = buildBuckets(range)
  const since = fmtSqlite(windowStart)

  const [logs, checkouts, allItems] = await Promise.all([
    db.select().from(usageLogs).where(gte(usageLogs.usedAt, since)),
    db.select().from(equipmentCheckouts).where(gte(equipmentCheckouts.checkedOutAt, since)),
    db.select({ id: items.id, name: items.name }).from(items),
  ])
  const names = new Map(allItems.map((i) => [i.id, i.name]))

  const bucketIndex = (ts: number): number => {
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (ts >= buckets[i]!.start && ts < buckets[i]!.end) return i
    }
    return -1
  }

  const usagePerBucket: Map<string, number>[] = buckets.map(() => new Map())
  for (const log of logs) {
    const i = bucketIndex(parseDbDate(log.usedAt))
    if (i < 0) continue
    const m = usagePerBucket[i]!
    m.set(log.itemId, (m.get(log.itemId) ?? 0) + 1)
  }

  const checkoutPerBucket: Map<string, number>[] = buckets.map(() => new Map())
  for (const co of checkouts) {
    const i = bucketIndex(parseDbDate(co.checkedOutAt))
    if (i < 0) continue
    const m = checkoutPerBucket[i]!
    m.set(co.itemId, (m.get(co.itemId) ?? 0) + 1)
  }

  return c.json({
    range,
    buckets: buckets.map((b) => ({ key: b.key, label: b.label })),
    usage: toSeries(usagePerBucket, names),
    checkouts: toSeries(checkoutPerBucket, names),
  })
})
