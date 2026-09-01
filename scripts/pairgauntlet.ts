/* Mirrored-pair gauntlet — the measurement instrument for strength-affecting
 * changes. Run: npx tsx scripts/pairgauntlet.ts <mode> [args...]
 *
 * WHY THIS EXISTS
 * ----------------
 * evaltune.ts (this directory) scores a candidate by playing it against
 * DEFAULT_WEIGHTS "N games as attacker, N games as defender" from the fixed
 * opening position and summing wins. That protocol is blind to side bias, and
 * the bias measured here is not small: an A/A control (DEFAULT_WEIGHTS vs
 * itself, identical config both sides, depth 4, 24 games with 4 random opening
 * plies) came back 11-13 overall but **1-11 as attacker / 10-2 as defender —
 * defenders won 21/24 (87.5%) with BOTH sides running byte-identical code.**
 * Any real eval signal from a candidate term is invisible under that much
 * side bias; every "measured neutral" verdict evaltune.ts has ever produced
 * was produced without correcting for it.
 *
 * THE FIX: mirrored pairs. Generate one opening, play it TWICE from that same
 * position — once with the candidate as attackers / baseline as defenders,
 * once with roles swapped — and score the PAIR, not the two games separately:
 *   +1  candidate wins both games in the pair (a genuine advantage: it
 *       survived the side swap)
 *    0  the pair splits, or either game is drawn/incomplete (exactly what
 *       pure side bias looks like: whichever side is "good" wins, regardless
 *       of which config is playing it)
 *   -1  candidate loses both games in the pair
 * Side bias hits both games in a pair equally (same opening, same depth, only
 * the attacker/defender assignment of the two configs is swapped), so it
 * cancels by construction. A genuine improvement has to win the pair; a
 * config that only benefits from defender-side bias splits its pairs (wins as
 * defender, loses as attacker) and nets zero.
 *
 * Validated (full reproduction, seeds and all: docs/reports/paired-gauntlet-
 * instrument.md):
 *   - A/A control, book2 opening, depth 4, 16 pairs, seed 11: WW=3 LL=3
 *     split=10 net=+0 — dead even, where the unpaired harness's identical
 *     config showed 87.5% defender bias.
 *   - Known-positive calibration, depth 4 (candidate) vs depth 3 (baseline),
 *     40 pairs total: WW=10 LL=0 split=30 net=+10, sign-test p=0.00195 — the
 *     instrument correctly credits a real, structural one-ply advantage and
 *     does not manufacture significance out of bias alone.
 *   - Has since detected one real negative on a candidate eval term
 *     (quadrantCoverage at weight 10, 40 pairs: 0W/13L/27split, p=0.000244).
 *
 * ⚠ POWER ANALYSIS — READ BEFORE CHOOSING A PAIR COUNT
 * ------------------------------------------------------
 * Most pairs split (no side bias is left to decide them once mirrored), so
 * only a minority are decisive (WW or LL) and the sign test only sees those.
 * At the validated setting (book2, depth 4) the A/A control's own decisive
 * rate was 6/16 = 37.5% of pairs. Minimum WW-vs-LL split among *decisive*
 * pairs needed to cross p<0.05 (exact two-sided binomial, this file's own
 * binomTwoSidedP, not a normal approximation):
 *
 *   n_decisive | min split for p<0.05 | p at that split
 *   6          | 6-0                  | 0.0313
 *   10         | 9-1                  | 0.0215
 *   16         | 13-3                 | 0.0213
 *   20         | 15-5                 | 0.0414
 *   24         | 18-6                 | 0.0227
 *   40         | 27-13                | 0.0385
 *
 * At the observed 37.5% decisive rate, **16 total pairs give only ~6 decisive
 * pairs — too few to ever reach significance short of a 6-0 sweep** (a nearly
 * unanimous, very large effect). The calibration run above needed 40 pairs
 * (~10 decisive) to cross significance for a large, unambiguous one-ply
 * effect. Budget **~50-60 total pairs** (~19-22 decisive at the observed
 * rate) as the working minimum for a real go/no-go call on a moderate effect.
 * A run of 10 or 16 pairs that comes back "even" has not shown the candidate
 * is neutral — it has not looked hard enough to tell either way. Do not read
 * a small run as a verdict.
 *
 * USAGE
 * -----
 *   npx tsx scripts/pairgauntlet.ts aa <depth> <pairs> <seed> [opening]
 *     A/A self-check: DEFAULT_WEIGHTS vs itself. Must come out ~even (net
 *     near 0, no lopsided WW/LL split) if the harness itself is unbiased.
 *
 *   npx tsx scripts/pairgauntlet.ts calibrate <depthHi> <depthLo> <pairs> <seed> [opening]
 *     Known-positive calibration: depthHi (candidate) vs depthLo (baseline),
 *     both DEFAULT_WEIGHTS. A correctly-working instrument MUST show depthHi
 *     winning clearly — if it doesn't, the harness itself is broken, not the
 *     engine.
 *
 *   npx tsx scripts/pairgauntlet.ts cand <term> <depth> <pairs> <seed> [opening]
 *     Candidate eval-weight term vs DEFAULT_WEIGHTS, same depth both sides.
 *     term one of: blockerAwareKingDist | shield | liberties | mobility |
 *     quadrantCoverage
 *
 * ARGS
 *   depth / depthHi / depthLo : fixed maxDepth (no time budget) per side.
 *   pairs   : number of mirrored pairs to play (2x this many games run).
 *   seed    : integer RNG seed for opening generation AND search
 *             tie-breaking. Required, always echoed in the output header —
 *             same seed + same opening scheme reproduces byte-identical play.
 *   opening : "random2" | "random4" | "book2" | "book4" | "none". Defaults to
 *             book2, the scheme measured cleanest for A/A bias (dead-even at
 *             16 pairs; random2 also nets zero but noisier; random4 and book4
 *             both showed a lingering negative net at small sample sizes —
 *             more randomisation measurably re-introduced bias rather than
 *             averaging it out). book2/4 walk the project's own opening book
 *             (src/game/openingBook.ts), falling back to a random legal move
 *             once the walk leaves the book's stored lines.
 *
 * OUTPUT: a running per-pair line, then a summary with the pair distribution
 * (WW/LL/split), the net score, decisive-pair count, and the two-sided exact
 * binomial sign-test p-value on WW vs LL among decisive pairs. No file is
 * written; pipe stdout to capture a run.
 */
