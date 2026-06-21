"use client";

import { Dispatch, SetStateAction, useEffect, type MutableRefObject } from "react";
import type { BoardEvent } from "@/lib/board-bus";
import type { CardLabel, Pile, Task, WorkspaceLabel } from "@/lib/board-types";

/**
 * Subscribe to the board's server-sent event stream and fold card/pile
 * changes into local state. Events carry authoritative data, so re-applying
 * our own echo is a no-op. Re-subscribes only when the board changes.
 */
export function useBoardStream(
  boardId: number,
  setTasks: Dispatch<SetStateAction<Task[]>>,
  setPiles: Dispatch<SetStateAction<Pile[]>>,
  labelsRef: MutableRefObject<WorkspaceLabel[]>,
) {
// Live board sync: every open kanban view subscribes to the board's
// event stream and folds card/pile changes into local state. Events
// carry authoritative data, so re-applying our own echo is a no-op.
useEffect(() => {
  const es = new EventSource(`/api/boards/${boardId}/stream`);
  es.onmessage = (e) => {
    let ev: BoardEvent | { type: "connected" };
    try {
      ev = JSON.parse(e.data);
    } catch {
      return;
    }
    switch (ev.type) {
      case "card_created": {
        const c = ev.card;
        setTasks((prev) => {
          // Already have the real card — nothing to do.
          if (prev.some((t) => t.id === c.id)) return prev;
          // This may be the echo of a card we just created optimistically.
          // Reconcile it with our pending temp card (negative id, same pile
          // and title) instead of appending, so it doesn't flash as a
          // duplicate before the POST response lands.
          const tempIdx = prev.findIndex(
            (t) =>
              t.id < 0 &&
              t.pileId === c.pileId &&
              (t.title ?? "") === (c.title ?? ""),
          );
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = {
              ...next[tempIdx],
              id: c.id,
              title: c.title,
              pileId: c.pileId,
              position: c.position,
            };
            return next;
          }
          return [
            ...prev,
            {
              id: c.id,
              title: c.title,
              pileId: c.pileId,
              position: c.position,
              itemsTotal: 0,
              itemsDone: 0,
              attachments: 0,
              comments: 0,
              links: 0,
              labels: [],
              assignees: [],
              dueAt: null,
            },
          ];
        });
        break;
      }
      case "card_moved": {
        const place = new Map<number, { pileId: number; position: number }>();
        for (const o of ev.order) {
          o.cardIds.forEach((cid, i) =>
            place.set(cid, { pileId: o.pileId, position: i + 1 }),
          );
        }
        setTasks((prev) =>
          prev.map((t) => {
            const p = place.get(t.id);
            return p ? { ...t, pileId: p.pileId, position: p.position } : t;
          }),
        );
        break;
      }
      case "card_deleted":
        setTasks((prev) => prev.filter((t) => t.id !== ev.cardId));
        break;
      case "card_updated":
        setTasks((prev) =>
          prev.map((t) =>
            t.id === ev.cardId
              ? {
                  ...t,
                  ...(ev.title !== undefined ? { title: ev.title } : {}),
                  ...(Object.prototype.hasOwnProperty.call(ev, "dueAt")
                    ? { dueAt: ev.dueAt ?? null }
                    : {}),
                }
              : t,
          ),
        );
        break;
      case "card_labels": {
        const resolved: CardLabel[] = [];
        for (const lid of ev.labelIds) {
          const l = labelsRef.current.find((x) => x.id === lid);
          if (l) resolved.push({ id: l.id, title: l.title, color: l.color });
        }
        setTasks((prev) =>
          prev.map((t) => (t.id === ev.cardId ? { ...t, labels: resolved } : t)),
        );
        break;
      }
      case "card_assignees":
        setTasks((prev) =>
          prev.map((t) =>
            t.id === ev.cardId
              ? {
                  ...t,
                  assignees: ev.assignees.map((a) => ({
                    userId: a.userId,
                    firstname: a.firstname,
                    lastname: a.lastname,
                    email: a.email,
                  })),
                }
              : t,
          ),
        );
        break;
      case "card_counts":
        setTasks((prev) =>
          prev.map((t) =>
            t.id === ev.cardId
              ? {
                  ...t,
                  itemsTotal: ev.itemsTotal,
                  itemsDone: ev.itemsDone,
                  attachments: ev.attachments,
                  comments: ev.comments,
                  links: ev.links,
                }
              : t,
          ),
        );
        break;
      case "pile_created": {
        const p = ev.pile;
        setPiles((prev) =>
          prev.some((x) => x.id === p.id)
            ? prev
            : [...prev, { id: p.id, title: p.title, color: p.color, position: p.position }],
        );
        break;
      }
      case "pile_updated":
        setPiles((prev) =>
          prev.map((p) => (p.id === ev.pileId ? { ...p, title: ev.title } : p)),
        );
        break;
      case "pile_deleted":
        setPiles((prev) => prev.filter((p) => p.id !== ev.pileId));
        break;
      case "piles_reordered": {
        const rank = new Map(ev.pileIds.map((pid, i) => [pid, i]));
        setPiles((prev) =>
          [...prev]
            .map((p) => ({ ...p, position: (rank.get(p.id) ?? 0) + 1 }))
            .sort((a, b) => a.position - b.position),
        );
        break;
      }
    }
  };
  return () => es.close();
}, [boardId]);
}
