import { mysqlTable, int, varchar, text, datetime, json, index, uniqueIndex, primaryKey, tinyint } from "drizzle-orm/mysql-core";

// NOTE: index names below intentionally mirror the names that already exist in
// the production database (some are MariaDB FK auto-index names like `board_id`,
// others are hand-named `idx_*`). Keeping them identical means the index
// migration (drizzle/0010_perf_indexes.sql) is a clean no-op on the existing DB
// while still creating every index on a fresh one.

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 10 }),
  deletedAt: datetime("deleted_at"),
});

export const capabilities = mysqlTable("capabilities", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 20 }),
  deletedAt: datetime("deleted_at"),
});

export const roleCapabilities = mysqlTable(
  "role_capabilities",
  {
    roleId: int("role_id").notNull(),
    capabilityId: int("capability_id").notNull(),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.capabilityId] }),
    // PK covers (role_id, capability_id); capability_id alone needs its own index.
    index("capability_id").on(t.capabilityId),
  ],
);

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    roleId: int("role_id"),
    firstname: varchar("firstname", { length: 100 }),
    lastname: varchar("lastname", { length: 100 }),
    email: varchar("email", { length: 255 }),
    deletedAt: datetime("deleted_at"),
    hashedPassword: varchar("hashed_password", { length: 255 }),
    lastBoardId: int("last_board_id"),
    emailVerifiedAt: datetime("email_verified_at"),
  },
  (t) => [index("role_id").on(t.roleId)],
);

/** SCM integration (Gitea, later GitHub/GitLab) — one per workspace+provider. */
export const scmConnections = mysqlTable(
  "scm_connections",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    provider: varchar("provider", { length: 20 }).notNull().default("gitea"),
    baseUrl: varchar("base_url", { length: 255 }),
    webhookToken: varchar("webhook_token", { length: 64 }).notNull(),
    secret: varchar("secret", { length: 64 }),
    enabled: tinyint("enabled").notNull().default(1),
    // When a PR referencing a card is merged, move that card to the pile with
    // this title in its own board. Empty/null disables auto-move.
    donePileName: varchar("done_pile_name", { length: 60 }),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
  },
  (t) => [
    // The webhook token routes the inbound URL, so it must be unique.
    uniqueIndex("uq_scm_token").on(t.webhookToken),
    uniqueIndex("uq_scm_ws_provider").on(t.workspaceId, t.provider),
  ],
);

/** A commit / PR / branch linked to a card by an SCM webhook. */
export const cardLinks = mysqlTable(
  "card_links",
  {
    id: int("id").autoincrement().primaryKey(),
    cardId: int("card_id").notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    ref: varchar("ref", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }),
    url: varchar("url", { length: 500 }),
    state: varchar("state", { length: 20 }),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
  },
  // (card_id, kind, ref) unique also serves card_id-only lookups as a left prefix.
  (t) => [uniqueIndex("uq_card_link").on(t.cardId, t.kind, t.ref)],
);

export const authTokens = mysqlTable(
  "auth_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    createdAt: datetime("created_at"),
    expiresAt: datetime("expires_at"),
    usedAt: datetime("used_at"),
  },
  (t) => [
    index("idx_auth_tokens_token").on(t.token),
    index("idx_auth_tokens_user").on(t.userId),
  ],
);

// Long-lived, reusable personal access tokens (e.g. for the MCP server).
// Only the SHA-256 hash is stored; the plaintext is shown once at creation.
export const apiTokens = mysqlTable(
  "api_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
    createdAt: datetime("created_at"),
    lastUsedAt: datetime("last_used_at"),
    expiresAt: datetime("expires_at"),
    revokedAt: datetime("revoked_at"),
  },
  (t) => [
    index("api_tokens_hash_idx").on(t.tokenHash),
    index("api_tokens_user_idx").on(t.userId),
  ],
);

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 50 }),
  deletedAt: datetime("deleted_at"),
});

export const workspaceCapabilities = mysqlTable("workspace_capabilities", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 20 }),
  deletedAt: datetime("deleted_at"),
});

export const workspaceRoles = mysqlTable("workspace_roles", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 40 }),
  deletedAt: datetime("deleted_at"),
});

export const workspaceRoleCapabilities = mysqlTable(
  "workspace_role_capabilities",
  {
    workspaceRoleId: int("workspace_role_id").notNull(),
    workspaceCapabilityId: int("workspace_capability_id").notNull(),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceRoleId, t.workspaceCapabilityId] }),
    index("workspace_capability_id").on(t.workspaceCapabilityId),
  ],
);

