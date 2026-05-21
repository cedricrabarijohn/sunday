import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
    return (
        <div className={styles.page}>
            <div className={styles.content}>
                <h1 className={styles.glitch} data-text="404">
                    404
                </h1>
                <div className={styles.divider} />
                <p className={styles.message}>
                    This page doesn&apos;t exist.
                </p>
                <a className={styles.message} href="/">← Back to safety</a>
            </div>

            {/* Scanlines overlay */}
            <div className={styles.scanlines} />
        </div>
    );
}