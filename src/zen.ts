// ── Zen mode (calm, over-the-board board) ────────────────────────────────────
//
// Zen mode strips the screen to the essentials of a game in progress — the
// board, whose turn it is, the clock (when running) and the move log. Nothing
// else shows while you play.
//
// Game-flow controls are deliberately NOT part of this config: they are
// contextual, so a minimal "Next game" / "Next set" prompt appears only when a
// game actually ends, never as a persistent button mid-play. Everything else is
// an opt-in *extra* — hidden by default in Zen and revealed individually from
// settings: the match scoreboard, captured tray, move navigator, rules button,
// propose-takeback, resign, pause, the settings panels themselves and the
// export/import panel, the board-flip button and the analysis toggle.

export type ZenExtraId =
  | "scoreboard"
  | "captured"
  | "nav"
  | "rules"
  | "takeback"
  | "resign"
  | "pause"
  | "settings"
  | "gamefile"
  | "flip"
  | "analysis";

/** Opt-in extras, in the order they appear in the settings picker. */
export const ZEN_EXTRAS: ZenExtraId[] = [
  "scoreboard",
  "captured",
  "nav",
  "rules",
  "takeback",
  "resign",
  "pause",
  "settings",
  "gamefile",
  "flip",
  "analysis",
];

export interface ZenConfig {
  /** Whether Zen mode is active. */
  enabled: boolean;
  /** Which optional extras are revealed while Zen is active. */
  extras: Record<ZenExtraId, boolean>;
}

export const ZEN_ENABLED_KEY = "brandubh.zen.enabled";
export const ZEN_EXTRAS_KEY = "brandubh.zen.extras";

const noExtras = (): Record<ZenExtraId, boolean> =>
  ZEN_EXTRAS.reduce(
    (acc, id) => {
      acc[id] = false;
      return acc;
    },
    {} as Record<ZenExtraId, boolean>,
  );

export const defaultZenConfig = (): ZenConfig => ({ enabled: false, extras: noExtras() });

/** Parse a stored extras map, keeping only known boolean flags (missing → off). */
export function parseZenExtras(raw: string | null): Record<ZenExtraId, boolean> {
  const extras = noExtras();
  if (!raw) return extras;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      for (const id of ZEN_EXTRAS) {
        if (typeof parsed[id] === "boolean") extras[id] = parsed[id] as boolean;
      }
    }
  } catch {
    /* malformed — fall back to no extras */
  }
  return extras;
}

export function loadZenConfig(): ZenConfig {
  const cfg = defaultZenConfig();
  try {
    cfg.enabled = localStorage.getItem(ZEN_ENABLED_KEY) === "1";
    cfg.extras = parseZenExtras(localStorage.getItem(ZEN_EXTRAS_KEY));
  } catch {
    /* localStorage unavailable */
  }
  return cfg;
}

export function saveZenConfig(cfg: ZenConfig): void {
  try {
    localStorage.setItem(ZEN_ENABLED_KEY, cfg.enabled ? "1" : "0");
    localStorage.setItem(ZEN_EXTRAS_KEY, JSON.stringify(cfg.extras));
  } catch {
    /* ignore persistence failures */
  }
}
