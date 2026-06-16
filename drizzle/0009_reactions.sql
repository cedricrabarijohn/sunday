CREATE TABLE `board_task_reactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `kind` VARCHAR(10) NOT NULL,
  `target_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `emoji` VARCHAR(32) NOT NULL,
  `created_at` DATETIME,
  UNIQUE KEY `board_task_reactions_unique` (`kind`, `target_id`, `user_id`, `emoji`)
);
