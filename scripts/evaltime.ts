/* Recognizer cost/benefit under a real time budget.
 *   npx tsx scripts/evaltime.ts [rounds]        (default 7)
 *
 * WHY THIS EXISTS, AND WHY evaltune.ts CANNOT ANSWER THE SAME QUESTION
 *
 * The open question is the ⚠ on `EvalWeights.endgameRecognizers`: it ships ON
 * at a measured ~4.7x throughput cost in a corner endgame, while
 * `attackerRecognizer` ships OFF for play at ~7%, and on cost alone those two
 * defaults look inconsistent.
 *
 * evaltune.ts is the wrong instrument for it, twice over. Its candidate list
 * does not contain either recognizer flag, so running it verbatim answers a
 * different question entirely. And it fixes depth *on purpose* — "so results
 * isolate eval quality, not speed" — while the recognizers' entire cost IS
 * speed. Fixed-depth self-play already measured them neutral (24-24 at depth
 * 3, 16-16 at depth 5, recorded above RECOGNIZED_WIN in engine.ts), so a
 * fixed-depth gauntlet reports "even" close to by construction.
 *
 * What actually decides the flag is what the app does: iterative deepening
 * against ANALYSIS_LIMITS' 1200ms deadline. A recognizer earns its cost if the
 * search still reaches the depth that finds the win inside the budget, and
 * loses if the cost drops it a ply. That is a wall-clock question, so this
 * measures wall clock, and measuring wall clock on a shared machine is where
 * benchmarks go wrong.
 *
 * METHOD
 *
 * Three defences against a busy box, because a single A-then-B run on this
 * machine has already produced one convincing false regression:
 *
 *  - INTERLEAVED. Every config is measured once per round, rotating the order
 *    each round, so a load spike lands on all configs rather than on whichever
 *    happened to run during it. Never all-of-A then all-of-B.
 *  - MINIMUM OF N, not mean. Load can only ever make a run slower, so the
 *    fastest observed run is the closest estimate of the true cost. A mean
 *    reports the machine's mood; the median is shown only as a spread cue.
 *  - NODES ALONGSIDE MILLISECONDS. At fixed depth the node count is exactly
 *    deterministic, so it pins down what *kind* of cost is being paid. Expect
 *    the two to DISAGREE here: a recognizer is per-leaf evaluation work, so it
 *    barely moves the tree shape. Node ratio ~1.00 against a time ratio well
 *    under 1.00 is the recognizer's cost showing up exactly where it lives,
 *    not a contaminated clock. (An earlier version of this script flagged that
 *    disagreement as noise, which had it backwards.) Contamination is detected
 *    instead by a config's own median running far above its own minimum —
 *    load makes runs slower, never faster, so a tight min-to-median spread is
 *    what a trustworthy measurement looks like.
 *
 * Two measurements, and only the first one decides anything:
 *
 *  (A) DEADLINE — the real ANALYSIS_LIMITS. Reports depth reached and whether
 *      the forced win is found. This is the decision.
 *  (B) FIXED DEPTH — no deadline, so deterministic. Quantifies the cost the
 *      ratio in the ⚠ refers to, and is the number to quote when updating it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANALYSIS_LIMITS,
  DEFAULT_WEIGHTS,
  analysePosition,
  type EvalWeights,
} from "../src/game/engine";
import { parseGame } from "../src/game/gameFile";
import { initialState } from "../src/game/rules";
import { decisiveWinner } from "../src/evalBar";
import type { GameState, RuleSet } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";

const ROUNDS = Number(process.argv[2] ?? 7);
if (!Number.isFinite(ROUNDS) || ROUNDS < 1) throw new Error("rounds must be a positive number");

// The position the eval bar got wrong, from the file that reported it. Ply 14
// is king b2 with the raiders to move; the bar must read a defender win.
const REPORTED = join(import.meta.dirname, "../local/engine-flawed-brandubh-wtf-20260808.tafl");

function reportedGame(): { states: GameState[]; rules: RuleSet } {
  const parsed = parseGame(readFileSync(REPORTED, "utf8"));
  if (!parsed.ok) throw new Error(`cannot parse ${REPORTED}: ${parsed.error.code}`);
  return { states: parsed.game.states, rules: parsed.game.rules };
}

const { states, rules } = reportedGame();
const at = (ply: number): GameState => {
  const s = states[ply];
  if (!s) throw new Error(`fixture has no ply ${ply} (has ${states.length - 1})`);
  return s;
};

// Opening first on purpose: it is the case where the escape-zone gate bails in
// O(1) at nearly every leaf, which is where the old "free, 69k nodes/s both
// ways" figure came from. Keeping it in the table next to the endgame is what
// makes the difference between the two visible rather than arguable.
const POSITIONS: Array<[string, GameState, RuleSet]> = [
  ["opening (gate bails)", initialState(), VARIANTS.wtf],
  ["midgame ply 8", at(8), rules],
  ["endgame ply 12", at(12), rules],
  ["endgame ply 14 (reported)", at(14), rules],
];

// DEFAULT_WEIGHTS is the shipping play config: endgame ON, attacker OFF.
// "both on" is what ANALYSIS_WEIGHTS already ships for analysis, so it is a
// real config rather than a hypothetical one.
const CONFIGS: Array<[string, EvalWeights]> = [
  ["baseline (endgame ON, attacker OFF)", DEFAULT_WEIGHTS],
  ["endgame OFF, attacker OFF", { ...DEFAULT_WEIGHTS, endgameRecognizers: false, attackerRecognizer: false }],
  ["endgame OFF, attacker ON", { ...DEFAULT_WEIGHTS, endgameRecognizers: false, attackerRecognizer: true }],
  ["endgame ON, attacker ON", { ...DEFAULT_WEIGHTS, attackerRecognizer: true }],
];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pad = (s: string, n: number) => s.padEnd(n);

// A cold JS context reaches a shallower depth than a warm one — the handoff's
// "cold first analyse can land at depth 2 instead of 3". Warm every config on
// every position before recording anything, or round 1 measures the JIT.
process.stdout.write("warming up...");
for (const [, state, ruleset] of POSITIONS) {
  for (const [, weights] of CONFIGS) {
    analysePosition(state, ruleset, { maxDepth: ANALYSIS_LIMITS.maxDepth }, weights);
  }
}
console.log(" done\n");

console.log("═══ (A) DEADLINE: real ANALYSIS_LIMITS (maxDepth 4, 1200ms) ═══");
console.log("What the app actually runs. Depth reached, and whether the forced");
console.log("win is found. This is the measurement that decides the flag.\n");

for (const [posName, state, ruleset] of POSITIONS) {
  console.log(`  ${posName}`);
  const results = new Map<string, { depths: number[]; verdicts: string[]; scores: number[] }>();
  for (const [name] of CONFIGS) results.set(name, { depths: [], verdicts: [], scores: [] });

  for (let round = 0; round < ROUNDS; round++) {
    // Rotate so no config sits in the same slot every round.
    for (let k = 0; k < CONFIGS.length; k++) {
      const [name, weights] = CONFIGS[(k + round) % CONFIGS.length];
      const info = analysePosition(state, ruleset, ANALYSIS_LIMITS, weights);
      const r = results.get(name)!;
      r.depths.push(info.depth);
      r.scores.push(info.score);
      r.verdicts.push(decisiveWinner(info.score) ?? "—");
    }
  }

  for (const [name] of CONFIGS) {
    const r = results.get(name)!;
    const depthCounts = new Map<number, number>();
    for (const d of r.depths) depthCounts.set(d, (depthCounts.get(d) ?? 0) + 1);
    const depthStr = [...depthCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `d${d}×${n}`)
      .join(" ");
    const decisive = r.verdicts.filter((v) => v !== "—");
    const verdict = decisive.length
      ? `${decisive[0]} ${decisive.length}/${ROUNDS}`
      : `none 0/${ROUNDS}`;
    console.log(`    ${pad(name, 38)} ${pad(depthStr, 18)} proven: ${verdict}`);
  }
  console.log("");
}

console.log("═══ (B) FIXED DEPTH 4: cost, deterministic, min of N ═══");
console.log("No deadline, so node counts are exact. If the node ratio and the");
console.log("time ratio disagree, the box was busy and the timing is junk.\n");

for (const [posName, state, ruleset] of POSITIONS) {
  console.log(`  ${posName}`);
  const times = new Map<string, number[]>();
  const nodes = new Map<string, number>();
  for (const [name] of CONFIGS) times.set(name, []);

  for (let round = 0; round < ROUNDS; round++) {
    for (let k = 0; k < CONFIGS.length; k++) {
      const [name, weights] = CONFIGS[(k + round) % CONFIGS.length];
      const info = analysePosition(state, ruleset, { maxDepth: 4 }, weights);
      times.get(name)!.push(info.elapsedMs);
      const seen = nodes.get(name);
      if (seen !== undefined && seen !== info.nodes) {
        console.log(`    !! ${name}: node count not deterministic (${seen} vs ${info.nodes})`);
      }
      nodes.set(name, info.nodes);
    }
  }

  const baseMin = Math.min(...times.get(CONFIGS[0][0])!);
  const baseNodes = nodes.get(CONFIGS[0][0])!;
  for (const [name] of CONFIGS) {
    const ts = times.get(name)!;
    const min = Math.min(...ts);
    const n = nodes.get(name)!;
    const timeRatio = min / baseMin;
    const nodeRatio = n / baseNodes;
    const med = median(ts);
    // Load can only slow a run down, so a median far above this config's own
    // minimum means the box was busy while it ran and the number is soft.
    // Compares a config against itself, never against another config, so a
    // genuine cost difference can never masquerade as contamination.
    const suspect = med > 1.3 * min ? `  ⚠ spread ×${(med / min).toFixed(2)}` : "";
    console.log(
      `    ${pad(name, 38)} min ${min.toFixed(0).padStart(5)}ms  med ${med.toFixed(0).padStart(5)}ms` +
        `  ${n.toString().padStart(8)} nodes  time×${timeRatio.toFixed(2)} node×${nodeRatio.toFixed(2)}${suspect}`,
    );
  }
  console.log("");
}

console.log(`rounds: ${ROUNDS}. Re-run with a different count to confirm stability.`);
