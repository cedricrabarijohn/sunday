-- board_tasks.position is numbered PER PILE (1..N within each pile), so the
-- same position value legitimately repeats across piles of a board. The
-- baseline declared UNIQUE(board_id, position), which makes every cross-pile
-- card move fail with a duplicate-key error (HTTP 500) — the pile change
-- persists but the position re-pack throws. Replace the UNIQUE with a plain
-- index. Idempotent so it is safe on databases that never had the constraint.
ALTER TABLE `board_tasks` DROP INDEX IF EXISTS `board_tasks_index_0`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_tasks_index_0` ON `board_tasks` (`board_id`, `position`);