import {
  DEFAULT_WEIGHTS,
  FULL_CONFIG,
  pickMove,
  resetTT,
  type EvalWeights,
} from "../src/game/engine";
import {
  allMoves,
  applyMove,
  hashBoard,
  initialState,
  isGameOver,
  winnerOf,
} from "../src/game/rules";
import type { GameState, Side } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";
import { loadOpeningBook, bookRulesMatch } from "../src/game/openingBook";

const rules = VARIANTS.wtf;
const MAX_PLIES = 200;

// ── deterministic PRNG (mulberry32, as in evaltune.ts/aibench.ts/bookbench.ts) ─
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── opening generation ──────────────────────────────────────────────────────
export type OpeningScheme = "random2" | "random4" | "book2" | "book4" | "none";

let book: Record<string, import("../src/game/types").Move[]> | null = null;
function getBook() {
  if (book === null) {
    book = loadOpeningBook();
    if (!bookRulesMatch(rules)) {
      console.warn("WARNING: opening book fingerprint does not match VARIANTS.wtf — book openings will be empty/no-op.");
    }
  }
  return book;
}

function randomOpening(rng: () => number, plies: number): GameState {
  let s = initialState();
  for (let i = 0; i < plies; i++) {
    if (isGameOver(s.status)) break;
    const moves = allMoves(s.board, s.turn, rules);
    if (moves.length === 0) break;
    s = applyMove(s, moves[Math.floor(rng() * moves.length)], rules);
  }
  return s;
}

