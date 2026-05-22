import styles from "../../workspaces/AppShell.module.scss";

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
                <span className={styles.skeleton} style={{ height: 22, width: 220 }} />
              </div>
            </div>
          </div>
          <div className={styles.tasksList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.taskRow}>
                <span className={styles.taskNum}>{String(i + 1).padStart(2, "0")}</span>
                <div
                  className={styles.skeleton}
                  style={{ height: 14, width: `${45 + (i * 11) % 35}%` }}
                />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
