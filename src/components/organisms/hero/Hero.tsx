"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./Hero.module.scss";

const Hero = () => {
  const router = useRouter();

  return (
    <section className={styles.hero}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <span className={styles.brand}>sunday</span>
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
            <span className={styles.eyebrowMark} />
            Project management
          </div>
          <h1 className={styles.headline}>
            A small, fast place to track your work.
          </h1>
          <p className={styles.subhead}>
            Sunday gives you <code>workspaces</code>, <code>boards</code>, and{" "}
            <code>tasks</code>. It loads fast, stays out of your way, and works on a
            slow connection.
          </p>
          <div className={styles.ctaRow}>
            <button
              type="button"
              className={styles.ctaPrimary}
              onClick={() => router.push("/users/sign_up")}
            >
              Create account
            </button>
            <button
              type="button"
              className={styles.ctaGhost}
              onClick={() => router.push("/users/sign_in")}
            >
              Sign in
            </button>
          </div>
        </div>

        <div className={styles.preview} aria-hidden>
          <div className={styles.previewHeader}>
            <span className={styles.previewTitle}>Roadmap</span>
            <span className={styles.previewMeta}>4 tasks</span>
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
              <span className={styles.previewCheck} />
              <span>Invite the team</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewNum}>4</span>
              <span className={styles.previewCheck} />
              <span>Ship v0.1</span>
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        <div className={styles.footInner}>
          <span>sunday / v0.1</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </footer>
    </section>
  );
};

export default Hero;
