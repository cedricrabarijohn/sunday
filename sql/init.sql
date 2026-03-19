-- SQL dump generated using DBML (dbml.dbdiagram.io)
-- Database: MySQL
-- Generated at: 2026-03-19T20:08:02.164Z

CREATE TABLE `capabilities` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(20),
  `deleted_at` datetime
);

CREATE TABLE `roles` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(10),
  `deleted_at` datetime
);

CREATE TABLE `role_capabilities` (
  `role_id` integer,
  `capability_id` integer,
  `deleted_at` datetime,
  PRIMARY KEY (`role_id`, `capability_id`)
);

CREATE TABLE `users` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `role_id` integer,
  `firstname` varchar(30),
  `lastname` varchar(30),
  `email` varchar(30),
  `deleted_at` datetime,
  `hashed_password` varchar(255)
);

CREATE TABLE `workspaces` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `title` varchar(50),
  `deleted_at` datetime
);

CREATE TABLE `workspace_capabilities` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(20),
  `deleted_at` datetime
);

CREATE TABLE `workspace_roles` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(10),
  `deleted_at` datetime
);

CREATE TABLE `workspace_role_capabilities` (
  `workspace_role_id` integer,
  `workspace_capability_id` integer,
  `deleted_at` datetime,
  PRIMARY KEY (`workspace_role_id`, `workspace_capability_id`)
);

CREATE TABLE `workspace_users` (
  `workspace_id` integer,
  `user_id` integer,
  `workspace_role_id` integer,
  `deleted_at` datetime,
  PRIMARY KEY (`workspace_id`, `user_id`)
);

CREATE TABLE `boards` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `workspace_id` integer,
  `created_at` datetime,
  `deleted_at` datetime
);

CREATE TABLE `board_settings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_id` integer
);

CREATE TABLE `board_views` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(20),
  `board_id` integer,
  `deleted_at` datetime
);

CREATE TABLE `board_view_settings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_view_id` integer
);

CREATE TABLE `board_column_types` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(20),
  `deleted_at` datetime
);

CREATE TABLE `board_columns` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `label` varchar(20),
  `board_id` integer,
  `board_column_type_id` integer,
  `deleted_at` datetime
);

CREATE TABLE `board_columns_settings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_columns_id` integer,
  `config` JSON
);

CREATE TABLE `board_tasks` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_id` integer,
  `position` integer,
  `created_at` datetime,
  `updated_at` datetime,
  `deleted_at` datetime
);

CREATE TABLE `board_task_assigned_users` (
  `workspace_user_id` integer,
  `board_task_id` integer
);

CREATE TABLE `board_task_settings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_task_id` integer
);

CREATE TABLE `board_task_columns` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_column_id` integer,
  `board_task_id` integer,
  `value` JSON,
  `position` integer,
  `deleted_at` datetime
);

CREATE TABLE `board_task_column_settings` (
  `id` integer PRIMARY KEY AUTO_INCREMENT,
  `board_task_column_id` integer
);

CREATE UNIQUE INDEX `board_tasks_index_0` ON `board_tasks` (`board_id`, `position`);

CREATE UNIQUE INDEX `board_task_assigned_users_index_1` ON `board_task_assigned_users` (`workspace_user_id`, `board_task_id`);

CREATE UNIQUE INDEX `board_task_columns_index_2` ON `board_task_columns` (`board_column_id`, `board_task_id`);

ALTER TABLE `role_capabilities` ADD FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

ALTER TABLE `role_capabilities` ADD FOREIGN KEY (`capability_id`) REFERENCES `capabilities` (`id`);

ALTER TABLE `users` ADD FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

ALTER TABLE `workspace_role_capabilities` ADD FOREIGN KEY (`workspace_role_id`) REFERENCES `workspace_roles` (`id`);

ALTER TABLE `workspace_role_capabilities` ADD FOREIGN KEY (`workspace_capability_id`) REFERENCES `workspace_capabilities` (`id`);

ALTER TABLE `workspace_users` ADD FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`);

ALTER TABLE `workspace_users` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `workspace_users` ADD FOREIGN KEY (`workspace_role_id`) REFERENCES `workspace_roles` (`id`);

ALTER TABLE `boards` ADD FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`);

ALTER TABLE `board_settings` ADD FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`);

ALTER TABLE `board_views` ADD FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`);

ALTER TABLE `board_view_settings` ADD FOREIGN KEY (`board_view_id`) REFERENCES `board_views` (`id`);

ALTER TABLE `board_columns` ADD FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`);

ALTER TABLE `board_columns` ADD FOREIGN KEY (`board_column_type_id`) REFERENCES `board_column_types` (`id`);

ALTER TABLE `board_columns_settings` ADD FOREIGN KEY (`board_columns_id`) REFERENCES `board_columns` (`id`);

ALTER TABLE `board_tasks` ADD FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`);

ALTER TABLE `board_task_assigned_users` ADD FOREIGN KEY (`workspace_user_id`) REFERENCES `workspace_users` (`user_id`);

ALTER TABLE `board_task_assigned_users` ADD FOREIGN KEY (`board_task_id`) REFERENCES `board_tasks` (`id`);

ALTER TABLE `board_task_settings` ADD FOREIGN KEY (`board_task_id`) REFERENCES `board_tasks` (`id`);

ALTER TABLE `board_task_columns` ADD FOREIGN KEY (`board_column_id`) REFERENCES `board_columns` (`id`);

ALTER TABLE `board_task_columns` ADD FOREIGN KEY (`board_task_id`) REFERENCES `board_tasks` (`id`);

ALTER TABLE `board_task_column_settings` ADD FOREIGN KEY (`board_task_column_id`) REFERENCES `board_task_columns` (`id`);
