import { describe, expect, it } from "vitest";
import { forcedAttackerWin } from "./ai";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "./engine";
import type { Board, GameState, Piece, Side } from "./types";
import type { RuleSet } from "./variants";
import { VARIANTS } from "./variants";

/**
 * Independent oracle: can the side to move force an *attacker* win within `plies`?
 * A plain AND-OR minimax on the raw rules — attacker-to-move is an OR node (one
 * winning move suffices), defender-to-move is an AND node (every reply must still
 * lose). It shares none of the recognizer's net/gate logic, so agreement is real
 * cross-validation, and it is exact (no heuristic) for the shallow horizon we use.
 * This is the exact mirror of `forcedDefenderWinWithin` in recognizers.test.ts.
 */
function forcedAttackerWinWithin(state: GameState, rules: RuleSet, plies: number): boolean {
  if (isGameOver(state.status)) return winnerOf(state.status) === "attackers";
  if (plies === 0) return false; // not proven within the horizon
  const moves = allMoves(state.board, state.turn, rules);
  if (!moves.length) return false; // a terminal the status did not flag; never a proof
  if (state.turn === "attackers")
    return moves.some((m) => forcedAttackerWinWithin(applyMove(state, m, rules), rules, plies - 1));
  return moves.every((m) => forcedAttackerWinWithin(applyMove(state, m, rules), rules, plies - 1));
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

// The recognizer's scope is an imminent king capture: attacker on move with a
// capture in hand, or defender on move but netted (every reply losing the king) —
// the exact twin of the defender recognizer's escape/fork pair. See the note above
// `forcedAttackerWin` in ai.ts for why it rides a default-off flag.
describe("attacker recognizer: fires on the intended patterns", () => {
  it("capture in hand — attacker to move completes a custodial sandwich", () => {
    // King on (3,1) already flanked north by (2,1); the attacker on (6,1) slides to
    // (4,1), closing the (2,1)+(4,1) pair. One move, king dead.
    const b = empty();
    b[3][1] = "king";
    b[2][1] = "attacker";
    b[3][2] = "attacker";
    b[6][1] = "attacker";
    const s = stateOf(b, "attackers");
    expect(forcedAttackerWin(s, walker)).toBe(true);
    expect(forcedAttackerWinWithin(s, walker, 2)).toBe(true);
  });

  it("capture net — defender to move, the king's only step walks into a sandwich", () => {
    // King boxed at (3,1) by attackers on (2,1),(4,1),(3,2); its sole legal move
    // is →(3,0). An attacker already sits on (2,0), and (6,0) slides up to (4,0)
    // to close the (2,0)+(4,0) pair on the king at (3,0). Every reply loses.
    const b = empty();
    b[3][1] = "king";
    b[2][1] = "attacker";
    b[4][1] = "attacker";
    b[3][2] = "attacker";
    b[2][0] = "attacker";
    b[6][0] = "attacker";
    const s = stateOf(b, "defenders");
    expect(forcedAttackerWin(s, walker)).toBe(true);
    expect(forcedAttackerWinWithin(s, walker, 3)).toBe(true);
  });

  it("net with a free defender — both the king-stays and king-flees replies lose", () => {
    // As above, plus a defender shuffling on (6,6). If it moves (king stays), the
    // attacker on (2,0) drops to (3,0) and closes (3,0)+(3,2); if the king flees to
    // (3,0), (6,0)→(4,0) closes (2,0)+(4,0). No defender reply saves the king.
    const b = empty();
    b[3][1] = "king";
    b[2][1] = "attacker";
    b[4][1] = "attacker";
    b[3][2] = "attacker";
    b[2][0] = "attacker";
    b[6][0] = "attacker";
    b[6][6] = "defender";
    const s = stateOf(b, "defenders");
    expect(forcedAttackerWin(s, walker)).toBe(true);
    expect(forcedAttackerWinWithin(s, walker, 3)).toBe(true);
  });

  it("does not fire when the king still has a way out", () => {
    // Same box minus one wall: the king can slip away, so no capture is forced.
    const b = empty();
    b[3][1] = "king";
    b[2][1] = "attacker";
    b[3][2] = "attacker";
    b[6][0] = "attacker";
    const s = stateOf(b, "defenders");
    expect(forcedAttackerWin(s, walker)).toBe(false);
    expect(forcedAttackerWinWithin(s, walker, 4)).toBe(false);
  });

  it("bails in O(1) on an open king (no capture pressure)", () => {
    // King in the open with a lone distant attacker: the gate bails before any
    // move generation, and nothing is claimed.
    const b = empty();
    b[2][2] = "king";
    b[6][6] = "attacker";
    expect(forcedAttackerWin(stateOf(b, "attackers"), walker)).toBe(false);
    expect(forcedAttackerWin(stateOf(b, "defenders"), walker)).toBe(false);
  });
});

describe("attacker recognizer: SOUND — never claim an unforced win (cross-validated)", () => {
  it("every position where the recognizer fires is an independently-forced attacker win", () => {
    let fired = 0;
    const rng = mulberry32(20260730);
    // Sample positions from random self-play in both variants.
    for (const rules of [wtf, walker]) {
      for (let game = 0; game < 40 && fired < 60; game++) {
        let s = initialState();
        for (let ply = 0; ply < 60 && !isGameOver(s.status); ply++) {
          if (forcedAttackerWin(s, rules)) {
            fired++;
            // The recognizer's win is ≤2 plies; the independent AND-OR oracle at
            // depth 4 must confirm it. A disagreement here is a false positive.
            expect(
              forcedAttackerWinWithin(s, rules, 4),
              `recognizer fired but no forced attacker win within 4 plies`,
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
