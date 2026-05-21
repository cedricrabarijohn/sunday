import styles from "./AppShell.module.scss";

export default function Loading() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <span className={styles.brand}>sunday</span>
        </div>
        <div className={styles.sidebarScroll}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Workspaces</span>
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.navItem}>
                <span className={styles.skeleton} style={{ width: 8, height: 8, borderRadius: 2 }} />
                <span
                  className={styles.skeleton}
                  style={{ height: 12, width: `${55 + (i * 11) % 35}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className={styles.sidebarFoot}>
          <span className={styles.skeleton} style={{ width: 30, height: 30, borderRadius: "50%" }} />
          <span className={styles.skeleton} style={{ height: 12, width: 100 }} />
        </div>
      </aside>

      <div className={styles.content}>
        <main className={styles.main}>
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Workspaces</h1>
              <div className={styles.pageSubtitle}>Loading…</div>
            </div>
          </div>
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
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
