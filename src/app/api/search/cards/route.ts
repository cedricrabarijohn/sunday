import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTasks,
  boardUsers,
  boards,
  workspaceUsers,
  workspaces,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { WORKSPACE_ADMIN_ROLE_ID } from "@/lib/workspace-access";

const MAX_RESULTS = 20;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  // MariaDB's default collation (utf8mb4_general_ci / utf8mb4_unicode_ci) is
  // case-insensitive for LIKE, so we can rely on plain `like` here.
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;

  const adminWsRows = await db
    .select({ id: workspaceUsers.workspaceId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.userId, auth.session.sub),
        eq(workspaceUsers.workspaceRoleId, WORKSPACE_ADMIN_ROLE_ID),
        isNull(workspaceUsers.deletedAt),
      ),
    );
  const adminWorkspaceIds = adminWsRows
    .map((r) => r.id)
    .filter((id): id is number => id != null);

  const memberBoardRows = await db
    .select({ boardId: boardUsers.boardId })
    .from(boardUsers)
    .where(
      and(
        eq(boardUsers.userId, auth.session.sub),
        isNull(boardUsers.deletedAt),
      ),
    );
  const memberBoardIds = memberBoardRows
    .map((r) => r.boardId)
    .filter((id): id is number => id != null);

  // Over-fetch a bit so the visibility filter still leaves us with up to
  // MAX_RESULTS rows; cap to keep the query bounded.
  const rawRows = await db
    .select({
      id: boardTasks.id,
      title: boardTasks.title,
      boardId: boards.id,
      boardTitle: boards.title,
      workspaceId: workspaces.id,
      workspaceTitle: workspaces.title,
    })
    .from(boardTasks)
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(
      and(
        like(boardTasks.title, pattern),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
        isNull(workspaces.deletedAt),
      ),
    )
    .orderBy(desc(boardTasks.id))
    .limit(MAX_RESULTS * 5);

  const adminWsSet = new Set(adminWorkspaceIds);
  const memberBoardSet = new Set(memberBoardIds);
  const results = rawRows
    .filter(
      (r) =>
        r.workspaceId != null &&
        r.boardId != null &&
        (adminWsSet.has(r.workspaceId) || memberBoardSet.has(r.boardId)),
    )
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      id: r.id,
      title: r.title,
      boardId: r.boardId,
      boardTitle: r.boardTitle,
      workspaceId: r.workspaceId,
      workspaceTitle: r.workspaceTitle,
    }));

  return NextResponse.json({ results });
}
