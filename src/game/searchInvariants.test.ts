// ── Search invariants: Brandubh (7×7) ────────────────────────────────────────
//
// Witnesses for the search-core extraction planned in docs/adr/0007-*.md (item
// 3): pin what `allMoves`/`applyMove` and `pickMove` actually produce today, so
// a refactor that changes *how* the search is built can be checked against
// exactly the same numbers it produced before. These are deliberately
// byte-exact pins, not tolerances — a refactor that changes behaviour even
// slightly should fail one of these, on purpose.
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, FULL_CONFIG, pickMove, resetTT } from "./engine";
import { perft } from "./perft";
import { allMoves, applyMove, initialState, isGameOver } from "./rules";
import type { Board, GameState, Piece, Side } from "./types";
import { VARIANTS } from "./variants";
import type { RuleSet } from "./variants";

const empty = (): Board => Array.from({ length: 7 }, () => Array<Piece | null>(7).fill(null));
const stateOf = (b: Board, turn: Side): GameState => ({
  board: b,
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
});
const fixed = () => 0.5;

const perftBrandubh = (state: GameState, rules: RuleSet, depth: number): number =>
  perft(state, rules, depth, allMoves, applyMove, isGameOver);

// ── 1. Perft ──────────────────────────────────────────────────────────────────
//
// ⚠ PINNED TABLE. Re-pin these numbers only after a rule change you can name
// (e.g. the "⚠ CONTESTED RULE" WTF near-throne king-capture review flagged in
// variants.ts). A diff here that isn't traceable to a named rule change is a
// regression in move generation, not a re-pin.
//
// Both shipped presets (walker, wtf) produce the *same* opening tree through
// depth 4 — worth stating plainly rather than looking like a copy-paste error.
// The two presets differ only in throne/strong-king/encirclement/repetition
// rules, none of which are reachable from the opening within 4 plies on a
// board this size (no piece has come near the throne, no repetition is
// possible this early — see rules.ts's `sinceCapture >= 8` gate — and
// encirclement needs far more moves than this). The presets' trees provably
// diverge somewhere beyond depth 4; this table does not claim where.
//
// Depth 4 measured (this machine, this session): ~4.5s per preset on an idle
// box, up to ~21s observed with a concurrent gauntlet run driving load average
// to ~9 on 4 cores (WP-1.1, running alongside this work) — same node count
// either way, since perft counts nodes, not time. Kept in the suite with a
// generous per-test timeout rather than dropped, since depth 4 (per preset)
// stays under the "~5s on an idle machine" budget from the work package.
const PERFT_TABLE: Record<string, { d1: number; d2: number; d3: number; d4: number }> = {
  walker: { d1: 40, d2: 960, d3: 39512, d4: 1007392 },
  wtf: { d1: 40, d2: 960, d3: 39512, d4: 1007392 },
};

describe("perft: legal-move-tree node counts from the opening, per ruleset", () => {
  for (const [key, { d1, d2, d3 }] of Object.entries(PERFT_TABLE)) {
    it(`${key}: depths 1-3`, () => {
      const rules = VARIANTS[key];
      const s = initialState();
      expect(perftBrandubh(s, rules, 1)).toBe(d1);
      expect(perftBrandubh(s, rules, 2)).toBe(d2);
      expect(perftBrandubh(s, rules, 3)).toBe(d3);
    });
  }

  for (const [key, { d4 }] of Object.entries(PERFT_TABLE)) {
    it(
      `${key}: depth 4 (slow — see timing note on PERFT_TABLE above)`,
      () => {
        const rules = VARIANTS[key];
        expect(perftBrandubh(initialState(), rules, 4)).toBe(d4);
      },
      60_000,
    );
  }
});

// ── 2. Search fingerprints ───────────────────────────────────────────────────
//
// Fixed depth, FULL_CONFIG, DEFAULT_WEIGHTS, no deadline (so the search is a
// pure fixed-depth walk — deterministic given a seeded rng), TT cleared first
// (the transposition table in ./engine is module-global — see `resetTT` — so
// leaving it warm would make a pin depend on what ran before it, which is
// exactly what engine.test.ts's own performance guard avoids the same way).
describe("search fingerprints: score, node count and best move at depth 3", () => {
  const wtf = VARIANTS.wtf;

  it("opening", () => {
    resetTT();
    const r = pickMove(initialState(), wtf, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(-14.5);
    expect(r.nodes).toBe(992);
    expect(r.depth).toBe(3);
    expect(r.move).toEqual({ from: { row: 0, col: 3 }, to: { row: 0, col: 2 } });
    expect(r.bestMoves).toEqual([{ from: { row: 0, col: 3 }, to: { row: 0, col: 2 } }]);
  });

  // Generated once, deterministically, and hardcoded here as a literal so the
  // fixture survives a search-core refactor unchanged: 10 plies of self-play
  // from the opening (pickMove at maxDepth 2, FULL_CONFIG, wtf, mulberry32
  // seed 42, resetTT before each ply), attackers to move next.
  it("midgame (10 plies of deterministic self-play from the opening)", () => {
    const b = empty();
    b[0][2] = "attacker";
    b[1][4] = "attacker";
    b[2][0] = "defender";
    b[2][5] = "king";
    b[3][1] = "attacker";
    b[3][4] = "attacker";
    b[3][6] = "attacker";
    b[4][0] = "defender";
    b[5][3] = "attacker";
    b[6][3] = "attacker";
    resetTT();
    const r = pickMove(stateOf(b, "attackers"), wtf, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(92.75);
    expect(r.nodes).toBe(9883);
    expect(r.depth).toBe(3);
    expect(r.move).toEqual({ from: { row: 5, col: 3 }, to: { row: 5, col: 5 } });
    expect(r.bestMoves).toEqual([
      { from: { row: 3, col: 1 }, to: { row: 3, col: 0 } },
      { from: { row: 3, col: 4 }, to: { row: 5, col: 4 } },
      { from: { row: 5, col: 3 }, to: { row: 5, col: 5 } },
      { from: { row: 1, col: 4 }, to: { row: 1, col: 0 } },
      { from: { row: 6, col: 3 }, to: { row: 6, col: 5 } },
    ]);
  });

  // Tactical position reused from engine.test.ts's "plays the winning move
  // when the king can escape in one" — a proven mate-in-one, so iterative
  // deepening stops at depth 1 (a decisive score at a shallower depth is
  // already the true answer; see chooseMove/pickMove's root loop) even though
  // maxDepth asks for 3. Pinning `r.depth === 1` here is pinning that
  // short-circuit, not a mistake.
  it("tactical: king escapes to a corner in one move", () => {
    const b = empty();
    b[0][3] = "king";
    b[3][0] = "attacker";
    b[3][6] = "attacker";
    b[6][3] = "attacker";
    resetTT();
    const r = pickMove(stateOf(b, "defenders"), wtf, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(-1_000_000);
    expect(r.nodes).toBe(15);
    expect(r.depth).toBe(1);
    expect(r.move).toEqual({ from: { row: 0, col: 3 }, to: { row: 0, col: 0 } });
    expect(r.bestMoves).toEqual([{ from: { row: 0, col: 3 }, to: { row: 0, col: 0 } }]);
  });
});
