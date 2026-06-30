/* Shared types for the board view (kanban + table) and its helpers. */

import type { FieldConfig, FieldType } from "./fields";

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

const FILTER_KEYS = ["q", "assignees", "labels", "due"];
const isFieldKey = (k: string) => /^cf\d+$/.test(k);

/** Serialize the filter into URL search params, preserving non-filter params in `base`. */
export function filterToSearchParams(
  filter: BoardFilterState,
  base?: URLSearchParams,
): URLSearchParams {
  const p = new URLSearchParams(base?.toString() ?? "");
  for (const k of [...p.keys()]) {
    if (FILTER_KEYS.includes(k) || isFieldKey(k)) p.delete(k);
  }
  const q = filter.query.trim();
  if (q) p.set("q", q);
  if (filter.assigneeIds.size) p.set("assignees", [...filter.assigneeIds].join(","));
  if (filter.labelIds.size) p.set("labels", [...filter.labelIds].join(","));
  if (filter.due !== "any") p.set("due", filter.due);
  for (const [colId, opts] of filter.fields) {
    if (opts.size) p.set(`cf${colId}`, [...opts].join(","));
  }
  return p;
}

/** Parse a filter back from URL search params. */
export function filterFromSearchParams(p: URLSearchParams): BoardFilterState {
  const nums = (s: string | null) =>
    new Set((s ?? "").split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0));
  const due = p.get("due");
  const fields = new Map<number, Set<string>>();
  for (const [k, v] of p.entries()) {
    const m = /^cf(\d+)$/.exec(k);
    if (m && v) fields.set(Number(m[1]), new Set(v.split(",").filter(Boolean)));
  }
  return {
    query: p.get("q") ?? "",
    assigneeIds: nums(p.get("assignees")),
    labelIds: nums(p.get("labels")),
    due: due === "withDue" || due === "overdue" ? due : "any",
    fields,
  };
}
