// ── Walking a real bank Line, end to end ─────────────────────────────────────
//
// `attempt.test.ts` drives the step cursor against hand-built moves, which is
// the right way to test a state machine and says nothing about whether the bank
// holds a line the cursor can be walked along. This file is the other claim:
// the **Attempt** run from `puzzleStart` to `solved` over a **Puzzle** the
// generator actually mined, with every ply applied to a real board and checked
// legal on the way past.
//
// It exists because of a gap 8d declared rather than papered over. 157 of the
// bank's 158 puzzles hold one solver move, so every browser pass and every
// bank-fed assertion up to now walked a line whose second step does not exist.
// The multi-step path — `judge` advancing the cursor, the scripted reply going
// to the board behind the guess, `retryStep` mid-line, and completion firing on
// the last step and not before — had never met bank data.
//
// ## What this file cannot claim
//
// The step derivation is reimplemented here (`stepAt`), because the shipping one
// lives inside `BankPuzzlePlayer` and the project tests no components. So this
// proves the machine and the data agree; it does not prove the component wires
// them together. The driven-browser pass is what covers that, and the two are
// deliberately not substitutes.

import { describe, expect, it } from "vitest";
import { allMoves, applyMove } from "./rules";
import { judge, retryStep, type Attempt, type LineStep } from "./attempt";
import { loadBank, puzzleStart, solverMoves, solverSide, type Puzzle } from "./puzzleBank";
import type { GameState, Move } from "./types";
import { VARIANTS } from "./variants";

const rules = VARIANTS.wtf; // the ruleset the bank was generated under
const bank = loadBank(rules);

/** The multi-step puzzle 8d named as unreached. Asserted by id rather than
 *  found by search, so a regeneration that dropped it fails here loudly instead
 *  of quietly leaving this file testing one-step lines. */
const MULTI_STEP_ID = "00125";

/** Every puzzle asking for more than one solver move. One today; the walk below
 *  runs over all of them, so a bank that gains another gains the coverage. */
const multiStep = bank.filter((p) => solverMoves(p.line) > 1);

/** The **Step** the cursor is on, in the shape the judge wants. A **Line**
 *  alternates solver move and scripted reply and ends on a solver move, so step
 *  *n* is answered by `line[2n]` and replied to by `line[2n+1]`. */
const stepAt = (p: Puzzle, step: number): { line: LineStep; isLast: boolean } => ({
  line: {
    accepted: p.line[step * 2] ? [p.line[step * 2]] : null,
    reply: p.line[step * 2 + 1] ?? null,
  },
  isLast: step * 2 >= p.line.length - 1,
});

const start = (p: Puzzle): GameState => {
  const s = puzzleStart(p, rules);
  if (!s) throw new Error(`${p.id}: stored position will not parse`);
  return s;
};

const fresh = (p: Puzzle): Attempt => ({
  source: { kind: "bank", puzzleId: p.id },
  mover: solverSide(p),
  stage: "guessing",
  step: 0,
  attempts: 0,
});

/** A legal move for the side to move that is *not* the one being asked for —
 *  the wrong guess, taken from the board rather than invented, so it is a move a
 *  learner could really play into this position. */
const aWrongMove = (board: GameState, right: Move): Move => {
  const other = allMoves(board.board, board.turn, rules).find(
    (m) =>
      !(
        m.from.row === right.from.row &&
        m.from.col === right.from.col &&
        m.to.row === right.to.row &&
        m.to.col === right.to.col
      ),
  );
  if (!other) throw new Error("no legal move other than the solving one");
  return other;
};

const isLegalHere = (board: GameState, m: Move): boolean =>
  allMoves(board.board, board.turn, rules).some(
    (x) =>
      x.from.row === m.from.row &&
      x.from.col === m.from.col &&
      x.to.row === m.to.row &&
      x.to.col === m.to.col,
  );

describe("the bank still holds a multi-step line to walk", () => {
  it("loads under the ruleset it was verified for", () => {
    expect(bank.length).toBeGreaterThan(0);
  });

  it("contains the puzzle 8d could not reach, and it is still multi-step", () => {
    const p = bank.find((x) => x.id === MULTI_STEP_ID);
    expect(p).toBeDefined();
    expect(solverMoves(p!.line)).toBe(2);
    // Three plies asked for as two moves: solver, scripted reply, solver.
    expect(p!.line.length).toBe(3);
  });

  it("is the only one, which is the finding grade.ts already records", () => {
    // Not a target to hold at one. If the bank gains a longer line this fails,
    // and the walk below will already have covered it; update the number and
    // say so. ADR-0001's uniqueness requirement is what keeps lines short.
    expect(multiStep.map((p) => p.id)).toEqual([MULTI_STEP_ID]);
  });
});

