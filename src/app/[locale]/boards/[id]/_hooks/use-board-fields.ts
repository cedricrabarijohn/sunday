"use client";

import { Dispatch, SetStateAction } from "react";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import type { FieldConfig, FieldType } from "@/lib/fields";
import type { BoardColumn, FieldValue, Task } from "../_lib/board-types";

/** Create / rename / delete custom fields and edit their per-card values. */
export function useBoardFields(
  boardId: number,
  tasks: Task[],
  setTasks: Dispatch<SetStateAction<Task[]>>,
  columns: BoardColumn[],
  setColumns: Dispatch<SetStateAction<BoardColumn[]>>,
) {
  const toast = useToast();
  const { confirm } = useConfirm();
// --- custom fields ---
const onSetFieldValue = async (cardId: number, columnId: number, value: FieldValue) => {
  const snapshot = tasks;
  setTasks((prev) =>
    prev.map((t) =>
      t.id === cardId ? { ...t, fields: { ...(t.fields ?? {}), [columnId]: value } } : t,
    ),
  );
  if (cardId < 0) return;
  try {
    const res = await fetch(`/api/cards/${cardId}/columns/${columnId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setTasks(snapshot);
      toast.error(d.error || "Could not save field");
    }
  } catch {
    setTasks(snapshot);
    toast.error("Network error.");
  }
};

const onCreateField = async (input: { label: string; type: FieldType; config?: FieldConfig }) => {
  try {
    const res = await fetch(`/api/boards/${boardId}/columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error || "Could not add field");
      return;
    }
    setColumns((prev) => [...prev, d.column as BoardColumn]);
  } catch {
    toast.error("Network error.");
  }
};

const onRenameField = (columnId: number, label: string) => {
  setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, label } : c)));
  fetch(`/api/columns/${columnId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  }).catch(() => {});
};

const onDeleteField = async (columnId: number) => {
  const col = columns.find((c) => c.id === columnId);
  const ok = await confirm({
    title: `Delete field “${col?.label ?? ""}”?`,
    message: "Its values on every card will be removed. This cannot be undone.",
    confirmLabel: "Delete field",
    danger: true,
  });
  if (!ok) return;
  const snap = columns;
  setColumns((prev) => prev.filter((c) => c.id !== columnId));
  try {
    const res = await fetch(`/api/columns/${columnId}`, { method: "DELETE" });
    if (!res.ok) {
      setColumns(snap);
      toast.error("Could not delete field");
    }
  } catch {
    setColumns(snap);
    toast.error("Network error.");
  }
};

  return { onSetFieldValue, onCreateField, onRenameField, onDeleteField };
}
