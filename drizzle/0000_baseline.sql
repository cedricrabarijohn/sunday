CREATE TABLE `auth_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`purpose` varchar(20) NOT NULL,
	`token` varchar(64) NOT NULL,
	`created_at` datetime,
	`expires_at` datetime,
	`used_at` datetime,
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_capabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(40),
	`deleted_at` datetime,
	CONSTRAINT `board_capabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_column_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(20),
	`deleted_at` datetime,
	CONSTRAINT `board_column_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_columns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(20),
	`board_id` int,
	`board_column_type_id` int,
	`deleted_at` datetime,
	CONSTRAINT `board_columns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_columns_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_columns_id` int,
	`config` json,
	CONSTRAINT `board_columns_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_id` int NOT NULL,
	`email` varchar(255),
	`board_role_id` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`invited_by_user_id` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`created_at` datetime,
	`accepted_at` datetime,
	`expires_at` datetime,
	`accepted_by_user_id` int,
	CONSTRAINT `board_invites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_piles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_id` int NOT NULL,
	`title` varchar(60) NOT NULL,
	`color` varchar(20),
	`position` int NOT NULL DEFAULT 1,
	`created_at` datetime,
	`updated_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `board_piles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_role_capabilities` (
	`board_role_id` int NOT NULL,
	`board_capability_id` int NOT NULL,
	`deleted_at` datetime,
	CONSTRAINT `board_role_capabilities_board_role_id_board_capability_id_pk` PRIMARY KEY(`board_role_id`,`board_capability_id`)
);
--> statement-breakpoint
CREATE TABLE `board_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(40),
	`deleted_at` datetime,
	CONSTRAINT `board_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_id` int,
	CONSTRAINT `board_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_assigned_users` (
	`workspace_user_id` int,
	`board_task_id` int,
	CONSTRAINT `board_task_assigned_users_index_1` UNIQUE(`workspace_user_id`,`board_task_id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_assignees` (
	`board_task_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime,
	CONSTRAINT `board_task_assignees_board_task_id_user_id_pk` PRIMARY KEY(`board_task_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_task_id` int NOT NULL,
	`filename` varchar(255),
	`mime_type` varchar(64),
	`size_bytes` int,
	`url` varchar(500),
	`storage_key` varchar(500),
	`created_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `board_task_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_column_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_task_column_id` int,
	CONSTRAINT `board_task_column_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_columns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_column_id` int,
	`board_task_id` int,
	`value` json,
	`position` int,
	`deleted_at` datetime,
	CONSTRAINT `board_task_columns_id` PRIMARY KEY(`id`),
	CONSTRAINT `board_task_columns_index_2` UNIQUE(`board_column_id`,`board_task_id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_task_id` int NOT NULL,
	`user_id` int NOT NULL,
	`body` text,
	`created_at` datetime,
	`updated_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `board_task_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_task_id` int NOT NULL,
	`title` varchar(255),
	`done` tinyint NOT NULL DEFAULT 0,
	`position` int,
	`created_at` datetime,
	`updated_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `board_task_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_labels` (
	`board_task_id` int NOT NULL,
	`label_id` int NOT NULL,
	`created_at` datetime,
	CONSTRAINT `board_task_labels_board_task_id_label_id_pk` PRIMARY KEY(`board_task_id`,`label_id`)
);
--> statement-breakpoint
CREATE TABLE `board_task_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_task_id` int,
	CONSTRAINT `board_task_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_id` int,
	`pile_id` int,
	`title` varchar(255),
	`description` text,
	`position` int,
	`due_at` datetime,
	`created_at` datetime,
	`updated_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `board_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `board_tasks_index_0` UNIQUE(`board_id`,`position`)
);
--> statement-breakpoint
CREATE TABLE `board_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_id` int NOT NULL,
	`user_id` int NOT NULL,
	`board_role_id` int NOT NULL,
	`created_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `board_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_view_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`board_view_id` int,
	CONSTRAINT `board_view_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `board_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(20),
	`board_id` int,
	`deleted_at` datetime,
	CONSTRAINT `board_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspace_id` int,
	`title` varchar(100),
	`created_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `boards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `capabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(20),
	`deleted_at` datetime,
	CONSTRAINT `capabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspace_id` int NOT NULL,
	`title` varchar(50) NOT NULL,
	`color` varchar(20) NOT NULL,
	`description` varchar(120),
	`position` int,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`created_at` datetime,
	`updated_at` datetime,
	`deleted_at` datetime,
	CONSTRAINT `labels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`actor_user_id` int,
	`card_id` int,
	`board_id` int,
	`workspace_id` int,
	`payload` json,
	`read_at` datetime,
	`created_at` datetime,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_capabilities` (
	`role_id` int NOT NULL,
	`capability_id` int NOT NULL,
	`deleted_at` datetime,
	CONSTRAINT `role_capabilities_role_id_capability_id_pk` PRIMARY KEY(`role_id`,`capability_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(10),
	`deleted_at` datetime,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int,
	`firstname` varchar(30),
	`lastname` varchar(30),
	`email` varchar(30),
	`deleted_at` datetime,
	`hashed_password` varchar(255),
	`last_board_id` int,
	`email_verified_at` datetime,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_capabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(20),
	`deleted_at` datetime,
	CONSTRAINT `workspace_capabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspace_id` int NOT NULL,
	`email` varchar(255),
	`workspace_role_id` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`invited_by_user_id` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`created_at` datetime,
	`accepted_at` datetime,
	`expires_at` datetime,
	`accepted_by_user_id` int,
	CONSTRAINT `workspace_invites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_role_capabilities` (
	`workspace_role_id` int NOT NULL,
	`workspace_capability_id` int NOT NULL,
	`deleted_at` datetime,
	CONSTRAINT `workspace_role_capabilities_pk` PRIMARY KEY(`workspace_role_id`,`workspace_capability_id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(10),
	`deleted_at` datetime,
	CONSTRAINT `workspace_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_users` (
	`workspace_id` int NOT NULL,
	`user_id` int NOT NULL,
	`workspace_role_id` int,
	`deleted_at` datetime,
	CONSTRAINT `workspace_users_workspace_id_user_id_pk` PRIMARY KEY(`workspace_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(50),
	`deleted_at` datetime,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`)
);
