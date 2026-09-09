/* Mirrored-pair gauntlet — the measurement instrument for strength-affecting
 * changes, on all three tafl boards.
 * Run: npx tsx scripts/pairgauntlet.ts [--game <id>] <mode> [args...]
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
 * All three of those are **Brandubh** numbers. Tablut and Copenhagen were
 * validated separately (same protocol, their own A/A controls, side splits,
 * calibrations and timings) — see the per-board sections of the report. A
 * board's own validation is the only thing that licenses a verdict on it.
 *
 * THE THREE BOARDS
 * ----------------
 * `--game brandubh|tablut|copenhagen` (default brandubh). The three games fork
 * their rules, their engine, their D4 folding and their evaluation weight TYPE
 * (ADR-0006, ADR-0007) — there is deliberately no shared `EvalWeights`. So the
 * per-game imports live in `scripts/gauntlet/<game>.ts` behind the `GameAdapter`
 * interface, and weights are opaque to this file: it hands a `Weights` from one
 * adapter call straight to the next and never reads a field. Nothing measured
 * on one board says anything about another, and nothing measured under one
 * ruleset says anything about another; the run label echoes both.
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
 * a small run as a verdict. The decisive rate differs per board — see each
 * board's measured rate in the report before budgeting on another board.
 *
 * USAGE
 * -----
 *   npx tsx scripts/pairgauntlet.ts [--game <id>] aa <depth> <pairs> <seed> [opening]
 *     A/A self-check: DEFAULT_WEIGHTS vs itself. Must come out ~even (net
 *     near 0, no lopsided WW/LL split) if the harness itself is unbiased.
 *     Also prints the raw per-side win split, which is the board's own side
 *     bias measured directly — the number the pairing exists to cancel.
 *
 *   npx tsx scripts/pairgauntlet.ts [--game <id>] calibrate <depthHi> <depthLo> <pairs> <seed> [opening]
 *     Known-positive calibration: depthHi (candidate) vs depthLo (baseline),
 *     both DEFAULT_WEIGHTS. A correctly-working instrument MUST show depthHi
 *     winning clearly — if it doesn't, the harness itself is broken, not the
 *     engine.
 *
 *   npx tsx scripts/pairgauntlet.ts [--game <id>] cand <term|json> <depth> <pairs> <seed> [opening]
 *     Candidate eval weights vs DEFAULT_WEIGHTS, same depth both sides.
 *     <term|json> is either a named override for that game (run with no args
 *     to see the list — the three weight types differ, so the list does too)
 *     or a JSON object merged over that game's DEFAULT_WEIGHTS, e.g.
 *     '{"liberties":12,"mobility":3}'. An unknown key is a hard error naming
 *     the keys the game actually has, because a silently-ignored knob measures
 *     nothing but noise.
 *
 * ARGS
 *   --game  : brandubh (7×7, corner escape, WTF) | tablut (9×9, EDGE escape,
 *             Linnaeus/WTF) | copenhagen (11×11, corner escape). Default
 *             brandubh. Each plays under its own DEFAULT_VARIANT ruleset, which
 *             is echoed in the label.
 *   depth / depthHi / depthLo : fixed maxDepth (no time budget) per side.
 *   pairs   : number of mirrored pairs to play (2x this many games run).
 *   seed    : integer RNG seed for opening generation AND search
 *             tie-breaking. Required, always echoed in the output header —
 *             same seed + same opening scheme reproduces byte-identical play.
 *   opening : "random2" | "random4" | "shallow2" | "shallow4" | "book2" |
 *             "book4" | "none". Defaults to the game's own default: book2 on
 *             Brandubh, shallow2 on the two larger boards.
 *
 * OPENING SCHEMES, AND WHY book2 IS BRANDUBH-ONLY
 * -----------------------------------------------
 * A pair needs an opening that (a) is the SAME for both games of the pair, or
 * the mirroring does not cancel anything, and (b) VARIES across pairs, or every
 * pair measures the same single game twice.
 *
 *   book2 / book4  Walk the project's opening book (src/game/openingBook.ts)
 *                  for 2 or 4 plies, choosing uniformly (seeded) among the
 *                  book's stored replies, falling back to a uniformly-random
 *                  legal move once the walk leaves the book's lines.
 *                  **Brandubh only.** The book is a file of 7×7 positions
 *                  generated for Brandubh under the WTF ruleset, keyed by that
 *                  game's `hashBoard`; Tablut and Copenhagen ship no book at
 *                  all. Asked for on either of those boards this is a hard
 *                  error, not a silent fallback: a scheme that quietly became
 *                  "random legal moves" would put a scheme name in the run
 *                  label that did not describe the run.
 *   shallow2 / 4   The book-free replacement, and the default on Tablut and
 *                  Copenhagen. Plays 2 or 4 plies by a fixed-depth search
 *                  (depth SHALLOW_DEPTH), taking the exact scores of every root
 *                  move within SHALLOW_MARGIN of the best (`scoreRootMoves`,
 *                  the same multi-PV query the book generator uses) and
 *                  choosing uniformly (seeded) among them. Deterministic — no
 *                  deadline anywhere, and the TT is cleared before each ply so
 *                  a hot table left by the previous pair's games cannot colour
 *                  the opening. Same seed, same openings, on any machine. It
 *                  gives what book2 gives on Brandubh: openings that are sane
 *                  rather than uniformly random, identical within a pair, and
 *                  different across pairs. It is NOT the book: the book is a
 *                  deep offline product and this is a shallow live search, so
 *                  the two are not interchangeable even on Brandubh.
 *   random2 / 4    Uniformly-random legal plies. Available on every board.
 *                  Measured NOISIER than book2 on Brandubh: random4 and book4
 *                  both showed a lingering negative net at small sample sizes —
 *                  more randomisation measurably re-introduced bias rather than
 *                  averaging it out.
 *   none           Every pair starts from the standard opening position. Every
 *                  pair then plays the same two games; useful only as a
 *                  degenerate control.
 *
 * OUTPUT: a running per-pair line, then a summary with the pair distribution
 * (WW/LL/split), the net score, decisive-pair count, the two-sided exact
 * binomial sign-test p-value on WW vs LL among decisive pairs, and the raw
 * per-side win split (the board's uncancelled side bias). No file is written;
 * pipe stdout to capture a run.
 */
