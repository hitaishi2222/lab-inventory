import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { user, session, account, verification, users } from './db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // No SMTP configured in this self-hosted lab setup.
    // The reset URL is logged to the server console so an admin
    // can copy-paste it to the user. Configure a real transporter
    // (e.g. nodemailer) here for production email delivery.
    sendResetPassword: async ({ user, url, token }) => {
      const sep = '='.repeat(60)
      console.log('\n' + sep)
      console.log('PASSWORD RESET REQUEST')
      console.log(`User: ${user.name} <${user.email}>`)
      console.log(`Reset URL: ${url}`)
      console.log(`Token: ${token}`)
      console.log(sep + '\n')
    },
  },
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
  },
  databaseHooks: {
    user: {
      create: {
        // Every auth user gets an app profile row (default role JUNIOR).
        // Linked by email; admins promote via PUT /api/users/:id/role.
        after: async (user) => {
          const existing = await db.select().from(users).where(eq(users.email, user.email)).get()
          if (!existing) {
            const now = new Date().toISOString()
            await db.insert(users).values({
              id: crypto.randomUUID(),
              name: user.name,
              email: user.email,
              passwordHash: null,
              role: 'OTHERS',
              createdAt: now,
              updatedAt: now,
            })
          }
        },
      },
    },
  },
})
