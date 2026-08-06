// ── Zen mode (calm, over-the-board board) ────────────────────────────────────
//
// Zen mode strips the screen to the essentials of a game in progress — the
// board, whose turn it is, the clock (when running) and the move log. Nothing
// else shows while you play. It is **on by default** (see defaultZenConfig).
//
// Game-flow controls are deliberately NOT part of this config: they are
// contextual, so a minimal "Next game" / "Next set" prompt appears only when a
// game actually ends, never as a persistent button mid-play. Everything else is
// an opt-in *extra* — hidden by default in Zen and revealed individually from
// settings: the match scoreboard, captured tray, rules button, propose-takeback,
// resign, pause, the settings panels themselves and the export/import panel, the
// board-flip button, the analysis toggle, the engine eval (bar + best-move
// arrow), the variation tree the annotation pass and position setup.
//
// The one exception is the move navigator, which is ON by default (see
// ZEN_DEFAULT_EXTRAS). Stepping back through the moves just played is part of
// reading the board over a real table, not a piece of instrumentation on top of
// it — and with the board otherwise stripped bare it is the only way back to a
// position you have already left. It is still a normal extra, so it can be
// switched off like any other.
//
// The eval belongs in this list more than most: it is the one extra that tells
// you who is winning before you have worked it out, which is the opposite of
// what a calm over-the-board game is for. Hidden in Zen unless asked for.

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
  | "analysis"
  | "eval"
  | "tree"
  | "annotate"
  | "position";

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
  "eval",
  "tree",
  "annotate",
  "position",
];

export interface ZenConfig {
  /** Whether Zen mode is active. */
  enabled: boolean;
  /** Which optional extras are revealed while Zen is active. */
  extras: Record<ZenExtraId, boolean>;
}

/** Extras that Zen leaves switched on unless they are explicitly turned off. */
export const ZEN_DEFAULT_EXTRAS: ZenExtraId[] = ["nav"];

export const ZEN_ENABLED_KEY = "brandubh.zen.enabled";
export const ZEN_EXTRAS_KEY = "brandubh.zen.extras";

// Bumped whenever ZEN_DEFAULT_EXTRAS gains an entry. A stored map written by an
// older build spells out `false` for every extra it knew about, so a new default
// would never reach anyone who had already opened Zen; on a version bump the
// newly-defaulted extras are switched back on once, and the stamp is rewritten.
export const ZEN_EXTRAS_VERSION_KEY = "brandubh.zen.extras.v";
export const ZEN_EXTRAS_VERSION = 1;

const defaultExtras = (): Record<ZenExtraId, boolean> =>
  ZEN_EXTRAS.reduce(
    (acc, id) => {
      acc[id] = ZEN_DEFAULT_EXTRAS.includes(id);
      return acc;
    },
    {} as Record<ZenExtraId, boolean>,
  );

/**
 * **Zen is on out of the box.** The calm board is the game this app is for, so
 * it is what a new player is shown — not a mode they have to discover before
 * they can have it. Everything Zen hides is opt-in from here, and the way back
 * out is never more than the header switch (or the one at the foot of the page,
 * for when the header has scrolled away).
 *
 * Only the *mode* defaults on; the extras keep their own defaults, so a first
 * visit is Zen with the move navigator and nothing else.
 */
export const defaultZenConfig = (): ZenConfig => ({ enabled: true, extras: defaultExtras() });

/** Parse a stored extras map, keeping only known boolean flags (missing → default). */
export function parseZenExtras(raw: string | null): Record<ZenExtraId, boolean> {
  const extras = defaultExtras();
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

/**
 * Apply a stored-defaults upgrade: extras added to ZEN_DEFAULT_EXTRAS since the
 * stored map was written are switched on, whatever it says about them. Anything
 * stamped with the current version is left exactly as the player left it.
 */
export function upgradeZenExtras(
  extras: Record<ZenExtraId, boolean>,
  storedVersion: string | null,
): Record<ZenExtraId, boolean> {
  if (Number(storedVersion) === ZEN_EXTRAS_VERSION) return extras;
  const upgraded = { ...extras };
  for (const id of ZEN_DEFAULT_EXTRAS) upgraded[id] = true;
  return upgraded;
}

export function loadZenConfig(): ZenConfig {
  const cfg = defaultZenConfig();
  try {
    // Anything but a stored "0" is Zen: an explicit switch-off is the only
    // thing that turns it off, so a first visit — nothing stored at all — gets
    // the default above rather than falling through to "not on".
    cfg.enabled = localStorage.getItem(ZEN_ENABLED_KEY) !== "0";
    cfg.extras = upgradeZenExtras(
      parseZenExtras(localStorage.getItem(ZEN_EXTRAS_KEY)),
      localStorage.getItem(ZEN_EXTRAS_VERSION_KEY),
    );
  } catch {
    /* localStorage unavailable */
  }
  return cfg;
}

export function saveZenConfig(cfg: ZenConfig): void {
  try {
    localStorage.setItem(ZEN_ENABLED_KEY, cfg.enabled ? "1" : "0");
    localStorage.setItem(ZEN_EXTRAS_KEY, JSON.stringify(cfg.extras));
    localStorage.setItem(ZEN_EXTRAS_VERSION_KEY, String(ZEN_EXTRAS_VERSION));
  } catch {
    /* ignore persistence failures */
  }
}
