import { eq } from 'drizzle-orm'
import { getLabDb, runWithLab, registerLabDb, labStorage } from './index'
import { addRegistryLab, type LabConfig } from './labs'
import { ensureLabDatabase } from './ensure'
import { categories, user as authUser, account as authAccount, users } from './schema'
import { seedDefaultPermissions } from '../lib/permissions'
import { setSetting } from '../lib/settings'

const DEFAULT_CATEGORIES = [
  { name: 'Equipment', description: 'Lab instruments and devices' },
  { name: 'Chemicals', description: 'Chemical reagents and solvents' },
  { name: 'Consumables', description: 'Disposable lab supplies' },
]

/**
 * Create a brand-new lab from the Admin UI: registry entry → database
 * file → full schema → essentials (categories, permissions, lab name) →
 * a copy of the creating Admin's account so they can sign straight in
 * with the same email/username/password.
 *
 * Must run inside the creator's request context (for `db` routing and to
 * know which lab to copy the Admin account from).
 */
export async function provisionLab(name: string, creatorEmail: string): Promise<LabConfig> {
  const sourceLabId = labStorage.getStore()
  if (!sourceLabId) throw new Error('No source lab in context.')
  const sourceDb = getLabDb(sourceLabId)

  const lab = addRegistryLab(name)
  const labDb = registerLabDb(lab)
  await ensureLabDatabase(labDb)

  await runWithLab(lab.id, async () => {
    const db = getLabDb()

    const existing = await db.select({ id: categories.id }).from(categories)
    if (existing.length === 0) {
      await db.insert(categories).values(
        DEFAULT_CATEGORIES.map((c) => ({ id: crypto.randomUUID(), ...c })),
      )
    }

    await seedDefaultPermissions()
    await setSetting('software_name', lab.name)

    // Copy the creator's accounts so the same credentials work in the new lab.
    const already = await db.select({ id: users.id }).from(users).where(eq(users.email, creatorEmail)).get()
    if (!already) {
      const identity = await sourceDb.select().from(authUser).where(eq(authUser.email, creatorEmail)).get()
      const profile = await sourceDb.select().from(users).where(eq(users.email, creatorEmail)).get()
      if (identity && profile) {
        const accounts = await sourceDb.select().from(authAccount).where(eq(authAccount.userId, identity.id))
        await db.insert(authUser).values({
          id: identity.id,
          name: identity.name,
          email: identity.email,
          emailVerified: identity.emailVerified,
          image: identity.image,
          username: identity.username,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
        })
        for (const a of accounts) {
          await db.insert(authAccount).values({
            id: a.id,
            accountId: a.accountId,
            providerId: a.providerId,
            userId: a.userId,
            accessToken: a.accessToken,
            refreshToken: a.refreshToken,
            idToken: a.idToken,
            accessTokenExpiresAt: a.accessTokenExpiresAt,
            refreshTokenExpiresAt: a.refreshTokenExpiresAt,
            scope: a.scope,
            password: a.password,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          })
        }
        const now = new Date().toISOString()
        await db.insert(users).values({
          id: profile.id,
          name: profile.name,
          email: profile.email,
          passwordHash: profile.passwordHash,
          role: profile.role,
          createdAt: profile.createdAt,
          updatedAt: now,
        })
      }
    }
  })

  return lab
}
