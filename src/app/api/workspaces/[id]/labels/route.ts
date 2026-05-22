import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { labels } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { ALLOWED_COLORS, workspaceMember } from "@/lib/label-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await workspaceMember(workspaceId, auth.session.sub))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: labels.id,
      title: labels.title,
      color: labels.color,
      description: labels.description,
      position: labels.position,
      isDefault: labels.isDefault,
    })
    .from(labels)
    .where(and(eq(labels.workspaceId, workspaceId), isNull(labels.deletedAt)))
    .orderBy(asc(labels.position), asc(labels.id));

  return NextResponse.json({ labels: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await workspaceMember(workspaceId, auth.session.sub))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const title = (body?.title ?? "").toString().trim();
  const color = (body?.color ?? "").toString();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 50) return NextResponse.json({ error: "title too long" }, { status: 400 });
  if (!ALLOWED_COLORS.has(color)) {
    return NextResponse.json({ error: "Unknown color" }, { status: 400 });
  }

  const [maxRow] = await db
    .select({ value: max(labels.position) })
    .from(labels)
    .where(eq(labels.workspaceId, workspaceId));
  const position = (maxRow?.value ?? 0) + 1;

  const now = new Date();
  const [result] = await db.insert(labels).values({
    workspaceId,
    title,
    color,
    position,
    isDefault: 0,
    createdAt: now,
    updatedAt: now,
  });
  const labelId = Number((result as { insertId: number }).insertId);

  return NextResponse.json(
    {
      label: {
        id: labelId,
        title,
        color,
        description: null,
        position,
        isDefault: 0,
      },
    },
    { status: 201 },
  );
}
