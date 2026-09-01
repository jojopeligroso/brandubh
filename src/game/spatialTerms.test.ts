import { describe, expect, it } from "vitest";
import {
  countHangingSide,
  DEFAULT_WEIGHTS,
  evaluate,
  kingRegionSize,
  clearPathToCorner,
  quadrantCoverage,
  type EvalWeights,
} from "./engine";
import { allMoves, applyMove } from "./rules";
import type { Board, GameState, Piece, Side } from "./types";
import { VARIANTS } from "./variants";

// Walker rules, matching the audit's own probe scripts (a3/probe.ts,
// scratchpad/findings/a3-spatial-gap.md) that first measured these blindnesses.
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

/** All terms off, so a candidate weight can be isolated exactly as the audit's
 *  probe scripts did (ISOLATE_KING_CORNER-style objects in a3/probe.ts). */
const ZERO: EvalWeights = {
  material: 0,
  kingCorner: 0,
  escapeLane: 0,
  hug: 0,
  liberties: 0,
  shield: 0,
  mobility: 0,
  kingRegion: 0,
  blockerAwareKingDist: false,
  endgameRecognizers: false,
  attackerRecognizer: false,
  quadrantCoverage: 0,
  anvilThreat: 0,
};

describe("quadrantCoverage: fixes the measured quadrant-encirclement blindness", () => {
  // Demo 2 from scratchpad/findings/a3-spatial-gap.md, reproduced byte-for-byte
  // (see w4b/step1_reproduction.txt): four attackers bunched in one quadrant
  // (three corners wholly unguarded) vs. one attacker per quadrant (every
  // corner covered). kingRegionSize and clearPathToCorner tie on both boards
  // -- the blindness is structural, not a rounding coincidence.
  const bunched = empty();
  bunched[3][3] = "king";
  bunched[2][1] = "attacker";
  bunched[2][2] = "attacker";
  bunched[1][1] = "attacker";
  bunched[1][2] = "attacker";

  const spread = empty();
  spread[3][3] = "king";
  spread[1][1] = "attacker";
  spread[1][5] = "attacker";
  spread[5][1] = "attacker";
  spread[5][5] = "attacker";

  it("ground truth: the other spatial terms genuinely tie on these two boards", () => {
    expect(kingRegionSize(bunched, 3, 3)).toBe(kingRegionSize(spread, 3, 3));
    expect(clearPathToCorner(bunched, 3, 3)).toBe(clearPathToCorner(spread, 3, 3));
    expect(quadrantCoverage(bunched)).toBe(1); // all four attackers share one quadrant
    expect(quadrantCoverage(spread)).toBe(4); // one attacker per quadrant
  });

  it("the shipped default (quadrantCoverage: 0) reproduces the exact tie", () => {
    const a = evaluate(stateOf(bunched, "attackers"), DEFAULT_WEIGHTS, walker);
    const b = evaluate(stateOf(spread, "attackers"), DEFAULT_WEIGHTS, walker);
    expect(a).toBe(139.5);
    expect(b).toBe(139.5);
    expect(a).toBe(b); // the blindness: identical score despite very different coverage
  });

  it("enabling quadrantCoverage separates them in the correct direction (attacker-positive: covered corners score higher)", () => {
    const w: EvalWeights = { ...ZERO, quadrantCoverage: 10 };
    const a = evaluate(stateOf(bunched, "attackers"), w, walker);
    const b = evaluate(stateOf(spread, "attackers"), w, walker);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBe(30); // (4 - 1) covered quadrants * weight 10
  });

  it("the fix survives with the rest of the shipped evaluation switched on", () => {
    const w: EvalWeights = { ...DEFAULT_WEIGHTS, quadrantCoverage: 10 };
    const a = evaluate(stateOf(bunched, "attackers"), w, walker);
    const b = evaluate(stateOf(spread, "attackers"), w, walker);
    expect(b).toBeGreaterThan(a);
  });
});

