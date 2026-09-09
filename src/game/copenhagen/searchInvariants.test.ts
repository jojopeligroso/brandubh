// ── Search invariants: Copenhagen Hnefatafl (11×11) ──────────────────────────
//
// Witnesses for the search-core extraction planned in docs/adr/0007-*.md (item
// 3) — see src/game/searchInvariants.test.ts's header for the full rationale.
// Byte-exact pins, deliberately: a refactor that changes behaviour even
// slightly should fail one of these, on purpose.
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, FULL_CONFIG, pickMove, resetTT } from "./engine";
import { perft } from "../perft";
import { allMoves, applyMove, initialState, isGameOver } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import { VARIANTS, VISIBLE_VARIANTS } from "./variants";
import type { CopenhagenRuleSet } from "./variants";

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
const fixed = () => 0.5;

const perftCopenhagen = (state: GameState, rules: CopenhagenRuleSet, depth: number): number =>
  perft(state, rules, depth, allMoves, applyMove, isGameOver);

// ── 1. Perft ──────────────────────────────────────────────────────────────────
//
// ⚠ PINNED TABLE. Re-pin only after a rule change you can name — the pending
// "Copenhagen repetition default" review is the one flagged in the work
// package; a diff here that isn't traceable to a named rule change is a
// regression in move generation, not a re-pin.
//
// Both shipped presets (copenhagen, copenhagen-fetlar) produce the *same*
// opening tree through depth 3 — the flags they differ on (exit-fort,
// shieldwall, encirclement, repetition) are none of them reachable from the
// opening within 3 plies on an 11×11 board.
//
// This is the most expensive perft in the suite by a wide margin: 806,344
// leaf nodes at depth 3, against Tablut's 251,856 and Brandubh's 39,512 — the
// board is bigger (121 squares vs. 81 vs. 49) and every node here also
// carries Copenhagen's shieldwall-capture check, which the other two boards'
// captures skip entirely. Measured this session: ~1.6s for depth 1-2 combined
// (cheap), then anywhere from ~9.5s (this file's second perft call, JIT warm)
// to ~90s (first call, cold, under a concurrent gauntlet run driving load
// average to ~9 on 4 cores) for depth 3 alone. Given generous per-test
// timeouts below; see this file's contribution to the full-suite runtime in
// the work-package report if this ever needs revisiting.
//
// Depth 4 is not attempted at all: depth 3's branching factor here (~116 at
// the root) puts it far outside the "~5s per preset" budget by any measure.
const PERFT_TABLE: Record<string, { d1: number; d2: number; d3: number }> = {
  copenhagen: { d1: 116, d2: 6788, d3: 806344 },
  "copenhagen-fetlar": { d1: 116, d2: 6788, d3: 806344 },
};

describe("perft: legal-move-tree node counts from the opening, per shipped preset", () => {
  it("VISIBLE_VARIANTS matches the pinned table's keys (no preset silently added or removed)", () => {
    expect(new Set(VISIBLE_VARIANTS)).toEqual(new Set(Object.keys(PERFT_TABLE)));
  });

  for (const [key, { d1, d2 }] of Object.entries(PERFT_TABLE)) {
    it(`${key}: depths 1-2 (depth 3 timed separately below)`, () => {
      const rules = VARIANTS[key];
      const s = initialState(rules);
      expect(perftCopenhagen(s, rules, 1)).toBe(d1);
      expect(perftCopenhagen(s, rules, 2)).toBe(d2);
    });
  }

  for (const [key, { d3 }] of Object.entries(PERFT_TABLE)) {
    it(
      `${key}: depth 3 (slow — see timing note on PERFT_TABLE above)`,
      () => {
        const rules = VARIANTS[key];
        expect(perftCopenhagen(initialState(rules), rules, 3)).toBe(d3);
      },
      120_000,
    );
  }
});

