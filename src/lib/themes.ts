/**
 * Theme registry. To add a theme: add an entry here AND a matching
 * `[data-theme="<id>"]` block in globals.css. Everything else (picker,
 * persistence, anti-flash script) picks it up automatically.
 */
export type ThemeId = "light" | "sand" | "dark" | "midnight" | "dim";

export type ThemeMeta = {
  id: ThemeId;
  label: string;
  scheme: "light" | "dark";
  /** Colors shown in the picker swatch. */
  swatch: { bg: string; accent: string };
};

export const THEMES: ThemeMeta[] = [
  { id: "light", label: "Light", scheme: "light", swatch: { bg: "#fafafa", accent: "#5b5bd6" } },
  { id: "sand", label: "Sand", scheme: "light", swatch: { bg: "#f4ede0", accent: "#b06a2c" } },
  { id: "dark", label: "Dark", scheme: "dark", swatch: { bg: "#141419", accent: "#8888f4" } },
  { id: "midnight", label: "Midnight", scheme: "dark", swatch: { bg: "#0c1222", accent: "#6ea8fe" } },
  { id: "dim", label: "Dim", scheme: "dark", swatch: { bg: "#15202b", accent: "#1d9bf0" } },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME: ThemeId = "sand";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}
