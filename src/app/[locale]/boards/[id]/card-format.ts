/* Display-name helpers for board card assignees. */

import type { CardAssignee } from "./board-types";

export function initialsFor(a: CardAssignee): string {
  const f = a.firstname?.[0] ?? "";
  const l = a.lastname?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (a.email?.[0] ?? "?").toUpperCase();
}

export function nameFor(a: CardAssignee): string {
  const n = [a.firstname, a.lastname].filter(Boolean).join(" ");
  return n || a.email || "Unknown";
}