/** Walk the project's own opening book for `plies` steps, choosing uniformly
 *  among the book's stored replies at each step (rng-driven, deterministic).
 *  Falls back to a uniformly-random legal move as soon as the walk leaves the
 *  book's stored lines, so the requested ply count is always reached (subject
 *  to game-over). */
function bookOpening(rng: () => number, plies: number): GameState {
  const b = getBook();
  let s = initialState();
  for (let i = 0; i < plies; i++) {
    if (isGameOver(s.status)) break;
    const key = hashBoard(s.board, s.turn);
    const bookMoves = b[key];
    let mv;
    if (bookMoves && bookMoves.length > 0) {
      mv = bookMoves[Math.floor(rng() * bookMoves.length)];
    } else {
      const moves = allMoves(s.board, s.turn, rules);
      if (moves.length === 0) break;
      mv = moves[Math.floor(rng() * moves.length)];
    }
    s = applyMove(s, mv, rules);
  }
  return s;
}

export function generateOpening(scheme: OpeningScheme, rng: () => number): GameState {
  switch (scheme) {
    case "random2":
      return randomOpening(rng, 2);
    case "random4":
      return randomOpening(rng, 4);
    case "book2":
      return bookOpening(rng, 2);
    case "book4":
      return bookOpening(rng, 4);
    case "none":
      return initialState();
  }
}

// ── single game from a given opening state ──────────────────────────────────
interface GameOutcome {
  winner: Side | "draw" | null; // null = incomplete (hit MAX_PLIES)
  plies: number;
}

function playFrom(opening: GameState, atkW: EvalWeights, defW: EvalWeights, atkDepth: number, defDepth: number, seed: number): GameOutcome {
  const rngA = mulberry32(seed * 2 + 1);
  const rngD = mulberry32(seed * 2 + 2);
  let s: GameState = opening;
  let plies = 0;
  resetTT();
  while (!isGameOver(s.status) && plies < MAX_PLIES) {
    const atk = s.turn === "attackers";
    const { move } = pickMove(s, rules, { maxDepth: atk ? atkDepth : defDepth }, FULL_CONFIG, atk ? rngA : rngD, atk ? atkW : defW);
    if (!move) break;
    s = applyMove(s, move, rules);
    plies++;
  }
  return { winner: isGameOver(s.status) ? winnerOf(s.status) : null, plies };
}

// ── pair result classification ──────────────────────────────────────────────
type GameLetter = "W" | "L" | "D"; // from candidate's perspective; incomplete counted as D but flagged separately
export type PairCategory = "WW" | "LL" | "split";

function letterFor(winner: Side | "draw" | null, candSide: Side): { letter: GameLetter; incomplete: boolean } {
  if (winner === null) return { letter: "D", incomplete: true };
  if (winner === "draw") return { letter: "D", incomplete: false };
  return { letter: winner === candSide ? "W" : "L", incomplete: false };
}

/** Given the candidate's letter as attacker and as defender in one mirrored
 *  pair, the category and the ±1/0 score. Exported and pure so it can be
 *  hand-checked directly, independent of any engine call. */
export function categorize(atkLetter: GameLetter, defLetter: GameLetter): { category: PairCategory; score: -1 | 0 | 1 } {
  if (atkLetter === "W" && defLetter === "W") return { category: "WW", score: 1 };
  if (atkLetter === "L" && defLetter === "L") return { category: "LL", score: -1 };
  return { category: "split", score: 0 };
}

interface PairRecord {
  pairIndex: number;
  openingScheme: OpeningScheme;
  candAsAttackerResult: { winner: Side | "draw" | null; plies: number; letter: GameLetter };
  candAsDefenderResult: { winner: Side | "draw" | null; plies: number; letter: GameLetter };
  category: PairCategory;
  score: -1 | 0 | 1;
  incompleteCount: number;
}

/** Play one mirrored pair: same opening, candidate as attackers then as
 *  defenders. candDepth/baseDepth allow asymmetric-depth calibration runs;
 *  pass equal values for an eval-weight comparison at fixed depth. */
