import { generateScheduledNotifications } from '../src/server/lib/notifications.ts'

// Cron-friendly entry point: generates overdue-equipment and expiring-chemical
// notifications directly against the database (no auth layer).
// Usage: npx tsx scripts/generate-notifications.ts
;(async () => {
  const result = await generateScheduledNotifications()
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
})()
