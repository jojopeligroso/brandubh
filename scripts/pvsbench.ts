/* PVS bench — settles `usePVS` on the two larger tafl boards by measurement.
 * Run: npx tsx scripts/pvsbench.ts --game <tablut|copenhagen> [--depths 3,4,5]
 *      [--ladder-positions N] [--skip-ladder]
 *
 * WHY THIS EXISTS
 * ----------------
 * Brandubh's `usePVS` (src/game/engine.ts) shipped OFF after a measured verdict:
 * "±1% nodes, identical scores at depths 5-7" (commit 4f76471). Tablut and
 * Copenhagen ship `usePVS: true` as "a considered default rather than a
 * measured one" (see the FULL_CONFIG comments in
 * src/game/tablut/engine.ts and src/game/copenhagen/engine.ts). This script
 * reproduces the same shape of measurement — equal-depth node counts, PVS on
 * vs off, score identity checked as a correctness invariant rather than a
 * result — on both boards, modelled on scripts/aibench.ts.
 *
 * WHAT IT MEASURES
 * ----------------
 * (1) Equal-depth node counts: for a set of positions (the opening, hand-built
 *     tactical fixtures lifted from this game's own engine.test.ts /
 *     searchInvariants.test.ts, and positions sampled from a deterministic
 *     seeded self-play walk), at several depths, run pickMove with PVS on and
 *     PVS off and compare. PVS is a pure search optimisation: at equal depth
 *     the SCORE must be identical between the two configs. A score mismatch is
 *     printed as a BUG, not folded into the node-ratio table.
 * (2) Wall-clock at the shipping ladder limits (`hard`, `ollamh`): same
 *     positions, PVS on vs off, deadline-bound search — reports depth reached
 *     and elapsed ms. Since (1) guarantees PVS cannot change the score at a
 *     given depth, its only possible strength effect is reaching deeper before
 *     the clock runs out, which this measures directly.
 *
 * The `hard`/`ollamh` limits below are copied literals, not imports: the
 * `DIFFICULTY` table in each engine.ts is module-local (not exported). Copied
 * from src/game/tablut/engine.ts and src/game/copenhagen/engine.ts as of
 * 2026-09-09 — both boards currently share the same numbers:
 *   hard:   { maxDepth: 6,  deadlineMs: 3000, minDepth: 3 }
 *   ollamh: { maxDepth: 12, deadlineMs: 8000, minDepth: 4 }
 */
import * as TablutEngine from "../src/game/tablut/engine";
import * as TablutRules from "../src/game/tablut/rules";
import { VARIANTS as TABLUT_VARIANTS, DEFAULT_VARIANT as TABLUT_DEFAULT_VARIANT } from "../src/game/tablut/variants";
import { BOARD_SIZE as TABLUT_BOARD_SIZE, type Board as TablutBoard, type GameState as TablutState, type Piece as TablutPiece, type Side as TablutSide } from "../src/game/tablut/types";

import * as CopenhagenEngine from "../src/game/copenhagen/engine";
import * as CopenhagenRules from "../src/game/copenhagen/rules";
import { VARIANTS as COPENHAGEN_VARIANTS, DEFAULT_VARIANT as COPENHAGEN_DEFAULT_VARIANT } from "../src/game/copenhagen/variants";
import { BOARD_SIZE as COPENHAGEN_BOARD_SIZE, type Board as CopenhagenBoard, type GameState as CopenhagenState, type Piece as CopenhagenPiece, type Side as CopenhagenSide } from "../src/game/copenhagen/types";

// ── deterministic PRNG (mulberry32, as in aibench.ts/pairgauntlet.ts) ───────
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

// ── generic shape the rest of this file works through ──────────────────────
interface SearchLimitsLike {
  maxDepth: number;
  deadlineMs?: number;
  minDepth?: number;
}
interface SearchResultLike {
  move: unknown;
  score: number;
  depth: number;
  nodes: number;
}
interface Position {
  label: string;
  state: unknown;
}
interface GameApi {
  game: "tablut" | "copenhagen";
  rulesId: string;
  rules: unknown;
  FULL_CONFIG: Record<string, unknown>;
  DEFAULT_WEIGHTS: unknown;
  initialState: () => unknown;
  isGameOver: (status: string) => boolean;
  resetTT: () => void;
  pickMove: (
    state: unknown,
    rules: unknown,
    limits: SearchLimitsLike,
    config: Record<string, unknown>,
    rng: () => number,
    weights?: unknown,
  ) => SearchResultLike;
  fixtures: Position[];
}

