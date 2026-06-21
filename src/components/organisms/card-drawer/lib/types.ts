/* Shared data types for the card drawer and its sub-components. */

export type Item = {
  id: number;
  title: string | null;
  done: number;
  position: number | null;
};

export type Attachment = {
  id: number;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
};

export type WorkspaceLabel = {
  id: number;
  title: string;
  color: string;
  position: number | null;
  isDefault: number;
};

export type CardLabel = {
  id: number;
  title: string;
  color: string;
  position?: number | null;
};

export type Assignee = {
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

export type Reaction = { emoji: string; userIds: number[] };

export type Comment = {
  id: number;
  body: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  reactions?: Reaction[];
};

export type CardLink = {
  id: number;
  kind: string;
  ref: string;
  title: string | null;
  url: string | null;
  state: string | null;
};

export type CardDetail = {
  card: {
    id: number;
    title: string | null;
    description?: string | null;
    boardId?: number | null;
    dueAt?: string | null;
  };
  items: Item[];
  attachments: Attachment[];
  labels: CardLabel[];
  assignees: Assignee[];
  comments: Comment[];
  links?: CardLink[];
  taskReactions?: Reaction[];
  capabilities?: string[];
  canManageLabels?: boolean;
  currentUserId?: number;
};

export type CardCounts = {
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
  comments: number;
};
