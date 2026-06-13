CREATE TABLE `card_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`card_id` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`ref` varchar(255) NOT NULL,
	`title` varchar(255),
	`url` varchar(500),
	`state` varchar(20),
	`created_at` datetime,
	`updated_at` datetime,
	CONSTRAINT `card_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_card_link` UNIQUE(`card_id`,`kind`,`ref`)
);
--> statement-breakpoint
CREATE TABLE `scm_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspace_id` int NOT NULL,
	`provider` varchar(20) NOT NULL DEFAULT 'gitea',
	`base_url` varchar(255),
	`webhook_token` varchar(64) NOT NULL,
	`secret` varchar(64),
	`enabled` tinyint NOT NULL DEFAULT 1,
	`created_at` datetime,
	`updated_at` datetime,
	CONSTRAINT `scm_connections_id` PRIMARY KEY(`id`)
);
