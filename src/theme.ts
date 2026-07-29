// ── Board themes ─────────────────────────────────────────────────────────────
// The actual colour values live in `index.css` under `[data-theme="…"]`; this
// module enumerates the themes for the picker and handles persistence + default.

export type ThemeId =
  | "everforest"
  | "carved-wood"
  | "rose-pine"
  | "kanagawa"
  | "catppuccin"
  | "nord"
  | "tokyo-night"
  | "gruvbox"
  | "lichess-brown"
  | "lichess-blue"
  | "lichess-green"
  | "lichess-purple";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  /** Four representative colours shown as a swatch in the picker. */
  chips: [string, string, string, string];
}

// Softer, earthier themes lead; the more saturated ones follow.
export const THEMES: ThemeMeta[] = [
  { id: "everforest", name: "Everforest", chips: ["#3d484d", "#dbbc7f", "#a7c080", "#1b1e20"] },
  { id: "carved-wood", name: "Carved Wood", chips: ["#a9793f", "#e0a83a", "#e6b849", "#b23a48"] },
  { id: "rose-pine", name: "Rosé Pine", chips: ["#232135", "#f6c177", "#c4a7e7", "#eb6f92"] },
  { id: "kanagawa", name: "Kanagawa", chips: ["#2a2a37", "#e6c384", "#98bb6c", "#c34043"] },
  { id: "catppuccin", name: "Catppuccin", chips: ["#2a2b3d", "#f9e2af", "#cba6f7", "#f38ba8"] },
  { id: "nord", name: "Nord", chips: ["#3b4252", "#88c0d0", "#a3be8c", "#bf616a"] },
  { id: "tokyo-night", name: "Tokyo Night", chips: ["#22273c", "#7aa2f7", "#bb9af7", "#f7768e"] },
  { id: "gruvbox", name: "Gruvbox", chips: ["#3c3836", "#fabd2f", "#b8bb26", "#fb4934"] },
  // Classic chess-board palettes (light boards, à la Lichess).
  { id: "lichess-brown", name: "Lichess Brown", chips: ["#b58863", "#f0d9b5", "#e0a83a", "#c34043"] },
  { id: "lichess-blue", name: "Lichess Blue", chips: ["#8ca2ad", "#dee3e6", "#e6c384", "#bf616a"] },
  { id: "lichess-green", name: "Lichess Green", chips: ["#779952", "#edeed1", "#d9a441", "#c34043"] },
  { id: "lichess-purple", name: "Lichess Purple", chips: ["#9a6bbd", "#e0d3ec", "#e6c384", "#c34043"] },
];

/** Ultimate fallback if a random default cannot be chosen. */
export const DEFAULT_THEME: ThemeId = "everforest";

export const THEME_STORAGE_KEY = "brandubh.theme";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

/** First-visit default: Everforest 66% of the time, Carved Wood the rest. */
export function pickDefaultTheme(): ThemeId {
  try {
    return Math.random() < 0.66 ? "everforest" : "carved-wood";
  } catch {
    return DEFAULT_THEME;
  }
}

export function loadTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    /* localStorage unavailable (private mode, etc.) */
  }
  return pickDefaultTheme();
}

// ── Custom piece colours ─────────────────────────────────────────────────────
// Optional per-side overrides for the stone colours. A `null` means "follow the
// current theme"; a hex value overrides it. The pieces read `--atk` / `--def` /
// `--king` (and matching `-ink` for the emblem on top), which each theme sets in
// index.css — an inline value on the document root wins over the theme.

export type PieceKey = "atk" | "def" | "king";

export interface PieceColors {
  atk: string | null;
  def: string | null;
  king: string | null;
}

export const EMPTY_PIECE_COLORS: PieceColors = { atk: null, def: null, king: null };

export const PIECE_COLORS_KEY = "brandubh.pieceColors";

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function loadPieceColors(): PieceColors {
  try {
    const raw = localStorage.getItem(PIECE_COLORS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PieceColors>;
      return {
        atk: isHexColor(parsed?.atk) ? parsed.atk : null,
        def: isHexColor(parsed?.def) ? parsed.def : null,
        king: isHexColor(parsed?.king) ? parsed.king : null,
      };
    }
  } catch {
    /* localStorage unavailable or malformed */
  }
  return { ...EMPTY_PIECE_COLORS };
}

// Pick a dark or light emblem ink so the mark stays legible on any chosen stone.
function readableInk(hex: string): string {
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(channel(1)) + 0.7152 * lin(channel(3)) + 0.0722 * lin(channel(5));
  return luminance > 0.5 ? "#1b1b22" : "#f4f1e8";
}

export function applyPieceColors(colors: PieceColors): void {
  const root = document.documentElement;
  (Object.keys(EMPTY_PIECE_COLORS) as PieceKey[]).forEach((key) => {
    const value = colors[key];
    if (value) {
      root.style.setProperty(`--${key}`, value);
      root.style.setProperty(`--${key}-ink`, readableInk(value));
    } else {
      root.style.removeProperty(`--${key}`);
      root.style.removeProperty(`--${key}-ink`);
    }
  });
  try {
    localStorage.setItem(PIECE_COLORS_KEY, JSON.stringify(colors));
  } catch {
    /* ignore persistence failures */
  }
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
