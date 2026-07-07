import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaces } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { loadBoardExport } from "@/lib/board-export";
import {
  fieldFilterCount,
  filterFromSearchParams,
  matchesFilter,
} from "@/lib/board-types";
import { boardToMarkdown } from "@/lib/export/to-markdown";
import { boardToDocx } from "@/lib/export/to-docx";

export const runtime = "nodejs";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function slugify(title: string): string {
  const s = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "board";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "md";

  const [ws] = await db
    .select({ title: workspaces.title })
    .from(workspaces)
    .where(eq(workspaces.id, guard.board.workspaceId))
    .limit(1);

  const data = await loadBoardExport({
    id: guard.board.id,
    title: guard.board.title ?? "Untitled board",
    workspaceTitle: ws?.title ?? "",
  });

  // Respect the board's active filters, passed through as the same query params
  // the board URL uses (q / assignees / labels / due / cf<id>).
  const filter = filterFromSearchParams(url.searchParams);
  const filtered =
    filter.query.trim().length > 0 ||
    filter.assigneeIds.size > 0 ||
    filter.labelIds.size > 0 ||
    filter.due !== "any" ||
    fieldFilterCount(filter.fields) > 0;
  if (filtered) {
    for (const pile of data.piles) {
      pile.cards = pile.cards.filter((c) => matchesFilter(c, filter));
    }
  }

  const meta = { filtered, generatedAt: new Date() };
  const date = meta.generatedAt.toISOString().slice(0, 10);
  const filename = `${slugify(data.board.title)}-${date}.${format}`;

  const body: BodyInit =
    format === "docx"
      ? new Uint8Array(await boardToDocx(data, meta))
      : boardToMarkdown(data, meta);

  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "docx" ? DOCX_MIME : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
