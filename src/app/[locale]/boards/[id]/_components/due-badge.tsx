"use client";

import { CalendarIcon } from "@/components/Icons";
import kStyles from "../_styles/Kanban.module.scss";

function dueState(dueAt: string | Date): "overdue" | "soon" | "later" {
  const t = typeof dueAt === "string" ? new Date(dueAt).getTime() : dueAt.getTime();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (t < now) return "overdue";
  if (t - now < 2 * dayMs) return "soon";
  return "later";
}

function formatDueShort(dueAt: string | Date): string {
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function DueBadge({ dueAt }: { dueAt: string | Date }) {
  const state = dueState(dueAt);
  return (
    <span
      className={kStyles.cardBadge}
      data-due={state}
      title={
        typeof dueAt === "string"
          ? new Date(dueAt).toLocaleString()
          : dueAt.toLocaleString()
      }
    >
      <CalendarIcon size={11} />
      <span>{formatDueShort(dueAt)}</span>
    </span>
  );
}
