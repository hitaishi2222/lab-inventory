import { migrate } from 'drizzle-orm/libsql/migrator'
import { db } from './index'

// Applies ./drizzle/*.sql migrations to DATABASE_URL.
// Usage: npm run db:migrate
await migrate(db, { migrationsFolder: './drizzle' })
console.log('Migrations applied.')
