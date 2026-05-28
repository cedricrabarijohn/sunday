import { mysqlTable, int, varchar, text, datetime, json, uniqueIndex, primaryKey, tinyint } from "drizzle-orm/mysql-core";

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
  (t) => [primaryKey({ columns: [t.roleId, t.capabilityId] })],
);

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  roleId: int("role_id"),
  firstname: varchar("firstname", { length: 30 }),
  lastname: varchar("lastname", { length: 30 }),
  email: varchar("email", { length: 30 }),
  deletedAt: datetime("deleted_at"),
  hashedPassword: varchar("hashed_password", { length: 255 }),
});

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
  label: varchar("label", { length: 10 }),
  deletedAt: datetime("deleted_at"),
});

export const workspaceRoleCapabilities = mysqlTable(
  "workspace_role_capabilities",
  {
    workspaceRoleId: int("workspace_role_id").notNull(),
    workspaceCapabilityId: int("workspace_capability_id").notNull(),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceRoleId, t.workspaceCapabilityId] })],
);

export const workspaceInvites = mysqlTable("workspace_invites", {
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
});

export const workspaceUsers = mysqlTable(
  "workspace_users",
  {
    workspaceId: int("workspace_id").notNull(),
    userId: int("user_id").notNull(),
    workspaceRoleId: int("workspace_role_id"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const boards = mysqlTable("boards", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspace_id"),
  title: varchar("title", { length: 100 }),
  createdAt: datetime("created_at"),
  deletedAt: datetime("deleted_at"),
});

export const boardSettings = mysqlTable("board_settings", {
  id: int("id").autoincrement().primaryKey(),
  boardId: int("board_id"),
});

export const boardViews = mysqlTable("board_views", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 20 }),
  boardId: int("board_id"),
  deletedAt: datetime("deleted_at"),
});

export const boardViewSettings = mysqlTable("board_view_settings", {
  id: int("id").autoincrement().primaryKey(),
  boardViewId: int("board_view_id"),
});

export const boardColumnTypes = mysqlTable("board_column_types", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 20 }),
  deletedAt: datetime("deleted_at"),
});

export const boardColumns = mysqlTable("board_columns", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 20 }),
  boardId: int("board_id"),
  boardColumnTypeId: int("board_column_type_id"),
  deletedAt: datetime("deleted_at"),
});

export const boardColumnsSettings = mysqlTable("board_columns_settings", {
  id: int("id").autoincrement().primaryKey(),
  boardColumnsId: int("board_columns_id"),
  config: json("config"),
});

export const boardTasks = mysqlTable(
  "board_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    boardId: int("board_id"),
    pileId: int("pile_id"),
    title: varchar("title", { length: 255 }),
    description: text("description"),
    position: int("position"),
    createdAt: datetime("created_at"),
    updatedAt: datetime("updated_at"),
    deletedAt: datetime("deleted_at"),
  },
  (t) => [uniqueIndex("board_tasks_index_0").on(t.boardId, t.position)],
);

export const boardTaskAssignedUsers = mysqlTable(
  "board_task_assigned_users",
  {
    workspaceUserId: int("workspace_user_id"),
    boardTaskId: int("board_task_id"),
  },
  (t) => [uniqueIndex("board_task_assigned_users_index_1").on(t.workspaceUserId, t.boardTaskId)],
);

export const boardTaskSettings = mysqlTable("board_task_settings", {
  id: int("id").autoincrement().primaryKey(),
  boardTaskId: int("board_task_id"),
});

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
  (t) => [uniqueIndex("board_task_columns_index_2").on(t.boardColumnId, t.boardTaskId)],
);

export const boardTaskColumnSettings = mysqlTable("board_task_column_settings", {
  id: int("id").autoincrement().primaryKey(),
  boardTaskColumnId: int("board_task_column_id"),
});

export const boardTaskItems = mysqlTable("board_task_items", {
  id: int("id").autoincrement().primaryKey(),
  boardTaskId: int("board_task_id").notNull(),
  title: varchar("title", { length: 255 }),
  done: tinyint("done").notNull().default(0),
  position: int("position"),
  createdAt: datetime("created_at"),
  updatedAt: datetime("updated_at"),
  deletedAt: datetime("deleted_at"),
});

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

export const boardUsers = mysqlTable("board_users", {
  id: int("id").autoincrement().primaryKey(),
  boardId: int("board_id").notNull(),
  userId: int("user_id").notNull(),
  boardRoleId: int("board_role_id").notNull(),
  createdAt: datetime("created_at"),
  deletedAt: datetime("deleted_at"),
});

export const boardInvites = mysqlTable("board_invites", {
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
});

export const boardPiles = mysqlTable("board_piles", {
  id: int("id").autoincrement().primaryKey(),
  boardId: int("board_id").notNull(),
  title: varchar("title", { length: 60 }).notNull(),
  color: varchar("color", { length: 20 }),
  position: int("position").notNull().default(1),
  createdAt: datetime("created_at"),
  updatedAt: datetime("updated_at"),
  deletedAt: datetime("deleted_at"),
});

export const labels = mysqlTable("labels", {
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
});

export const boardTaskLabels = mysqlTable(
  "board_task_labels",
  {
    boardTaskId: int("board_task_id").notNull(),
    labelId: int("label_id").notNull(),
    createdAt: datetime("created_at"),
  },
  (t) => [primaryKey({ columns: [t.boardTaskId, t.labelId] })],
);

export const boardTaskAssignees = mysqlTable(
  "board_task_assignees",
  {
    boardTaskId: int("board_task_id").notNull(),
    userId: int("user_id").notNull(),
    createdAt: datetime("created_at"),
  },
  (t) => [primaryKey({ columns: [t.boardTaskId, t.userId] })],
);

export const boardTaskAttachments = mysqlTable("board_task_attachments", {
  id: int("id").autoincrement().primaryKey(),
  boardTaskId: int("board_task_id").notNull(),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mime_type", { length: 64 }),
  sizeBytes: int("size_bytes"),
  url: varchar("url", { length: 500 }),
  storageKey: varchar("storage_key", { length: 500 }),
  createdAt: datetime("created_at"),
  deletedAt: datetime("deleted_at"),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type BoardTask = typeof boardTasks.$inferSelect;
