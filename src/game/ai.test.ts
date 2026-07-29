import { describe, expect, it } from "vitest";
import { chooseMove, evaluate } from "./ai";
import { allMoves, applyMove, isCorner } from "./engine";
import { type Board, type GameState, type Side } from "./types";
import { VARIANTS } from "./variants";

const wtf = VARIANTS.wtf;

/** Build a Board from 7 strings of 7 chars. '.' empty 'a' attacker 'd' defender 'k' king */
function board(rows: string[]): Board {
  return rows.map((row) =>
    [...row].map((ch) =>
      ch === "a" ? "attacker" : ch === "d" ? "defender" : ch === "k" ? "king" : null,
    ),
  );
}

function state(b: Board, turn: Side = "attackers"): GameState {
  return {
    board: b,
    turn,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
  };
}

// The three positions below share an identical attacker layout (eight raiders on
// the same squares) — only the king moves — so material, corner-guard occupancy
// and king-hug terms are equal in each. Any score difference is purely the
// king-escape assessment.
//
// king at (0,3): a clear slide left to (0,0) *and* right to (0,6) — two escapes
// in a single move. On the king's turn that is a win.
const ONE_MOVE = state(
  board([
    "...k...",
    "......a",
    "....a..",
    ".......",
    "..a...a",
    "......a",
    "..a.aa.",
  ]),
);
// king at (2,1): no corner in one move, but a two-move run along column 0 to
// either (0,0) or (6,0). This is the pattern that beat the old AI.
const TWO_MOVE = state(
  board([
    ".......",
    "......a",
    ".k..a..",
    ".......",
    "..a...a",
    "......a",
    "..a.aa.",
  ]),
);
// king at (4,4): caged — every first move stops short of any edge, so no corner
// is reachable within two moves.
const BOXED = state(
  board([
    ".......",
    "......a",
    "....a..",
    ".......",
    "..a.k.a",
    "......a",
    "..a.aa.",
  ]),
);

describe("evaluate — king escape awareness", () => {
  it("ranks a caged king best, a one-move double escape worst, for the attackers", () => {
    const boxed = evaluate(BOXED, wtf);
    const twoMove = evaluate(TWO_MOVE, wtf);
    const oneMove = evaluate(ONE_MOVE, wtf);
    // Attacker-positive: caged is safest, the immediate double escape is nearly lost.
    expect(boxed).toBeGreaterThan(twoMove);
    expect(twoMove).toBeGreaterThan(oneMove);
  });

  it("treats a two-move corner run as a real threat, not a quiet position", () => {
    // A boxed king and a two-move-run king have the same material and the same
    // (zero) one-move escapes; the old evaluation scored them almost alike. The
    // gap must be large enough to steer the search away from the run.
    expect(evaluate(BOXED, wtf) - evaluate(TWO_MOVE, wtf)).toBeGreaterThan(120);
  });
});

describe("chooseMove — attacker defence", () => {
  it("blocks the king's only open path to a corner", () => {
    // King on (0,3) can escape right to the (0,6) corner; the left corner is
    // sealed by the attacker on (0,0). An attacker on (2,5) can drop onto the
    // escape lane. A competent attacker must take it.
    const s = state(
      board([
        "a..k...",
        ".......",
        ".....a.",
        ".......",
        "a......",
        ".......",
        "...a...",
      ]),
      "attackers",
    );
    const move = chooseMove(s, "medium", wtf, () => 0);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, wtf);
    const kingEscapes = allMoves(after.board, "defenders", wtf).filter((m) =>
      isCorner(m.to.row, m.to.col),
    );
    expect(kingEscapes).toHaveLength(0);
  });
});