describe("anvilThreat: fixes the measured defender-phalanx sign reversal", () => {
  // Demo 3 from scratchpad/findings/a3-spatial-gap.md, reproduced byte-for-byte:
  // equal material both sides; only the 2nd defender's square differs. In A it
  // sits idle and (2,3) hangs to a free attacker capture; in B it occupies the
  // one usable anvil square on that flank and no attacker move captures
  // anything. Ground-truthed by direct allMoves/applyMove enumeration below,
  // not just asserted.
  const king = { row: 5, col: 5 };
  const hangs = empty();
  hangs[king.row][king.col] = "king";
  hangs[2][2] = "attacker";
  hangs[2][6] = "attacker";
  hangs[2][3] = "defender"; // exposed
  hangs[5][1] = "defender"; // idle, far from any threat

  const safe = empty();
  safe[king.row][king.col] = "king";
  safe[2][2] = "attacker";
  safe[2][6] = "attacker";
  safe[2][3] = "defender"; // same piece, same square
  safe[2][4] = "defender"; // occupies the anvil square instead of sitting idle

  it("ground truth: exactly one attacker move captures a defender in 'hangs', zero in 'safe'", () => {
    const capturesIn = (board: Board): number => {
      const s = stateOf(board, "attackers");
      let n = 0;
      for (const m of allMoves(board, "attackers", walker)) {
        const child = applyMove(s, m, walker);
        const lastCaptures = child.history[child.history.length - 1]?.move.captures ?? [];
        if (lastCaptures.length > 0) n++;
      }
      return n;
    };
    expect(capturesIn(hangs)).toBe(1);
    expect(capturesIn(safe)).toBe(0);
  });

  it("countHangingSide agrees with the ground truth (attacker to move, defenders as victims)", () => {
    expect(countHangingSide(hangs, "defenders", walker)).toBe(1);
    expect(countHangingSide(safe, "defenders", walker)).toBe(0);
  });

  it("the shipped default (anvilThreat: 0) reproduces the exact sign reversal", () => {
    const a = evaluate(stateOf(hangs, "attackers"), DEFAULT_WEIGHTS, walker);
    const b = evaluate(stateOf(safe, "attackers"), DEFAULT_WEIGHTS, walker);
    expect(a).toBe(-107.5);
    expect(b).toBe(-101.5);
    // Attacker-positive score: the position with a free capture on the board
    // (hangs) scores LOWER (more defender-favourable) than the safe one — backwards.
    expect(a).toBeLessThan(b);
  });

  it("enabling anvilThreat (weight 15) flips the sign the right way: the safer position scores better for defenders", () => {
    const w: EvalWeights = { ...DEFAULT_WEIGHTS, anvilThreat: 15 };
    const a = evaluate(stateOf(hangs, "attackers"), w, walker);
    const b = evaluate(stateOf(safe, "attackers"), w, walker);
    // Now 'hangs' (defender about to lose a piece for free) must score BETTER
    // for attackers (higher) than 'safe' -- the correct direction.
    expect(a).toBeGreaterThan(b);
  });

  it("is turn-relative: a hanging piece belonging to the side about to move is not scored (only the side NOT to move can be captured this ply)", () => {
    // A version of 'hangs' without the idle 2nd defender at (5,1) -- that
    // piece turned out to create its own genuine reciprocal threat (it can
    // slide to (2,1) and net the exposed attacker at (2,2) on defenders'
    // *own* turn), which is real and correctly counted on defenders' move but
    // would confound a test aimed only at "your own hanging piece isn't
    // scored when it's your move". Isolate that one claim with a 3-piece
    // board: king, the same two attackers, the same exposed defender only.
    const isolated = empty();
    isolated[king.row][king.col] = "king";
    isolated[2][2] = "attacker";
    isolated[2][6] = "attacker";
    isolated[2][3] = "defender";
    expect(countHangingSide(isolated, "defenders", walker)).toBe(1); // hangs to attackers
    expect(countHangingSide(isolated, "attackers", walker)).toBe(0); // no reciprocal threat here

    const w: EvalWeights = { ...ZERO, anvilThreat: 20 };
    expect(evaluate(stateOf(isolated, "attackers"), w, walker)).toBe(20); // attacker to move: scored
    expect(evaluate(stateOf(isolated, "defenders"), w, walker)).toBe(0); // defenders to move: their own hanging piece is not this ply's threat
  });
});