// ── medium/hard/ollamh ladder limits — copied literals, see file header ────
// `medium` added 2026-09-09: on Copenhagen the owner has decided `hard` and
// `ollamh` stay disabled in the UI until the app has a backend, so on that
// board `medium`'s 2500ms deadline is the one budget a player can actually
// hit today. Reported for both boards for a like-for-like table, but see
// "which tiers are reachable" in the report for which one matters where.
const MEDIUM: SearchLimitsLike = { maxDepth: 3, deadlineMs: 2500 };
const HARD: SearchLimitsLike = { maxDepth: 6, deadlineMs: 3000, minDepth: 3 };
const OLLAMH: SearchLimitsLike = { maxDepth: 12, deadlineMs: 8000, minDepth: 4 };

// ── Tablut adapter ───────────────────────────────────────────────────────────
function tablutFixtures(): Position[] {
  const rules = TABLUT_VARIANTS[TABLUT_DEFAULT_VARIANT];
  const empty = (): TablutBoard =>
    Array.from({ length: TABLUT_BOARD_SIZE }, () => Array<TablutPiece | null>(TABLUT_BOARD_SIZE).fill(null));
  const stateOf = (b: TablutBoard, turn: TablutSide): TablutState => ({
    board: b,
    turn,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
    sinceCapture: 0,
  });

  const fixtures: Position[] = [];
  fixtures.push({ label: "opening", state: TablutRules.initialState(rules) });

  // "midgame (12 plies of deterministic self-play)" — reused verbatim from
  // src/game/tablut/searchInvariants.test.ts.
  {
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
    fixtures.push({ label: "midgame-fixture (searchInvariants, 12-ply self-play)", state: stateOf(b, "defenders") });
  }

  // "tactical: king capture in one move" — engine.test.ts / searchInvariants.test.ts.
  {
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][7] = "attacker";
    fixtures.push({ label: "tactical: king capture in one move", state: stateOf(b, "attackers") });
  }

  // "takes an escape that is one move away" — engine.test.ts.
  {
    const b = empty();
    b[4][4] = "king";
    b[8][8] = "attacker";
    fixtures.push({ label: "tactical: escape one move away", state: stateOf(b, "defenders") });
  }

  // "returns a decisive score for a proven two-lane fork" — engine.test.ts.
  {
    const b = empty();
    b[3][3] = "king";
    b[6][0] = "attacker";
    b[6][8] = "attacker";
    fixtures.push({ label: "tactical: two-lane fork", state: stateOf(b, "attackers") });
  }

  // "does not walk the king into a capture when it has a safe move" — engine.test.ts.
  {
    const b = empty();
    b[3][3] = "king";
    b[2][4] = "attacker";
    b[4][4] = "attacker";
    b[0][5] = "attacker";
    fixtures.push({ label: "tactical: king must dodge a capture", state: stateOf(b, "defenders") });
  }

  return fixtures;
}

const tablutAdapter: GameApi = {
  game: "tablut",
  rulesId: TABLUT_VARIANTS[TABLUT_DEFAULT_VARIANT].id,
  rules: TABLUT_VARIANTS[TABLUT_DEFAULT_VARIANT],
  FULL_CONFIG: TablutEngine.FULL_CONFIG as unknown as Record<string, unknown>,
  DEFAULT_WEIGHTS: TablutEngine.DEFAULT_WEIGHTS,
  initialState: () => TablutRules.initialState(TABLUT_VARIANTS[TABLUT_DEFAULT_VARIANT]),
  isGameOver: (status) => TablutRules.isGameOver(status as never),
  resetTT: () => TablutEngine.resetTT(),
  pickMove: (state, rules, limits, config, rng, weights) =>
    TablutEngine.pickMove(state as never, rules as never, limits, config as never, rng, weights as never),
  fixtures: tablutFixtures(),
};

