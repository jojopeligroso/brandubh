import { describe, expect, it } from "vitest";
import {
  DECISIVE,
  DEFAULT_WEIGHTS,
  DIFFICULTIES,
  FULL_CONFIG,
  WIN,
  clearPathToCorner,
  evaluate,
  kingCornerMoves,
  kingRegionSize,
  pickMove,
} from "./engine";
import { allMoves, applyMove, initialState, isGameOver, movesFrom, winnerOf } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import { VARIANTS } from "./variants";

const cph = VARIANTS.copenhagen;

const empty = (): Board =>
  Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));

const stateOf = (b: Board, turn: Side): GameState => ({
  board: b,
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
  sinceCapture: 0,
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── What the board actually costs to search ───────────────────────────────────
// Recorded rather than asserted tightly. These numbers are the reason the depth
// ladder in DIFFICULTIES buys fewer plies here than on either smaller board, and
// a future reader changing the search wants to know them before wondering why.

describe("the size of the problem", () => {
  it("opens roughly twice as wide as Tablut and three times as wide as Brandubh", () => {
    const s = initialState(cph);
    const attackers = allMoves(s.board, "attackers", cph).length;
    const defenders = allMoves(s.board, "defenders", cph).length;
    // Measured: 116 and 60, against Tablut's 80/56 and Brandubh's ~40.
    expect(attackers).toBe(116);
    expect(defenders).toBe(60);
  });
});

// ── Evaluation ────────────────────────────────────────────────────────────────

describe("evaluate", () => {
  it("is attacker-positive at the terminals", () => {
    const s = initialState(cph);
    expect(evaluate({ ...s, status: "attackers_win_capture" }, DEFAULT_WEIGHTS, cph)).toBe(WIN);
    expect(evaluate({ ...s, status: "defenders_win_escape" }, DEFAULT_WEIGHTS, cph)).toBe(-WIN);
    expect(evaluate({ ...s, status: "defenders_win_fort" }, DEFAULT_WEIGHTS, cph)).toBe(-WIN);
    expect(
      evaluate({ ...s, status: "defenders_win_repetition" }, DEFAULT_WEIGHTS, cph),
    ).toBe(-WIN);
    expect(evaluate({ ...s, status: "draw_repetition" }, DEFAULT_WEIGHTS, cph)).toBe(0);
  });

  it("scores the opening near level, unlike Tablut's constant offset", () => {
    // Tablut's opening scores +120 and all of it is the king-depth term, because
    // under edge escape the king starts as far from a winning square as he can
    // be. Under corner escape `kingCornerMoves` reads 2 from the throne (an
    // L-path exists), so the same term contributes only a modest constant here
    // and the material balance is genuinely even. Worth knowing before reading
    // the score as an opinion about the position.
    const score = evaluate(initialState(cph), DEFAULT_WEIGHTS, cph);
    expect(Math.abs(score)).toBeLessThan(200);
  });

  it("prefers a king with open corner lanes, from the defenders' side", () => {
    const boxed = empty();
    boxed[5][5] = "king";
    const running = empty();
    running[0][5] = "king"; // two clear lanes along the top rank
    expect(clearPathToCorner(running, 0, 5)).toBe(2);
    // Lower is better for the defenders, and the lane term is quadratic.
    expect(evaluate(stateOf(running, "defenders"), DEFAULT_WEIGHTS, cph)).toBeLessThan(
      evaluate(stateOf(boxed, "defenders"), DEFAULT_WEIGHTS, cph),
    );
  });

  it("counts the king's breathing room, capped", () => {
    const open = empty();
    open[5][5] = "king";
    // The cap is *soft*, in all three engines: the loop tests it at the top and
    // then pushes up to four neighbours, so it can overshoot by three. That is
    // fine for an eval term and not worth diverging this fork over — but it is
    // worth pinning, so nobody later reads the constant as an exact ceiling.
    expect(kingRegionSize(open, 5, 5)).toBeGreaterThanOrEqual(30);
    expect(kingRegionSize(open, 5, 5)).toBeLessThanOrEqual(33);

    const boxed = empty();
    boxed[5][5] = "king";
    boxed[4][5] = "attacker";
    boxed[6][5] = "attacker";
    boxed[5][4] = "attacker";
    boxed[5][6] = "attacker";
    expect(kingRegionSize(boxed, 5, 5)).toBe(0);
  });

  it("reads the king's real distance to a corner, blockers included", () => {
    const b = empty();
    b[0][5] = "king";
    expect(kingCornerMoves(b, 0, 5, cph)).toBe(1); // straight down the rank
    b[0][1] = "attacker";
    b[0][9] = "attacker";
    expect(kingCornerMoves(b, 0, 5, cph)).toBe(2); // both lanes shut; an L-path remains
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe("pickMove", () => {
  it("returns a legal move from the opening at every difficulty's shape", () => {
    const s = initialState(cph);
    for (const depth of [1, 2, 3]) {
      const out = pickMove(s, cph, { maxDepth: depth, deadlineMs: 4000 }, FULL_CONFIG, () => 0.5);
      expect(out.move).not.toBeNull();
      const legal = allMoves(s.board, s.turn, cph);
      expect(
        legal.some(
          (m) =>
            m.from.row === out.move!.from.row &&
            m.from.col === out.move!.from.col &&
            m.to.row === out.move!.to.row &&
            m.to.col === out.move!.to.col,
        ),
      ).toBe(true);
      expect(out.nodes).toBeGreaterThan(0);
    }
  });

  it("takes the escape when the king has one in hand", () => {
    const b = empty();
    b[0][5] = "king";
    b[7][7] = "attacker";
    const out = pickMove(stateOf(b, "defenders"), cph, { maxDepth: 3 }, FULL_CONFIG, () => 0.5);
    expect(out.move).not.toBeNull();
    const after = applyMove(stateOf(b, "defenders"), out.move!, cph);
    expect(after.status).toBe("defenders_win_escape");
    expect(out.score).toBeLessThanOrEqual(-DECISIVE);
  });

  it("takes the king when the capture is there, against a strong king", () => {
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    b[3][9] = "attacker"; // slides west onto (3,4)
    const out = pickMove(stateOf(b, "attackers"), cph, { maxDepth: 3 }, FULL_CONFIG, () => 0.5);
    expect(out.move).not.toBeNull();
    const after = applyMove(stateOf(b, "attackers"), out.move!, cph);
    expect(after.status).toBe("attackers_win_capture");
  });

  it("never returns an illegal or null move over a full self-played game", () => {
    // The cheapest possible guard against a search that desynchronises from the
    // rules — an engine that plays a move the rules do not have is a crash in the
    // UI and a corrupt save on disk.
    let s = initialState(cph);
    const rng = mulberry32(20260904);
    for (let ply = 0; ply < 24 && !isGameOver(s.status); ply++) {
      const out = pickMove(s, cph, { maxDepth: 2, deadlineMs: 2000 }, FULL_CONFIG, rng);
      expect(out.move, `no move at ply ${ply}`).not.toBeNull();
      const from = s.board[out.move!.from.row][out.move!.from.col];
      expect(from).not.toBeNull();
      expect(
        movesFrom(s.board, out.move!.from.row, out.move!.from.col, cph).some(
          (d) => d.row === out.move!.to.row && d.col === out.move!.to.col,
        ),
        `illegal move at ply ${ply}`,
      ).toBe(true);
      s = applyMove(s, out.move!, cph);
    }
    expect(s.moveCount).toBeGreaterThan(0);
    if (isGameOver(s.status)) expect(winnerOf(s.status)).not.toBeNull();
  });

  it("keeps the difficulty ladder in the order the UI shows it", () => {
    expect(DIFFICULTIES).toEqual(["easy", "medium", "hard", "ollamh"]);
  });
});
