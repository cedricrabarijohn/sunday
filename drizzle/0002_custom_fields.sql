ALTER TABLE `board_columns` MODIFY COLUMN `label` varchar(60);--> statement-breakpoint
ALTER TABLE `board_columns` ADD `type` varchar(20);--> statement-breakpoint
ALTER TABLE `board_columns` ADD `config` json;--> statement-breakpoint
ALTER TABLE `board_columns` ADD `position` int;