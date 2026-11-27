-- Purchase bills, their printed line items, and the link from inventory items.
--
-- Hand-written because the committed drizzle snapshot (meta/0000 only) lags the
-- hand-written 0001-0006 migrations: `drizzle-kit generate` replays their work
-- (app_settings, role_permissions, the FK rebuilds, user.username) and fails on
-- an already-migrated database. 0007_snapshot.json is current, so the *next*
-- generate diffs correctly.
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_number` text NOT NULL,
	`vendor_name` text NOT NULL,
	`bill_date` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`notes` text,
	`received_from_vendor_by` text,
	`received_from_vendor_at` text,
	`submitted_to_university_by` text,
	`submitted_to_university_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`received_from_vendor_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_to_university_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bills_bill_date_idx` ON `bills` (`bill_date`);--> statement-breakpoint
CREATE TABLE `bill_items` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_items_bill_idx` ON `bill_items` (`bill_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `bill_id` text REFERENCES bills(id);--> statement-breakpoint
CREATE INDEX `items_bill_idx` ON `items` (`bill_id`);--> statement-breakpoint
-- Role permissions are data, so an existing lab would otherwise keep a role
-- set that cannot see the new page at all. Same defaults as
-- src/server/lib/permissions.ts; `WHERE NOT EXISTS` keeps this re-runnable.
INSERT INTO `role_permissions` (`id`, `role`, `permission`)
SELECT lower(hex(randomblob(16))), `role`, `permission` FROM (
  SELECT 'ADMIN' AS `role`, 'bills:view' AS `permission`
  UNION ALL SELECT 'ADMIN', 'bills:manage'
  UNION ALL SELECT 'SUPERVISOR', 'bills:view'
  UNION ALL SELECT 'SUPERVISOR', 'bills:manage'
  UNION ALL SELECT 'POSTDOC', 'bills:view'
  UNION ALL SELECT 'PHD', 'bills:view'
  UNION ALL SELECT 'PROJECT_RESEARCH_FELLOW', 'bills:view'
  UNION ALL SELECT 'OTHERS', 'bills:view'
) AS `defaults`
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permissions` rp
  WHERE rp.`role` = `defaults`.`role` AND rp.`permission` = `defaults`.`permission`
);
