import { describe, expect, it } from "vitest";
import {
  acceptsGuess,
  hidesEngine,
  isFinished,
  isSolution,
  judge,
  retryStep,
  sameMove,
  type Attempt,
  type LineStep,
} from "./attempt";
import type { Move } from "./types";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({
  from: { row: fr, col: fc },
  to: { row: tr, col: tc },
});

/** A Review Mistake: one step, answer from the worker, cursor pinned at 0. */
const fresh = (): Attempt => ({
  source: { kind: "review", ply: 7 },
  mover: "defenders",
  stage: "guessing",
  step: 0,
  attempts: 0,
});

/** A bank puzzle: the same machine, with a stored line under it. */
const banked = (): Attempt => ({
  source: { kind: "bank", puzzleId: "00023" },
  mover: "defenders",
  stage: "guessing",
  step: 0,
  attempts: 0,
});

/** A single-move answer with a scripted reply — what the bank stores. */
const line = (accepted: Move, reply: Move | null): LineStep => ({ accepted: [accepted], reply });

/** What review passes: the worker's equal-best set, and nothing to play back. */
const worker = (accepted: Move[] | null): LineStep => ({ accepted, reply: null });

describe("sameMove", () => {
  it("compares both endpoints, not object identity", () => {
    expect(sameMove(mv(1, 2, 3, 4), mv(1, 2, 3, 4))).toBe(true);
    expect(sameMove(mv(1, 2, 3, 4), mv(1, 2, 3, 5))).toBe(false);
    expect(sameMove(mv(1, 2, 3, 4), mv(0, 2, 3, 4))).toBe(false);
  });
});

describe("isSolution", () => {
  const best = [mv(1, 1, 1, 4), mv(2, 2, 5, 2)];

  it("accepts the engine's own move", () => {
    expect(isSolution(mv(1, 1, 1, 4), best)).toBe(true);
  });

  it("accepts any move the engine rates exactly as highly", () => {
    // The set is exact, so this is not leniency — telling someone they are
    // wrong for a move the engine scored identically teaches them something
    // false about the position.
    expect(isSolution(mv(2, 2, 5, 2), best)).toBe(true);
  });

  it("rejects anything outside the set", () => {
    expect(isSolution(mv(3, 3, 3, 6), best)).toBe(false);
  });

  it("accepts nothing before the search has returned", () => {
    // Better to make someone wait than to mark them wrong because the answer
    // had not arrived yet.
    expect(isSolution(mv(1, 1, 1, 4), null)).toBe(false);
    expect(isSolution(mv(1, 1, 1, 4), [])).toBe(false);
  });

  it("is exactly as strict as the set it is given (ADR-0001 needs no second rule)", () => {
    // The bank's uniqueness filter is what makes the accepted set a singleton;
    // the judge does not enforce it and does not need to.
    const single = [mv(1, 1, 1, 4)];
    expect(isSolution(mv(1, 1, 1, 4), single)).toBe(true);
    expect(isSolution(mv(2, 2, 5, 2), single)).toBe(false);
  });
});

describe("hiding the engine while a guess is outstanding", () => {
  it("hides it while guessing and after a wrong try", () => {
    // The single most important rule here: the eval bar and the arrows answer
    // the question the exercise is asking.
    expect(hidesEngine({ ...fresh(), stage: "guessing" })).toBe(true);
    expect(hidesEngine({ ...fresh(), stage: "wrong" })).toBe(true);
  });

  it("shows it once the attempt is over, however it ended", () => {
    expect(hidesEngine({ ...fresh(), stage: "solved" })).toBe(false);
    expect(hidesEngine({ ...fresh(), stage: "revealed" })).toBe(false);
  });

  it("does not hide anything when no attempt is running", () => {
    expect(hidesEngine(null)).toBe(false);
  });

  it("hides exactly when it is still judging guesses", () => {
    // These two must never disagree: a board that judges a move while the
    // answer is on screen, or one that hides the answer but ignores the move,
    // are both incoherent.
    for (const stage of ["guessing", "wrong", "solved", "revealed"] as const) {
      const a = { ...fresh(), stage };
      expect(hidesEngine(a)).toBe(acceptsGuess(a));
    }
  });

  it("says the same thing for a bank attempt as for a review one", () => {
    // Nothing about hiding the engine depends on where the answer came from.
    for (const stage of ["guessing", "wrong", "solved", "revealed"] as const) {
      expect(hidesEngine({ ...banked(), stage })).toBe(hidesEngine({ ...fresh(), stage }));
    }
  });
});

