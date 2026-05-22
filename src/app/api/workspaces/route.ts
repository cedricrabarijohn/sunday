import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { labels, workspaces, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

const WORKSPACE_ADMIN_ROLE_ID = 1;

const DEFAULT_LABELS: Array<{ title: string; color: string }> = [
  { title: "To do", color: "slate" },
  { title: "In progress", color: "amber" },
  { title: "Review", color: "sky" },
  { title: "Blocked", color: "coral" },
  { title: "Done", color: "lime" },
];

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const rows = await db
    .select({
      id: workspaces.id,
      title: workspaces.title,
      role: workspaceUsers.workspaceRoleId,
    })
    .from(workspaces)
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceUsers.userId, auth.session.sub),
        isNull(workspaces.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    );

  return NextResponse.json({ workspaces: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const title = (body?.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 50) return NextResponse.json({ error: "title too long" }, { status: 400 });

  const [result] = await db.insert(workspaces).values({ title });
  const id = Number((result as { insertId: number }).insertId);

  await db.insert(workspaceUsers).values({
    workspaceId: id,
    userId: auth.session.sub,
    workspaceRoleId: WORKSPACE_ADMIN_ROLE_ID,
  });

  const now = new Date();
  await db.insert(labels).values(
    DEFAULT_LABELS.map((d, idx) => ({
      workspaceId: id,
      title: d.title,
      color: d.color,
      position: idx + 1,
      isDefault: 1,
      createdAt: now,
      updatedAt: now,
    })),
  );

  return NextResponse.json({ workspace: { id, title } }, { status: 201 });
}