// ── 2. Search fingerprints ───────────────────────────────────────────────────
//
// Fixed depth, FULL_CONFIG, DEFAULT_WEIGHTS, no deadline — deterministic. TT
// cleared first (module-global — see `resetTT` in ./engine).
describe("search fingerprints: score, node count and best move at depth 3", () => {
  const rules = VARIANTS.copenhagen;

  it("opening", () => {
    resetTT();
    const r = pickMove(initialState(rules), rules, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(180);
    expect(r.nodes).toBe(8287);
    expect(r.depth).toBe(3);
    expect(r.move).toEqual({ from: { row: 0, col: 3 }, to: { row: 1, col: 3 } });
    // A wide equal-best set at the opening — 13 root moves tie the best score
    // at this depth. Exact set, in the order the search returns it.
    expect(r.bestMoves).toEqual([
      { from: { row: 1, col: 5 }, to: { row: 2, col: 5 } },
      { from: { row: 0, col: 3 }, to: { row: 3, col: 3 } },
      { from: { row: 0, col: 4 }, to: { row: 2, col: 4 } },
      { from: { row: 0, col: 3 }, to: { row: 2, col: 3 } },
      { from: { row: 0, col: 4 }, to: { row: 1, col: 4 } },
      { from: { row: 1, col: 5 }, to: { row: 1, col: 4 } },
      { from: { row: 0, col: 3 }, to: { row: 1, col: 3 } },
      { from: { row: 1, col: 5 }, to: { row: 1, col: 3 } },
      { from: { row: 1, col: 5 }, to: { row: 1, col: 2 } },
      { from: { row: 0, col: 3 }, to: { row: 0, col: 2 } },
      { from: { row: 1, col: 5 }, to: { row: 1, col: 1 } },
      { from: { row: 0, col: 3 }, to: { row: 0, col: 1 } },
      { from: { row: 1, col: 5 }, to: { row: 1, col: 0 } },
    ]);
  });

  // Generated once, deterministically, and hardcoded here as a literal so the
  // fixture survives a search-core refactor unchanged: 12 plies of
  // self-play from the opening (pickMove at maxDepth 2, FULL_CONFIG,
  // copenhagen, mulberry32 seed 42, resetTT before each ply). Copenhagen's
  // attackers move first, so after 12 plies it is attackers to move again.
  it("midgame (12 plies of deterministic self-play from the opening)", () => {
    const b = empty();
    b[0][3] = "attacker";
    b[0][5] = "attacker";
    b[0][6] = "attacker";
    b[0][7] = "attacker";
    b[1][3] = "attacker";
    b[3][0] = "attacker";
    b[3][3] = "defender";
    b[3][4] = "attacker";
    b[3][5] = "attacker";
    b[4][0] = "attacker";
    b[4][4] = "defender";
    b[4][5] = "defender";
    b[4][6] = "defender";
    b[4][10] = "attacker";
    b[5][0] = "attacker";
    b[5][1] = "attacker";
    b[5][3] = "defender";
    b[5][4] = "defender";
    b[5][5] = "king";
    b[5][6] = "defender";
    b[5][7] = "defender";
    b[5][9] = "attacker";
    b[5][10] = "attacker";
    b[6][0] = "attacker";
    b[6][4] = "defender";
    b[6][8] = "defender";
    b[6][10] = "attacker";
    b[7][0] = "attacker";
    b[7][7] = "defender";
    b[7][10] = "attacker";
    b[8][4] = "attacker";
    b[8][7] = "defender";
    b[9][5] = "attacker";
    b[9][6] = "attacker";
    b[9][7] = "attacker";
    b[10][3] = "attacker";
    b[10][5] = "attacker";
    resetTT();
    const r = pickMove(stateOf(b, "attackers"), rules, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(170);
    expect(r.nodes).toBe(36418);
    expect(r.depth).toBe(3);
    expect(r.move).toEqual({ from: { row: 3, col: 0 }, to: { row: 3, col: 2 } });
    expect(r.bestMoves).toEqual([{ from: { row: 3, col: 0 }, to: { row: 3, col: 2 } }]);
  });

  // Tactical position reused from engine.test.ts's "takes the king when the
  // capture is there, against a strong king" — a proven mate-in-one, so
  // iterative deepening stops at depth 1 even though maxDepth asks for 3.
  it("tactical: king capture in one move, against a strong king", () => {
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    b[3][9] = "attacker";
    resetTT();
    const r = pickMove(stateOf(b, "attackers"), rules, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(1_000_000);
    expect(r.nodes).toBe(111);
    expect(r.depth).toBe(1);
    expect(r.move).toEqual({ from: { row: 3, col: 9 }, to: { row: 3, col: 4 } });
    expect(r.bestMoves).toEqual([{ from: { row: 3, col: 9 }, to: { row: 3, col: 4 } }]);
  });
});

// ── 3. Performance guard ──────────────────────────────────────────────────────
//
// Mirrors src/game/engine.test.ts's Brandubh "performance guard": pin an upper
// node budget for a fixed-depth opening search, node count rather than
// milliseconds (another agent is running gauntlets on this machine while this
// suite is written, so a timing-based assertion would be noise). This is the
// *pruned alpha-beta search* node count, not perft's full-tree count above —
// orders of magnitude smaller, and fast (a few seconds at worst) even on this
// board's wider branching.
describe("performance guard", () => {
  it("keeps the opening depth-4 search within a sane node budget", () => {
    const rules = VARIANTS.copenhagen;
    resetTT();
    const r = pickMove(initialState(rules), rules, { maxDepth: 4 }, FULL_CONFIG, fixed);
    expect(r.depth).toBe(4);
    expect(r.nodes).toBeLessThan(150_000);
  });
});
