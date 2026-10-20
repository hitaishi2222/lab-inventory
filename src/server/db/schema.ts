import { sql } from 'drizzle-orm'
import { text, integer, real, sqliteTable, index } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Better Auth tables (managed by better-auth via the Drizzle adapter).
// Do not write to these by hand — use the auth API (sign-up / sign-in).
// App-level profile/role data lives in the `users` table below and is linked
// by email address (see src/server/middleware/auth.ts).
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  // Login handle for username sign-in (better-auth `username` plugin).
  // Null for accounts created before usernames existed — those users keep
  // signing in with email until they set a username in Settings.
  username: text('username').unique(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
}, (t) => ({ userIdx: index('session_user_idx').on(t.userId) }))

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({ userIdx: index('account_user_idx').on(t.userId) }))

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (t) => ({ identifierIdx: index('verification_identifier_idx').on(t.identifier) }))

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  // Null when credentials are managed by better-auth (the normal case).
  // Kept nullable for legacy rows only.
  passwordHash: text('password_hash'),
  role: text('role', {
    enum: [
      'ADMIN',
      'SUPERVISOR',
      'POSTDOC',
      'PHD',
      'PROJECT_RESEARCH_FELLOW',
      'OTHERS',
    ],
  })
    .notNull()
    .default('OTHERS'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  categoryId: text('category_id').references(() => categories.id),
  description: text('description'),
  location: text('location'),
  quantity: real('quantity').notNull().default(0),
  unit: text('unit').notNull().default('pieces'),
  minStockThreshold: real('min_stock_threshold').notNull().default(0),
  imageUrl: text('image_url'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  categoryIdx: index('items_category_idx').on(t.categoryId),
  createdAtIdx: index('items_created_at_idx').on(t.createdAt),
}))

export const chemicalDetails = sqliteTable('chemical_details', {
  id: text('id').primaryKey(),
  itemId: text('item_id').references(() => items.id).notNull().unique(),
  casNumber: text('cas_number'),
  hazardClass: text('hazard_class'),
  hazardPictograms: text('hazard_pictograms'),
  expiryDate: text('expiry_date'),
  storageConditions: text('storage_conditions'),
  sdsUrl: text('sds_url'),
  molecularFormula: text('molecular_formula'),
})

export const equipmentDetails = sqliteTable('equipment_details', {
  id: text('id').primaryKey(),
  itemId: text('item_id').references(() => items.id).notNull().unique(),
  serialNumber: text('serial_number'),
  status: text('status', { enum: ['AVAILABLE', 'CHECKED_OUT', 'MAINTENANCE'] }).notNull().default('AVAILABLE'),
  condition: text('condition'),
  purchaseDate: text('purchase_date'),
  warrantyExpiry: text('warranty_expiry'),
})

export const equipmentCheckouts = sqliteTable('equipment_checkouts', {
  id: text('id').primaryKey(),
  itemId: text('item_id').references(() => items.id).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  checkedOutAt: text('checked_out_at').notNull().default(sql`(datetime('now'))`),
  expectedReturnAt: text('expected_return_at'),
  returnedAt: text('returned_at'),
  notes: text('notes'),
  status: text('status', { enum: ['ACTIVE', 'RETURNED', 'OVERDUE'] }).notNull().default('ACTIVE'),
}, (t) => ({
  itemIdx: index('equipment_checkouts_item_idx').on(t.itemId),
  userIdx: index('equipment_checkouts_user_idx').on(t.userId),
  statusIdx: index('equipment_checkouts_status_idx').on(t.status),
}))

export const equipmentReservations = sqliteTable('equipment_reservations', {
  id: text('id').primaryKey(),
  itemId: text('item_id').references(() => items.id).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  // ISO datetimes (UTC). A reservation occupies [startsAt, endsAt).
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['UPCOMING', 'CANCELLED'] }).notNull().default('UPCOMING'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({ userIdx: index('equipment_reservations_user_idx').on(t.userId) }))

export const usageLogs = sqliteTable('usage_logs', {
  id: text('id').primaryKey(),
  itemId: text('item_id').references(() => items.id).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  quantityUsed: real('quantity_used').notNull(),
  usedAt: text('used_at').notNull().default(sql`(datetime('now'))`),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  itemIdx: index('usage_logs_item_idx').on(t.itemId),
  userIdx: index('usage_logs_user_idx').on(t.userId),
  usedAtIdx: index('usage_logs_used_at_idx').on(t.usedAt),
}))

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  // Nullable + ON DELETE SET NULL: audit history outlives the account it
  // describes. The actor's email is kept in `details` for CREATE/UPDATE rows.
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action', { enum: ['CREATE', 'UPDATE', 'DELETE', 'CHECKOUT', 'RETURN', 'LOGIN', 'IMPORT'] }).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: text('details'),
  ipAddress: text('ip_address'),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  timestampIdx: index('audit_logs_timestamp_idx').on(t.timestamp),
  userIdx: index('audit_logs_user_idx').on(t.userId),
  entityIdx: index('audit_logs_entity_idx').on(t.entityType, t.entityId),
}))

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type', { enum: ['LOW_STOCK', 'EXPIRY_WARNING', 'OVERDUE_EQUIPMENT'] }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: integer('read').notNull().default(0),
  link: text('link'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  userReadIdx: index('notifications_user_read_idx').on(t.userId, t.read),
  createdAtIdx: index('notifications_created_at_idx').on(t.createdAt),
}))

export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const rolePermissions = sqliteTable('role_permissions', {
  id: text('id').primaryKey(),
  role: text('role', {
    enum: [
      'ADMIN',
      'SUPERVISOR',
      'POSTDOC',
      'PHD',
      'PROJECT_RESEARCH_FELLOW',
      'OTHERS',
    ],
  })
    .notNull(),
  permission: text('permission').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})
