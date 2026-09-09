// ── Board-flip preference storage (Tablut / Copenhagen) ──────────────────────
//
// Brandubh's own flip toggle lives inline in `App.tsx` (a local `loadFlag`
// helper plus the `BOARD_FLIP_*_KEY` constants in `src/orientation.ts`, which
// itself stays deliberately generic — see the module doc there: orientation is
// geometry, not rules, and one copy of the *mapping* serves every board).
// Storage is a different question: Tablut and Copenhagen are separate screens
// with their own save-key namespace (`tablut.game.v1` / `copenhagen.game.v1`,
// see `game/tablut/persist.ts` and `game/copenhagen/persist.ts`), so their
// flip preference gets its own keys too, rather than sharing Brandubh's —
// flipping one board's picture should not silently flip the others'.
//
// Pulled into its own tiny module, rather than duplicated per screen, so the
// two screens' load/save behaviour cannot drift apart, and so it is testable
// without mounting either screen (the suites here are pure logic; there is no
// jsdom in this project — see CLAUDE.md).

/**
 * Read a stored "1"/"0" flag. Anything else, or nothing stored, reads as
 * `fallback` — the same on/off convention `App.tsx`'s own `loadFlag` uses for
 * Zen and the clock.
 */
export function loadFlipFlag(key: string, fallback = false): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback; // localStorage unavailable (private mode, etc.)
  }
}

/**
 * Persist a flip flag under its key. Failure is silent — the same policy the
 * rest of the app's flag storage uses.
 */
export function saveFlipFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore persistence failures */
  }
}
