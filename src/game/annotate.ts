// ── Post-game annotations ────────────────────────────────────────────────────
//
// Re-search a finished game position by position and mark the moves where the
// evaluation swung: inaccuracy, mistake, blunder. Lichess does this with
// centipawns; this engine is not pawn-scaled, so the bands here are calibrated
// against real games of *this* game (see THRESHOLDS below) rather than borrowed.
//
// Everything in this file is pure. The pass itself lives in `App.tsx` because it
// drives the worker, but the judgement — "was that a blunder?" — is here, where
// it can be tested. The suites in this project are pure-logic only, so a
// classifier left inside a component is a classifier nobody ever checks.
//
// ## The sign convention, which is the whole trap
//
// `evaluate` and `pickMove` are **attacker-positive**: a good position for the
// raiders scores high, a good position for the king's side scores low. So the
// same numeric drop means opposite things depending on who moved, and a
// classifier that forgets this marks every good defender move as a blunder.
// `lossFor` below is the single place that asymmetry is handled.

import { DECISIVE as DECISIVE_SCORE } from "./ai";
import { winnerOf } from "./engine";
import type { GameStatus, Side } from "./types";

/**
 * The depth the annotation pass searches at.
 *
 * `medium` is fixed depth 3 with the full machinery and takes ~50ms a position,
 * so a forty-move game is judged in a couple of seconds. It is not chosen for
 * speed alone: THRESHOLDS below were calibrated from depth-3 scores, and scores
 * from a different depth are not comparable to bands measured at this one.
 */
export const ANNOTATE_DIFFICULTY = "medium" as const;

/**
 * The value of a position the board has already settled, or null if it is still
 * being played. Searching a finished position is both pointless and wrong — with
 * no legal moves the search reports 0, which would read as "level" in the very
 * place the game was decided.
 */
export function terminalScore(status: GameStatus): number | null {
  const winner = winnerOf(status);
  if (winner === "attackers") return DECISIVE_SCORE;
  if (winner === "defenders") return -DECISIVE_SCORE;
  return status === "playing" ? null : 0; // a draw is level, and it is over
}

export type Mark = "inaccuracy" | "mistake" | "blunder";

/**
 * How much the mover gave up, in the engine's own units, always ≥ 0 when the
 * move made things worse for them.
 *
 * `before` is the value of the position they moved *from*, `after` the value of
 * the position they left behind — both with best play, both attacker-positive.
 */
export function lossFor(before: number, after: number, mover: Side): number {
  return mover === "attackers" ? before - after : after - before;
}

/**
 * Bands, in the units of `evaluate` (`src/game/ai.ts`).
 *
 * **Calibrated, not imported.** Centipawn bands do not transfer: this engine is
 * not pawn-scaled, and a 7×7 board swings hard enough that one capture can be a
 * fifth of the material on it.
 *
 * `scripts/annotate-calibrate.ts` measured the per-move loss distribution over
 * 40 seeded self-play games at depth 3 — 850 plies, 327 of which gave something
 * up, with a quarter of moves played at random so there would be real errors to
 * size. The percentiles of that losing tail:
 *
 * ```
 *   p50  30    p75  76    p90 110    p95 180    p99 246
 * ```
 *
 * The bands sit on it as follows, each also landing on a natural anchor in the
 * evaluation's own weights (`material` 40 per piece, `escapeLane` 120):
 *
 * - **inaccuracy 40** (≈p60) — about a piece: noticeable, rarely decisive.
 * - **mistake 80** (≈p80) — two pieces, or a real positional concession.
 * - **blunder 120** (≈p91) — an escape lane handed over; the kind that loses.
 *
 * They are deliberately not tight. The sample above is error-inflated by design,
 * so these mark ~9% of *losing* moves as blunders there and far fewer in a real
 * game. Bands tuned to flag every imperfection would mark nearly everything and
 * mean nothing.
 *
 * Re-run the calibration if `DEFAULT_WEIGHTS` ever changes — bands measured
 * against a different evaluation are bands that say nothing about this one.
 */
export const THRESHOLDS = {
  inaccuracy: 40,
  mistake: 80,
  blunder: 120,
} as const;

export interface ClassifyInput {
  /** Best-play value of the position the move was made from. */
  before: number;
  /** Best-play value of the position it produced. */
  after: number;
  mover: Side;
  /** True when the mover had no choice — you cannot blunder a forced move. */
  onlyMove?: boolean;
}

/**
 * Judge one move, or return null for "nothing worth saying".
 *
 * Two suppressions matter as much as the bands:
 *
 * 1. **A game already decided cannot be blundered.** Once best play is a forced
 *    result, the difference between winning and winning more slowly is not an
 *    error — and without this the tail of every finished game becomes a wall of
 *    `??`, which is exactly how an annotation feature stops being read.
 * 2. **A forced move is never a mistake.** With one legal reply there was no
 *    decision to get wrong; the damage was done earlier, and marking it here
 *    blames the wrong move.
 *
 * Walking *into* a forced loss from a live position is the one case that still
 * marks at full severity, because that is the move that threw it.
 */
export function classify(o: ClassifyInput): Mark | null {
  if (o.onlyMove) return null;

  const decided = Math.abs(o.before) >= DECISIVE_SCORE;
  if (decided) return null;

  const loss = lossFor(o.before, o.after, o.mover);
  if (loss <= 0) return null; // held or improved — nothing to say

  // Live position → forced loss for the mover. Whatever the arithmetic says,
  // this is the move that lost the game.
  const lostOutright =
    Math.abs(o.after) >= DECISIVE_SCORE &&
    (o.mover === "attackers" ? o.after < 0 : o.after > 0);
  if (lostOutright) return "blunder";

  if (loss >= THRESHOLDS.blunder) return "blunder";
  if (loss >= THRESHOLDS.mistake) return "mistake";
  if (loss >= THRESHOLDS.inaccuracy) return "inaccuracy";
  return null;
}

/** The glyph a mark is shown with, in the notation everyone already knows. */
export const markGlyph = (mark: Mark): string =>
  mark === "blunder" ? "??" : mark === "mistake" ? "?" : "?!";

export interface SideTally {
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

export const emptyTally = (): SideTally => ({ inaccuracy: 0, mistake: 0, blunder: 0 });

/**
 * Count the marks per side, for the summary line. `marks[i]` is the judgement on
 * ply i+1, index-aligned with a game's `history`.
 */
export function tally(marks: (Mark | null)[], movers: Side[]): Record<Side, SideTally> {
  const out: Record<Side, SideTally> = { attackers: emptyTally(), defenders: emptyTally() };
  marks.forEach((m, i) => {
    const side = movers[i];
    if (m && side) out[side][m] += 1;
  });
  return out;
}

/**
 * Turn a walk of per-position scores into per-move marks.
 *
 * `scores[k]` is the value of the position after k plies, so one search per
 * position covers the whole game: the move at ply k is judged by `scores[k-1]`
 * against `scores[k]`. `movers[k-1]` is the side that played it.
 */
export function marksFromScores(
  scores: number[],
  movers: Side[],
  onlyMoves: boolean[] = [],
): (Mark | null)[] {
  const out: (Mark | null)[] = [];
  for (let k = 1; k < scores.length; k++) {
    out.push(
      classify({
        before: scores[k - 1],
        after: scores[k],
        mover: movers[k - 1],
        onlyMove: onlyMoves[k - 1] ?? false,
      }),
    );
  }
  return out;
}
