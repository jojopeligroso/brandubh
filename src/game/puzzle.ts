// ── Learn from your mistakes ─────────────────────────────────────────────────
//
// The teaching loop: instead of showing you the better move, the review puts you
// back in the position you got wrong and asks you to find it. Being shown an
// answer and finding one are different experiences, and only the second sticks.
//
// The flow, and the reason for each state:
//
//   guessing  → you are looking at the position, with the engine's opinion
//               HIDDEN. This is the whole point: an eval bar and an arrow beside
//               the board would answer the question before it was asked.
//   wrong     → you played something else. Not "you failed" — the position is
//               still open and the only offers are *try again* or *see it*.
//   solved    → you found a move the engine rates exactly as highly as its own.
//   revealed  → you asked to be shown. A legitimate way to finish, and it must
//               not be a lesser one; someone stuck learns nothing from being
//               made to guess again.
//
// Kept here, pure, because the interesting decisions are all boolean and the
// project's suites are pure-logic only — a state machine living inside a
// component is a state machine nobody tests.

import type { Move, Side } from "./types";

export type PuzzleStage = "guessing" | "wrong" | "solved" | "revealed";

export interface PuzzleState {
  /** The ply the mistake was played at; the puzzle sits at `ply - 1`. */
  ply: number;
  /** Whose move it is — the player who erred, so the prompt can name them. */
  mover: Side;
  stage: PuzzleStage;
  /** How many wrong moves have been tried, for the "try again" copy. */
  attempts: number;
}

/** Two moves are the same move. */
export const sameMove = (a: Move, b: Move): boolean =>
  a.from.row === b.from.row &&
  a.from.col === b.from.col &&
  a.to.row === b.to.row &&
  a.to.col === b.to.col;

/**
 * Whether a played move counts as finding it.
 *
 * Membership of the engine's **equal-best set**, not "close enough". The set is
 * exact — every move in it scored identically to the best (see
 * `SearchResult.bestMoves`) — so accepting any of them is not leniency, it is
 * refusing to invent a distinction the engine did not make. A learner told
 * "wrong" for a move the engine rates exactly as highly would be learning
 * something false about the position.
 *
 * With no solution yet (the search has not returned), nothing is accepted:
 * better to make someone wait a moment than to tell them they are wrong because
 * the answer had not arrived.
 */
export const isSolution = (move: Move, bestMoves: Move[] | null): boolean =>
  !!bestMoves && bestMoves.length > 0 && bestMoves.some((m) => sameMove(m, move));

/**
 * Whether the engine's opinion must stay hidden.
 *
 * True while there is still a guess to make. This is the single most important
 * rule in the file: the eval bar, the best-move arrow and the candidate arrows
 * all answer the question the puzzle is asking, so any of them on screen turns
 * the exercise into a reading comprehension test.
 */
export const hidesEngine = (p: PuzzleState | null): boolean =>
  p !== null && (p.stage === "guessing" || p.stage === "wrong");

/** Whether a move played on the board should be judged rather than just explored. */
export const acceptsGuess = (p: PuzzleState | null): boolean =>
  p !== null && (p.stage === "guessing" || p.stage === "wrong");

/** The stage a guess moves us to. */
export const judge = (p: PuzzleState, move: Move, bestMoves: Move[] | null): PuzzleState =>
  isSolution(move, bestMoves)
    ? { ...p, stage: "solved" }
    : { ...p, stage: "wrong", attempts: p.attempts + 1 };

/** Whether the puzzle is over, however it ended. */
export const isFinished = (p: PuzzleState | null): boolean =>
  p !== null && (p.stage === "solved" || p.stage === "revealed");
