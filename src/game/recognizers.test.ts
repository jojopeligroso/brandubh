import { describe, expect, it } from "vitest";
import { forcedDefenderWin } from "./ai";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "./engine";
import type { Board, GameState, Piece, Side } from "./types";
import type { RuleSet } from "./variants";
import { VARIANTS } from "./variants";

/**
 * Independent oracle: can the side to move force a *defender* win within `plies`?
 * A plain AND-OR minimax on the raw rules — defender-to-move is an OR node (one
 * winning move suffices), attacker-to-move is an AND node (every reply must still
 * lose). It shares none of the recognizer's lane/fork logic, so agreement is real
 * cross-validation, and it is exact (no heuristic) for the shallow horizon we use.
 */
function forcedDefenderWinWithin(state: GameState, rules: RuleSet, plies: number): boolean {
  if (isGameOver(state.status)) return winnerOf(state.status) === "defenders";
  if (plies === 0) return false; // not proven within the horizon
  const moves = allMoves(state.board, state.turn, rules);
  if (state.turn === "defenders")
    return moves.some((m) => forcedDefenderWinWithin(applyMove(state, m, rules), rules, plies - 1));
  return moves.every((m) => forcedDefenderWinWithin(applyMove(state, m, rules), rules, plies - 1));
}

const wtf = VARIANTS.wtf;
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

describe("recognizers: fire on the intended patterns", () => {
  it("two-lane fork — attacker to move, king forks two corners on the top edge", () => {
    const b = empty();
    b[0][3] = "king"; // row 0 clear left to (0,0) and right to (0,6): two lanes
    b[4][1] = "attacker";
    b[4][5] = "attacker";
    b[5][3] = "attacker";
    const s = stateOf(b, "attackers");
    expect(forcedDefenderWin(s, walker)).toBe(true);
    // The independent oracle must agree it is a forced defender win.
    expect(forcedDefenderWinWithin(s, walker, 4)).toBe(true);
  });

  it("guarded corner race — defender to move, king steps into the fork", () => {
    const b = empty();
    b[1][3] = "king"; // no lane yet; stepping to (0,3) forks (0,0) and (0,6)
    b[4][1] = "attacker";
    b[4][5] = "attacker";
    b[5][3] = "attacker";
    const s = stateOf(b, "defenders");
    expect(forcedDefenderWin(s, walker)).toBe(true);
    expect(forcedDefenderWinWithin(s, walker, 4)).toBe(true);
  });

  it("does not fire when only one lane is open (attacker blocks it)", () => {
    const b = empty();
    b[0][3] = "king";
    b[0][5] = "attacker"; // right lane sealed → only the left lane is open
    b[4][3] = "attacker";
    const s = stateOf(b, "attackers");
    expect(forcedDefenderWin(s, walker)).toBe(false);
  });
});

describe("recognizers: SOUND — never claim an unforced win (cross-validated)", () => {
  it("every position where the recognizer fires is an independently-forced defender win", () => {
    let fired = 0;
    const rng = mulberry32(20260729);
    // Sample positions from random self-play in both variants.
    for (const rules of [wtf, walker]) {
      for (let game = 0; game < 25 && fired < 60; game++) {
        let s = initialState();
        for (let ply = 0; ply < 45 && !isGameOver(s.status); ply++) {
          if (forcedDefenderWin(s, rules)) {
            fired++;
            // The recognizer's win is ≤3 plies; the independent AND-OR oracle at
            // depth 4 must confirm it. A disagreement here is a false positive.
            expect(
              forcedDefenderWinWithin(s, rules, 4),
              `recognizer fired but no forced defender win within 4 plies`,
            ).toBe(true);
          }
          const moves = allMoves(s.board, s.turn, rules);
          if (!moves.length) break;
          s = applyMove(s, moves[Math.floor(rng() * moves.length)], rules);
        }
      }
    }
    // The sampler must actually exercise the recognizer, or the test proves nothing.
    expect(fired).toBeGreaterThan(0);
  });
});
