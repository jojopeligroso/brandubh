import { describe, expect, it } from "vitest";
import {
  acceptsGuess,
  hidesEngine,
  isFinished,
  isSolution,
  judge,
  sameMove,
  type PuzzleState,
} from "./puzzle";
import type { Move } from "./types";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({
  from: { row: fr, col: fc },
  to: { row: tr, col: tc },
});

const fresh = (): PuzzleState => ({ ply: 7, mover: "defenders", stage: "guessing", attempts: 0 });

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
});

describe("hiding the engine while a guess is outstanding", () => {
  it("hides it while guessing and after a wrong try", () => {
    // The single most important rule here: the eval bar and the arrows answer
    // the question the puzzle is asking.
    expect(hidesEngine({ ...fresh(), stage: "guessing" })).toBe(true);
    expect(hidesEngine({ ...fresh(), stage: "wrong" })).toBe(true);
  });

  it("shows it once the puzzle is over, however it ended", () => {
    expect(hidesEngine({ ...fresh(), stage: "solved" })).toBe(false);
    expect(hidesEngine({ ...fresh(), stage: "revealed" })).toBe(false);
  });

  it("does not hide anything when no puzzle is running", () => {
    expect(hidesEngine(null)).toBe(false);
  });

  it("hides exactly when it is still judging guesses", () => {
    // These two must never disagree: a board that judges a move while the
    // answer is on screen, or one that hides the answer but ignores the move,
    // are both incoherent.
    for (const stage of ["guessing", "wrong", "solved", "revealed"] as const) {
      const p = { ...fresh(), stage };
      expect(hidesEngine(p)).toBe(acceptsGuess(p));
    }
  });
});

describe("judging a guess", () => {
  const best = [mv(1, 1, 1, 4)];

  it("solves on the right move", () => {
    expect(judge(fresh(), mv(1, 1, 1, 4), best).stage).toBe("solved");
  });

  it("goes to 'wrong' and counts the attempt otherwise", () => {
    const after = judge(fresh(), mv(0, 0, 0, 3), best);
    expect(after.stage).toBe("wrong");
    expect(after.attempts).toBe(1);
  });

  it("keeps counting across repeated tries, and can still be solved after them", () => {
    let p = fresh();
    p = judge(p, mv(0, 0, 0, 3), best);
    p = judge(p, mv(0, 0, 0, 2), best);
    expect(p.attempts).toBe(2);
    expect(p.stage).toBe("wrong");
    p = judge(p, mv(1, 1, 1, 4), best);
    expect(p.stage).toBe("solved");
    // Getting there late is still getting there; the count is context, not a score.
    expect(p.attempts).toBe(2);
  });

  it("leaves the position it is asking about alone", () => {
    const p = fresh();
    expect(judge(p, mv(0, 0, 0, 3), best).ply).toBe(p.ply);
    expect(judge(p, mv(0, 0, 0, 3), best).mover).toBe(p.mover);
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
});