// ── Copenhagen adapter ───────────────────────────────────────────────────────
function copenhagenFixtures(): Position[] {
  const rules = COPENHAGEN_VARIANTS[COPENHAGEN_DEFAULT_VARIANT];
  const empty = (): CopenhagenBoard =>
    Array.from({ length: COPENHAGEN_BOARD_SIZE }, () => Array<CopenhagenPiece | null>(COPENHAGEN_BOARD_SIZE).fill(null));
  const stateOf = (b: CopenhagenBoard, turn: CopenhagenSide): CopenhagenState => ({
    board: b,
    turn,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
    sinceCapture: 0,
  });

  const fixtures: Position[] = [];
  fixtures.push({ label: "opening", state: CopenhagenRules.initialState(rules) });

  // "midgame (12 plies of deterministic self-play)" — reused verbatim from
  // src/game/copenhagen/searchInvariants.test.ts.
  {
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
    fixtures.push({ label: "midgame-fixture (searchInvariants, 12-ply self-play)", state: stateOf(b, "attackers") });
  }

  // "tactical: king capture in one move, against a strong king" — searchInvariants.test.ts.
  {
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    b[3][9] = "attacker";
    fixtures.push({ label: "tactical: king capture in one move (strong king)", state: stateOf(b, "attackers") });
  }

  // "takes the escape when the king has one in hand" — engine.test.ts.
  {
    const b = empty();
    b[0][5] = "king";
    b[7][7] = "attacker";
    fixtures.push({ label: "tactical: escape in hand", state: stateOf(b, "defenders") });
  }

  // "completes an exit fort one move away, as defenders" — engine.test.ts.
  {
    const b = empty();
    b[0][4] = "defender";
    b[0][5] = "king";
    b[0][7] = "defender";
    b[1][4] = "defender";
    b[1][7] = "defender";
    b[2][5] = "defender";
    b[4][6] = "defender";
    b[10][2] = "attacker";
    fixtures.push({ label: "tactical: exit fort one move away", state: stateOf(b, "defenders") });
  }

  // "closes a shieldwall capture one move away, as raiders" — engine.test.ts.
  {
    const b = empty();
    b[0][4] = "defender";
    b[0][5] = "king";
    b[0][6] = "defender";
    b[0][3] = "attacker";
    b[0][7] = "attacker";
    b[1][4] = "attacker";
    b[1][6] = "attacker";
    b[4][5] = "attacker";
    fixtures.push({ label: "tactical: shieldwall one move away", state: stateOf(b, "attackers") });
  }

  return fixtures;
}

const copenhagenAdapter: GameApi = {
  game: "copenhagen",
  rulesId: COPENHAGEN_VARIANTS[COPENHAGEN_DEFAULT_VARIANT].id,
  rules: COPENHAGEN_VARIANTS[COPENHAGEN_DEFAULT_VARIANT],
  FULL_CONFIG: CopenhagenEngine.FULL_CONFIG as unknown as Record<string, unknown>,
  DEFAULT_WEIGHTS: CopenhagenEngine.DEFAULT_WEIGHTS,
  initialState: () => CopenhagenRules.initialState(COPENHAGEN_VARIANTS[COPENHAGEN_DEFAULT_VARIANT]),
  isGameOver: (status) => CopenhagenRules.isGameOver(status as never),
  resetTT: () => CopenhagenEngine.resetTT(),
  pickMove: (state, rules, limits, config, rng, weights) =>
    CopenhagenEngine.pickMove(state as never, rules as never, limits, config as never, rng, weights as never),
  fixtures: copenhagenFixtures(),
};

// ── seeded self-play position sampling ──────────────────────────────────────
/** Play a deterministic self-play game (FULL_CONFIG, depth 2, TT cleared each
 *  ply — same recipe as copenhagen/engine.test.ts's "never returns an illegal
 *  move" test) and sample the resulting state every `sampleEvery` plies. Gives
 *  positions that are neither hand-built tactics nor the bare opening. */
function selfPlaySamples(api: GameApi, seed: number, maxPlies: number, sampleEvery: number): Position[] {
  const rng = mulberry32(seed);
  let state = api.initialState() as { status: string; turn: string };
  const out: Position[] = [];
  for (let ply = 1; ply <= maxPlies; ply++) {
    if (api.isGameOver(state.status)) break;
    api.resetTT();
    const r = api.pickMove(state, api.rules, { maxDepth: 2 }, api.FULL_CONFIG, rng, api.DEFAULT_WEIGHTS);
    if (!r.move) break;
    const applyFn = api.game === "tablut" ? TablutRules.applyMove : CopenhagenRules.applyMove;
    state = applyFn(state as never, r.move as never, api.rules as never) as never;
    if (ply % sampleEvery === 0) {
      out.push({ label: `self-play ply ${ply} (seed ${seed})`, state: structuredClone(state) });
    }
  }
  return out;
}

// ── measurement (1): equal-depth node counts ────────────────────────────────
interface DepthStats {
  depth: number;
  ratios: number[]; // nodesPvsOn / nodesPvsOff, per position
  mismatches: string[]; // labels where score differed
}

function benchNodes(api: GameApi, positions: Position[], depths: number[]): DepthStats[] {
  const pvsOn = { ...api.FULL_CONFIG, usePVS: true };
  const pvsOff = { ...api.FULL_CONFIG, usePVS: false };
  const stats: DepthStats[] = [];

  for (const depth of depths) {
    const ratios: number[] = [];
    const mismatches: string[] = [];
    console.log(`\n── depth ${depth} ──`);
    for (const pos of positions) {
      api.resetTT();
      const on = api.pickMove(pos.state, api.rules, { maxDepth: depth }, pvsOn, () => 0.5, api.DEFAULT_WEIGHTS);
      api.resetTT();
      const off = api.pickMove(pos.state, api.rules, { maxDepth: depth }, pvsOff, () => 0.5, api.DEFAULT_WEIGHTS);
      const ratio = off.nodes > 0 ? on.nodes / off.nodes : 1;
      const scoreOk = on.score === off.score;
      if (!scoreOk) mismatches.push(pos.label);
      ratios.push(ratio);
      console.log(
        `  ${pos.label.padEnd(52)} on=${String(on.nodes).padStart(8)} off=${String(off.nodes).padStart(8)} ` +
          `ratio=${ratio.toFixed(4)} depthReached on/off=${on.depth}/${off.depth} ` +
          `score on/off=${on.score}/${off.score}${scoreOk ? "" : "  <-- SCORE MISMATCH (BUG)"}`,
      );
    }
    stats.push({ depth, ratios, mismatches });
  }
  return stats;
}

