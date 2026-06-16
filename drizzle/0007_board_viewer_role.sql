-- Adds a read-only board role. `board_viewer` can see a board and its cards
-- (and comment, which only needs view_board) but cannot edit anything. Until
-- now the only board roles were admin (all caps) and member (which already
-- has edit_card/delete_card), so there was no way to grant view-only access.
-- Idempotent: safe to re-run.
INSERT INTO `board_roles` (`id`, `label`) VALUES (3, 'board_viewer')
  ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);
--> statement-breakpoint
INSERT IGNORE INTO `board_role_capabilities` (`board_role_id`, `board_capability_id`) VALUES
  (3, 1);
