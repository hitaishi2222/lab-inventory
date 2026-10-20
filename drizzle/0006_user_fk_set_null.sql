-- Deleting a user must not destroy (or be blocked by) their history.
--
-- audit_logs, notifications, usage_logs, equipment_checkouts and
-- equipment_reservations all referenced users(id) NOT NULL with no ON DELETE
-- action. With libsql's foreign_keys=1 that meant DELETE /api/users/:id failed
-- with SQLITE_CONSTRAINT as soon as the person had ever logged in, used a
-- chemical or checked something out — so departed members could never be
-- removed. SQLite cannot alter a foreign key in place, hence the table rebuild:
-- user_id becomes nullable and the reference becomes ON DELETE SET NULL, so the
-- history survives and the person's name is replaced by "former user" in the UI.
--
-- The copy also backfills rows that already point at a non-existent user
-- (13 such audit rows existed in the shipped data/lab.db), because those would
-- violate the new constraint the moment foreign_keys is enforced again.
--
-- NOTE: the migrator runs with foreign_keys=off, which is what makes the
-- DROP/RENAME sequence below safe. Do not run this file against a live
-- connection with foreign keys enabled.
CREATE TABLE `__new_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details` text,
	`ip_address` text,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_audit_logs` (`id`, `user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `timestamp`)
SELECT `id`, CASE WHEN `user_id` IN (SELECT `id` FROM `users`) THEN `user_id` ELSE NULL END,
       `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `timestamp`
FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_timestamp_idx` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_entity_idx` ON `audit_logs` (`entity_type`, `entity_id`);--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`link` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_notifications` (`id`, `user_id`, `type`, `title`, `message`, `read`, `link`, `created_at`)
SELECT `id`, CASE WHEN `user_id` IS NULL OR `user_id` IN (SELECT `id` FROM `users`) THEN `user_id` ELSE NULL END,
       `type`, `title`, `message`, `read`, `link`, `created_at`
FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_read_idx` ON `notifications` (`user_id`, `read`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_created_at_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text,
	`quantity_used` real NOT NULL,
	`used_at` text DEFAULT (datetime('now')) NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_usage_logs` (`id`, `item_id`, `user_id`, `quantity_used`, `used_at`, `notes`, `created_at`)
SELECT `id`, `item_id`, CASE WHEN `user_id` IN (SELECT `id` FROM `users`) THEN `user_id` ELSE NULL END,
       `quantity_used`, `used_at`, `notes`, `created_at`
FROM `usage_logs`;--> statement-breakpoint
DROP TABLE `usage_logs`;--> statement-breakpoint
ALTER TABLE `__new_usage_logs` RENAME TO `usage_logs`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_item_idx` ON `usage_logs` (`item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_user_idx` ON `usage_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_used_at_idx` ON `usage_logs` (`used_at`);--> statement-breakpoint
CREATE TABLE `__new_equipment_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text,
	`checked_out_at` text DEFAULT (datetime('now')) NOT NULL,
	`expected_return_at` text,
	`returned_at` text,
	`notes` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_equipment_checkouts` (`id`, `item_id`, `user_id`, `checked_out_at`, `expected_return_at`, `returned_at`, `notes`, `status`)
SELECT `id`, `item_id`, CASE WHEN `user_id` IN (SELECT `id` FROM `users`) THEN `user_id` ELSE NULL END,
       `checked_out_at`, `expected_return_at`, `returned_at`, `notes`, `status`
FROM `equipment_checkouts`;--> statement-breakpoint
DROP TABLE `equipment_checkouts`;--> statement-breakpoint
ALTER TABLE `__new_equipment_checkouts` RENAME TO `equipment_checkouts`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_checkouts_item_idx` ON `equipment_checkouts` (`item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_checkouts_user_idx` ON `equipment_checkouts` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_checkouts_status_idx` ON `equipment_checkouts` (`status`);--> statement-breakpoint
CREATE TABLE `__new_equipment_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'UPCOMING' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_equipment_reservations` (`id`, `item_id`, `user_id`, `starts_at`, `ends_at`, `notes`, `status`, `created_at`)
SELECT `id`, `item_id`, CASE WHEN `user_id` IN (SELECT `id` FROM `users`) THEN `user_id` ELSE NULL END,
       `starts_at`, `ends_at`, `notes`, `status`, `created_at`
FROM `equipment_reservations`;--> statement-breakpoint
DROP TABLE `equipment_reservations`;--> statement-breakpoint
ALTER TABLE `__new_equipment_reservations` RENAME TO `equipment_reservations`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_reservations_item_idx` ON `equipment_reservations` (`item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_reservations_user_idx` ON `equipment_reservations` (`user_id`);
