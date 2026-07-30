/* Calibrate the annotation bands in src/game/annotate.ts. Run: npx tsx scripts/annotate-calibrate.ts
 *
 * Chess centipawn bands do not transfer here. This engine's `evaluate` is not
 * pawn-scaled (material is 40/piece, escapeLane 120), and a 7x7 board swings
 * hard — one capture can be a fifth of the material on it — so bands borrowed
 * from Lichess would either flag every move or none. These are picked from the
 * measured distribution of per-move loss in seeded self-play instead.
 *
 * Re-run this if DEFAULT_WEIGHTS ever changes: bands calibrated against a
 * different evaluation are bands that mean nothing. Deterministic (seeded). */
import { DEFAULT_WEIGHTS, chooseMove, pickMove, resetTT } from "../src/game/ai";
import { allMoves, applyMove, initialState, isGameOver } from "../src/game/engine";
import { DEFAULT_VARIANT, VARIANTS } from "../src/game/variants";
import { lossFor } from "../src/game/annotate";

const rules = VARIANTS[DEFAULT_VARIANT];
const GAMES = Number(process.env.GAMES ?? 40);
const DEPTH = Number(process.env.DEPTH ?? 3);
const MAX_PLIES = 60;

let seed = 12345;
const rng = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const scoreOf = (state: ReturnType<typeof initialState>): number =>
  pickMove(state, rules, { maxDepth: DEPTH }, undefined, rng, DEFAULT_WEIGHTS).score;

const losses: number[] = [];
let plies = 0;

for (let g = 0; g < GAMES; g++) {
  resetTT();
  let state = initialState();
  let before = scoreOf(state);
  for (let p = 0; p < MAX_PLIES && !isGameOver(state.status); p++) {
    const legal = allMoves(state.board, state.turn, rules);
    if (!legal.length) break;
    const mover = state.turn;
    // Mostly best play, sometimes a random legal move — the random ones are what
    // produce the errors this is trying to measure the size of.
    const move =
      rng() < 0.25 ? legal[Math.floor(rng() * legal.length)] : chooseMove(state, "medium", rules, rng);
    if (!move) break;
    state = applyMove(state, move, rules);
    const after = scoreOf(state);
    // Ignore positions best play has already decided; those are not judgements
    // about a move, and `classify` suppresses them for the same reason.
    if (Math.abs(before) < 999_000 && Math.abs(after) < 999_000) {
      const loss = lossFor(before, after, mover);
      if (loss > 0) losses.push(loss);
    }
    before = after;
    plies++;
  }
  process.stdout.write(`\rgame ${g + 1}/${GAMES} · ${plies} plies · ${losses.length} losing moves`);
}

losses.sort((a, b) => a - b);
const pct = (p: number): number => losses[Math.min(losses.length - 1, Math.floor((p / 100) * losses.length))];
console.log("\n");
console.log(`plies sampled:   ${plies}`);
console.log(`moves that lost: ${losses.length} (${((100 * losses.length) / plies).toFixed(1)}% of plies)`);
for (const p of [50, 60, 70, 75, 80, 85, 90, 95, 99]) {
  console.log(`  p${String(p).padStart(2)}: ${pct(p)}`);
}
console.log(`max:             ${losses[losses.length - 1]}`);
