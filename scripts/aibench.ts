/* AI benchmark & strength check. Run: npx tsx scripts/aibench.ts
 *
 * Reports (a) depth reached vs wall-clock for the new search, to size the "hard"
 * time budget, and (b) self-play results of the new search vs the legacy search
 * to confirm the rewrite actually plays stronger. Deterministic (seeded RNG,
 * fixed-depth self-play) so runs are comparable. */
import {
  FULL_CONFIG,
  LEGACY_CONFIG,
  pickMove,
  resetTT,
  type SearchConfig,
} from "../src/game/ai";
import { applyMove, initialState, isGameOver, winnerOf } from "../src/game/engine";
import type { GameState, Side } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const rules = VARIANTS.wtf;

/** Deterministic PRNG (mulberry32) so benchmark runs are reproducible. */
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

// ── (a) Depth vs time on a few positions ──────────────────────────────────────
console.log("── Depth reached vs time budget (new search) ──");
for (const ms of [200, 400, 700, 1000]) {
  resetTT();
  const t0 = performance.now();
  const r = pickMove(initialState(), rules, { maxDepth: 64, deadlineMs: ms }, FULL_CONFIG, Math.random);
  const dt = performance.now() - t0;
  console.log(`  budget ${String(ms).padStart(4)}ms → depth ${r.depth}, ${r.nodes} nodes, ${dt.toFixed(0)}ms actual`);
}

console.log("\n── Fixed-depth timing (opening position) ──");
for (const d of [3, 4, 5]) {
  for (const [label, cfg] of [["legacy", LEGACY_CONFIG], ["new", FULL_CONFIG]] as [string, SearchConfig][]) {
    resetTT();
    const t0 = performance.now();
    const r = pickMove(initialState(), rules, { maxDepth: d }, cfg, Math.random);
    const dt = performance.now() - t0;
    console.log(`  depth ${d} ${label.padEnd(6)} → ${String(r.nodes).padStart(9)} nodes, ${dt.toFixed(0).padStart(5)}ms`);
  }
}

// ── (b) Self-play: new vs legacy ──────────────────────────────────────────────
function playGame(
  attackerCfg: SearchConfig,
  defenderCfg: SearchConfig,
  depth: number,
  seed: number,
): { winner: Side | "draw" | null; plies: number } {
  const rngA = mulberry32(seed * 2 + 1);
  const rngD = mulberry32(seed * 2 + 2);
  let state: GameState = initialState();
  let plies = 0;
  const MAX_PLIES = 200;
  while (!isGameOver(state.status) && plies < MAX_PLIES) {
    const attackerTurn = state.turn === "attackers";
    const cfg = attackerTurn ? attackerCfg : defenderCfg;
    const rng = attackerTurn ? rngA : rngD;
    resetTT();
    const { move } = pickMove(state, rules, { maxDepth: depth }, cfg, rng);
    if (!move) break;
    state = applyMove(state, move, rules);
    plies++;
  }
  return { winner: isGameOver(state.status) ? winnerOf(state.status) : null, plies };
}

function series(label: string, newAsAttacker: boolean, depth: number, games: number): void {
  let newWins = 0;
  let legacyWins = 0;
  let other = 0;
  for (let i = 0; i < games; i++) {
    const w = playGame(
      newAsAttacker ? FULL_CONFIG : LEGACY_CONFIG,
      newAsAttacker ? LEGACY_CONFIG : FULL_CONFIG,
      depth,
      i + 1,
    ).winner;
    const newSide: Side = newAsAttacker ? "attackers" : "defenders";
    if (w === newSide) newWins++;
    else if (w === "attackers" || w === "defenders") legacyWins++;
    else other++;
  }
  console.log(`  ${label}: new ${newWins} — legacy ${legacyWins} — draw/none ${other}  (of ${games})`);
}

console.log("\n── Self-play: new (depth 3+quiescence+TT) vs legacy (depth 3) ──");
const GAMES = 12;
series("new plays attackers", true, 3, GAMES);
series("new plays defenders", false, 3, GAMES);
