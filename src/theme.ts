// ── Board themes ─────────────────────────────────────────────────────────────
// The actual colour values live in `index.css` under `[data-theme="…"]`; this
// module enumerates the themes for the picker and handles persistence + default.

export type ThemeId =
  | "gokstad"
  | "ballinderry"
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
  /**
   * The two board square tones, light first — the only thing a theme decides
   * about the board that a picker swatch can honestly show. Piece colours are
   * deliberately NOT part of a theme (see DEFAULT_PIECE_COLORS below), so they
   * never appear here. Each pair mirrors `--board-c2` and the tone `--cell-dark`
   * composites to over it in index.css; keep them in step when a theme changes.
   */
  chips: [string, string];
}

// Softer, earthier themes lead; the more saturated ones follow.
export const THEMES: ThemeMeta[] = [
  // Dark bog oak with a pale-oak incised grid — the two colours the Gokstad
  // board's own timber is attested in (see the theme note in index.css).
  { id: "gokstad", name: "Gokstad", chips: ["#d9c398", "#241a10"] },
  // The one theme whose swatch is not two square tones, because its board has
  // none: Ballinderry is a board of drilled holes (see the theme note in
  // index.css), so the honest pair is the yew and the hole cut into it —
  // `--board-c2` and `--hole-ink`, not `--cell-dark`, which this theme empties.
  { id: "ballinderry", name: "Ballinderry", chips: ["#c7a173", "#4b2f14"] },
  { id: "everforest", name: "Everforest", chips: ["#475258", "#3e484d"] },
  { id: "carved-wood", name: "Carved Wood", chips: ["#b6864e", "#a77a46"] },
  { id: "rose-pine", name: "Rosé Pine", chips: ["#232135", "#2c2a3f"] },
  { id: "kanagawa", name: "Kanagawa", chips: ["#2a2a37", "#33333e"] },
  { id: "catppuccin", name: "Catppuccin", chips: ["#2a2b3d", "#333247"] },
  { id: "nord", name: "Nord", chips: ["#434c5e", "#4a5365"] },
  { id: "tokyo-night", name: "Tokyo Night", chips: ["#22273c", "#272e46"] },
  { id: "gruvbox", name: "Gruvbox", chips: ["#504945", "#453f3b"] },
  // Classic chess-board palettes (light boards, à la Lichess).
  { id: "lichess-brown", name: "liBrown", chips: ["#f0d9b5", "#b58863"] },
  { id: "lichess-blue", name: "liBlue", chips: ["#dee3e6", "#8ca2ad"] },
  { id: "lichess-green", name: "liGreen", chips: ["#edeed1", "#779952"] },
  { id: "lichess-purple", name: "liPurple", chips: ["#e0d3ec", "#9a6bbd"] },
];

/** First-visit default theme. */
export const DEFAULT_THEME: ThemeId = "gokstad";

export const THEME_STORAGE_KEY = "brandubh.theme";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

/** First-visit default: always Gokstad. */
export function pickDefaultTheme(): ThemeId {
  return DEFAULT_THEME;
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
// Piece colours are decoupled from the board theme: red-gold raiders, silver
// defenders and king, on every theme. A `null` here means "use that
// default"; a hex value overrides it. The pieces read `--atk` / `--def` /
// `--king` (and matching `-ink` for the emblem on top), which index.css sets
// once on `:root` — no `[data-theme]` block may set them, or switching board
// colours would silently move the pieces too. An inline value on the document
// root wins over both.

export type PieceKey = "atk" | "def" | "king";

/** The stone colours every theme starts from; mirrors `:root` in index.css.
 *
 *  The white silver and red gold are the wordmark's own brand pair — PANTONE
 *  Cool Gray 1 C and PANTONE 146 C, the two colours the title "Branduḃ" is
 *  drawn in (see the wordmark note in index.css) — split on the same seam:
 *  the king's side (king and defenders alike) takes "Bran"'s silver, the
 *  raiders take "duḃ"'s red gold. King and defenders share a colour because
 *  they share a side; the crown emblem, not the stone colour, is what tells
 *  the king apart on the board. */
export const DEFAULT_PIECE_COLORS: Record<PieceKey, string> = {
  atk: "#a76d11",
  def: "#d9d9d6",
  king: "#d9d9d6",
};

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

// ── Themes that belong to one board ──────────────────────────────────────────
// Ballinderry is not a palette, it is a *board*: 49 holes in a 7×7 grid, drawn
// from the object the theme is named for (NMI 1932:6583, see
// docs/ballinderry-board.md). Neither of the other two tafl boardgames was ever a
// peg board, and both are a different size, so carrying this theme onto one would
// render an 81- or 121-hole board that never existed and quietly claim it did.
// The chosen theme is left alone — this is about what gets *painted* on a surface
// it does not describe, not about the player's choice, which persists untouched
// and is what the picker keeps showing.

const BOARD_SPECIFIC_THEMES = new Set<ThemeId>(["ballinderry"]);

/** What a board-specific theme falls back to away from its own board. */
export const OFF_BOARD_FALLBACK: ThemeId = "gokstad";

/**
 * The theme to paint, given the player's choice and which board is on screen.
 * Pure, so the fallback is testable without a document — the reason it is a
 * function of its own rather than a branch inside `applyTheme`.
 */
export function resolveTheme(theme: ThemeId, offBrandubhBoard: boolean): ThemeId {
  return offBrandubhBoard && BOARD_SPECIFIC_THEMES.has(theme) ? OFF_BOARD_FALLBACK : theme;
}

/**
 * Paint `theme` and remember it.
 *
 * `offBrandubhBoard` — true on the Tablut and Copenhagen surfaces — changes what
 * is painted and never what is stored: a player who chose Ballinderry still has
 * Ballinderry chosen while they are looking at one of the bigger boards, and gets
 * it back on the way out. The flag is deliberately "not the 7×7 board" rather
 * than a list of surfaces, so a fourth board is covered by whoever passes it.
 */
export function applyTheme(theme: ThemeId, offBrandubhBoard = false): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(theme, offBrandubhBoard));
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