export const workspaceInvites = mysqlTable(
  "workspace_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    email: varchar("email", { length: 255 }),
    workspaceRoleId: int("workspace_role_id").notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    invitedByUserId: int("invited_by_user_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: datetime("created_at"),
    acceptedAt: datetime("accepted_at"),
    expiresAt: datetime("expires_at"),
    acceptedByUserId: int("accepted_by_user_id"),
  },
  (t) => [
    uniqueIndex("token").on(t.token),
    index("idx_workspace_invites_workspace").on(t.workspaceId),
  ],
);

export const workspaceUsers = mysqlTable(
  "workspace_users",
  {
    workspaceId: int("workspace_id").notNull(),
    userId: int("user_id").notNull(),
    workspaceRoleId: int("workspace_role_id"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("user_id").on(t.userId),
    index("workspace_role_id").on(t.workspaceRoleId),
  ],
);

export const boards = mysqlTable(
  "boards",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id"),
    title: varchar("title", { length: 100 }),
    createdAt: datetime("created_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [index("workspace_id").on(t.workspaceId)],
);

export const boardSettings = mysqlTable(
  "board_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    boardId: int("board_id"),
  },
  (t) => [index("board_id").on(t.boardId)],
);

export const boardViews = mysqlTable(
  "board_views",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 20 }),
    boardId: int("board_id"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [index("board_id").on(t.boardId)],
);

export const boardViewSettings = mysqlTable(
  "board_view_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    boardViewId: int("board_view_id"),
  },
  (t) => [index("board_view_id").on(t.boardViewId)],
);

export const boardColumnTypes = mysqlTable("board_column_types", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 20 }),
  deletedAt: datetime("deleted_at"),
});

export const boardColumns = mysqlTable(
  "board_columns",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 60 }),
    // Custom-field type: text | number | select | multi_select | date | checkbox | url
    type: varchar("type", { length: 20 }),
    // Type-specific config (e.g. select options) as JSON.
    config: json("config"),
    position: int("position"),
    boardId: int("board_id"),
    boardColumnTypeId: int("board_column_type_id"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    index("idx_board_columns_board").on(t.boardId),
    index("board_column_type_id").on(t.boardColumnTypeId),
  ],
);

export const boardColumnsSettings = mysqlTable(
  "board_columns_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    boardColumnsId: int("board_columns_id"),
    config: json("config"),
  },
  (t) => [index("board_columns_id").on(t.boardColumnsId)],
);

export const boardTasks = mysqlTable(
  "board_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    boardId: int("board_id"),
    pileId: int("pile_id"),
    title: varchar("title", { length: 255 }),
    description: text("description"),
    position: int("position"),
    dueAt: datetime("due_at"),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    deletedAt: datetime("deleted_at"),
  },
  // NON-unique: positions are numbered per pile (1..N in each pile), so they
  // are not unique board-wide. A UNIQUE here would 500 every cross-pile move.
  // (board_id, position) also serves board_id-only lookups as a left prefix.
  (t) => [
    index("board_tasks_index_0").on(t.boardId, t.position),
    index("idx_board_tasks_pile").on(t.pileId),
  ],
);

export const boardTaskAssignedUsers = mysqlTable(
  "board_task_assigned_users",
  {
    workspaceUserId: int("workspace_user_id"),
    boardTaskId: int("board_task_id"),
  },
  (t) => [
    uniqueIndex("board_task_assigned_users_index_1").on(t.workspaceUserId, t.boardTaskId),
    index("board_task_id").on(t.boardTaskId),
  ],
);

export const boardTaskSettings = mysqlTable(
  "board_task_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    boardTaskId: int("board_task_id"),
  },
  (t) => [index("board_task_id").on(t.boardTaskId)],
);

export const boardTaskColumns = mysqlTable(
  "board_task_columns",
  {
    id: int("id").autoincrement().primaryKey(),
    boardColumnId: int("board_column_id"),
    boardTaskId: int("board_task_id"),
    value: json("value"),
    position: int("position"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    uniqueIndex("board_task_columns_index_2").on(t.boardColumnId, t.boardTaskId),
    index("board_task_id").on(t.boardTaskId),
  ],
);

export const boardTaskColumnSettings = mysqlTable(
  "board_task_column_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    boardTaskColumnId: int("board_task_column_id"),
  },
  (t) => [index("board_task_column_id").on(t.boardTaskColumnId)],
);

export const boardTaskItems = mysqlTable(
  "board_task_items",
  {
    id: int("id").autoincrement().primaryKey(),
    boardTaskId: int("board_task_id").notNull(),
    title: varchar("title", { length: 255 }),
    done: tinyint("done").notNull().default(0),
    position: int("position"),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [index("idx_board_task_items_card").on(t.boardTaskId)],
);

export const boardRoles = mysqlTable("board_roles", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 40 }),
  deletedAt: datetime("deleted_at"),
});

