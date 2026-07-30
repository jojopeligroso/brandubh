// ── Eval bar — turning an engine score into a picture ────────────────────────
//
// The engine speaks in **attacker-positive** integers: `+` favours the raiders,
// `−` favours the king's side, on the scale `evaluate` uses (the `material`
// weight is 40, so ~40 is a piece). This module is the whole translation from
// that number to what is drawn, and it is pure so it can be tested — the
// project's suites are pure-logic only, so a mapping that lived inside the
// component would be a mapping nobody ever checked the sign of.
//
// ## Which way up (the orientation decision)
//
// The bar is vertical and stands beside the board, so it has two ends and must
// say who owns each. **Its ends are the two chairs — the same two the clocks
// use — and it turns over with the board exactly as they do.**
//
// The alternative was to pin attackers to one end always. That is what a fixed
// "white on the bottom" bar does in chess, and it is wrong here for the same
// reason 7b gave for flipping the clocks: the near end of the screen is the
// player sitting at it. A bar whose growing end belonged to the away player
// while the near player's pieces sat under it would have to be read backwards.
// So the caller passes the side that owns the *bottom* end — `bottomClockSide`
// in App, already flip-aware — and everything here is expressed from there:
// a fill above 0.5 and a positive number both mean "the near player is ahead",
// whichever side they took and whichever way up the board is.
//
// Under a north–south flip the bar's fill is therefore inverted along with the
// board and the clocks. (The east–west mirror leaves it alone, for the same
// reason it leaves the clocks alone: it does not change which end of the screen
// is near.) That is the point: the picture stays consistent with the seat you
// are looking from.

import { DECISIVE, DEFAULT_WEIGHTS } from "./game/ai";
import type { Side } from "./game/types";

/**
 * Whether the engine eval may be shown at all.
 *
 * **It is a post-game tool, and only a post-game tool.** An eval bar and a
 * best-move arrow beside a game you are still playing is an engine telling you
 * what to do — against the computer that is cheating, and over the board it is
 * cheating in front of a witness. So availability is not a preference: the
 * feature does not exist until the game it describes has finished.
 *
 * The test is the **live** game's result, not the position on screen, and the
 * distinction matters twice:
 *
 *  - Stepping back through a game still in progress shows finished-looking
 *    early positions. Those are still part of an unfinished game — no eval.
 *  - Exploring a line in analysis mode (7b) *truncates* the timeline, so the
 *    tip becomes an unfinished position again. But the real game is finished
 *    and safely snapshotted; analysing it is precisely the use case. So the
 *    caller passes the concluded state of the snapshot while analysing, and
 *    the eval stays available down the whole variation.
 *
 * Analysis mode entered on an *unfinished* game therefore still gets nothing,
 * which is the hole this closes: it would otherwise have been a way to consult
 * the engine mid-game and then leave analysis and play on.
 */
export const evalAvailable = (o: { liveGameOver: boolean }): boolean => o.liveGameOver;

/**
 * How steeply the fill responds to the score, in engine points.
 *
 * A logistic curve rather than a clamp, so the bar keeps saying something at
 * every level of advantage instead of pegging and going quiet. Tuned against
 * the material weight (40 = one piece), which is what the numbers on this scale
 * actually mean:
 *
 *   +1 piece  (40)  → 0.57     a nudge
 *   +2 pieces (80)  → 0.63
 *   +5 pieces (200) → 0.79
 *   +10 pieces(400) → 0.93     winning, and the bar looks it
 *
 * The brief's failure case — "a +40 material edge shouldn't peg the bar" — is
 * the first row: one piece up moves the bar by 7% of its length, not to the end.
 */
export const EVAL_SCALE = 150;

/**
 * How close to the ends a non-decisive score is allowed to get.
 *
 * A crushing-but-not-forced position must still be visibly different from a
 * *proven* win, so the sliver is reserved: only a decisive score fills the bar.
 */
export const EVAL_FILL_LIMIT = 0.97;

/** Engine points per "piece" of advantage, for the numeric readout. */
export const POINTS_PER_PIECE = DEFAULT_WEIGHTS.material;

/**
 * The side a decisive score means victory for, or `null` if the position is
 * still a matter of degree. `DECISIVE` also catches `±RECOGNIZED_WIN` (a
 * recognizer's forced result), which sits above it.
 */
export function decisiveWinner(score: number): Side | null {
  if (score >= DECISIVE) return "attackers";
  if (score <= -DECISIVE) return "defenders";
  return null;
}

/**
 * Re-express an attacker-positive score from the point of view of the player at
 * the bottom of the screen: positive means *they* are ahead.
 *
 * This is the one sign flip in the feature. Everything downstream — the fill,
 * the number, the label — reads from here, so the bar and the number can never
 * disagree about who is winning.
 */
export const scoreForBottom = (score: number, bottomSide: Side): number =>
  bottomSide === "attackers" ? score : -score;

/**
 * The fraction of the bar (0–1) filled from the **bottom** end.
 *
 * 0.5 is level. Above 0.5 the bottom player is ahead; a decisive score goes all
 * the way to 1 (or 0), and nothing short of one does.
 */
export function evalBarFill(score: number, bottomSide: Side): number {
  const winner = decisiveWinner(score);
  if (winner) return winner === bottomSide ? 1 : 0;
  const advantage = scoreForBottom(score, bottomSide);
  const fill = 1 / (1 + Math.exp(-advantage / EVAL_SCALE));
  // Guard the ends for the reason above, and against a non-finite score.
  if (!Number.isFinite(fill)) return 0.5;
  return Math.min(EVAL_FILL_LIMIT, Math.max(1 - EVAL_FILL_LIMIT, fill));
}

/**
 * The numeric readout, in pieces, signed the same way as the bar: `+0.8` means
 * the bottom player is four-fifths of a piece to the good.
 *
 * Pieces rather than raw engine points because the raw number is an
 * implementation detail of the weights and changes when they are retuned;
 * "about a piece up" survives that and is what the number is for.
 */
export function formatEvalScore(score: number, bottomSide: Side): string {
  const pieces = scoreForBottom(score, bottomSide) / POINTS_PER_PIECE;
  // −0.04 must not print as "-0.0"; round first, then take the sign of what
  // will actually be shown.
  const rounded = Math.round(pieces * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${Math.abs(rounded).toFixed(1)}`;
}
