import styles from "../AppShell.module.scss";

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
          <h1 className={styles.pageTitle}>Boards</h1>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
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
