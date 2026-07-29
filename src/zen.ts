// ── Zen mode (decluttered board) ─────────────────────────────────────────────
//
// Zen mode strips the screen back to the essentials — the board, whose turn it
// is, the clock (if one is running) and the move log — for a calm,
// over-the-board feel. Every other panel (match scoreboard, captured tray, move
// navigator, game controls, rules button, takeback, resign) is opt-in: hidden by
// default in zen, each revealed individually from settings.

export type ZenElementId =
  | "scoreboard"
  | "captured"
  | "nav"
  | "controls"
  | "rules"
  | "takeback"
  | "resign";

/** The optional panels, in the order they appear in the settings picker. */
export const ZEN_ELEMENTS: ZenElementId[] = [
  "scoreboard",
  "captured",
  "nav",
  "controls",
  "rules",
  "takeback",
  "resign",
];

export interface ZenConfig {
  /** Whether zen mode is active. */
  enabled: boolean;
  /** Which optional panels stay visible while zen is active. */
  show: Record<ZenElementId, boolean>;
}

export const ZEN_ENABLED_KEY = "brandubh.zen.enabled";
export const ZEN_SHOW_KEY = "brandubh.zen.show";

const allHidden = (): Record<ZenElementId, boolean> =>
  ZEN_ELEMENTS.reduce(
    (acc, id) => {
      acc[id] = false;
      return acc;
    },
    {} as Record<ZenElementId, boolean>,
  );

export const defaultZenConfig = (): ZenConfig => ({ enabled: false, show: allHidden() });

/** Parse a stored `show` map, keeping only known boolean flags. Pure + robust. */
export function parseZenShow(raw: string | null): Record<ZenElementId, boolean> {
  const show = allHidden();
  if (!raw) return show;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      for (const id of ZEN_ELEMENTS) {
        if (typeof parsed[id] === "boolean") show[id] = parsed[id] as boolean;
      }
    }
  } catch {
    /* malformed — fall back to all hidden */
  }
  return show;
}

export function loadZenConfig(): ZenConfig {
  const cfg = defaultZenConfig();
  try {
    cfg.enabled = localStorage.getItem(ZEN_ENABLED_KEY) === "1";
    cfg.show = parseZenShow(localStorage.getItem(ZEN_SHOW_KEY));
  } catch {
    /* localStorage unavailable */
  }
  return cfg;
}

export function saveZenConfig(cfg: ZenConfig): void {
  try {
    localStorage.setItem(ZEN_ENABLED_KEY, cfg.enabled ? "1" : "0");
    localStorage.setItem(ZEN_SHOW_KEY, JSON.stringify(cfg.show));
  } catch {
    /* ignore persistence failures */
  }
}
