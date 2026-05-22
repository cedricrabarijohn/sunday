"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PALETTE } from "@/lib/palette";
import styles from "./Hero.module.scss";

const Hero = () => {
  const router = useRouter();

  const workspaceItems = [
    { name: "Design", color: PALETTE[5] },
    { name: "Engineering", color: PALETTE[0], active: true },
    { name: "Marketing", color: PALETTE[6] },
    { name: "Ops", color: PALETTE[3] },
  ];

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
            <span>Project management, served fresh on Sundays</span>
          </div>
          <h1 className={styles.headline}>
            Plan the week.{" "}
            <span className={styles.headlineAccent}>Ship the week.</span>
          </h1>
          <p className={styles.subhead}>
            Sunday is a small, fast project tool. Group projects into{" "}
            <code>workspaces</code>, organize work into <code>boards</code>, and
            check off <code>tasks</code> as the week goes on.
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
              <span className={styles.capLabel}>Workspaces</span>
              <span className={styles.capValue}>Many at once</span>
              <span className={styles.capDelta}>One per project or team</span>
            </div>
            <div className={styles.cap}>
              <span className={styles.capLabel}>Boards</span>
              <span className={styles.capValue}>Lists, not chaos</span>
              <span className={styles.capDelta}>Plain, ordered, fast</span>
            </div>
            <div className={styles.cap}>
              <span className={styles.capLabel}>Tasks</span>
              <span className={styles.capValue}>Toggle &amp; ship</span>
              <span className={styles.capDelta}>Click the box. That&apos;s it.</span>
            </div>
          </div>
        </div>

        <div className={styles.preview} aria-hidden>
          <div className={styles.previewHead}>
            <span className={styles.previewDot} />
            <span className={styles.previewDot} />
            <span className={styles.previewDot} />
            <span className={styles.previewTabLabel}>sunday / engineering / roadmap</span>
          </div>
          <div className={styles.previewLayout}>
            <div className={styles.previewSide}>
              <span className={styles.previewSideLabel}>Workspaces</span>
              {workspaceItems.map((w) => (
                <div
                  key={w.name}
                  className={`${styles.previewSideItem} ${w.active ? styles.previewSideItemActive : ""}`}
                >
                  <span className={styles.previewSideDot} style={{ background: w.color.hue }} />
                  <span>{w.name}</span>
                </div>
              ))}
            </div>
            <div className={styles.previewMain}>
              <div className={styles.previewTitleRow}>
                <span className={styles.previewTitle}>Roadmap</span>
                <span className={styles.previewBadge}>4/6 done</span>
              </div>
              <div className={styles.previewProgressTrack}>
                <div
                  className={styles.previewProgressFill}
                  style={{ ["--fill" as string]: "66%" }}
                />
              </div>
              <div className={styles.previewList}>
                <div className={styles.previewRow}>
                  <span className={styles.previewNum}>1</span>
                  <span className={`${styles.previewCheck} ${styles.previewChecked}`} />
                  <span className={styles.previewStrike}>Set up the workspace</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewNum}>2</span>
                  <span className={`${styles.previewCheck} ${styles.previewChecked}`} />
                  <span className={styles.previewStrike}>Draft the first board</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewNum}>3</span>
                  <span className={`${styles.previewCheck} ${styles.previewChecked}`} />
                  <span className={styles.previewStrike}>Write the press release</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewNum}>4</span>
                  <span className={`${styles.previewCheck} ${styles.previewChecked}`} />
                  <span className={styles.previewStrike}>Onboard the first ten</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewNum}>5</span>
                  <span className={styles.previewCheck} />
                  <span>Ship v0.1</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewNum}>6</span>
                  <span className={styles.previewCheck} />
                  <span>Announce on Sunday</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        <div className={styles.footInner}>
          <span className={styles.footLeft}>sunday</span>
          <span className={styles.footMeta}>v0.1 / {new Date().getFullYear()}</span>
        </div>
      </footer>
    </section>
  );
};

export default Hero;
