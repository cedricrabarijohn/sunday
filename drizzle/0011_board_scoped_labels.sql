-- Make labels board-scoped instead of workspace-scoped.
--
-- Previously a label belonged to a workspace and showed up on every board in
-- it. Now each board owns its own label catalog. Backfill: every label that is
-- actually used on a card moves to that card's board (no label is used across
-- more than one board, so this is unambiguous); labels that were never applied
-- to any card are dropped.

ALTER TABLE `labels` ADD COLUMN `board_id` INT NULL AFTER `id`;
--> statement-breakpoint

-- Used labels → the (single) board they're used on.
UPDATE `labels` l
  JOIN (
    SELECT btl.label_id, MIN(bt.board_id) AS board_id
    FROM `board_task_labels` btl
    JOIN `board_tasks` bt ON bt.id = btl.board_task_id
    GROUP BY btl.label_id
  ) u ON u.label_id = l.id
  SET l.board_id = u.board_id;
--> statement-breakpoint

-- Drop never-applied labels (no card references them, so nothing is orphaned).
DELETE FROM `labels` WHERE `board_id` IS NULL;
--> statement-breakpoint

ALTER TABLE `labels` MODIFY COLUMN `board_id` INT NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_labels_board` ON `labels` (`board_id`);
--> statement-breakpoint
ALTER TABLE `labels` DROP COLUMN `workspace_id`;