import type { GameState, Move, Side } from "../src/game/types";
import { adapterFor, isGameId, GAME_IDS, type GameAdapter, type Weights, type Config } from "./gauntlet/index";

const MAX_PLIES = 200;

/** Fixed-depth search and score margin the `shallowN` opening schemes use.
 *  Depth 2 and 50 centipawn-equivalents were chosen by measurement, not taste:
 *  at the standard opening position they return 5 near-best root moves on
 *  Brandubh, 4 on Tablut and 15 on Copenhagen (root moves are D4-folded, so
 *  those are distinct orbits, not mirror images of each other), for under 70ms
 *  a ply on the largest board. Fewer than ~3 would make every pair's opening
 *  the same; many more would be `random` wearing a search's name. */
const SHALLOW_DEPTH = 2;
const SHALLOW_MARGIN = 50;

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
export const OPENING_SCHEMES = [
  "random2",
  "random4",
  "shallow2",
  "shallow4",
  "book2",
  "book4",
  "none",
] as const;
export type OpeningScheme = (typeof OPENING_SCHEMES)[number];

export function isOpeningScheme(s: string): s is OpeningScheme {
  return (OPENING_SCHEMES as readonly string[]).includes(s);
}

function randomOpening(a: GameAdapter, rng: () => number, plies: number): GameState {
  let s = a.initialState();
  for (let i = 0; i < plies; i++) {
    if (a.isOver(s)) break;
    const moves = a.legalMoves(s);
    if (moves.length === 0) break;
    s = a.apply(s, moves[Math.floor(rng() * moves.length)]);
  }
  return s;
}

/** Walk the project's own opening book for `plies` steps, choosing uniformly
 *  among the book's stored replies at each step (rng-driven, deterministic).
 *  Falls back to a uniformly-random legal move as soon as the walk leaves the
 *  book's stored lines, so the requested ply count is always reached (subject
 *  to game-over). Brandubh only — see the header. */
function bookOpening(a: GameAdapter, rng: () => number, plies: number): GameState {
  let s = a.initialState();
  for (let i = 0; i < plies; i++) {
    if (a.isOver(s)) break;
    const bookMoves = a.bookReplies(s);
    let mv: Move;
    if (bookMoves && bookMoves.length > 0) {
      mv = bookMoves[Math.floor(rng() * bookMoves.length)];
    } else {
      const moves = a.legalMoves(s);
      if (moves.length === 0) break;
      mv = moves[Math.floor(rng() * moves.length)];
    }
    s = a.apply(s, mv);
  }
  return s;
}

/** Play `plies` from the opening by a fixed-depth search, choosing uniformly
 *  (seeded) among the moves within SHALLOW_MARGIN of the best. The book-free
 *  scheme — see the header for what it is and is not. */
