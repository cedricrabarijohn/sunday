import styles from "../../workspaces/AppShell.module.scss";

export default function Loading() {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.brand}>sunday</span>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <div className={styles.skeleton} style={{ height: 26, width: 220 }} />
        </div>
        <div className={styles.tasksList}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.taskRow}>
              <span className={styles.taskNum}>{i + 1}</span>
              <span className={styles.taskCheck} aria-hidden />
              <div className={styles.skeleton} style={{ height: 14, width: `${45 + (i * 11) % 35}%` }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
