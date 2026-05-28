import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAssignees,
  boardTaskLabels,
  boardTasks,
  boardUsers,
  boards,
  labels,
  users,
  workspaceUsers,
  workspaces,
} from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { WORKSPACE_ADMIN_ROLE_ID } from "@/lib/workspace-access";
import AppShell from "../../workspaces/AppShell";
import MyCardsClient from "./MyCardsClient";

export default async function MyCardsPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/users/sign_in");

  const [user] = await db
    .select({ firstname: users.firstname, lastname: users.lastname, email: users.email })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) redirect("/users/sign_in");

  const allWorkspaces = await db
    .select({ id: workspaces.id, title: workspaces.title })
    .from(workspaces)
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceUsers.userId, session.sub),
        isNull(workspaces.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    );

  // Workspaces where the caller is an admin (escalation: they see every
  // board in those workspaces regardless of explicit board membership).
  const adminWsRows = await db
    .select({ id: workspaceUsers.workspaceId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.userId, session.sub),
        eq(workspaceUsers.workspaceRoleId, WORKSPACE_ADMIN_ROLE_ID),
        isNull(workspaceUsers.deletedAt),
      ),
    );
  const adminWorkspaceIds = adminWsRows
    .map((r) => r.id)
    .filter((id): id is number => id != null);

  // Boards where the caller is an explicit member.
  const memberBoardRows = await db
    .select({ boardId: boardUsers.boardId })
    .from(boardUsers)
    .where(
      and(
        eq(boardUsers.userId, session.sub),
        isNull(boardUsers.deletedAt),
      ),
    );
  const memberBoardIds = memberBoardRows.map((r) => r.boardId);

  // Pull every card assigned to the caller; we'll filter by visible
  // boards in JS to avoid an awkward OR-with-leftJoin in SQL.
  const rawRows = await db
    .select({
      id: boardTasks.id,
      title: boardTasks.title,
      dueAt: boardTasks.dueAt,
      boardId: boards.id,
      boardTitle: boards.title,
      workspaceId: workspaces.id,
      workspaceTitle: workspaces.title,
    })
    .from(boardTaskAssignees)
    .innerJoin(boardTasks, eq(boardTasks.id, boardTaskAssignees.boardTaskId))
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(
      and(
        eq(boardTaskAssignees.userId, session.sub),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
        isNull(workspaces.deletedAt),
      ),
    );

  const adminWsSet = new Set(adminWorkspaceIds);
  const memberBoardSet = new Set(memberBoardIds);
  const visible = rawRows.filter(
    (r) =>
      r.workspaceId != null &&
      (adminWsSet.has(r.workspaceId) || memberBoardSet.has(r.boardId)),
  );

  const cardIds = visible.map((r) => r.id);
  const labelRows = cardIds.length
    ? await db
        .select({
          cardId: boardTaskLabels.boardTaskId,
          id: labels.id,
          title: labels.title,
          color: labels.color,
          position: labels.position,
        })
        .from(boardTaskLabels)
        .innerJoin(labels, eq(labels.id, boardTaskLabels.labelId))
        .where(
          and(
            inArray(boardTaskLabels.boardTaskId, cardIds),
            isNull(labels.deletedAt),
          ),
        )
        .orderBy(asc(labels.position), asc(labels.id))
    : [];

  const labelsByCard = new Map<number, Array<{ id: number; title: string; color: string }>>();
  for (const row of labelRows) {
    const arr = labelsByCard.get(row.cardId) ?? [];
    arr.push({ id: row.id, title: row.title, color: row.color });
    labelsByCard.set(row.cardId, arr);
  }

  const cards = visible.map((r) => ({
    id: r.id,
    title: r.title,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    boardId: r.boardId,
    boardTitle: r.boardTitle,
    workspaceId: r.workspaceId!,
    workspaceTitle: r.workspaceTitle,
    labels: labelsByCard.get(r.id) ?? [],
  }));

  return (
    <AppShell user={user} workspaces={allWorkspaces}>
      <MyCardsClient cards={cards} />
    </AppShell>
  );
}
