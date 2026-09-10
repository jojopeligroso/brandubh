// ── Search invariants: Nine Men's Morris ─────────────────────────────────────
//
// The witnesses a later change has to survive. Two kinds live here, for the two
// kinds of mistake this engine can make silently:
//
//  1. **Move generation.** Perft counts, pinned. A generator bug does not crash —
//     it plays a slightly different game, forever, and every other test in the
//     directory keeps passing because they all ask the generator what is legal.
//  2. **Search agreement.** An alpha-beta search with a transposition table,
//     killers, a history heuristic and mate-distance scoring must return *exactly*
//     the value a plain minimax returns over the same tree. Each of those four is
//     an optimisation, and an optimisation that changes the answer is a bug. The
//     oracle here is a fourteen-line negamax with no pruning of any kind, sharing
//     nothing with the search but the leaf evaluation.
//
// The same role `../copenhagen/searchInvariants.test.ts` plays for the 11×11 board,
// and the same discipline: byte-exact pins, deliberately, so a refactor that
// changes behaviour even slightly fails on purpose.
import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, FULL_CONFIG, LEGACY_CONFIG, evaluateAtPly, pickMove, resetTT } from "./engine";
import { perft, perftDivide } from "./perft";
import { allMoves, applyMove, initialState, moveName, pointIndex } from "./rules";
import { POINT_COUNT, type Board, type Cell, type GameState, type Side } from "./types";
import { VARIANTS, VISIBLE_VARIANTS, type MorrisRuleSet } from "./variants";

// This project has no @types/node dependency (tsconfig's `lib` is browser-only:
// ES2020 + DOM), so `process` has no ambient type anywhere else in `src`. This file
// runs under vitest's Node environment, where `process.env` genuinely exists at
// runtime — the minimal ambient declaration below types exactly that, rather than
// pulling in all of @types/node for one env read.
declare const process: { env: Record<string, string | undefined> };

const gasser = VARIANTS["morris-gasser-1"];
const p = pointIndex;
const fixed = () => 0.5;

function stateOf(white: string[], black: string[], turn: Side, hands = { white: 0, black: 0 }): GameState {
  const board = Array<Cell>(POINT_COUNT).fill(0) as Cell[];
  for (const n of white) board[p(n)] = 1;
  for (const n of black) board[p(n)] = 2;
  return { board: board as Board, turn, inHand: hands, status: "playing", history: [], sinceMill: 0 };
}

// ── 1. Perft ──────────────────────────────────────────────────────────────────
//
// ⚠ PINNED TABLE. Re-pin only after a rule change you can name; a diff here that
// is not traceable to a named rule change is a move-generation regression.
//
// Every number has a closed form, which is unusual and worth having. Nobody can
// close a mill before their third stone is on the board, and White's third stone
// lands on ply 5, so the first four plies are pure "place anywhere":
//
//     d1 = 24                  d3 = 24·23·22      = 12,144
//     d2 = 24·23 = 552         d4 = 24·23·22·21   = 255,024
//
// Depth 5 is where the game's structure first appears. The mill-free count would be
// 24·23·22·21·20 = 5,100,480; the excess is exactly the sequences in which White's
// three stones form a mill, each of which branches over the two Black stones
// available to take instead of not branching at all:
//
//     16 mills × 3! orderings of White's three placements × 21·20 ordered Black
//     placements on the remaining points = 40,320 extra leaves
//     5,100,480 + 40,320 = 5,140,800   ✓ (neither Black stone can be in a mill
//                                         with only two on the board, so each such
//                                         sequence branches 2-for-1 and no more)
//
// Depth 5 is gated behind PERFT_DEEP (~7s): `PERFT_DEEP=1 npx vitest run
// src/game/morris/searchInvariants.test.ts`. Depth 6 is 99,274,176 leaves (~2
// minutes) and is recorded here rather than run at all.
const PERFT_TABLE: Record<string, { d1: number; d2: number; d3: number; d4: number; d5: number }> = {
  "morris-gasser-1": { d1: 24, d2: 552, d3: 12_144, d4: 255_024, d5: 5_140_800 },
};

describe("perft: legal-move-tree leaf counts from the opening, per shipped preset", () => {
  it("VISIBLE_VARIANTS matches the pinned table's keys (no preset silently added or removed)", () => {
    expect(new Set(VISIBLE_VARIANTS)).toEqual(new Set(Object.keys(PERFT_TABLE)));
  });

  for (const [key, { d1, d2, d3, d4 }] of Object.entries(PERFT_TABLE)) {
    it(`${key}: depths 1-4`, () => {
      const rules: MorrisRuleSet = VARIANTS[key];
      const s = initialState(rules);
      expect(perft(s, rules, 1)).toBe(d1);
      expect(perft(s, rules, 2)).toBe(d2);
      expect(perft(s, rules, 3)).toBe(d3);
      expect(perft(s, rules, 4)).toBe(d4);
    }, 60_000);
  }

  for (const [key, { d5 }] of Object.entries(PERFT_TABLE)) {
    it.skipIf(!process.env.PERFT_DEEP)(
      `${key}: depth 5 [PERFT_DEEP] — the first ply a mill can be closed on`,
      () => {
        const rules: MorrisRuleSet = VARIANTS[key];
        expect(perft(initialState(rules), rules, 5)).toBe(d5);
        // And the closed form above, spelled out.
        expect(24 * 23 * 22 * 21 * 20 + 16 * 6 * 21 * 20).toBe(d5);
      },
      120_000,
    );
  }

  it("divides evenly over the symmetric opening, which is how a future bug localises", () => {
    const rows = perftDivide(initialState(gasser), gasser, 3);
    expect(rows).toHaveLength(24);
    expect(rows.every((r) => r.nodes === 23 * 22)).toBe(true);
    expect(rows.reduce((n, r) => n + r.nodes, 0)).toBe(PERFT_TABLE["morris-gasser-1"].d3);
  });

  it("counts a decided position as one leaf, however deep it is asked", () => {
    // A won game has no more plies to play out, so perft must not expand it.
    const won = stateOf(["a7", "d7", "g4", "f4"], ["c5", "e5", "e3"], "white");
    const after = applyMove(won, { from: p("g4"), to: p("g7"), remove: p("e5") }, gasser);
    expect(after.status).toBe("white_win_stones");
    expect(perft(after, gasser, 5)).toBe(1);
  });
});

