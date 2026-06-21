"use client";

import { Dispatch, SetStateAction } from "react";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import type { Assignee, CardDetail } from "../lib/types";

type Options = {
  cardId: number;
  data: CardDetail | null;
  setData: Dispatch<SetStateAction<CardDetail | null>>;
  onAssigneesChange?: (cardId: number, assignees: Assignee[]) => void;
};

/** Toggle a card's assignees, optimistically, persisting the full set. */
export function useCardAssignees({ cardId, data, setData, onAssigneesChange }: Options) {
  const toast = useToast();

  const persistAssignees = async (next: Assignee[]) => {
    try {
      const res = await fetch(`/api/cards/${cardId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: next.map((a) => a.userId) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Could not update assignees");
      }
    } catch {
      toast.error("Network error.");
    }
  };

  const onToggleAssignee = (member: Assignee) => {
    if (!data) return;
    const has = data.assignees.some((a) => a.userId === member.userId);
    const next = has
      ? data.assignees.filter((a) => a.userId !== member.userId)
      : [...data.assignees, member];
    setData({ ...data, assignees: next });
    onAssigneesChange?.(cardId, next);
    persistAssignees(next);
  };

  return { onToggleAssignee };
}
