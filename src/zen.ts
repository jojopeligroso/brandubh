// ── Board display config (what is shown) ─────────────────────────────────────
//
// The board itself, whose turn it is, the clock (when running) and the move log
// are the essentials — always on screen. Every other panel is optional and
// individually toggleable from settings: the match scoreboard, captured tray,
// move navigator, game controls, rules button, takeback, resign, and the inline
// settings panels themselves.
//
// "Zen" is simply the preset that hides every optional panel for a calm,
// over-the-board board; "Show all" brings them back. The settings panels can be
// hidden too, so the same controls always live in the always-reachable gear ⚙
// modal as well.

export type BoardElementId =
  | "scoreboard"
  | "captured"
  | "nav"
  | "controls"
  | "rules"
  | "takeback"
  | "resign"
  | "settings";

/** Optional panels, in the order they appear in the settings picker. */
export const BOARD_ELEMENTS: BoardElementId[] = [
  "scoreboard",
  "captured",
  "nav",
  "controls",
  "rules",
  "takeback",
  "resign",
  "settings",
];

export type DisplayShow = Record<BoardElementId, boolean>;

export interface DisplayConfig {
  show: DisplayShow;
}

export const DISPLAY_SHOW_KEY = "brandubh.display.show";

const fill = (value: boolean): DisplayShow =>
  BOARD_ELEMENTS.reduce((acc, id) => {
    acc[id] = value;
    return acc;
  }, {} as DisplayShow);

/** Everything visible — the default. */
export const showAllPreset = (): DisplayShow => fill(true);
/** The zen preset — every optional panel hidden. */
export const zenPreset = (): DisplayShow => fill(false);

export const defaultDisplay = (): DisplayConfig => ({ show: showAllPreset() });

/** True when nothing optional is shown (the zen preset is in effect). */
export const isZen = (show: DisplayShow): boolean => BOARD_ELEMENTS.every((id) => !show[id]);
/** True when every optional panel is shown. */
export const isAllShown = (show: DisplayShow): boolean =>
  BOARD_ELEMENTS.every((id) => show[id]);

/** Parse a stored show map. Unknown keys are dropped; missing ones default to
 *  visible, so a new panel added in a later version shows by default. */
export function parseDisplayShow(raw: string | null): DisplayShow {
  const show = showAllPreset();
  if (!raw) return show;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      for (const id of BOARD_ELEMENTS) {
        if (typeof parsed[id] === "boolean") show[id] = parsed[id] as boolean;
      }
    }
  } catch {
    /* malformed — fall back to all shown */
  }
  return show;
}

export function loadDisplay(): DisplayConfig {
  try {
    return { show: parseDisplayShow(localStorage.getItem(DISPLAY_SHOW_KEY)) };
  } catch {
    return defaultDisplay();
  }
}

export function saveDisplay(cfg: DisplayConfig): void {
  try {
    localStorage.setItem(DISPLAY_SHOW_KEY, JSON.stringify(cfg.show));
  } catch {
    /* ignore persistence failures */
  }
}
