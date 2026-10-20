-- Hot-path indexes.
--
-- Every foreign key and every column a list endpoint filters/sorts on had no
-- index: usage history, checkout history, audit trail and notification lists
-- all ended up as full table scans, and the per-request profile lookup by user
-- too. SQLite does not create these automatically for non-unique keys.
--
-- IF NOT EXISTS so this migration is also safe to re-run against a database
-- that was created before the journal in drizzle/meta/_journal.json was fixed.
-- NOTE: drizzle splits migration files on the statement-breakpoint marker and
-- libsql throws on an empty chunk, so comments must never carry that marker
-- and a file must not begin with one.
CREATE INDEX IF NOT EXISTS `items_category_idx` ON `items` (`category_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `items_created_at_idx` ON `items` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_item_idx` ON `usage_logs` (`item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_user_idx` ON `usage_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_logs_used_at_idx` ON `usage_logs` (`used_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_checkouts_item_idx` ON `equipment_checkouts` (`item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_checkouts_user_idx` ON `equipment_checkouts` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_checkouts_status_idx` ON `equipment_checkouts` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_reservations_user_idx` ON `equipment_reservations` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_timestamp_idx` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_entity_idx` ON `audit_logs` (`entity_type`, `entity_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_read_idx` ON `notifications` (`user_id`, `read`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_created_at_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);