describe("every step correct, from puzzleStart to solved", () => {
  it.each(multiStep.map((p) => [p.id, p] as const))(
    "#%s walks its whole line, every ply legal on the board it is played from",
    (_id, p) => {
      let board = start(p);
      let a = fresh(p);
      const solvedAt: number[] = [];
      const steps = solverMoves(p.line);

      for (let i = 0; i < steps; i++) {
        expect(a.stage).toBe("guessing");
        expect(a.step).toBe(i);
        const { line, isLast } = stepAt(p, i);
        expect(isLast).toBe(i === steps - 1);

        const solving = line.accepted![0];
        expect(isLegalHere(board, solving)).toBe(true);
        const { attempt, play } = judge(a, solving, line, isLast);
        a = attempt;

        // What the caller applies, in order — and each ply legal from the
        // position it is actually played from, which is the half of the
        // contract a hand-built line cannot check.
        expect(play[0]).toEqual(solving);
        for (const m of play) {
          expect(isLegalHere(board, m)).toBe(true);
          board = applyMove(board, m, rules);
        }

        if (isLast) {
          expect(play).toEqual([solving]);
          expect(a.stage).toBe("solved");
        } else {
          expect(play).toEqual([solving, line.reply]);
          expect(a.stage).toBe("guessing");
          expect(a.step).toBe(i + 1);
        }
        if (a.stage === "solved") solvedAt.push(i);
      }

      // The completion fires exactly once, on the last step and not before —
      // the assertion `onSolved` is guarded by in the player, made here where a
      // pure suite can hold it.
      expect(solvedAt).toEqual([steps - 1]);
      expect(a.attempts).toBe(0);
      expect(a.step).toBe(steps - 1);
    },
  );
});

describe("a wrong guess at step 2, retried", () => {
  it.each(multiStep.map((p) => [p.id, p] as const))(
    "#%s keeps step 1 on the board and asks step 2 again",
    (_id, p) => {
      let board = start(p);
      let a = fresh(p);

      // Step 1, correct: the guess and the scripted reply both land.
      const first = stepAt(p, 0);
      const r1 = judge(a, first.line.accepted![0], first.line, first.isLast);
      a = r1.attempt;
      for (const m of r1.play) board = applyMove(board, m, rules);
      expect(a.step).toBe(1);

      // The anchor: the position step 2 is asked from. The component holds this
      // index; here it is the board itself, and it is what *try again* restores.
      const anchor = board;

      const right = stepAt(p, 1);
      const wrong = aWrongMove(board, right.line.accepted![0]);
      const r2 = judge(a, wrong, right.line, right.isLast);
      a = r2.attempt;
      expect(a.stage).toBe("wrong");
      // The cursor does not move: someone who has found one move has found it.
      expect(a.step).toBe(1);
      expect(a.attempts).toBe(1);
      // The wrong move still goes to the board, so it can be seen.
      expect(r2.play).toEqual([wrong]);
      board = applyMove(board, wrong, rules);
      expect(board).not.toEqual(anchor);

      // Try again: the machine returns to guessing at the same step, and the
      // caller rewinds the board to the anchor. Both halves, because
      // `attempt.ts` says outright that the second is not its job.
      a = retryStep(a);
      board = anchor;
      expect(a.stage).toBe("guessing");
      expect(a.step).toBe(1);
      expect(a.attempts).toBe(1);

      const solving = right.line.accepted![0];
      expect(isLegalHere(board, solving)).toBe(true);
      const r3 = judge(a, solving, right.line, right.isLast);
      a = r3.attempt;
      expect(a.stage).toBe("solved");
      // Getting there late is still getting there: counted, never scored.
      expect(a.attempts).toBe(1);
      for (const m of r3.play) board = applyMove(board, m, rules);
    },
  );
});

describe("a wrong guess at step 1", () => {
  it.each(multiStep.map((p) => [p.id, p] as const))(
    "#%s does not advance the cursor, and the line still runs to solved after it",
    (_id, p) => {
      const opening = start(p);
      let board = opening;
      let a = fresh(p);

      const first = stepAt(p, 0);
      const wrong = aWrongMove(board, first.line.accepted![0]);
      const r1 = judge(a, wrong, first.line, first.isLast);
      a = r1.attempt;
      expect(a.stage).toBe("wrong");
      expect(a.step).toBe(0);
      expect(a.attempts).toBe(1);
      // No scripted reply behind a wrong guess: the reply answers the solving
      // move and would be answering something else.
      expect(r1.play).toEqual([wrong]);
      board = applyMove(board, wrong, rules);

      a = retryStep(a);
      board = opening;
      expect(a.step).toBe(0);

      // And the whole line still runs, with the count carried through it.
      const steps = solverMoves(p.line);
      for (let i = 0; i < steps; i++) {
        const { line, isLast } = stepAt(p, i);
        const r = judge(a, line.accepted![0], line, isLast);
        a = r.attempt;
        for (const m of r.play) board = applyMove(board, m, rules);
        expect(a.stage).toBe(isLast ? "solved" : "guessing");
      }
      expect(a.attempts).toBe(1);
    },
  );
});

describe("completion fires on the last step and not before", () => {
  it.each(multiStep.map((p) => [p.id, p] as const))(
    "#%s is not solved by its first move, however many times it is played",
    (_id, p) => {
      let a = fresh(p);
      const { line, isLast } = stepAt(p, 0);
      expect(isLast).toBe(false);

      // Playing the step-1 answer is a correct move and not a solve. The player
      // guards `onSolved` with a ref; what makes the guard sufficient is that
      // the stage reaches `solved` once, here.
      a = judge(a, line.accepted![0], line, isLast).attempt;
      expect(a.stage).toBe("guessing");
      expect(a.stage).not.toBe("solved");

      // And the step-1 answer replayed at step 2 is simply wrong there: the
      // accepted set belongs to the step, not to the puzzle.
      const second = stepAt(p, 1);
      const stale = judge(a, line.accepted![0], second.line, second.isLast);
      expect(stale.attempt.stage).toBe("wrong");
      expect(stale.attempt.step).toBe(1);
    },
  );
});
