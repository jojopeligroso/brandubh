// ── Board themes ─────────────────────────────────────────────────────────────
// Colour palettes inspired by the default themes shipped with Omarchy. The
// actual colour values live in `index.css` under `[data-theme="…"]`; this module
// just enumerates the themes for the picker and handles persistence.

export type ThemeId =
  | "tokyo-night"
  | "catppuccin"
  | "gruvbox"
  | "nord"
  | "everforest"
  | "carved-wood";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  /** Four representative colours shown as a swatch in the picker. */
  chips: [string, string, string, string];
}

export const THEMES: ThemeMeta[] = [
  { id: "tokyo-night", name: "Tokyo Night", chips: ["#22273c", "#7aa2f7", "#bb9af7", "#f7768e"] },
  { id: "catppuccin", name: "Catppuccin", chips: ["#2a2b3d", "#f9e2af", "#cba6f7", "#f38ba8"] },
  { id: "gruvbox", name: "Gruvbox", chips: ["#3c3836", "#fabd2f", "#b8bb26", "#fb4934"] },
  { id: "nord", name: "Nord", chips: ["#3b4252", "#88c0d0", "#a3be8c", "#bf616a"] },
  { id: "everforest", name: "Everforest", chips: ["#3d484d", "#dbbc7f", "#a7c080", "#e67e80"] },
  { id: "carved-wood", name: "Carved Wood", chips: ["#a9793f", "#e0a83a", "#e6b849", "#b23a48"] },
];

export const DEFAULT_THEME: ThemeId = "tokyo-night";

export const THEME_STORAGE_KEY = "brandubh.theme";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

export function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    /* localStorage unavailable (private mode, etc.) — fall back to default */
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore persistence failures */
  }
  // Keep the mobile browser chrome colour in step with the theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const night = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-night")
      .trim();
    if (night) meta.setAttribute("content", night);
  }
}
