import { describe, expect, it } from "vitest";
import { canonicalKey, solve } from "./solver";
import { applyMove, initialState, moveName, pointIndex } from "./rules";
import { POINT_COUNT, type Board, type Cell, type GameState, type Side } from "./types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor } from "./variants";

// The solver's only job is to be an *independent* witness, so these tests are
// deliberately about soundness rather than reach: that a proof is a proof, that an
// exhausted budget says "unknown" instead of guessing, and that the memo table does
// not change an answer. Anything that needs real search depth is the engine's job.

const gasser = VARIANTS["morris-gasser-1"];
/** The paper's own game: no practical draw rules, and no flying — which is what
 *  keeps a hand-built endgame's branching small enough to prove by hand. */
const strict = rulesFor("custom", {
  ...CUSTOM_RULE_DEFAULTS,
  flying: "none",
  repetitionResult: "none",
  noMillDrawMoves: "none",
});
const p = pointIndex;

function stateOf(
  white: string[],
  black: string[],
  turn: Side,
  hands = { white: 0, black: 0 },
  sinceMill = 0,
): GameState {
  const board = Array<Cell>(POINT_COUNT).fill(0) as Cell[];
  for (const n of white) board[p(n)] = 1;
  for (const n of black) board[p(n)] = 2;
  return { board: board as Board, turn, inHand: hands, status: "playing", history: [], sinceMill };
}

describe("proving a win", () => {
  it("proves a mill-closing win in one ply, and names the move", () => {
    const s = stateOf(["a7", "d7", "g4", "f4"], ["c5", "e5", "e3"], "white");
    const r = solve(s, gasser, { maxNodes: 200_000, maxDepth: 4 });
    expect(r.value).toBe("white");
    expect(r.dtm).toBe(1);
    expect(r.budgetHit).toBe(false);
    expect(r.bestMove).not.toBeNull();
    // g4→g7 completes a7-d7-g7 and takes Black's third stone.
    expect(moveName(r.bestMove!)).toMatch(/^g4-g7x/);
    expect(applyMove(s, r.bestMove!, gasser).status).toBe("white_win_stones");
  });

  it("reports an already-finished game without searching", () => {
    const s = stateOf(["a7", "d7", "g4", "f4"], ["c5", "e5", "e3"], "white");
    const done = applyMove(s, { from: p("g4"), to: p("g7"), remove: p("e5") }, gasser);
    const r = solve(done, gasser);
    expect(r.value).toBe("white");
    expect(r.dtm).toBe(0);
    expect(r.bestMove).toBeNull();
    expect(r.nodes).toBe(1);
  });
});

describe("proving a loss", () => {
  it("proves a forced loss for the side to move", () => {
    // Black, to move, has three stones and no flying. Every neighbour of every one
    // of them is occupied except g7, so `d7-g7` is Black's *only* legal turn — and
    // then White slides b2→b4, closing a4-b4-c4, and takes Black's third stone.
    const s = stateOf(["a4", "d6", "d5", "c4", "b2"], ["a7", "d7", "c5"], "black");
    const r = solve(s, strict, { maxNodes: 500_000, maxDepth: 8 });
    expect(r.value).toBe("white");
    expect(r.dtm).toBe(2); // Black's forced move, then White's mill
    expect(r.budgetHit).toBe(false);
    expect(moveName(r.bestMove!)).toBe("d7-g7"); // the slowest loss is the only move
  });

  it("proves the same position the same way with the memo table off", () => {
    // The table folds over the 16 symmetries and drops the move history, which is
    // the documented graph-history hazard. On a position with no repetition rule in
    // play the two must agree exactly, and that is what makes `memo: true` usable.
    const s = stateOf(["a4", "d6", "d5", "c4", "b2"], ["a7", "d7", "c5"], "black");
    const withMemo = solve(s, strict, { maxNodes: 500_000, maxDepth: 8, memo: true });
    const without = solve(s, strict, { maxNodes: 500_000, maxDepth: 8, memo: false });
    expect(without.value).toBe(withMemo.value);
    expect(without.dtm).toBe(withMemo.dtm);
  });
});

describe("the budget", () => {
  it("says unknown rather than guessing, and says it hit the budget", () => {
    const r = solve(initialState(gasser), gasser, { maxNodes: 500 });
    expect(r.value).toBe("unknown");
    expect(r.budgetHit).toBe(true);
    expect(r.nodes).toBeGreaterThan(0);
    expect(r.dtm).toBe(Infinity);
  });

  it("still proves a win that is inside the budget, however small", () => {
    // Soundness is not a function of the budget: a one-ply proof is found with a
    // node allowance that cannot possibly explore the position.
    const s = stateOf(["a7", "d7", "g4", "f4"], ["c5", "e5", "e3"], "white");
    const r = solve(s, gasser, { maxNodes: 3 });
    expect(r.value).toBe("white");
    expect(r.dtm).toBe(1);
  });

  it("stops at the ply cap and at the clock", () => {
    const s = initialState(gasser);
    expect(solve(s, gasser, { maxDepth: 2 }).value).toBe("unknown");
    let t = 0;
    const deadlined = solve(s, gasser, { deadlineMs: 5, now: () => (t += 10) });
    expect(deadlined.value).toBe("unknown");
    expect(deadlined.budgetHit).toBe(true);
  });
});

describe("canonicalKey", () => {
  it("gives symmetric positions the same key", () => {
    // The same opening stone on each of the eight corners, and on the inner ring's
    // corners too — one position by sixteen names.
    const keys = new Set(
      ["a7", "g7", "g1", "a1", "c5", "e5", "e3", "c3"].map((n) =>
        canonicalKey(stateOf([n], [], "black", { white: 8, black: 9 })),
      ),
    );
    expect(keys.size).toBe(1);
  });

  it("separates what is not the same position", () => {
    const base = stateOf(["a7"], [], "black", { white: 8, black: 9 });
    expect(canonicalKey(base)).not.toBe(canonicalKey({ ...base, turn: "white" }));
    expect(canonicalKey(base)).not.toBe(canonicalKey(stateOf(["d7"], [], "black", { white: 8, black: 9 })));
    expect(canonicalKey(base)).not.toBe(canonicalKey(stateOf([], ["a7"], "black", { white: 8, black: 9 })));
    expect(canonicalKey(base)).not.toBe(
      canonicalKey(stateOf(["a7"], [], "black", { white: 7, black: 9 })),
    );
  });
});

describe("proving a draw", () => {
  it("proves a draw when every legal turn ends in one", () => {
    // Four outer corners against four inner ones, with the fifty-move counter one
    // ply from running out: no mill is reachable by either side in a single move, so
    // *every* legal turn trips `draw_no_mill`. A proven draw, in nine nodes.
    //
    // A genuinely dead-drawn endgame — the same position with the counter at zero —
    // is out of this solver's reach, and that is the honest state of affairs rather
    // than a gap in the test: proving "neither side can force a win" over a shuffle
    // is what Gasser's retrograde databases are for, and what `db/` will be checked
    // against when it lands.
    const s = stateOf(["a7", "g7", "g1", "a1"], ["c5", "e5", "e3", "c3"], "white", undefined, 99);
    const r = solve(s, gasser, { maxNodes: 10_000, maxDepth: 6 });
    expect(r.value).toBe("draw");
    expect(r.budgetHit).toBe(false);
    expect(r.dtm).toBe(Infinity);
    expect(r.nodes).toBeLessThan(20);
    expect(applyMove(s, r.bestMove!, gasser).status).toBe("draw_no_mill");
  });
});
