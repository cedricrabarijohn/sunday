import styles from "../../workspaces/AppShell.module.scss";
import kStyles from "./Kanban.module.scss";

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
          <div className={kStyles.scroller}>
            {Array.from({ length: 3 }).map((_, p) => (
              <div key={p} className={kStyles.pile}>
                <div className={kStyles.pileHead}>
                  <span className={kStyles.pileDot} style={{ background: "var(--border)" }} />
                  <span className={styles.skeleton} style={{ height: 14, flex: 1 }} />
                </div>
                <div className={kStyles.pileBody}>
                  {Array.from({ length: 3 - p }).map((__, i) => (
                    <div key={i} className={kStyles.card}>
                      <span className={styles.skeleton} style={{ height: 14, width: "75%" }} />
                      <span className={styles.skeleton} style={{ height: 12, width: "50%" }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
