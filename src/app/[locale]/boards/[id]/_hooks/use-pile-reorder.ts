"use client";

import { Dispatch, DragEvent, SetStateAction, useState } from "react";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import type { Pile } from "../_lib/board-types";

/**
 * Drag-and-drop + move-button reordering for board piles. Owns the drag
 * state, persists the new order to the server, and rolls back on failure.
 */
export function usePileReorder(
  piles: Pile[],
  setPiles: Dispatch<SetStateAction<Pile[]>>,
  boardId: number,
) {
  const toast = useToast();
// --- Pile reordering (drag & drop + move buttons) ---
const [pileDragId, setPileDragId] = useState<number | null>(null);
// beforeId === null means "drop at the end"; the whole hint null means none.
const [pileDropHint, setPileDropHint] = useState<{ beforeId: number | null } | null>(null);

const persistPileOrder = async (orderedIds: number[]) => {
  try {
    const res = await fetch(`/api/boards/${boardId}/piles/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pileIds: orderedIds }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error || "Could not reorder piles");
      return false;
    }
    return true;
  } catch {
    toast.error("Network error.");
    return false;
  }
};

const applyPileOrder = (renum: Pile[]) => {
  const current = [...piles].sort((a, b) => a.position - b.position);
  if (renum.every((p, i) => p.id === current[i]?.id)) return; // no change
  const snapshot = piles;
  setPiles(renum);
  persistPileOrder(renum.map((p) => p.id)).then((ok) => {
    if (!ok) setPiles(snapshot);
  });
};

// Move `dragId` so it sits just before `beforeId` (or at the end when null).
const reorderPiles = (dragId: number, beforeId: number | null) => {
  const current = [...piles].sort((a, b) => a.position - b.position);
  const dragged = current.find((p) => p.id === dragId);
  if (!dragged) return;
  const without = current.filter((p) => p.id !== dragId);
  const idx = beforeId == null ? without.length : without.findIndex((p) => p.id === beforeId);
  const insertAt = idx < 0 ? without.length : idx;
  without.splice(insertAt, 0, dragged);
  applyPileOrder(without.map((p, i) => ({ ...p, position: i + 1 })));
};

// Nudge a pile one slot left/right — accessible/touch-friendly alternative
// to dragging.
const movePile = (pileId: number, dir: -1 | 1) => {
  const current = [...piles].sort((a, b) => a.position - b.position);
  const i = current.findIndex((p) => p.id === pileId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= current.length) return;
  [current[i], current[j]] = [current[j], current[i]];
  applyPileOrder(current.map((p, k) => ({ ...p, position: k + 1 })));
};

const onPileReorderStart = (e: DragEvent<HTMLElement>, pileId: number) => {
  setPileDragId(pileId);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/x-pile", String(pileId));
};

const onPileReorderOver = (e: DragEvent<HTMLElement>, overPile: Pile) => {
  if (pileDragId == null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (overPile.id === pileDragId) {
    setPileDropHint(null);
    return;
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const after = e.clientX > rect.left + rect.width / 2;
  const current = [...piles].sort((a, b) => a.position - b.position);
  const i = current.findIndex((p) => p.id === overPile.id);
  const beforeId = after ? current[i + 1]?.id ?? null : overPile.id;
  // Dropping right next to where it already is is a no-op — hide the hint.
  if (beforeId === pileDragId) {
    setPileDropHint(null);
    return;
  }
  setPileDropHint({ beforeId });
};

const onPileReorderDrop = (e: DragEvent<HTMLElement>) => {
  if (pileDragId == null) return;
  e.preventDefault();
  e.stopPropagation();
  const dragId = pileDragId;
  const hint = pileDropHint;
  setPileDragId(null);
  setPileDropHint(null);
  if (hint) reorderPiles(dragId, hint.beforeId);
};

const onPileReorderEnd = () => {
  setPileDragId(null);
  setPileDropHint(null);
};

  return {
    pileDragId,
    pileDropHint,
    movePile,
    onPileReorderStart,
    onPileReorderOver,
    onPileReorderDrop,
    onPileReorderEnd,
  };
}
