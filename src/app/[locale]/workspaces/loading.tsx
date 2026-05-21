import styles from "./AppShell.module.scss";

export default function Loading() {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.brand}>sunday</span>
          <div className={styles.account}>
            <span className={styles.skeleton} style={{ width: 24, height: 24, borderRadius: "50%" }} />
            <span className={styles.skeleton} style={{ width: 80, height: 12 }} />
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Workspaces</h1>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.card}>
              <span className={styles.skeleton} style={{ height: 14, width: "70%" }} />
              <div className={styles.cardFooter}>
                <span className={styles.skeleton} style={{ height: 10, width: 60 }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
