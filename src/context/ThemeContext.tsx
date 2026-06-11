'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { DEFAULT_THEME, THEMES, THEME_IDS, isThemeId, type ThemeId, type ThemeMeta } from '@/lib/themes';

interface ThemeContextType {
    theme: ThemeId;
    setTheme: (id: ThemeId) => void;
    /** Cycle to the next theme (kept for the simple toggle button). */
    toggleTheme: () => void;
    themes: ThemeMeta[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // One-shot mount guard (anti-flash) — intentional, not a render loop.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
        const stored = localStorage.getItem('theme');
        if (isThemeId(stored)) {
            setThemeState(stored);
        } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            setThemeState('light');
        }
    }, []);

    useEffect(() => {
        if (!mounted) return;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme, mounted]);

    const setTheme = (id: ThemeId) => setThemeState(id);

    const toggleTheme = () => {
        setThemeState((prev) => {
            const i = THEME_IDS.indexOf(prev);
            return THEME_IDS[(i + 1) % THEME_IDS.length];
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
