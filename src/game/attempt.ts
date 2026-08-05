// ── The Attempt: one exercise in progress ────────────────────────────────────
//
// An **Attempt** is the live runtime of one exercise. Two things produce one: a
// **Review Mistake** (a move your own game marked, offered back) and a
// **Puzzle** from the bank. The board and the panel know about the Attempt and
// nothing else, which is what lets one screen serve both.
//
// The teaching loop is the reason the thing exists at all: instead of showing
// you the better move, it puts you back in the position you got wrong and asks
// you to find it. Being shown an answer and finding one are different
// experiences, and only the second sticks.
//
// The flow, and the reason for each state:
//
//   guessing  → you are looking at the position, with the engine's opinion
//               HIDDEN. This is the whole point: an eval bar and an arrow beside
//               the board would answer the question before it was asked.
//   wrong     → you played something else. Not "you failed" — the position is
//               still open and the offers are *try again*, *see it*, or out.
//   solved    → you found a move the engine rates exactly as highly as its own.
//   revealed  → you asked to be shown. A legitimate way to finish, and it must
//               not be a lesser one; someone stuck learns nothing from being
//               made to guess again.
//
// A **Line** may be up to four solver moves long, so the Attempt carries a
// `step` cursor into it. A Review Mistake is a one-step line whose answer
// arrives from the worker instead of from the bank, so its cursor never moves —
// the same machine, walked one step.
//
// Kept here, pure, because the interesting decisions are all boolean and the
// project's suites are pure-logic only — a state machine living inside a
// component is a state machine nobody tests.

import type { Move, Side } from "./types";

export type AttemptStage = "guessing" | "wrong" | "solved" | "revealed";

/**
 * Where the exercise came from, carrying only what differs between the two.
 *
 * `mover` is deliberately *not* in here: the panel reads it for its headline in
 * both cases, so folding it into the review variant would mean duplicating it
 * in the bank variant or teaching the panel to discriminate.
 */
export type AttemptSource =
  /** A Review Mistake at `ply`; the position sits at `ply - 1`. The answer is a
   *  live engine search, so it arrives late and may be an equal-best *set*. */
  | { kind: "review"; ply: number }
  /** A bank **Puzzle**, by its permanent five-digit **Puzzle number**. The
   *  answer is stored, and is a single move at every step by ADR-0001. */
  | { kind: "bank"; puzzleId: string };

export interface Attempt {
  source: AttemptSource;
  /** Whose move it is: the player who erred, or the bank puzzle's solver. */
  mover: Side;
  stage: AttemptStage;
  /** Cursor into the **Line**. A Review Mistake is one step, so always 0. */
  step: number;
  /** Wrong guesses across all steps. Counted, never scored. */
  attempts: number;
}

/**
 * One **Step** of a **Line**: what answers it, and what the opponent plays back.
 *
 * The two sources fill this differently and the judge does not care which:
 * review passes the worker's equal-best set with no reply, the bank passes a
 * singleton and the scripted reply that follows it.
 */
export interface LineStep {
  /** Accepted solving move(s). Bank: exactly one, by ADR-0001. Review: the
   *  equal-best set from the worker, or null while it has not arrived. */
  accepted: Move[] | null;
  /** Scripted reply, played after a correct non-final step. */
  reply: Move | null;
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
 * The bank does not need the leniency and cannot afford it — a stored line's
 * next reply may not even be legal after a different equally-good move — but it
 * does not need a second function either: the generator filters for a unique
 * solving move, so the set it passes is a singleton by construction. ADR-0001's
 * two acceptance rules therefore coexist here rather than forking the judge.
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
 * all answer the question the exercise is asking, so any of them on screen turns
 * it into a reading comprehension test.
 */
export const hidesEngine = (a: Attempt | null): boolean =>
  a !== null && (a.stage === "guessing" || a.stage === "wrong");

/** Whether a move played on the board should be judged rather than just explored. */
export const acceptsGuess = (a: Attempt | null): boolean =>
  a !== null && (a.stage === "guessing" || a.stage === "wrong");

/**
 * Judge a guess against the step it answers, and say what the board should show.
 *
 * One function, two callers, and no branch on `source`: the difference between a
 * bank puzzle and a review mistake is entirely in what `step` and `isLast` are
 * filled with.
 *
 * `play` is what the caller applies to the board, in order:
 *   • a wrong guess       → `[move]`, so you can see what your move does. Being
 *                           told "no" without seeing why teaches nothing.
 *   • a correct last step → `[move]`, and the Attempt is solved.
 *   • a correct step with more to come → `[move, reply]`, and the Attempt stays
 *                           at `guessing` one step further on.
 */
export function judge(
  a: Attempt,
  move: Move,
  step: LineStep,
  isLast: boolean,
): { attempt: Attempt; play: Move[] } {
  if (!isSolution(move, step.accepted)) {
    return { attempt: { ...a, stage: "wrong", attempts: a.attempts + 1 }, play: [move] };
  }
  if (isLast) return { attempt: { ...a, stage: "solved" }, play: [move] };
  // A non-final step always has a reply in a well-formed Line (they alternate,
  // and a Line ends on a solver move). Tolerating a missing one keeps a
  // malformed record from throwing at the board.
  return {
    attempt: { ...a, stage: "guessing", step: a.step + 1 },
    play: step.reply ? [move, step.reply] : [move],
  };
}

/**
 * Try again: back to `guessing` at the **same** step.
 *
 * The cursor does not reset, so a wrong guess at step 3 of 4 costs step 3 and
 * not the whole line — someone who has found three moves has found them. The
 * count of wrong guesses is not reset either: it is context for the copy, never
 * a score, so there is nothing to protect by clearing it.
 *
 * Rewinding the board is the caller's job, because the two sources rewind
 * differently: review removes the branch the guess created, the bank restores
 * the position at the start of the step with the earlier steps still on it.
 */
export const retryStep = (a: Attempt): Attempt => ({ ...a, stage: "guessing" });

/** Whether the attempt is over, however it ended. */
export const isFinished = (a: Attempt | null): boolean =>
  a !== null && (a.stage === "solved" || a.stage === "revealed");
