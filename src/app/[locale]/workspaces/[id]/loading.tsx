import styles from "../_styles/AppShell.module.scss";

export default function Loading() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <span className={styles.brand}>sunday</span>
        </div>
        <div className={styles.sidebarScroll} />
        <div className={styles.sidebarFoot}>
          <span className={styles.skeleton} style={{ width: 30, height: 30, borderRadius: "50%" }} />
          <span className={styles.skeleton} style={{ height: 12, width: 100 }} />
        </div>
      </aside>

      <div className={styles.content}>
        <main className={styles.main}>
          <div className={styles.pageHeader}>
            <div className={styles.pageHeaderText}>
              <span className={styles.skeleton} style={{ width: 32, height: 32, borderRadius: 6 }} />
              <div>
                <span className={styles.skeleton} style={{ height: 22, width: 180 }} />
              </div>
            </div>
          </div>
          <div className={styles.grid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.card}>
                <span className={styles.skeleton} style={{ width: 28, height: 28, borderRadius: 6 }} />
                <span className={styles.skeleton} style={{ height: 14, width: "70%" }} />
                <div className={styles.cardFooter}>
                  <span className={styles.skeleton} style={{ height: 10, width: 50 }} />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
