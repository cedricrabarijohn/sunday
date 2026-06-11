'use client';

import { CSSProperties } from 'react';
import { useTheme } from '@/context/ThemeContext';
import styles from './ThemeSwatches.module.scss';

/** A compact row of theme swatches. Click one to apply it instantly. */
export default function ThemeSwatches() {
    const { theme, setTheme, themes } = useTheme();

    return (
        <div className={styles.wrap} role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === t.id}
                    aria-label={t.label}
                    title={t.label}
                    className={`${styles.swatch} ${theme === t.id ? styles.active : ''}`}
                    style={{
                        ['--sw-bg' as string]: t.swatch.bg,
                        ['--sw-accent' as string]: t.swatch.accent,
                    } as CSSProperties}
                    onClick={() => setTheme(t.id)}
                >
                    <span className={styles.dot} aria-hidden />
                </button>
            ))}
        </div>
    );
}
