import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { labels, workspaceUsers } from "@/db/schema";
import { PALETTE } from "./palette";

export const ALLOWED_COLORS = new Set(PALETTE.map((p) => p.name));

export async function workspaceMember(workspaceId: number, userId: number) {
  const [row] = await db
    .select({ id: workspaceUsers.workspaceId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        eq(workspaceUsers.userId, userId),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return !!row;
}

export async function loadLabelForUser(labelId: number, userId: number) {
  const [row] = await db
    .select({
      id: labels.id,
      workspaceId: labels.workspaceId,
      title: labels.title,
      color: labels.color,
      position: labels.position,
      isDefault: labels.isDefault,
    })
    .from(labels)
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, labels.workspaceId))
    .where(
      and(
        eq(labels.id, labelId),
        eq(workspaceUsers.userId, userId),
        isNull(labels.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