function playPair(
  pairIndex: number,
  candW: EvalWeights,
  baseW: EvalWeights,
  candDepth: number,
  baseDepth: number,
  openingScheme: OpeningScheme,
  openingSeed: number,
): PairRecord {
  const openingRng = mulberry32(openingSeed);
  const opening = generateOpening(openingScheme, openingRng);

  // Game 1: candidate = attackers, baseline = defenders.
  const g1 = playFrom(opening, candW, baseW, candDepth, baseDepth, pairIndex * 4 + 1);
  const l1 = letterFor(g1.winner, "attackers");

  // Game 2: baseline = attackers, candidate = defenders. SAME opening.
  const g2 = playFrom(opening, baseW, candW, baseDepth, candDepth, pairIndex * 4 + 3);
  const l2 = letterFor(g2.winner, "defenders");

  const { category, score } = categorize(l1.letter, l2.letter);

  return {
    pairIndex,
    openingScheme,
    candAsAttackerResult: { winner: g1.winner, plies: g1.plies, letter: l1.letter },
    candAsDefenderResult: { winner: g2.winner, plies: g2.plies, letter: l2.letter },
    category,
    score,
    incompleteCount: (l1.incomplete ? 1 : 0) + (l2.incomplete ? 1 : 0),
  };
}

// ── binomial sign-test helper (two-sided, exact) ────────────────────────────
function logChoose(n: number, k: number): number {
  let r = 0;
  for (let i = 0; i < k; i++) r += Math.log(n - i) - Math.log(i + 1);
  return r;
}
export function binomTwoSidedP(k: number, n: number, p = 0.5): number {
  if (n === 0) return 1;
  // sum P(X=i) over all i with P(X=i) <= P(X=k), for X~Bin(n,p)
  const logPk = logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
  let total = 0;
  for (let i = 0; i <= n; i++) {
    const logPi = logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p);
    if (logPi <= logPk + 1e-9) total += Math.exp(logPi);
  }
  return Math.min(1, total);
}

// ── gauntlet runner ──────────────────────────────────────────────────────────
export interface GauntletSummary {
  pairs: number;
  WW: number;
  LL: number;
  split: number;
  netScore: number; // WW - LL
  incompleteGames: number;
  decisive: number; // WW + LL
  signTestP: number; // two-sided binomial p-value on WW vs LL among decisive pairs
  wallMs: number;
  records: PairRecord[];
}

export function runGauntlet(
  candW: EvalWeights,
  baseW: EvalWeights,
  candDepth: number,
  baseDepth: number,
  nPairs: number,
  openingScheme: OpeningScheme,
  baseSeed: number,
  log: (s: string) => void = console.log,
): GauntletSummary {
  const records: PairRecord[] = [];
  const t0 = performance.now();
  for (let i = 0; i < nPairs; i++) {
    const openingSeed = baseSeed * 100003 + i; // distinct opening per pair, deterministic
    const rec = playPair(i, candW, baseW, candDepth, baseDepth, openingScheme, openingSeed);
    records.push(rec);
    log(
      `  pair ${i + 1}/${nPairs}: atk=${rec.candAsAttackerResult.letter}(${rec.candAsAttackerResult.plies}p) def=${rec.candAsDefenderResult.letter}(${rec.candAsDefenderResult.plies}p) -> ${rec.category} (score ${rec.score >= 0 ? "+" : ""}${rec.score})`,
    );
  }
  const wallMs = performance.now() - t0;
  const WW = records.filter((r) => r.category === "WW").length;
  const LL = records.filter((r) => r.category === "LL").length;
  const split = records.filter((r) => r.category === "split").length;
  const decisive = WW + LL;
  const signTestP = decisive > 0 ? binomTwoSidedP(WW, decisive) : 1;
  return {
    pairs: nPairs,
    WW,
    LL,
    split,
    netScore: WW - LL,
    incompleteGames: records.reduce((a, r) => a + r.incompleteCount, 0),
    decisive,
    signTestP,
    wallMs,
    records,
  };
}

