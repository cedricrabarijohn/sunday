"use client";

import Link from "next/link";
import { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PALETTE } from "@/lib/palette";
import styles from "./Hero.module.scss";

// Palette by name, for readable references below.
const C = Object.fromEntries(PALETTE.map((p) => [p.name, p])) as Record<
  string,
  (typeof PALETTE)[number]
>;

type Person = { initials: string; hue: string };
const AT: Person = { initials: "AT", hue: C.indigo.hue };
const MK: Person = { initials: "MK", hue: C.teal.hue };
const LP: Person = { initials: "LP", hue: C.pink.hue };

type MockCard = {
  labels: { text: string; color: (typeof PALETTE)[number] }[];
  title: string;
  people: Person[];
  meta?: string;
  done?: boolean;
};

const BOARD: { title: string; color: (typeof PALETTE)[number]; cards: MockCard[] }[] = [
  {
    title: "To do",
    color: C.slate,
    cards: [
      {
        labels: [{ text: "Bug", color: C.coral }],
        title: "Fix sign-in redirect loop",
        people: [AT],
        meta: "Due Fri",
      },
      {
        labels: [{ text: "Feature", color: C.indigo }],
        title: "Inline checklist on cards",
        people: [MK, LP],
      },
    ],
  },
  {
    title: "In progress",
    color: C.amber,
    cards: [
      {
        labels: [
          { text: "Urgent", color: C.pink },
          { text: "Backend", color: C.teal },
        ],
        title: "Realtime board sync",
        people: [AT, MK],
        meta: "3/5",
      },
    ],
  },
  {
    title: "Done",
    color: C.lime,
    cards: [
      {
        labels: [{ text: "Frontend", color: C.sky }],
        title: "Table view + drag & drop",
        people: [MK],
        done: true,
      },
    ],
  },
];

const Hero = () => {
  const router = useRouter();

  return (
    <section className={styles.hero}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand}>sunday</Link>
          <div className={styles.navActions}>
            <Link href="/users/sign_in" className={styles.linkBtn}>Sign in</Link>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push("/users/sign_up")}
            >
              Create account
            </button>
          </div>
        </div>
      </nav>

      <div className={styles.body}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            <span>a side project that got a little out of hand</span>
          </div>
          <h1 className={styles.headline}>
            Plan before{" "}
            <span className={styles.headlineAccent}>Monday comes.</span>
          </h1>
          <p className={styles.subhead}>
            It&apos;s boards and cards, nothing you haven&apos;t seen. What&apos;s
            missing is the rest of it: the setup wizard, the sales call, the
            per-seat invoice, the trial that expires right when you start
            counting on it. Make a board, drag a card, tick a box. Then go enjoy
            what&apos;s left of the weekend.
          </p>
          <div className={styles.ctaRow}>
            <button
              type="button"
              className={styles.ctaPrimary}
              onClick={() => router.push("/users/sign_up")}
            >
              Get an account
            </button>
            <button
              type="button"
              className={styles.ctaGhost}
              onClick={() => router.push("/users/sign_in")}
            >
              Sign in
            </button>
          </div>

          <div className={styles.caps}>
            <div className={styles.cap}>
              <span className={styles.capLabel}>what it is</span>
              <span className={styles.capValue}>Boards &amp; a table view</span>
              <span className={styles.capDelta}>drag, drop, done</span>
            </div>
            <div className={styles.cap}>
              <span className={styles.capLabel}>what it isn&apos;t</span>
              <span className={styles.capValue}>No AI, no upsells</span>
              <span className={styles.capDelta}>and no &ldquo;talk to sales&rdquo;</span>
            </div>
            <div className={styles.cap}>
              <span className={styles.capLabel}>the catch</span>
              <span className={styles.capValue}>It&apos;s still v0.1</span>
              <span className={styles.capDelta}>so be a little patient</span>
            </div>
          </div>
        </div>

        <div className={styles.preview} aria-hidden>
          <div className={styles.previewHead}>
            <span className={styles.previewDot} />
            <span className={styles.previewDot} />
            <span className={styles.previewDot} />
            <span className={styles.previewLive}>
              <span className={styles.previewLiveDot} />
              live
            </span>
            <span className={styles.previewTabLabel}>sunday / engineering / sprint</span>
          </div>

          <div className={styles.previewBar}>
            <span className={styles.previewBoardTitle}>Sprint board</span>
            <div className={styles.previewToggle}>
              <span className={styles.previewToggleOn}>Board</span>
              <span className={styles.previewToggleOff}>Table</span>
            </div>
          </div>

          <div className={styles.previewKanban}>
            {BOARD.map((col) => (
              <div key={col.title} className={styles.previewCol}>
                <div className={styles.previewColHead}>
                  <span
                    className={styles.previewColDot}
                    style={{ background: col.color.hue }}
                  />
                  <span>{col.title}</span>
                  <span className={styles.previewColCount}>{col.cards.length}</span>
                </div>
                {col.cards.map((card) => (
                  <div
                    key={card.title}
                    className={`${styles.previewCard} ${card.done ? styles.previewCardDone : ""}`}
                  >
                    {card.labels.length > 0 && (
                      <div className={styles.previewCardLabels}>
                        {card.labels.map((l) => (
                          <span
                            key={l.text}
                            className={styles.previewChip}
                            style={{ background: l.color.soft, color: l.color.hue }}
                          >
                            {l.text}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={styles.previewCardTitle}>{card.title}</div>
                    <div className={styles.previewCardFoot}>
                      <div className={styles.previewAvatars}>
                        {card.people.map((p) => (
                          <span
                            key={p.initials}
                            className={styles.previewPip}
                            style={{ background: p.hue } as CSSProperties}
                          >
                            {p.initials}
                          </span>
                        ))}
                      </div>
                      {card.meta && (
                        <span className={styles.previewMetaBadge}>{card.meta}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        <div className={styles.footInner}>
          <span className={styles.footLeft}>sunday</span>
          <span className={styles.footMeta}>still v0.1 · built on weekends · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </section>
  );
};

export default Hero;
