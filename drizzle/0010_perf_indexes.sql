-- Performance indexes.
--
-- These already exist on the long-lived database (created out-of-band from
-- sql/init.sql's FOREIGN KEYs plus hand-added idx_* indexes), but the Drizzle
-- baseline (0000) only declares primary keys and a handful of unique
-- constraints. A database provisioned purely from migrations was therefore
-- missing every secondary index and slow under load. This migration declares
-- them so a fresh install matches production.
--
-- Index names match the existing production names exactly, and every statement
-- is `IF NOT EXISTS`, so this migration is a clean no-op on the existing DB.

-- Identity & access
CREATE INDEX IF NOT EXISTS `role_id` ON `users` (`role_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `capability_id` ON `role_capabilities` (`capability_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workspace_capability_id` ON `workspace_role_capabilities` (`workspace_capability_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_id` ON `workspace_users` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workspace_role_id` ON `workspace_users` (`workspace_role_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_tokens_token` ON `auth_tokens` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_tokens_user` ON `auth_tokens` (`user_id`);
--> statement-breakpoint

-- Invites (unique token + workspace/board lookup)
CREATE UNIQUE INDEX IF NOT EXISTS `token` ON `workspace_invites` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workspace_invites_workspace` ON `workspace_invites` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `token` ON `board_invites` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_board_invites_board` ON `board_invites` (`board_id`);
--> statement-breakpoint

-- Boards & settings
CREATE INDEX IF NOT EXISTS `workspace_id` ON `boards` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_id` ON `board_settings` (`board_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_id` ON `board_views` (`board_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_view_id` ON `board_view_settings` (`board_view_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_board_piles_board` ON `board_piles` (`board_id`);
--> statement-breakpoint

-- Custom fields (columns)
CREATE INDEX IF NOT EXISTS `idx_board_columns_board` ON `board_columns` (`board_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_column_type_id` ON `board_columns` (`board_column_type_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_columns_id` ON `board_columns_settings` (`board_columns_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_task_id` ON `board_task_columns` (`board_task_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_task_column_id` ON `board_task_column_settings` (`board_task_column_id`);
--> statement-breakpoint

-- Cards (tasks) & their children
CREATE INDEX IF NOT EXISTS `idx_board_tasks_pile` ON `board_tasks` (`pile_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_task_id` ON `board_task_settings` (`board_task_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_task_id` ON `board_task_assigned_users` (`board_task_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_board_task_items_card` ON `board_task_items` (`board_task_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_board_task_assignees_user` ON `board_task_assignees` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_btl_label` ON `board_task_labels` (`label_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_board_task_attachments_card` ON `board_task_attachments` (`board_task_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_btc_task` ON `board_task_comments` (`board_task_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_btc_user` ON `board_task_comments` (`user_id`);
--> statement-breakpoint

-- Board membership
CREATE UNIQUE INDEX IF NOT EXISTS `uq_board_users` ON `board_users` (`board_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_board_users_user` ON `board_users` (`user_id`);
--> statement-breakpoint

-- Labels
CREATE INDEX IF NOT EXISTS `idx_labels_workspace` ON `labels` (`workspace_id`);
--> statement-breakpoint

-- Notifications (bell query + recency)
CREATE INDEX IF NOT EXISTS `idx_notifications_user` ON `notifications` (`user_id`, `read_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notifications_created` ON `notifications` (`created_at`);
--> statement-breakpoint

-- SCM connections (unique webhook token + one connection per workspace+provider)
CREATE UNIQUE INDEX IF NOT EXISTS `uq_scm_token` ON `scm_connections` (`webhook_token`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_scm_ws_provider` ON `scm_connections` (`workspace_id`, `provider`);