export const boardCapabilities = mysqlTable("board_capabilities", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 40 }),
  deletedAt: datetime("deleted_at"),
});

export const boardRoleCapabilities = mysqlTable(
  "board_role_capabilities",
  {
    boardRoleId: int("board_role_id").notNull(),
    boardCapabilityId: int("board_capability_id").notNull(),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [primaryKey({ columns: [t.boardRoleId, t.boardCapabilityId] })],
);

export const boardUsers = mysqlTable(
  "board_users",
  {
    id: int("id").autoincrement().primaryKey(),
    boardId: int("board_id").notNull(),
    userId: int("user_id").notNull(),
    boardRoleId: int("board_role_id").notNull(),
    createdAt: datetime("created_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    uniqueIndex("uq_board_users").on(t.boardId, t.userId),
    index("idx_board_users_user").on(t.userId),
  ],
);

export const boardInvites = mysqlTable(
  "board_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    boardId: int("board_id").notNull(),
    email: varchar("email", { length: 255 }),
    boardRoleId: int("board_role_id").notNull(),
    token: varchar("token", { length: 64 }).notNull(),
    invitedByUserId: int("invited_by_user_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: datetime("created_at"),
    acceptedAt: datetime("accepted_at"),
    expiresAt: datetime("expires_at"),
    acceptedByUserId: int("accepted_by_user_id"),
  },
  (t) => [
    uniqueIndex("token").on(t.token),
    index("idx_board_invites_board").on(t.boardId),
  ],
);

export const boardPiles = mysqlTable(
  "board_piles",
  {
    id: int("id").autoincrement().primaryKey(),
    boardId: int("board_id").notNull(),
    title: varchar("title", { length: 60 }).notNull(),
    color: varchar("color", { length: 20 }),
    position: int("position").notNull().default(1),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [index("idx_board_piles_board").on(t.boardId)],
);

export const labels = mysqlTable(
  "labels",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    title: varchar("title", { length: 50 }).notNull(),
    color: varchar("color", { length: 20 }).notNull(),
    description: varchar("description", { length: 120 }),
    position: int("position"),
    isDefault: tinyint("is_default").notNull().default(0),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [index("idx_labels_workspace").on(t.workspaceId)],
);

export const boardTaskLabels = mysqlTable(
  "board_task_labels",
  {
    boardTaskId: int("board_task_id").notNull(),
    labelId: int("label_id").notNull(),
    createdAt: datetime("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.boardTaskId, t.labelId] }),
    index("idx_btl_label").on(t.labelId),
  ],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    actorUserId: int("actor_user_id"),
    cardId: int("card_id"),
    boardId: int("board_id"),
    workspaceId: int("workspace_id"),
    payload: json("payload"),
    readAt: datetime("read_at"),
    createdAt: datetime("created_at"),
  },
  (t) => [
    // The bell query filters by user and unread state, ordered by recency.
    index("idx_notifications_user").on(t.userId, t.readAt),
    index("idx_notifications_created").on(t.createdAt),
  ],
);

export const boardTaskComments = mysqlTable(
  "board_task_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    boardTaskId: int("board_task_id").notNull(),
    userId: int("user_id").notNull(),
    body: text("body"),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [
    index("idx_btc_task").on(t.boardTaskId),
    index("idx_btc_user").on(t.userId),
  ],
);

export const boardTaskAssignees = mysqlTable(
  "board_task_assignees",
  {
    boardTaskId: int("board_task_id").notNull(),
    userId: int("user_id").notNull(),
    createdAt: datetime("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.boardTaskId, t.userId] }),
    index("idx_board_task_assignees_user").on(t.userId),
  ],
);

export const boardTaskAttachments = mysqlTable(
  "board_task_attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    boardTaskId: int("board_task_id").notNull(),
    filename: varchar("filename", { length: 255 }),
    mimeType: varchar("mime_type", { length: 64 }),
    sizeBytes: int("size_bytes"),
    url: varchar("url", { length: 500 }),
    storageKey: varchar("storage_key", { length: 500 }),
    createdAt: datetime("created_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [index("idx_board_task_attachments_card").on(t.boardTaskId)],
);

export const boardTaskReactions = mysqlTable(
  "board_task_reactions",
  {
    id: int("id").autoincrement().primaryKey(),
    kind: varchar("kind", { length: 10 }).notNull(),
    targetId: int("target_id").notNull(),
    userId: int("user_id").notNull(),
    emoji: varchar("emoji", { length: 32 }).notNull(),
    createdAt: datetime("created_at"),
  },
  (t) => [uniqueIndex("board_task_reactions_unique").on(t.kind, t.targetId, t.userId, t.emoji)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type BoardTask = typeof boardTasks.$inferSelect;