function shallowOpening(a: GameAdapter, rng: () => number, plies: number): GameState {
  let s = a.initialState();
  for (let i = 0; i < plies; i++) {
    if (a.isOver(s)) break;
    // Cleared per ply: scoreRootMoves reads the shared TT, and a table warm
    // from the previous pair's games would make the openings depend on run
    // order rather than on the seed alone.
    a.resetSearch();
    const near = a.nearBest(s, SHALLOW_DEPTH, SHALLOW_MARGIN);
    let mv: Move;
    if (near.length > 0) {
      mv = near[Math.floor(rng() * near.length)];
    } else {
      const moves = a.legalMoves(s);
      if (moves.length === 0) break;
      mv = moves[Math.floor(rng() * moves.length)];
    }
    s = a.apply(s, mv);
  }
  return s;
}

export function generateOpening(a: GameAdapter, scheme: OpeningScheme, rng: () => number): GameState {
  switch (scheme) {
    case "random2":
      return randomOpening(a, rng, 2);
    case "random4":
      return randomOpening(a, rng, 4);
    case "shallow2":
      return shallowOpening(a, rng, 2);
    case "shallow4":
      return shallowOpening(a, rng, 4);
    case "book2":
      return bookOpening(a, rng, 2);
    case "book4":
      return bookOpening(a, rng, 4);
    case "none":
      return a.initialState();
  }
}

/** A scheme a board cannot run is refused here, before any game is played, so
 *  the failure is a message rather than a run whose label lies about it. */
export function assertSchemeSupported(a: GameAdapter, scheme: OpeningScheme): void {
  if ((scheme === "book2" || scheme === "book4") && !a.hasBook) {
    throw new Error(
      `opening scheme "${scheme}" needs an opening book and ${a.game} has none.\n` +
        `  The book (src/game/openingBook.ts) is a file of Brandubh 7×7 positions under the WTF\n` +
        `  ruleset; it does not exist for ${a.game}. Use shallow2 (this game's default) or random4.`,
    );
  }
}

// ── single game from a given opening state ──────────────────────────────────
interface GameOutcome {
  winner: Side | "draw" | null; // null = incomplete (hit MAX_PLIES)
  plies: number;
}