describe("judging a one-step line (the Review Mistake, unchanged)", () => {
  const best = worker([mv(1, 1, 1, 4)]);

  it("solves on the right move", () => {
    expect(judge(fresh(), mv(1, 1, 1, 4), best, true).attempt.stage).toBe("solved");
  });

  it("goes to 'wrong' and counts the attempt otherwise", () => {
    const { attempt } = judge(fresh(), mv(0, 0, 0, 3), best, true);
    expect(attempt.stage).toBe("wrong");
    expect(attempt.attempts).toBe(1);
  });

  it("keeps counting across repeated tries, and can still be solved after them", () => {
    let a = fresh();
    a = judge(a, mv(0, 0, 0, 3), best, true).attempt;
    a = judge(a, mv(0, 0, 0, 2), best, true).attempt;
    expect(a.attempts).toBe(2);
    expect(a.stage).toBe("wrong");
    a = judge(a, mv(1, 1, 1, 4), best, true).attempt;
    expect(a.stage).toBe("solved");
    // Getting there late is still getting there; the count is context, not a score.
    expect(a.attempts).toBe(2);
  });

  it("leaves the position it is asking about alone", () => {
    const a = fresh();
    const after = judge(a, mv(0, 0, 0, 3), best, true).attempt;
    expect(after.source).toEqual(a.source);
    expect(after.mover).toBe(a.mover);
  });

  it("never moves the cursor: a one-step line behaves exactly as it did before", () => {
    const wrong = judge(fresh(), mv(0, 0, 0, 3), best, true).attempt;
    const right = judge(fresh(), mv(1, 1, 1, 4), best, true).attempt;
    expect(wrong.step).toBe(0);
    expect(right.step).toBe(0);
  });

  it("plays only the guess, right or wrong — there is no reply to script", () => {
    expect(judge(fresh(), mv(0, 0, 0, 3), best, true).play).toEqual([mv(0, 0, 0, 3)]);
    expect(judge(fresh(), mv(1, 1, 1, 4), best, true).play).toEqual([mv(1, 1, 1, 4)]);
  });
});