function summarizeNodeStats(stats: DepthStats[]): void {
  console.log("\n=== node-ratio summary (PVS-on nodes / PVS-off nodes) ===");
  for (const s of stats) {
    const sorted = [...s.ratios].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const over3pct = sorted.filter((r) => Math.abs(r - 1) > 0.03).length;
    console.log(
      `depth ${s.depth}: min=${min.toFixed(4)} median=${median.toFixed(4)} mean=${mean.toFixed(4)} max=${max.toFixed(4)} ` +
        `(n=${sorted.length}, >3% deviation: ${over3pct}/${sorted.length}, mismatches=${s.mismatches.length}` +
        `${s.mismatches.length ? " " + JSON.stringify(s.mismatches) : ""})`,
    );
  }
}

// ── measurement (2): wall-clock at ladder limits ────────────────────────────
function benchLadder(api: GameApi, positions: Position[], limits: SearchLimitsLike, label: string): void {
  const pvsOn = { ...api.FULL_CONFIG, usePVS: true };
  const pvsOff = { ...api.FULL_CONFIG, usePVS: false };
  console.log(`\n── ${label} ladder limit: ${JSON.stringify(limits)} ──`);
  for (const pos of positions) {
    api.resetTT();
    const t0 = performance.now();
    const on = api.pickMove(pos.state, api.rules, limits, pvsOn, () => 0.5, api.DEFAULT_WEIGHTS);
    const onMs = performance.now() - t0;
    api.resetTT();
    const t1 = performance.now();
    const off = api.pickMove(pos.state, api.rules, limits, pvsOff, () => 0.5, api.DEFAULT_WEIGHTS);
    const offMs = performance.now() - t1;
    console.log(
      `  ${pos.label.padEnd(52)} on: depth=${on.depth} nodes=${on.nodes} ${onMs.toFixed(0)}ms   ` +
        `off: depth=${off.depth} nodes=${off.nodes} ${offMs.toFixed(0)}ms`,
    );
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
  let game: string | undefined;
  let depths: number[] | undefined;
  let ladderPositions = 6;
  let skipLadder = false;
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--game") game = argv[++i];
    else if (t === "--depths") depths = argv[++i].split(",").map(Number);
    else if (t === "--ladder-positions") ladderPositions = Number(argv[++i]);
    else if (t === "--skip-ladder") skipLadder = true;
  }
  return { game, depths, ladderPositions, skipLadder };
}

function main(): void {
  const { game, depths: depthsArg, ladderPositions, skipLadder } = parseArgs(process.argv.slice(2));
  if (game !== "tablut" && game !== "copenhagen") {
    console.error("usage: npx tsx scripts/pvsbench.ts --game <tablut|copenhagen> [--depths 3,4,5] [--ladder-positions N] [--skip-ladder]");
    process.exit(1);
  }
  const api = game === "tablut" ? tablutAdapter : copenhagenAdapter;
  const defaultDepths = game === "tablut" ? [3, 4, 5] : [2, 3, 4];
  const depths = depthsArg ?? defaultDepths;

  console.log(`pvsbench: game=${api.game} rules=${api.rulesId} depths=${depths.join(",")}`);
  console.log(`nproc/uptime should be recorded by the caller around this run.`);

  const selfPlay = selfPlaySamples(api, 20260909, 40, 5);
  const positions = [...api.fixtures, ...selfPlay];
  console.log(`\npositions (${positions.length}): ${positions.map((p) => p.label).join(" | ")}`);

  const stats = benchNodes(api, positions, depths);
  summarizeNodeStats(stats);

  const overallMaxDeviation = Math.max(
    ...stats.flatMap((s) => s.ratios.map((r) => Math.abs(r - 1))),
  );
  console.log(
    `\noverall max |ratio-1| across all depths/positions: ${(overallMaxDeviation * 100).toFixed(2)}% ` +
      `(gauntlet threshold: 3%)`,
  );

  if (!skipLadder) {
    const ladderPos = positions.slice(0, Math.min(ladderPositions, positions.length));
    benchLadder(api, positions, MEDIUM, "medium");
    benchLadder(api, positions, HARD, "hard");
    benchLadder(api, ladderPos, OLLAMH, "ollamh");
  }
}

main();