function printSummary(label: string, s: GauntletSummary) {
  console.log(`\n=== ${label} ===`);
  console.log(`pairs=${s.pairs}  WW=${s.WW}  LL=${s.LL}  split=${s.split}  net=${s.netScore >= 0 ? "+" : ""}${s.netScore}`);
  console.log(`decisive pairs (WW+LL)=${s.decisive}  sign-test two-sided p=${s.signTestP.toFixed(4)}`);
  console.log(`incomplete games=${s.incompleteGames}  wall=${(s.wallMs / 1000).toFixed(1)}s  (${(s.wallMs / s.pairs).toFixed(0)}ms/pair)`);
  if (s.pairs < 50) {
    console.log(
      `⚠ ${s.pairs} pairs is below the ~50-60 working minimum (see file header) — a small run can only detect a\n` +
        `  very large, near-unanimous effect. An "even" result here is not evidence of neutrality.`,
    );
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const CANDIDATES: Record<string, EvalWeights> = {
  blockerAwareKingDist: { ...DEFAULT_WEIGHTS, blockerAwareKingDist: true },
  shield: { ...DEFAULT_WEIGHTS, shield: 20 },
  liberties: { ...DEFAULT_WEIGHTS, liberties: 12 },
  mobility: { ...DEFAULT_WEIGHTS, mobility: 3 },
  quadrantCoverage: { ...DEFAULT_WEIGHTS, quadrantCoverage: 10 },
};

function requireSeed(raw: string | undefined, usage: string): number {
  const sd = Number(raw);
  if (raw === undefined || !Number.isFinite(sd)) {
    console.error(`seed is required and must be a number.\nusage: ${usage}`);
    process.exit(1);
  }
  return sd;
}

function main() {
  const mode = process.argv[2];
  let summary: GauntletSummary;
  let label: string;

  if (mode === "aa") {
    const [depth, pairs, seedArg, opening] = process.argv.slice(3);
    const usage = "npx tsx scripts/pairgauntlet.ts aa <depth> <pairs> <seed> [opening]";
    const d = Number(depth), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = (opening as OpeningScheme) ?? "book2";
    label = `A/A self-check depth=${d} pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, d, d, p, scheme, sd);
  } else if (mode === "calibrate") {
    const [depthHi, depthLo, pairs, seedArg, opening] = process.argv.slice(3);
    const usage = "npx tsx scripts/pairgauntlet.ts calibrate <depthHi> <depthLo> <pairs> <seed> [opening]";
    const dh = Number(depthHi), dl = Number(depthLo), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = (opening as OpeningScheme) ?? "book2";
    label = `Calibration depthHi=${dh}(cand) vs depthLo=${dl}(base) pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, dh, dl, p, scheme, sd);
  } else if (mode === "cand") {
    const [term, depth, pairs, seedArg, opening] = process.argv.slice(3);
    const usage = "npx tsx scripts/pairgauntlet.ts cand <term> <depth> <pairs> <seed> [opening]";
    const cand = CANDIDATES[term];
    if (!cand) {
      console.error(`unknown term "${term}". Options: ${Object.keys(CANDIDATES).join(", ")}\nusage: ${usage}`);
      process.exit(1);
    }
    const d = Number(depth), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = (opening as OpeningScheme) ?? "book2";
    label = `Candidate "${term}" vs DEFAULT depth=${d} pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(cand, DEFAULT_WEIGHTS, d, d, p, scheme, sd);
  } else {
    console.error(
      "usage:\n" +
        "  npx tsx scripts/pairgauntlet.ts aa <depth> <pairs> <seed> [opening]\n" +
        "  npx tsx scripts/pairgauntlet.ts calibrate <depthHi> <depthLo> <pairs> <seed> [opening]\n" +
        "  npx tsx scripts/pairgauntlet.ts cand <term> <depth> <pairs> <seed> [opening]\n" +
        "opening (default book2): random2 | random4 | book2 | book4 | none\n" +
        "seed is required in every mode and is always echoed in the output header.",
    );
    process.exit(1);
  }

  printSummary(label, summary);
}

// Only run the CLI when executed directly — importing this module (e.g. from
// the co-located test) must not trigger a gauntlet.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
