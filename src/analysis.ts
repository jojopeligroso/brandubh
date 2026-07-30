// ── Analysis (free-move) mode ────────────────────────────────────────────────
//
// A read/explore mode laid over the live game: the computer stops replying, both
// sides become pickable, the clock stops, and nothing you do is written to the
// saved game. It is how you push a line forward by hand to see where it goes.
//
// The rules that make that true are small boolean decisions taken in several
// places in `App.tsx` — the AI-turn effect, the autosave, the board's
// interactivity gate. They live here as pure functions so they can be tested
// directly: the project's test suites are pure-logic only (no jsdom, no
// component tests), so a predicate that stays inside a component is a predicate
// that never gets tested.
//
// Analysis is *view + scratch* state. It never changes the ruleset, the play
// mode or the side you control in the live game. Since Session 7c its moves go
// into a move tree of their own (`game/moveTree.ts`) rather than into the live
// timeline, so the live game is not merely restored on exit — it is never
// written to in the first place.

import type { Side } from "./game/types";

/**
 * Whether the computer may take its turn.
 *
 * Analysis suppresses the auto-reply outright: exploring a line means moving
 * both sides by hand, and an engine that answered every move would keep
 * dragging the position away from whatever you were trying to look at. The
 * remaining conditions are live play's own — the AI only ever moves at the tip
 * of an unfinished game, on its own side, with the clock running.
 */
export function aiMayReply(o: {
  analysis: boolean;
  atTip: boolean;
  gameOver: boolean;
  paused: boolean;
  aiSide: Side | null;
  turn: Side;
}): boolean {
  if (o.analysis) return false;
  if (!o.atTip || o.gameOver || o.paused) return false;
  return o.aiSide !== null && o.turn === o.aiSide;
}

/**
 * Whether the autosave may write to storage.
 *
 * `offeringResume` is the existing rule — while the opening overlay is still
 * offering to restore a saved game, an empty board must not overwrite it.
 * Analysis adds the mirror of it: a scratch line must not overwrite the game it
 * was branched from. This one still matters after 7c, because what the autosave
 * reads (`states`/`cursor` in App) is the *derived* line — in analysis that is a
 * variation, not the game.
 */
export function autosaveAllowed(o: { analysis: boolean; offeringResume: boolean }): boolean {
  return !o.analysis && !o.offeringResume;
}

/**
 * The side the board lets you pick up: in analysis, both (`null`, the same
 * value hotseat play uses), otherwise whichever side you are actually playing.
 */
export const controllableIn = (analysis: boolean, humanSide: Side | null): Side | null =>
  analysis ? null : humanSide;

/**
 * Whether the board accepts clicks at all.
 *
 * In analysis the two gates that exist to keep you from playing your
 * opponent's moves — the side check and the manual clock hold — do not apply:
 * moving both sides *is* the mode, and the clock is stopped anyway. Everything
 * else still holds; in particular a finished position has no moves to explore.
 */
export function boardIsInteractive(o: {
  analysis: boolean;
  atTip: boolean;
  gameOver: boolean;
  thinking: boolean;
  paused: boolean;
  humanSide: Side | null;
  turn: Side;
}): boolean {
  if (o.gameOver || o.thinking) return false;
  if (o.analysis) return true;
  return o.atTip && !o.paused && (o.humanSide === null || o.turn === o.humanSide);
}
