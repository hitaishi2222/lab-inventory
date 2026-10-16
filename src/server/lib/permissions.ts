import { db } from '../db'
import { rolePermissions } from '../db/schema'
import { eq } from 'drizzle-orm'

export type Role =
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'POSTDOC'
  | 'PHD'
  | 'PROJECT_RESEARCH_FELLOW'
  | 'OTHERS'

export const ROLES: Role[] = [
  'ADMIN',
  'SUPERVISOR',
  'POSTDOC',
  'PHD',
  'PROJECT_RESEARCH_FELLOW',
  'OTHERS',
]

export type Permission =
  | 'inventory:view'
  | 'inventory:create'
  | 'inventory:edit'
  | 'inventory:delete'
  | 'equipment:checkout'
  | 'equipment:return'
  | 'usage:log'
  | 'notifications:view'
  | 'audit:view'
  | 'users:manage'
  | 'categories:manage'
  | 'export:data'
  | 'permissions:manage'
  | 'settings:manage'

export const ALL_PERMISSIONS: Permission[] = [
  'inventory:view',
  'inventory:create',
  'inventory:edit',
  'inventory:delete',
  'equipment:checkout',
  'equipment:return',
  'usage:log',
  'notifications:view',
  'audit:view',
  'users:manage',
  'categories:manage',
  'export:data',
  'permissions:manage',
  'settings:manage',
]

// Default permission sets assigned when the system is first seeded.
// Admin can override these at runtime via the Permissions page.
export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  SUPERVISOR: [
    'inventory:view',
    'inventory:create',
    'inventory:edit',
    'inventory:delete',
    'equipment:checkout',
    'equipment:return',
    'usage:log',
    'notifications:view',
    'categories:manage',
    'export:data',
    'settings:manage',
  ],
  POSTDOC: [
    'inventory:view',
    'inventory:create',
    'inventory:edit',
    'equipment:checkout',
    'equipment:return',
    'usage:log',
    'notifications:view',
  ],
  PHD: [
    'inventory:view',
    'inventory:create',
    'equipment:checkout',
    'equipment:return',
    'usage:log',
    'notifications:view',
  ],
  PROJECT_RESEARCH_FELLOW: [
    'inventory:view',
    'equipment:checkout',
    'equipment:return',
    'usage:log',
    'notifications:view',
  ],
  OTHERS: ['inventory:view', 'notifications:view'],
}

/** Seed default permissions, adding any missing ones for each role. */
export async function seedDefaultPermissions() {
  for (const role of ROLES) {
    const existing = await db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.role, role))
    const existingPerms = new Set(existing.map((r) => r.permission))
    const missing = DEFAULT_PERMISSIONS[role].filter((p) => !existingPerms.has(p))
    if (missing.length > 0) {
      await db.insert(rolePermissions).values(
        missing.map((permission) => ({
          id: crypto.randomUUID(),
          role,
          permission,
        })),
      )
    }
  }
}

/** Load the set of permissions for a given role. */
export async function getRolePermissions(role: Role): Promise<Set<Permission>> {
  const rows = await db
    .select({ permission: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role))
  return new Set(rows.map((r) => r.permission) as Permission[])
}

/** Upsert permissions for a role (replace the whole set). */
export async function setRolePermissions(role: Role, permissions: Permission[]) {
  await db.delete(rolePermissions).where(eq(rolePermissions.role, role))
  if (permissions.length > 0) {
    await db.insert(rolePermissions).values(
      permissions.map((permission) => ({
        id: crypto.randomUUID(),
        role,
        permission,
      })),
    )
  }
}