function playFrom(
  a: GameAdapter,
  opening: GameState,
  atkW: Weights,
  defW: Weights,
  atkDepth: number,
  defDepth: number,
  seed: number,
  atkConfig?: Config,
  defConfig?: Config,
): GameOutcome {
  const rngA = mulberry32(seed * 2 + 1);
  const rngD = mulberry32(seed * 2 + 2);
  let s: GameState = opening;
  let plies = 0;
  a.resetSearch();
  while (!a.isOver(s) && plies < MAX_PLIES) {
    const atk = s.turn === "attackers";
    const move = a.search(s, atk ? atkDepth : defDepth, atk ? rngA : rngD, atk ? atkW : defW, atk ? atkConfig : defConfig);
    if (!move) break;
    s = a.apply(s, move);
    plies++;
  }
  return { winner: a.winner(s), plies };
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
 *  pass equal values for an eval-weight comparison at fixed depth.
 *  candConfig/baseConfig are optional and follow the candidate/baseline
 *  (like the weights do, not the side) — omit both for the existing
 *  eval-weight/depth comparisons, which get each adapter's own default
 *  config unchanged. */
function playPair(
  a: GameAdapter,
  pairIndex: number,
  candW: Weights,
  baseW: Weights,
  candDepth: number,
  baseDepth: number,
  openingScheme: OpeningScheme,
  openingSeed: number,
  candConfig?: Config,
  baseConfig?: Config,
): PairRecord {
  const openingRng = mulberry32(openingSeed);
  const opening = generateOpening(a, openingScheme, openingRng);

  // Game 1: candidate = attackers, baseline = defenders.
  const g1 = playFrom(a, opening, candW, baseW, candDepth, baseDepth, pairIndex * 4 + 1, candConfig, baseConfig);
  const l1 = letterFor(g1.winner, "attackers");

  // Game 2: baseline = attackers, candidate = defenders. SAME opening.
  const g2 = playFrom(a, opening, baseW, candW, baseDepth, candDepth, pairIndex * 4 + 3, baseConfig, candConfig);
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
  /** Raw games won by each SIDE across all 2N games, ignoring which config was
   *  playing it. This is the board's side bias, uncancelled — the quantity the
   *  pairing exists to neutralise, reported so it is on the record rather than
   *  merely assumed to have been handled. */
  attackerWins: number;
  defenderWins: number;
  drawnOrIncomplete: number;
  wallMs: number;
  records: PairRecord[];
}

export function runGauntlet(
  adapter: GameAdapter,
  candW: Weights,
  baseW: Weights,
  candDepth: number,
  baseDepth: number,
  nPairs: number,
  openingScheme: OpeningScheme,
  baseSeed: number,
  log: (s: string) => void = console.log,
  candConfig?: Config,
  baseConfig?: Config,
): GauntletSummary {
  assertSchemeSupported(adapter, openingScheme);
  const records: PairRecord[] = [];
  const t0 = performance.now();
  for (let i = 0; i < nPairs; i++) {
    const openingSeed = baseSeed * 100003 + i; // distinct opening per pair, deterministic
    const rec = playPair(adapter, i, candW, baseW, candDepth, baseDepth, openingScheme, openingSeed, candConfig, baseConfig);
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
  const winners = records.flatMap((r) => [r.candAsAttackerResult.winner, r.candAsDefenderResult.winner]);
  return {
    pairs: nPairs,
    WW,
    LL,
    split,
    netScore: WW - LL,
    incompleteGames: records.reduce((a, r) => a + r.incompleteCount, 0),
    decisive,
    signTestP,
    attackerWins: winners.filter((w) => w === "attackers").length,
    defenderWins: winners.filter((w) => w === "defenders").length,
    drawnOrIncomplete: winners.filter((w) => w === "draw" || w === null).length,
    wallMs,
    records,
  };
}

function printSummary(label: string, s: GauntletSummary) {
  console.log(`\n=== ${label} ===`);
  console.log(`pairs=${s.pairs}  WW=${s.WW}  LL=${s.LL}  split=${s.split}  net=${s.netScore >= 0 ? "+" : ""}${s.netScore}`);
  console.log(`decisive pairs (WW+LL)=${s.decisive}  sign-test two-sided p=${s.signTestP.toFixed(4)}`);
  const games = s.pairs * 2;
  const pct = games > 0 ? ((100 * s.defenderWins) / games).toFixed(1) : "0.0";
  console.log(
    `side split (raw games, bias NOT cancelled): attackers=${s.attackerWins}  defenders=${s.defenderWins}  ` +
      `drawn/incomplete=${s.drawnOrIncomplete}  of ${games}  (defenders ${pct}%)`,
  );
  console.log(`incomplete games=${s.incompleteGames}  wall=${(s.wallMs / 1000).toFixed(1)}s  (${(s.wallMs / s.pairs).toFixed(0)}ms/pair)`);
  if (s.pairs < 50) {
    console.log(
      `⚠ ${s.pairs} pairs is below the ~50-60 working minimum (see file header) — a small run can only detect a\n` +
        `  very large, near-unanimous effect. An "even" result here is not evidence of neutrality.`,
    );
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function requireSeed(raw: string | undefined, usage: string): number {
  const sd = Number(raw);
  if (raw === undefined || !Number.isFinite(sd)) {
    console.error(`seed is required and must be a number.\nusage: ${usage}`);
    process.exit(1);
  }
  return sd;
}

/** Pull `--game <id>` / `--game=<id>` out of argv wherever it sits, so the
 *  positional arguments of every mode keep the exact shape they had before the
 *  flag existed. */
export function extractGame(argv: string[]): { game: string; rest: string[] } {
  const rest: string[] = [];
  let game = "brandubh";
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--game") {
      game = argv[++i] ?? "";
    } else if (t.startsWith("--game=")) {
      game = t.slice("--game=".length);
    } else {
      rest.push(t);
    }
  }
  return { game, rest };
}

function resolveScheme(a: GameAdapter, raw: string | undefined): OpeningScheme {
  const name = raw ?? a.defaultOpening;
  if (!isOpeningScheme(name)) {
    console.error(`unknown opening scheme "${name}". Options: ${OPENING_SCHEMES.join(" | ")}`);
    process.exit(1);
  }
  try {
    assertSchemeSupported(a, name);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  return name;
}

/** Named term or JSON object of overrides. */
function resolveCandidate(a: GameAdapter, raw: string | undefined, usage: string): Weights {
  if (raw === undefined) {
    console.error(`a candidate term or JSON weights object is required.\nusage: ${usage}`);
    process.exit(1);
  }
  if (raw.trimStart().startsWith("{")) {
    try {
      return a.weightsFromJson(raw);
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }
  const named = a.candidate(raw);
  if (!named) {
    console.error(
      `unknown term "${raw}" for ${a.game}. Named options: ${a.candidateTerms().join(", ")}\n` +
        `  (the three games have different weight types, so the lists differ — or pass a JSON object)\n` +
        `usage: ${usage}`,
    );
    process.exit(1);
  }
  return named;
}

function main() {
  const { game, rest } = extractGame(process.argv.slice(2));
  if (!isGameId(game)) {
    console.error(`unknown --game "${game}". Options: ${GAME_IDS.join(" | ")}`);
    process.exit(1);
  }
  const adapter = adapterFor(game);
  const board = `game=${adapter.game} rules=${adapter.rulesId}`;

  const mode = rest[0];
  let summary: GauntletSummary;
  let label: string;

  if (mode === "aa") {
    const [depth, pairs, seedArg, opening] = rest.slice(1);
    const usage = "npx tsx scripts/pairgauntlet.ts [--game <id>] aa <depth> <pairs> <seed> [opening]";
    const d = Number(depth), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = resolveScheme(adapter, opening);
    label = `A/A self-check ${board} depth=${d} pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(adapter, adapter.defaultWeights, adapter.defaultWeights, d, d, p, scheme, sd);
  } else if (mode === "calibrate") {
    const [depthHi, depthLo, pairs, seedArg, opening] = rest.slice(1);
    const usage = "npx tsx scripts/pairgauntlet.ts [--game <id>] calibrate <depthHi> <depthLo> <pairs> <seed> [opening]";
    const dh = Number(depthHi), dl = Number(depthLo), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = resolveScheme(adapter, opening);
    label = `Calibration ${board} depthHi=${dh}(cand) vs depthLo=${dl}(base) pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(adapter, adapter.defaultWeights, adapter.defaultWeights, dh, dl, p, scheme, sd);
  } else if (mode === "cand") {
    const [term, depth, pairs, seedArg, opening] = rest.slice(1);
    const usage = "npx tsx scripts/pairgauntlet.ts [--game <id>] cand <term|json> <depth> <pairs> <seed> [opening]";
    const cand = resolveCandidate(adapter, term, usage);
    const d = Number(depth), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = resolveScheme(adapter, opening);
    label = `Candidate "${term}" vs DEFAULT ${board} depth=${d} pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(adapter, cand, adapter.defaultWeights, d, d, p, scheme, sd);
  } else if (mode === "pvs") {
    // Candidate = PVS off, baseline = PVS on (Tablut and Copenhagen ship on;
    // Brandubh ships off, so this mode is a no-op A/A there, which is fine —
    // it means the same thing as `aa` for that board). Same DEFAULT_WEIGHTS
    // both sides, same depth both sides: the only thing varied is `usePVS`.
    // See WP-2.0 / docs/reports/pvs-tablut-copenhagen.md for why this mode
    // exists and what it measured.
    const [depth, pairs, seedArg, opening] = rest.slice(1);
    const usage = "npx tsx scripts/pairgauntlet.ts [--game <id>] pvs <depth> <pairs> <seed> [opening]";
    const d = Number(depth), p = Number(pairs);
    const sd = requireSeed(seedArg, usage);
    const scheme = resolveScheme(adapter, opening);
    label = `PVS off (cand) vs PVS on (base) ${board} depth=${d} pairs=${p} seed=${sd} opening=${scheme}`;
    console.log(label);
    summary = runGauntlet(
      adapter,
      adapter.defaultWeights,
      adapter.defaultWeights,
      d,
      d,
      p,
      scheme,
      sd,
      console.log,
      adapter.pvsConfig(false),
      adapter.pvsConfig(true),
    );
  } else {
    console.error(
      "usage:\n" +
        "  npx tsx scripts/pairgauntlet.ts [--game <id>] aa <depth> <pairs> <seed> [opening]\n" +
        "  npx tsx scripts/pairgauntlet.ts [--game <id>] calibrate <depthHi> <depthLo> <pairs> <seed> [opening]\n" +
        "  npx tsx scripts/pairgauntlet.ts [--game <id>] cand <term|json> <depth> <pairs> <seed> [opening]\n" +
        "  npx tsx scripts/pairgauntlet.ts [--game <id>] pvs <depth> <pairs> <seed> [opening]\n" +
        `game (default brandubh): ${GAME_IDS.join(" | ")}\n` +
        `opening (default: book2 on brandubh, shallow2 on tablut/copenhagen): ${OPENING_SCHEMES.join(" | ")}\n` +
        "  book2/book4 are Brandubh-only — the opening book exists for no other board.\n" +
        "named cand terms per game:\n" +
        GAME_IDS.map((g) => `  ${g}: ${adapterFor(g).candidateTerms().join(", ")}`).join("\n") +
        "\n  or a JSON object of overrides, e.g. '{\"liberties\":12}'\n" +
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