// ── 2. Alpha-beta agrees with plain minimax ───────────────────────────────────

/** Negamax with no pruning, no table, no ordering — the oracle. Shares only
 *  `evaluateAtPly` with the engine under test. */
function plainNegamax(state: GameState, rules: MorrisRuleSet, depth: number, ply: number): number {
  if (state.status !== "playing" || depth === 0) return evaluateAtPly(state, ply, DEFAULT_WEIGHTS, rules);
  let best = -Infinity;
  for (const m of allMoves(state, rules)) {
    const v = -plainNegamax(applyMove(state, m, rules), rules, depth - 1, ply + 1);
    if (v > best) best = v;
  }
  return best;
}

const POSITIONS: Array<[string, GameState]> = [
  ["opening", initialState(gasser)],
  [
    "mid-placing, mills available to both sides",
    stateOf(["a7", "d7", "b6"], ["c5", "e5", "a1"], "white", { white: 6, black: 6 }),
  ],
  [
    "moving phase, sliding only",
    stateOf(["a7", "g7", "g1", "a1", "d6"], ["c5", "e5", "e3", "c3", "b4"], "black"),
  ],
  ["a mill-closing win in one", stateOf(["a7", "d7", "g4", "f4"], ["c5", "e5", "e3"], "white")],
  ["a blocking defence", stateOf(["a4", "f4", "d3", "c3"], ["b2", "b6", "c4", "e3"], "white")],
];

describe("the search returns the minimax value", () => {
  it.each(POSITIONS)("%s: depth 3, pruning off and on, equals plain minimax", (_label, s) => {
    const truth = plainNegamax(s, gasser, 3, 0);

    resetTT();
    const legacy = pickMove(s, gasser, { maxDepth: 3 }, LEGACY_CONFIG, fixed);
    expect(legacy.score, "no machinery at all").toBe(truth);

    resetTT();
    const noTT = pickMove(s, gasser, { maxDepth: 3 }, { ...FULL_CONFIG, useTT: false }, fixed);
    expect(noTT.score, "ordering + killers + history, no table").toBe(truth);

    resetTT();
    const full = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, fixed);
    expect(full.score, "the shipped configuration").toBe(truth);
  }, 60_000);

  it("keeps agreeing at depth 4 on the positions that are cheap enough to check", () => {
    for (const [label, s] of POSITIONS.slice(2)) {
      const truth = plainNegamax(s, gasser, 4, 0);
      resetTT();
      expect(pickMove(s, gasser, { maxDepth: 4 }, FULL_CONFIG, fixed).score, label).toBe(truth);
    }
  }, 60_000);

  it("gives the same score with the table on and off, from a warmed table too", () => {
    // The second `pickMove` on the same position reads entries the first one wrote,
    // which is the case a naive depth-or-bound check gets wrong.
    for (const [label, s] of POSITIONS) {
      resetTT();
      const cold = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, fixed);
      const warm = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, fixed);
      expect(warm.score, label).toBe(cold.score);
      resetTT();
      const off = pickMove(s, gasser, { maxDepth: 3 }, { ...FULL_CONFIG, useTT: false }, fixed);
      expect(off.score, label).toBe(cold.score);
    }
  }, 60_000);
});

// ── 3. Search fingerprints ────────────────────────────────────────────────────
//
// Fixed depth, FULL_CONFIG, DEFAULT_WEIGHTS, no deadline — deterministic. The table
// is cleared first (it is module state — see `resetTT`). These are the pins that
// make an accidental behaviour change visible; re-pin only with a reason.

describe("search fingerprints: score, node count and chosen move", () => {
  it("opening at depth 3", () => {
    resetTT();
    const r = pickMove(initialState(gasser), gasser, { maxDepth: 3 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(12);
    expect(r.nodes).toBe(377);
    expect(r.depth).toBe(3);
    // Four root moves survive symmetry folding and all four tie, so the pick is
    // `rng()`'s — 0.5 of four is the third.
    expect(r.bestMoves.map(moveName)).toEqual(["a7", "d7", "b6", "d6"]);
    expect(moveName(r.move!)).toBe("b6");
  });

  it("opening at depth 4", () => {
    resetTT();
    const r = pickMove(initialState(gasser), gasser, { maxDepth: 4 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(0);
    expect(r.nodes).toBe(2063);
    expect(r.depth).toBe(4);
    expect(moveName(r.move!)).toBe("d6");
  });

  it("a tactical win in one stops at depth 1", () => {
    const s = stateOf(["a7", "d7", "g4", "f4"], ["c5", "e5", "e3"], "white");
    resetTT();
    const r = pickMove(s, gasser, { maxDepth: 6 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS);
    expect(r.score).toBe(999_999);
    expect(r.depth).toBe(1);
    expect(r.nodes).toBe(10);
    expect(moveName(r.move!)).toBe("g4-g7xe5");
  });
});
