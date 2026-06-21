/* Shared types for the board view (kanban + table) and its helpers. */

import type { FieldConfig, FieldType } from "@/lib/fields";

export type FieldValue = string | number | boolean | string[] | null;

export type BoardColumn = {
  id: number;
  label: string | null;
  type: FieldType | string | null;
  config: FieldConfig;
  position: number | null;
};

export type CardLabel = { id: number; title: string; color: string };

export type CardAssignee = {
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

export type WorkspaceLabel = {
  id: number;
  title: string;
  color: string;
  position: number | null;
  isDefault: number;
};

export type Task = {
  id: number;
  title: string | null;
  pileId: number | null;
  position: number | null;
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
  comments: number;
  links: number;
  labels: CardLabel[];
  assignees: CardAssignee[];
  dueAt: string | Date | null;
  fields?: Record<number, FieldValue>;
};

export type Pile = {
  id: number;
  title: string;
  color: string | null;
  position: number;
};

export type DragState = { cardId: number; fromPileId: number | null } | null;
export type DropHint = { pileId: number; beforeCardId: number | null } | null;

export type BoardFilterState = {
  query: string;
  assigneeIds: Set<number>;
  labelIds: Set<number>;
  due: "any" | "withDue" | "overdue";
  // Custom-field filters: column id → selected option ids (select / multi_select).
  fields: Map<number, Set<string>>;
};

/** Total number of selected custom-field options across all fields. */
export function fieldFilterCount(fields: Map<number, Set<string>>): number {
  let n = 0;
  for (const set of fields.values()) n += set.size;
  return n;
}
