import { Hono } from 'hono'
import { requireAuth, requirePermission } from '../middleware/auth'
import { db } from '../db'
import { items, chemicalDetails, equipmentDetails, equipmentCheckouts, usageLogs, auditLogs, users } from '../db/schema'
import { desc } from 'drizzle-orm'

export const exportRouter = new Hono()

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Mitigate CSV formula injection in spreadsheet apps.
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvRow(record: Record<string, unknown>): string {
  return Object.values(record).map(csvEscape).join(',')
}

function csvHeader(keys: string[]): string {
  return keys.map(csvEscape).join(',')
}

function toCSV<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return ''
  const keys = Object.keys(rows[0])
  return [csvHeader(keys), ...rows.map(r => csvRow(r))].join('\n')
}

// GET /api/export/items - Export all items as CSV
exportRouter.get('/items', requireAuth, requirePermission('export:data'), async (c) => {
  const allItems = await db.select().from(items).orderBy(desc(items.createdAt))
  const chemicals = await db.select().from(chemicalDetails)
  const equipments = await db.select().from(equipmentDetails)

  const chemMap = new Map(chemicals.map((c) => [c.itemId, c]))
  const equipMap = new Map(equipments.map((e) => [e.itemId, e]))

  const rows = allItems.map((item) => {
    const chem = chemMap.get(item.id)
    const equip = equipMap.get(item.id)
    return {
      id: item.id,
      name: item.name,
      category_id: item.categoryId ?? '',
      description: item.description ?? '',
      location: item.location ?? '',
      quantity: item.quantity,
      unit: item.unit,
      min_stock_threshold: item.minStockThreshold,
      image_url: item.imageUrl ?? '',
      cas_number: chem?.casNumber ?? '',
      hazard_class: chem?.hazardClass ?? '',
      molecular_formula: chem?.molecularFormula ?? '',
      expiry_date: chem?.expiryDate ?? '',
      storage_conditions: chem?.storageConditions ?? '',
      sds_url: chem?.sdsUrl ?? '',
      serial_number: equip?.serialNumber ?? '',
      equipment_status: equip?.status ?? '',
      condition: equip?.condition ?? '',
      purchase_date: equip?.purchaseDate ?? '',
      warranty_expiry: equip?.warrantyExpiry ?? '',
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }
  })

  const csv = toCSV(rows)
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="items_export.csv"',
  })
})

// GET /api/export/usage - Export usage logs as CSV
exportRouter.get('/usage', requireAuth, requirePermission('export:data'), async (c) => {
  const rows = await db.select().from(usageLogs).orderBy(desc(usageLogs.createdAt))
  const csv = toCSV(rows.map((r) => ({
    id: r.id,
    item_id: r.itemId,
    user_id: r.userId,
    quantity_used: r.quantityUsed,
    used_at: r.usedAt,
    notes: r.notes ?? '',
    created_at: r.createdAt,
  })))
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="usage_logs_export.csv"',
  })
})

// GET /api/export/checkouts - Export equipment checkouts as CSV
exportRouter.get('/checkouts', requireAuth, requirePermission('export:data'), async (c) => {
  const rows = await db.select().from(equipmentCheckouts).orderBy(desc(equipmentCheckouts.checkedOutAt))
  const csv = toCSV(rows.map((r) => ({
    id: r.id,
    item_id: r.itemId,
    user_id: r.userId,
    checked_out_at: r.checkedOutAt,
    expected_return_at: r.expectedReturnAt ?? '',
    returned_at: r.returnedAt ?? '',
    notes: r.notes ?? '',
    status: r.status,
  })))
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="equipment_checkouts_export.csv"',
  })
})

// GET /api/export/audit - Export audit log as CSV
exportRouter.get('/audit', requireAuth, requirePermission('export:data'), async (c) => {
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp))
  const csv = toCSV(rows.map((r) => ({
    id: r.id,
    user_id: r.userId,
    action: r.action,
    entity_type: r.entityType,
    entity_id: r.entityId,
    details: r.details ?? '',
    ip_address: r.ipAddress ?? '',
    timestamp: r.timestamp,
  })))
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="audit_log_export.csv"',
  })
})

// GET /api/export/users - Export users as CSV
exportRouter.get('/users', requireAuth, requirePermission('export:data'), async (c) => {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt))
  const csv = toCSV(rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  })))
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="users_export.csv"',
  })
})
