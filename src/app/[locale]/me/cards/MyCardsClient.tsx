"use client";

import { useMemo } from "react";
import Link from "next/link";
import { colorForName } from "@/lib/palette";
import styles from "../../workspaces/AppShell.module.scss";
import mStyles from "./MyCards.module.scss";

type CardRow = {
  id: number;
  title: string | null;
  dueAt: string | null;
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  labels: Array<{ id: number; title: string; color: string }>;
};

type Bucket = { key: string; label: string; cards: CardRow[] };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketize(cards: CardRow[]): Bucket[] {
  const now = new Date();
  const today = startOfDay(now).getTime();
  const tomorrow = today + 24 * 60 * 60 * 1000;
  const weekEnd = today + 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, Bucket> = {
    overdue: { key: "overdue", label: "Overdue", cards: [] },
    today: { key: "today", label: "Today", cards: [] },
    week: { key: "week", label: "This week", cards: [] },
    later: { key: "later", label: "Later", cards: [] },
    none: { key: "none", label: "No due date", cards: [] },
  };

  for (const c of cards) {
    if (!c.dueAt) {
      buckets.none.cards.push(c);
      continue;
    }
    const t = new Date(c.dueAt).getTime();
    if (t < today) buckets.overdue.cards.push(c);
    else if (t < tomorrow) buckets.today.cards.push(c);
    else if (t < weekEnd) buckets.week.cards.push(c);
    else buckets.later.cards.push(c);
  }

  const byDue = (a: CardRow, b: CardRow) => {
    const at = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bt = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return at - bt;
  };
  for (const k of Object.keys(buckets)) buckets[k].cards.sort(byDue);

  return ["overdue", "today", "week", "later", "none"]
    .map((k) => buckets[k])
    .filter((b) => b.cards.length > 0);
}

function formatDue(dueAt: string): string {
  const d = new Date(dueAt);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export default function MyCardsClient({ cards }: { cards: CardRow[] }) {
  const buckets = useMemo(() => bucketize(cards), [cards]);

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderText}>
          <div>
            <h1 className={styles.pageTitle}>My cards</h1>
            <div className={styles.pageSubtitle}>
              Everything assigned to you, across all your workspaces.
            </div>
          </div>
        </div>
        <span className={styles.pageMeta}>
          {cards.length} {cards.length === 1 ? "card" : "cards"}
        </span>
      </div>

      {cards.length === 0 ? (
        <div className={mStyles.empty}>
          You have no cards assigned to you right now.
        </div>
      ) : (
        buckets.map((b) => (
          <section key={b.key} className={mStyles.section}>
            <header className={mStyles.sectionHead}>
              <h2 className={mStyles.sectionTitle}>{b.label}</h2>
              <span className={mStyles.sectionCount}>{b.cards.length}</span>
            </header>
            <ul className={mStyles.list}>
              {b.cards.map((c) => (
                <li key={c.id}>
                  <Link className={mStyles.row} href={`/boards/${c.boardId}`}>
                    <div className={mStyles.rowMain}>
                      <div className={mStyles.rowTitle}>
                        {c.title?.trim() ? c.title : <em>Untitled</em>}
                      </div>
                      <div className={mStyles.rowSub}>
                        {c.workspaceTitle || "workspace"} ·{" "}
                        <span className={mStyles.rowBoard}>
                          {c.boardTitle || "board"}
                        </span>
                      </div>
                      {c.labels.length > 0 && (
                        <div className={mStyles.rowLabels}>
                          {c.labels.map((l) => {
                            const c2 = colorForName(l.color);
                            return (
                              <span
                                key={l.id}
                                className={mStyles.labelChip}
                                style={{ background: c2.soft, color: c2.hue }}
                              >
                                <span
                                  className={mStyles.labelDot}
                                  style={{ background: c2.hue }}
                                  aria-hidden
                                />
                                {l.title}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {c.dueAt && (
                      <span
                        className={mStyles.due}
                        data-state={
                          b.key === "overdue"
                            ? "overdue"
                            : b.key === "today" || b.key === "week"
                            ? "soon"
                            : "later"
                        }
                      >
                        {formatDue(c.dueAt)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
