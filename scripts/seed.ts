import { eq } from 'drizzle-orm'
import { db } from '../src/server/db/index.ts'
import { users, user as authUser, categories, items, chemicalDetails, equipmentDetails, appSettings } from '../src/server/db/schema.ts'
import { auth } from '../src/server/auth.ts'
import { seedDefaultPermissions } from '../src/server/lib/permissions.ts'
import { setSetting } from '../src/server/lib/settings.ts'

// Idempotent: safe to re-run (skips whatever already exists).

// --- Categories ------------------------------------------------------------
const existingCategories = await db.select().from(categories)
let categoryIds: Record<'equipment' | 'chemicals' | 'consumables', string>
if (existingCategories.length > 0) {
  const byName = Object.fromEntries(existingCategories.map((c) => [c.name, c.id]))
  categoryIds = { equipment: byName['Equipment'], chemicals: byName['Chemicals'], consumables: byName['Consumables'] }
  console.log('Categories already exist, skipping.')
} else {
  categoryIds = {
    equipment: crypto.randomUUID(),
    chemicals: crypto.randomUUID(),
    consumables: crypto.randomUUID(),
  }
  await db.insert(categories).values([
    { id: categoryIds.equipment, name: 'Equipment', description: 'Lab instruments and devices' },
    { id: categoryIds.chemicals, name: 'Chemicals', description: 'Chemical reagents and solvents' },
    { id: categoryIds.consumables, name: 'Consumables', description: 'Disposable lab supplies' },
  ])
  console.log('Categories seeded.')
}

// --- Admin user (credentials owned by better-auth) --------------------------
// Login: admin@lab.edu / admin123
const ADMIN_EMAIL = 'admin@lab.edu'
const existingAdmin = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get()
if (!existingAdmin) {
  await auth.api.signUpEmail({
    body: { name: 'Lab Admin', email: ADMIN_EMAIL, username: 'admin', password: 'admin123' },
    // signUpEmail outside a request needs explicit headers object
    headers: new Headers(),
  })
  // signUpEmail triggers the databaseHooks hook that creates the JUNIOR
  // profile row — promote it to ADMIN.
  await db
    .update(users)
    .set({ name: 'Lab Admin', role: 'ADMIN', updatedAt: new Date().toISOString() })
    .where(eq(users.email, ADMIN_EMAIL))
  console.log('Admin user created (admin@lab.edu / admin123).')
} else {
  console.log('Admin user already exists, skipping.')
}

// Backfill: accounts created before usernames existed get one if it is free.
// (Requires `npm run db:migrate` first so the `username` column exists.)
const adminIdentity = await db.select().from(authUser).where(eq(authUser.email, ADMIN_EMAIL)).get()
if (adminIdentity && !adminIdentity.username) {
  const taken = await db.select().from(authUser).where(eq(authUser.username, 'admin')).get()
  if (!taken) {
    await db.update(authUser).set({ username: 'admin' }).where(eq(authUser.email, ADMIN_EMAIL))
    console.log("Admin username set to 'admin' (also works for login).")
  } else {
    console.log("Username 'admin' is taken — set the admin username in Settings.")
  }
}

// --- Sample items ------------------------------------------------------------
const existingItems = await db.select().from(items)
if (existingItems.length > 0) {
  console.log('Items already exist, skipping.')
} else {
  const itemIds = {
    oscilloscope: crypto.randomUUID(),
    acetone: crypto.randomUUID(),
    gloves: crypto.randomUUID(),
    ftir: crypto.randomUUID(),
  }

  await db.insert(items).values([
    {
      id: itemIds.oscilloscope,
      name: 'Oscilloscope — Rigol DS1054Z',
      categoryId: categoryIds.equipment,
      description: '4-channel digital oscilloscope, 50 MHz',
      location: 'Bench A-1',
      quantity: 2,
      unit: 'pieces',
      minStockThreshold: 1,
    },
    {
      id: itemIds.acetone,
      name: 'Acetone (HPLC grade)',
      categoryId: categoryIds.chemicals,
      description: 'High purity acetone for HPLC and general use',
      location: 'Chemical Cabinet B-1',
      quantity: 2000,
      unit: 'mL',
      minStockThreshold: 500,
    },
    {
      id: itemIds.gloves,
      name: 'Nitrile Gloves (M)',
      categoryId: categoryIds.consumables,
      description: 'Medium size nitrile examination gloves',
      location: 'Cabinet A-3',
      quantity: 10,
      unit: 'boxes',
      minStockThreshold: 5,
    },
    {
      id: itemIds.ftir,
      name: 'FTIR Spectrometer — PerkinElmer',
      categoryId: categoryIds.equipment,
      description: 'Fourier Transform Infrared Spectrometer',
      location: 'Room 201',
      quantity: 1,
      unit: 'pieces',
      minStockThreshold: 1,
    },
  ])

  await db.insert(chemicalDetails).values({
    id: crypto.randomUUID(),
    itemId: itemIds.acetone,
    casNumber: '67-64-1',
    hazardClass: 'Flammable Liquid Category 2',
    hazardPictograms: '["GHS02", "GHS07"]',
    storageConditions: 'Flammable cabinet, room temperature',
    molecularFormula: 'C3H6O',
  })

  await db.insert(equipmentDetails).values([
    {
      id: crypto.randomUUID(),
      itemId: itemIds.oscilloscope,
      serialNumber: 'RIG-DS1054Z-001',
      status: 'AVAILABLE',
      condition: 'Good',
    },
    {
      id: crypto.randomUUID(),
      itemId: itemIds.ftir,
      serialNumber: 'PE-FTIR-2023-045',
      status: 'AVAILABLE',
      condition: 'Excellent',
    },
  ])
  console.log('Sample items seeded.')
}

// --- Migrate legacy roles (JUNIOR/SENIOR) to new role set ---
const legacyRoles: Record<string, string> = { JUNIOR: 'OTHERS', SENIOR: 'SUPERVISOR' }
for (const [oldRole, newRole] of Object.entries(legacyRoles)) {
  await db.update(users).set({ role: newRole, updatedAt: new Date().toISOString() }).where(eq(users.role, oldRole))
  console.log(`Migrated legacy role ${oldRole} → ${newRole}`)
}

// --- Default role permissions ---
await seedDefaultPermissions()
console.log('Default role permissions seeded.')

// --- Default software name ---
await setSetting('software_name', 'Labs')
console.log('Default software name seeded.')

console.log('Database seeded successfully!')
process.exit(0)
