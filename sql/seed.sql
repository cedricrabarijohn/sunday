-- Seed the RBAC reference data so a fresh database works out of the box.
-- Without these rows a newly-created workspace's admin holds no capabilities,
-- so the creator cannot even add a board. Self-healing: ON DUPLICATE KEY UPDATE
-- corrects labels at known ids, INSERT IGNORE adds missing role→capability
-- mappings — safe to re-run or apply over a partially-seeded database.

-- The baseline declared workspace_roles.label too narrow for the seed values.
ALTER TABLE `workspace_roles` MODIFY `label` varchar(40);

INSERT INTO `roles` (`id`, `label`) VALUES (1, 'admin'), (2, 'user')
  ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

INSERT INTO `workspace_roles` (`id`, `label`) VALUES (1, 'workspace_admin'), (2, 'workspace_user')
  ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

INSERT INTO `workspace_capabilities` (`id`, `label`) VALUES
  (1, 'view_workspace'),
  (2, 'edit_workspace'),
  (3, 'delete_workspace'),
  (4, 'manage_members'),
  (5, 'manage_labels'),
  (6, 'manage_piles'),
  (7, 'create_board'),
  (8, 'edit_board'),
  (9, 'delete_board'),
  (10, 'create_card'),
  (11, 'edit_card'),
  (12, 'delete_card')
  ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

INSERT IGNORE INTO `workspace_role_capabilities` (`workspace_role_id`, `workspace_capability_id`) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9), (1, 10), (1, 11), (1, 12),
  (2, 1), (2, 7), (2, 8), (2, 10), (2, 11), (2, 12);

INSERT INTO `board_roles` (`id`, `label`) VALUES (1, 'board_admin'), (2, 'board_member'), (3, 'board_viewer')
  ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

INSERT INTO `board_capabilities` (`id`, `label`) VALUES
  (1, 'view_board'),
  (2, 'edit_board'),
  (3, 'delete_board'),
  (4, 'manage_board_members'),
  (5, 'manage_piles'),
  (6, 'create_card'),
  (7, 'edit_card'),
  (8, 'delete_card')
  ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

INSERT IGNORE INTO `board_role_capabilities` (`board_role_id`, `board_capability_id`) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
  (2, 1), (2, 6), (2, 7), (2, 8),
  (3, 1);
