import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boards, users, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { loadBoardCapabilities } from "@/lib/board-access";
import Hero from "@/components/organisms/hero/Hero";

export default async function Home() {
  const session = await getSessionFromCookie();

  // Not signed in — show the marketing page.
  if (!session) return <Hero />;

  // Signed in — try to send them straight to the board they last viewed.
  const [me] = await db
    .select({ lastBoardId: users.lastBoardId })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  const lastBoardId = me?.lastBoardId ?? 0;

  if (lastBoardId > 0) {
    const [board] = await db
      .select({
        id: boards.id,
        workspaceId: boards.workspaceId,
        title: boards.title,
        createdAt: boards.createdAt,
      })
      .from(boards)
      .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
      .where(
        and(
          eq(boards.id, lastBoardId),
          isNull(boards.deletedAt),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1);

    // Only redirect if it still exists and they can still see it.
    if (board && board.workspaceId != null) {
      const caps = await loadBoardCapabilities(
        {
          id: board.id,
          workspaceId: board.workspaceId,
          title: board.title,
          createdAt: board.createdAt,
        },
        session.sub,
      );
      if (caps.has("view_board")) redirect(`/boards/${board.id}`);
    }
  }

  // No usable last board — fall back to the workspaces home.
  redirect("/workspaces");
}
