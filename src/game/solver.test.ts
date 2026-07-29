import { describe, expect, it } from "vitest";
import { canonicalKey, solve } from "./solver";
import { applyMove } from "./engine";
import type { Board, GameState, Piece, Side } from "./types";
import { VARIANTS } from "./variants";

const walker = VARIANTS.walker;
const empty = (): Board => Array.from({ length: 7 }, () => Array<Piece | null>(7).fill(null));
const stateOf = (b: Board, turn: Side): GameState => ({
  board: b,
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
});

describe("solver: canonical key folds the board's symmetry", () => {
  it("gives one corner king the same key from all four corners", () => {
    const keys = new Set<string>();
    for (const [r, c] of [
      [0, 0],
      [0, 6],
      [6, 0],
      [6, 6],
    ] as const) {
      const b = empty();
      b[r][c] = "king";
      keys.add(canonicalKey(stateOf(b, "defenders")));
    }
    expect(keys.size).toBe(1);
  });

  it("distinguishes side to move", () => {
    const b = empty();
    b[3][3] = "king";
    expect(canonicalKey(stateOf(b, "attackers"))).not.toBe(canonicalKey(stateOf(b, "defenders")));
  });
});

describe("solver: proves known short results", () => {
  it("proves a defender mate-in-1 (king walks into the corner)", () => {
    const b = empty();
    b[0][3] = "king"; // clear run left to the (0,0) corner
    b[6][0] = "attacker";
    b[6][6] = "attacker";
    b[5][3] = "attacker";
    const r = solve(stateOf(b, "defenders"), walker, { maxNodes: 200_000 });
    expect(r.value).toBe("defenders");
    expect(r.dtm).toBe(1);
    expect(r.bestMove).not.toBeNull();
    // The proven move really does end the game for the defenders.
    const after = applyMove(stateOf(b, "defenders"), r.bestMove!, walker);
    expect(after.status).toBe("defenders_win_escape");
  });

  it("proves an attacker mate-in-1 (custodial king capture)", () => {
    // King on an edge, one attacker already flanking; the other slides in to pin it.
    const b = empty();
    b[0][3] = "king";
    b[0][2] = "attacker"; // left flank in place
    b[2][4] = "attacker"; // slides to (0,4) to complete the capture
    b[6][0] = "attacker";
    const r = solve(stateOf(b, "attackers"), walker, { maxNodes: 500_000 });
    expect(r.value).toBe("attackers");
    expect(r.dtm).toBe(1);
    const after = applyMove(stateOf(b, "attackers"), r.bestMove!, walker);
    expect(after.status).toBe("attackers_win_capture");
  });

  it("is sound under the budget: returns unknown, never a wrong proof", () => {
    // A wide-open midgame-ish position the tiny budget cannot resolve.
    const b = empty();
    b[3][3] = "king";
    b[1][3] = "attacker";
    b[5][3] = "attacker";
    b[3][1] = "attacker";
    b[3][5] = "attacker";
    b[2][3] = "defender";
    const r = solve(stateOf(b, "attackers"), walker, { maxNodes: 300 });
    expect(r.value).toBe("unknown");
    expect(r.budgetHit).toBe(true);
  });

  it("memo and no-memo agree on a proven result", () => {
    const b = empty();
    b[0][3] = "king";
    b[6][0] = "attacker";
    b[6][6] = "attacker";
    b[5][3] = "attacker";
    const withMemo = solve(stateOf(b, "defenders"), walker, { maxNodes: 200_000, memo: true });
    const noMemo = solve(stateOf(b, "defenders"), walker, { maxNodes: 200_000, memo: false });
    expect(withMemo.value).toBe(noMemo.value);
    expect(withMemo.dtm).toBe(noMemo.dtm);
  });
});
