/* Evaluation A/B gauntlet. Run: npx tsx scripts/evaltune.ts
 *
 * Each candidate weight-set plays FULL-search games against the DEFAULT_WEIGHTS
 * baseline, at a fixed depth (so results isolate eval quality, not speed), on
 * both sides, over seeded games. Deterministic.
 *
 * Findings for Brandubh (WTF): no candidate beat the baseline at real depths.
 * mobility won at depth 2 (11-5) but was even by depth 3 and costs ~2x per node;
 * shield and liberties were worse; blocker-aware king distance was neutral. So
 * DEFAULT_WEIGHTS ships as-is. Re-run this when adding a variant (e.g. Tablut) —
 * the balance there may favour different terms. */
import { DEFAULT_WEIGHTS, FULL_CONFIG, pickMove, resetTT, type EvalWeights } from "../src/game/ai";
import { applyMove, initialState, isGameOver, winnerOf } from "../src/game/engine";
import type { GameState, Side } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const rules = VARIANTS.wtf;
const DEPTH = 2;
const GAMES_PER_SIDE = 8;

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

function playGame(atkW: EvalWeights, defW: EvalWeights, seed: number): Side | "draw" | null {
  const rngA = mulberry32(seed * 2 + 1);
  const rngD = mulberry32(seed * 2 + 2);
  let s: GameState = initialState();
  let plies = 0;
  while (!isGameOver(s.status) && plies < 200) {
    const atk = s.turn === "attackers";
    resetTT();
    const { move } = pickMove(s, rules, { maxDepth: DEPTH }, FULL_CONFIG, atk ? rngA : rngD, atk ? atkW : defW);
    if (!move) break;
    s = applyMove(s, move, rules);
    plies++;
  }
  return isGameOver(s.status) ? winnerOf(s.status) : null;
}

/** Candidate plays both sides vs baseline; returns wins/losses/draws for candidate. */
function gauntlet(cand: EvalWeights): { w: number; l: number; d: number } {
  let w = 0, l = 0, d = 0;
  const tally = (winner: Side | "draw" | null, candSide: Side) => {
    if (winner === candSide) w++;
    else if (winner === "attackers" || winner === "defenders") l++;
    else d++;
  };
  for (let i = 0; i < GAMES_PER_SIDE; i++) tally(playGame(cand, DEFAULT_WEIGHTS, i + 1), "attackers");
  for (let i = 0; i < GAMES_PER_SIDE; i++) tally(playGame(DEFAULT_WEIGHTS, cand, i + 500), "defenders");
  return { w, l, d };
}

const candidates: Array<[string, EvalWeights]> = [
  ["blocker-aware kingDist", { ...DEFAULT_WEIGHTS, blockerAwareKingDist: true }],
  ["shield 20", { ...DEFAULT_WEIGHTS, shield: 20 }],
  ["liberties 12", { ...DEFAULT_WEIGHTS, liberties: 12 }],
  ["mobility 3", { ...DEFAULT_WEIGHTS, mobility: 3 }],
];

console.log(`Eval gauntlet vs DEFAULT (FULL search, depth ${DEPTH}, ${GAMES_PER_SIDE * 2} games each)`);
console.log("candidate                    W-L-D   (of " + GAMES_PER_SIDE * 2 + ")");
for (const [name, w] of candidates) {
  const r = gauntlet(w);
  const verdict = r.w > r.l ? "  ✓ better" : r.w < r.l ? "  ✗ worse" : "  = even";
  console.log(`  ${name.padEnd(26)} ${r.w}-${r.l}-${r.d}${verdict}`);
}