describe("walking a multi-step line", () => {
  // Three solver moves with a scripted reply between each: seven plies in all,
  // asked for as three.
  const solves = [mv(1, 1, 1, 4), mv(1, 4, 4, 4), mv(4, 4, 6, 4)];
  const replies = [mv(6, 6, 6, 5), mv(6, 5, 5, 5)];
  const stepAt = (i: number): LineStep => line(solves[i], replies[i] ?? null);
  const isLast = (i: number): boolean => i === solves.length - 1;

  it("advances the cursor and stays guessing on a correct non-final step", () => {
    const { attempt, play } = judge(banked(), solves[0], stepAt(0), isLast(0));
    expect(attempt.stage).toBe("guessing");
    expect(attempt.step).toBe(1);
    // Both plies go to the board in order: your move, then the answer to it.
    expect(play).toEqual([solves[0], replies[0]]);
  });

  it("runs the whole line to solved", () => {
    let a = banked();
    for (let i = 0; i < solves.length; i++) {
      const r = judge(a, solves[i], stepAt(i), isLast(i));
      a = r.attempt;
      expect(r.play[0]).toEqual(solves[i]);
    }
    expect(a.stage).toBe("solved");
    expect(a.step).toBe(2);
    expect(a.attempts).toBe(0);
  });

  it("plays the solving move alone on the last step — nothing is scripted after it", () => {
    let a = banked();
    a = judge(a, solves[0], stepAt(0), isLast(0)).attempt;
    a = judge(a, solves[1], stepAt(1), isLast(1)).attempt;
    expect(judge(a, solves[2], stepAt(2), isLast(2)).play).toEqual([solves[2]]);
  });

  it("keeps the cursor where it was when a later step is guessed wrong", () => {
    // Step 2 of 3 (cursor 1). A wrong guess costs that step, not the line.
    let a = banked();
    a = judge(a, solves[0], stepAt(0), isLast(0)).attempt;
    expect(a.step).toBe(1);
    const { attempt, play } = judge(a, mv(0, 0, 0, 3), stepAt(1), isLast(1));
    expect(attempt.stage).toBe("wrong");
    expect(attempt.step).toBe(1);
    expect(attempt.attempts).toBe(1);
    // The wrong move still goes to the board — being told "no" without seeing
    // why teaches nothing.
    expect(play).toEqual([mv(0, 0, 0, 3)]);
  });

  it("accumulates wrong guesses across steps, never per step", () => {
    let a = banked();
    a = judge(a, mv(0, 0, 0, 3), stepAt(0), isLast(0)).attempt; // wrong at step 1
    a = judge(a, solves[0], stepAt(0), isLast(0)).attempt; // right at step 1
    a = judge(a, mv(0, 0, 0, 2), stepAt(1), isLast(1)).attempt; // wrong at step 2
    a = judge(a, solves[1], stepAt(1), isLast(1)).attempt; // right at step 2
    expect(a.attempts).toBe(2);
    expect(a.step).toBe(2);
  });

  it("plays only the guess when a non-final step has no reply recorded", () => {
    // A malformed record should not throw at the board.
    const { attempt, play } = judge(banked(), solves[0], { accepted: [solves[0]], reply: null }, false);
    expect(attempt.step).toBe(1);
    expect(play).toEqual([solves[0]]);
  });
});

describe("retryStep", () => {
  it("returns to guessing at the same step", () => {
    // Someone who has found three moves has found them; a wrong guess costs the
    // step, not the line.
    const stuck: Attempt = { ...banked(), stage: "wrong", step: 2, attempts: 3 };
    const again = retryStep(stuck);
    expect(again.stage).toBe("guessing");
    expect(again.step).toBe(2);
  });

  it("does not clear the count of wrong guesses", () => {
    // The count is context for the copy, never a score, so there is nothing to
    // protect by resetting it.
    expect(retryStep({ ...banked(), stage: "wrong", step: 1, attempts: 3 }).attempts).toBe(3);
  });

  it("leaves the source and the mover untouched", () => {
    const stuck: Attempt = { ...fresh(), stage: "wrong", attempts: 1 };
    const again = retryStep(stuck);
    expect(again.source).toEqual(stuck.source);
    expect(again.mover).toBe(stuck.mover);
  });
});

describe("isFinished", () => {
  it("is true for both endings and neither middle state", () => {
    // Revealing must count as finished: someone stuck learns nothing from being
    // made to keep guessing.
    expect(isFinished({ ...fresh(), stage: "solved" })).toBe(true);
    expect(isFinished({ ...fresh(), stage: "revealed" })).toBe(true);
    expect(isFinished({ ...fresh(), stage: "guessing" })).toBe(false);
    expect(isFinished({ ...fresh(), stage: "wrong" })).toBe(false);
    expect(isFinished(null)).toBe(false);
  });

  it("does not treat an unfinished multi-step line as over", () => {
    // Mid-line the stage is `guessing` again, which is the point: the cursor,
    // not the stage, is what says how far through you are.
    expect(isFinished({ ...banked(), stage: "guessing", step: 2 })).toBe(false);
  });
});
