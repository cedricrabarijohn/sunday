/* Serialize a loaded board export to a Markdown document. Card descriptions
 * and comment bodies are already stored as Markdown, so they embed verbatim. */

import { formatFieldValue } from "@/lib/fields";
import { nameFor } from "@/lib/card-format";
import type { BoardExport, ExportTask } from "@/lib/board-export";

export type ExportMeta = { filtered: boolean; generatedAt: Date };

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

function cardToMarkdown(card: ExportTask, columns: BoardExport["columns"]): string {
  const out: string[] = [];
  out.push(`### ${card.title?.trim() || "Untitled card"}`);
  out.push("");

  const meta: string[] = [];
  if (card.labels.length) {
    meta.push(`**Labels:** ${card.labels.map((l) => l.title).join(", ")}`);
  }
  if (card.assignees.length) {
    meta.push(`**Assignees:** ${card.assignees.map(nameFor).join(", ")}`);
  }
  if (card.dueAt) {
    meta.push(`**Due:** ${fmtDate(card.dueAt)}`);
  }
  for (const col of columns) {
    const text = formatFieldValue(col.type, card.fields[col.id], col.config);
    if (text) meta.push(`**${col.label ?? "Field"}:** ${text}`);
  }
  if (meta.length) {
    out.push(meta.join("  \n"));
    out.push("");
  }

  const desc = card.description?.trim();
  if (desc) {
    out.push(desc);
    out.push("");
  }

  if (card.checklist.length) {
    out.push("**Checklist**");
    out.push("");
    for (const item of card.checklist) {
      out.push(`- [${item.done ? "x" : " "}] ${item.title}`);
    }
    out.push("");
  }

  if (card.comments.length) {
    out.push("**Comments**");
    out.push("");
    for (const c of card.comments) {
      const stamp = fmtDate(c.createdAt);
      out.push(`> **${c.author}**${stamp ? ` — ${stamp}` : ""}  `);
      for (const line of (c.body || "").split("\n")) out.push(`> ${line}`);
      out.push("");
    }
  }

  return out.join("\n");
}

export function boardToMarkdown(data: BoardExport, meta: ExportMeta): string {
  const out: string[] = [];
  out.push(`# ${data.board.title}`);
  out.push("");
  const sub = `*Workspace: ${data.board.workspaceTitle}* · Exported ${fmtDate(meta.generatedAt)}`;
  out.push(meta.filtered ? `${sub} · _filtered view_` : sub);
  out.push("");

  for (const pile of data.piles) {
    out.push(`## ${pile.title}`);
    out.push("");
    if (!pile.cards.length) {
      out.push("_No cards._");
      out.push("");
      continue;
    }
    for (const card of pile.cards) {
      out.push(cardToMarkdown(card, data.columns));
      out.push("");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
