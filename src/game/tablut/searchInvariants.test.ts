// ── Search invariants: Tablut (9×9) ──────────────────────────────────────────
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
import type { TablutRuleSet } from "./variants";

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

const perftTablut = (state: GameState, rules: TablutRuleSet, depth: number): number =>
  perft(state, rules, depth, allMoves, applyMove, isGameOver);

// ── 1. Perft ──────────────────────────────────────────────────────────────────
//
// ⚠ PINNED TABLE. Re-pin only after a rule change you can name — the pending
// "Tablut first mover" review is the one flagged in the work package; a diff
// here that isn't traceable to a named rule change is a regression in move
// generation, not a re-pin.
//
// Every VISIBLE_VARIANTS preset shares initialState's `rules.firstMove`
// (defenders for all four shipped presets today), so the perft root is the
// same side-to-move for each; the trees still diverge because `tablut-corners`
// changes the escape condition and makes the corners hostile+restricted,
// which is reachable earlier here than in Brandubh (this board is bigger and
// captures/blocked-corner squares affect legal moves from the first few
// plies onward, not just win detection).
//
// Depth 4 is NOT pinned: depth 3 alone already costs ~1.6-2s per preset on an
// idle machine (measured this session), and perft's branching factor here
// (~56 legal moves at the root) means depth 4 is on the order of 50x that —
// tens of seconds per preset, well outside the "~5s per preset" budget from
// the work package. Extrapolated, not run to completion, for exactly that
// reason.
const PERFT_TABLE: Record<string, { d1: number; d2: number; d3: number }> = {
  "tablut-linnaeus": { d1: 56, d2: 4408, d3: 251856 },
  tablut: { d1: 56, d2: 4408, d3: 251856 },
  "tablut-gulo": { d1: 56, d2: 4408, d3: 251856 },
  "tablut-corners": { d1: 56, d2: 3968, d3: 225224 },
};

describe("perft: legal-move-tree node counts from the opening, per shipped preset", () => {
  it("VISIBLE_VARIANTS matches the pinned table's keys (no preset silently added or removed)", () => {
    expect(new Set(VISIBLE_VARIANTS)).toEqual(new Set(Object.keys(PERFT_TABLE)));
  });

  for (const [key, { d1, d2, d3 }] of Object.entries(PERFT_TABLE)) {
    it(
      `${key}: depths 1-3`,
      () => {
        const rules = VARIANTS[key];
        const s = initialState(rules);
        expect(perftTablut(s, rules, 1)).toBe(d1);
        expect(perftTablut(s, rules, 2)).toBe(d2);
        expect(perftTablut(s, rules, 3)).toBe(d3);
      },
      20_000,
    );
  }
});

// ── 2. Search fingerprints ───────────────────────────────────────────────────
//
// Fixed depth, FULL_CONFIG, DEFAULT_WEIGHTS, no deadline — deterministic. TT
// cleared first (module-global — see `resetTT` in ./engine).
describe("search fingerprints: score, node count and best move at depth 3", () => {
  const rules = VARIANTS["tablut-linnaeus"];

  it("opening", () => {
    resetTT();
    const r = pickMove(initialState(rules), rules, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(80);
    // 2404 as of 2026-09-09 (WP-2.0: usePVS flipped to false — see the
    // FULL_CONFIG comment and docs/reports/pvs-tablut-copenhagen.md). Was
    // 2748 under usePVS: true; score/depth/move/bestMoves are unaffected —
    // PVS is a pure search optimisation and cannot change them.
    expect(r.nodes).toBe(2404);
    expect(r.depth).toBe(3);
    expect(r.move).toEqual({ from: { row: 2, col: 4 }, to: { row: 2, col: 3 } });
    expect(r.bestMoves).toEqual([{ from: { row: 2, col: 4 }, to: { row: 2, col: 3 } }]);
  });

  // Generated once, deterministically, and hardcoded here as a literal so the
  // fixture survives a search-core refactor unchanged: 12 plies of
  // self-play from the opening (pickMove at maxDepth 2, FULL_CONFIG,
  // tablut-linnaeus, mulberry32 seed 42, resetTT before each ply). Tablut's
  // defenders move first, so after 12 plies it is defenders to move again.
  it("midgame (12 plies of deterministic self-play from the opening)", () => {
    const b = empty();
    b[0][4] = "attacker";
    b[0][5] = "attacker";
    b[1][1] = "attacker";
    b[2][1] = "defender";
    b[2][3] = "attacker";
    b[3][0] = "attacker";
    b[3][4] = "king";
    b[3][5] = "defender";
    b[3][8] = "attacker";
    b[4][0] = "attacker";
    b[4][1] = "attacker";
    b[4][2] = "attacker";
    b[4][6] = "defender";
    b[4][7] = "attacker";
    b[4][8] = "attacker";
    b[5][4] = "defender";
    b[5][8] = "attacker";
    b[6][4] = "defender";
    b[6][5] = "defender";
    b[7][4] = "attacker";
    b[8][3] = "attacker";
    b[8][4] = "attacker";
    b[8][5] = "attacker";
    resetTT();
    const r = pickMove(stateOf(b, "defenders"), rules, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(224);
    // 16157 as of 2026-09-09 (WP-2.0: usePVS flipped to false). Was 18361
    // under usePVS: true; score/depth/move/bestMoves unaffected.
    expect(r.nodes).toBe(16157);
    expect(r.depth).toBe(3);
    expect(r.move).toEqual({ from: { row: 5, col: 4 }, to: { row: 5, col: 7 } });
    expect(r.bestMoves).toEqual([{ from: { row: 5, col: 4 }, to: { row: 5, col: 7 } }]);
  });

  // Tactical position reused from engine.test.ts's "takes a king capture that
  // is one move away" — a proven mate-in-one, so iterative deepening stops at
  // depth 1 even though maxDepth asks for 3 (a decisive score found at a
  // shallower depth is already the true answer).
  it("tactical: king capture in one move", () => {
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][7] = "attacker";
    resetTT();
    const r = pickMove(stateOf(b, "attackers"), rules, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(1_000_000);
    expect(r.nodes).toBe(85);
    expect(r.depth).toBe(1);
    expect(r.move).toEqual({ from: { row: 3, col: 7 }, to: { row: 3, col: 4 } });
    expect(r.bestMoves).toEqual([{ from: { row: 3, col: 7 }, to: { row: 3, col: 4 } }]);
  });
});

// ── 3. Performance guard ──────────────────────────────────────────────────────
//
// Mirrors src/game/engine.test.ts's Brandubh "performance guard": pin an upper
// node budget for a fixed-depth opening search, node count rather than
// milliseconds (another agent is running gauntlets on this machine while this
// suite is written, so a timing-based assertion would be noise). Depth 4
// chosen because it runs in well under a second even under load and clears
// the pruned search node count meaningfully above the depth-3 fingerprint
// above, giving the guard something real to catch.
describe("performance guard", () => {
  it("keeps the opening depth-4 search within a sane node budget", () => {
    const rules = VARIANTS["tablut-linnaeus"];
    resetTT();
    const r = pickMove(initialState(rules), rules, { maxDepth: 4 }, FULL_CONFIG, fixed);
    expect(r.depth).toBe(4);
    expect(r.nodes).toBeLessThan(60_000);
  });
});
