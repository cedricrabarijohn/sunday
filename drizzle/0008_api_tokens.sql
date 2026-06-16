-- Personal access tokens for programmatic access (MCP server, future API
-- clients). Unlike auth_tokens these are long-lived and reusable; only the
-- SHA-256 hash is stored so a database leak never exposes a usable token.
CREATE TABLE IF NOT EXISTS `api_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(60) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`token_prefix` varchar(16) NOT NULL,
	`created_at` datetime,
	`last_used_at` datetime,
	`expires_at` datetime,
	`revoked_at` datetime,
	CONSTRAINT `api_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `api_tokens_hash_idx` ON `api_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);
