/* Offline puzzle-bank generator. Run:
 *   npx tsx scripts/genpuzzles.ts [--games 120] [--depth 6] [--verify 4]
 *                                 [--target 80] [--seed 12345] [--nodes 200000] [--dry]
 *
 * Mines verified **Puzzles** from seeded self-play plus hand-added positions and
 * emits src/game/puzzleBank.data.ts, the bank the app bundles (decoded by
 * src/game/puzzleBank.ts). Same shape as scripts/genbook.ts: deterministic,
 * fixed depths, no deadline, no rng outside the seeded one, a regeneration
 * command in the emitted header, and a printed summary.
 *
 * ## Mining and emitting are separate jobs
 *
 * Mining is hours; emitting is a second. Run as one command they were also one
 * transaction, and a run interrupted at 95% delivered 0% — which is exactly what
 * happened. Three properties fix that, and they are the reason for the mode
 * flags:
 *
 *   • **Checkpointed.** A **Shard** on disk is rewritten after every game, so an
 *     interruption costs one game and re-running the same command resumes.
 *   • **Shardable.** `--from`/`--to` mine a range of games. Ranges are
 *     independent (see the seeding note below), so they run in parallel on as
 *     many cores as there are, and `--merge` combines them.
 *   • **Re-gradable.** A shard holds *assessed* puzzles: the measurements, not
 *     the grade. `--merge` alone re-bands the whole bank from shards already on
 *     disk, without re-mining. Since `BAND_CUTS` is explicitly a guess until 8f
 *     fits it, that turns a cut-tuning iteration from hours into a second.
 *
 *   Modes:
 *     (neither flag)  mine [--from, --to) and emit         — the one-shot run
 *     --shard         mine [--from, --to) into a shard, no emit
 *     --merge         emit from every shard on disk, no mining
 *
 *   A full parallel run over 8 cores, then the emit:
 *     for i in 0 1 2 3 4 5 6 7; do
 *       npx tsx scripts/genpuzzles.ts --shard --from $((i*20)) --to $((i*20+20)) &
 *     done; wait
 *     npx tsx scripts/genpuzzles.ts --merge
 *
 *   Adding a position to data/puzzle-handadds.txt and regenerating:
 *     npx tsx scripts/genpuzzles.ts --shard --from 0 --to 0
 *     npx tsx scripts/genpuzzles.ts --merge
 *
 *   The empty range is deliberate: hand-adds are mined by whichever shard holds
 *   game 0, once, recorded as `handAdds: true`, so re-running that shard's real
 *   range never opens the file again, and `--merge` never mines at all. A fresh
 *   0-0 shard reads the file and mines no games. Every one of those three
 *   commands now says what it is skipping (`scripts/handadds.ts`), because the
 *   two wrong ones used to say nothing whatsoever.
 *
 * Shards are checked in. They are the mined evidence and the data module is the
 * shipped subset of it, so a refit in 8f is reproducible from the repo by anyone
 * who cannot spend an afternoon re-mining.
 *
 * ## Why a game is reproducible from its own seed alone
 *
 * Sharding and resuming are both the same bet: that game *g* plays out the same
 * way whatever did or did not happen before it. Two things had to change for
 * that to be true, and neither is cosmetic.
 *
 *   • **The rng reseeds per game** from `SEED` and the game index, instead of
 *     one stream running through all of them. `chooseMove` draws a
 *     data-dependent number of times, so under a single stream game 100's
 *     position in it depended on all 99 games before it and no range could start
 *     anywhere but 0.
 *   • **The assessor no longer perturbs the trajectory it samples.** Assessment
 *     used to run *between* the plies of the game it was mining, and it writes
 *     to the shared transposition table that `chooseMove` reads for move
 *     *ordering* — so whether a position got assessed at all, which depended on
 *     the global duplicate set and on the target being reached, changed which
 *     moves the game went on to play. A game is now played to completion first
 *     and its candidates assessed after, which removes the coupling
 *     structurally rather than defending against it. `analysePosition`
 *     (`ai.ts:1295-1315`) records the same hazard found the same way.
 *
 * ## What "verified" means here, and what it does not
 *
 * Two kinds of evidence, never confused with each other (ADR-0002). `regicide`
 * and `escape` are **proofs**: `solve()` returns a game-theoretic value and the
 * shipped line is a prefix of a proven one. `crushing` and `advantage` are
 * **evaluations** at the generation depth against cuts calibrated in
 * `scripts/annotate-calibrate.ts`. A proof is never called an evaluation and an
 * evaluation is never called a proof, in the data or in this file.
 *
 * ## The filters, and why the yield is low on purpose
 *
 * 1. UNIQUENESS (ADR-0001). A bank puzzle plays the opponent's replies from a
 *    stored line, so a learner answering with a *different* equally-best move
 *    walks into a scripted reply that no longer fits the board. Any candidate
 *    whose solving move at any shipped step has an equal-best rival is rejected
 *    rather than trimmed. In an open position with many raider moves this throws
 *    away a lot of otherwise good material; that cost was accepted deliberately,
 *    and the yield is printed so it stays visible rather than merely accepted.
 *
 * 2. VERIFY DEPTH. The suite re-checks uniqueness cheaply, at BANK_VERIFY_DEPTH,
 *    because re-running the generation-depth search over ~200 solver moves in
 *    `npm test` would add another `ai.test.ts`. For that fast invariant to be
 *    true of what ships, the generator has to enforce it, so a candidate whose
 *    solving move is not *also* uniquely best at the verify depth is rejected
 *    here. The consequence is worth stating plainly: `depthToFind` can then
 *    never exceed BANK_VERIFY_DEPTH, which caps the range of the grade formula's
 *    dominant term. See the note in the summary.
 *
 * 3. GOAL. A proof whose win arrives by encirclement, no-moves or repetition is
 *    rejected: the goal vocabulary has four values and none of them names those,
 *    so shipping one as `regicide` would be the bank claiming more than it has.
 *
 * ## Truncation (ADR-0002 + the plan's proposal 3)
 *
 * The full proof is held here; the prefix ships. The operational predicate is:
 * stop at the first solver move after which the win is proven AND no further
 * *uniquely-best* solver move remains — because once there is no single right
 * answer there is nothing left to test. That reading is what makes ADR-0001 and
 * ADR-0002 the same rule seen twice. Four solver moves is the hard cap either
 * way.
 *
 * ## The ledger
 *
 * data/puzzle-ledger.json maps a position to its permanent five-digit **Puzzle
 * number**. The key is `canonicalKey` of the position the learner actually sees
 * — after the lead-in, folded over D4 — so a mirrored duplicate is recognised as
 * the same puzzle and keeps its number, and a ruleset change that alters the
 * answer keeps it too. Numbers are assigned in order of first appearance and
 * never reused. A hand-written **Note** in the ledger outranks anything computed
 * and this generator does not argue with it. Checked in, never bundled.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chooseMove, resetTT, scoreRootMoves } from "../src/game/ai";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "../src/game/engine";
import { encodeMove, rulesFingerprint } from "../src/game/openingBook";
import { encodePosition, parsePosition } from "../src/game/position";
import { canonicalKey, solve } from "../src/game/solver";
import { THRESHOLDS } from "../src/game/annotate";
import {
  bandOf,
  gradeOf,
  GRADE_WEIGHTS,
  type GradeMeasurements,
  type Salience,
} from "../src/game/grade";
import {
  encodePuzzle,
  evalGoal,
  isProof,
  PUZZLE_GOALS,
  solverMoves,
  type Puzzle,
  type PuzzleGoal,
} from "../src/game/puzzleBank";
import {
  computeTags,
  MOTIFS,
  MOTIF_SET_THRESHOLD,
  namedSets,
  PLAIN_TAGS,
  primaryMotif,
  recogniseMotifs,
  type Motif,
  type Tag,
} from "../src/game/motifs";
import { BOARD_SIZE, type GameState, type Move, type Side, type Square } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";
import { CORNERS, isCorner } from "../src/game/engine";
import {
  handAddProblemReport,
  mergeHandAddWarning,
  readHandAdds,
  shardHandAddWarning,
  type HandAddFile,
} from "./handadds";

const rules = VARIANTS.wtf; // the shipping default; the bank is fingerprint-gated to it

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string, def: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : def;
};
const GAMES = flag("games", 120);
const DEPTH = flag("depth", 6); // generation depth for the evaluation goals
const VERIFY = flag("verify", 4); // the cheap depth the suite re-checks at
/**
 * When a one-shot run has mined enough to stop. A **floor, not a ceiling**:
 * everything a shard found ships, because there is no reason to throw away a
 * verified puzzle that cost an hour to find. The bank is a few bytes per record
 * in a bundle already measured in hundreds of kilobytes, and a larger pool is
 * what gives the **Bands** something to be cut from.
 *
 * `--shard` ignores it entirely: a shard cannot see what the others have found,
 * so it mines its whole range and lets the merge take everything.
 */
const TARGET = flag("target", 80);
const SEED = flag("seed", 12345);
const NODES = flag("nodes", 400_000); // solver budget per candidate
const MAX_PLIES = 70;
const DRY = argv.includes("--dry");

// ── Mode and range ────────────────────────────────────────────────────────────
/** Mine this half-open range of games, `[FROM, TO)`. Hand-adds belong to the
 *  range that contains game 0, so exactly one shard of a parallel run assesses
 *  them and the merge does not have to dedupe them against each other. */
const FROM = flag("from", 0);
const TO = flag("to", GAMES);
const MINE_ONLY = argv.includes("--shard");
const MERGE_ONLY = argv.includes("--merge");
/** Discard an existing shard instead of resuming it. Resuming is the default
 *  precisely because the failure this is here for is an interruption, and after
 *  one the obvious thing to type is the command you typed before. */
const RESTART = argv.includes("--restart");

const OUT = join(import.meta.dirname, "../src/game/puzzleBank.data.ts");
const LEDGER = join(import.meta.dirname, "../data/puzzle-ledger.json");
const HANDADDS = join(import.meta.dirname, "../data/puzzle-handadds.txt");
const SHARD_DIR = join(import.meta.dirname, "../data/puzzle-shards");
const shardPath = (from: number, to: number): string =>
  join(SHARD_DIR, `games-${String(from).padStart(4, "0")}-${String(to).padStart(4, "0")}.json`);

/** At most four solver moves — a learner playing out a proven guillotine is
 *  being tested on patience, not recognition (ADR-0002). */
const MAX_SOLVER_MOVES = 4;

/** How much the lead-in has to have given up for the position after it to be
 *  worth assessing. `annotate.ts`'s own blunder band, in the same units and
 *  calibrated by the same script — a **Review Mistake** and a bank puzzle ask
 *  the same question, so they should agree about what counts as a mistake. */
const BLUNDER = THRESHOLDS.blunder;

// ── Seeded rng ────────────────────────────────────────────────────────────────
//
// One stream per *game*, not one per run. Under a single stream, how far into it
// game `g` began depended on how many draws every game before it happened to
// make, so a range could only ever start at 0 and a resume had to replay
// everything it had already done. Reseeding from the game index is what makes
// `--from`/`--to` and the checkpoint exact rather than approximate: the whole
// state of the generator between games is the integer below, and it is a pure
// function of the run seed and the index.
let seed = SEED;
const rng = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/** Knuth's multiplicative constant, to spread adjacent game indices to distant
 *  seeds — consecutive seeds in an LCG this small give correlated first draws,
 *  which would make neighbouring games open alike. */
const seedGame = (g: number): void => {
  seed = (SEED + Math.imul(g + 1, 2654435761)) & 0x7fffffff;
};

const other = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");
const byEncoding = (a: Move, b: Move): number => encodeMove(a).localeCompare(encodeMove(b));

// ── Rejection bookkeeping ─────────────────────────────────────────────────────
// Every candidate leaves by exactly one door, and every door is counted. A yield
// number without its reasons is a number nobody can act on.
const REASONS = [
  "duplicate_position",
  "not_decisive",
  "solver_tie",
  "unprovable_goal",
  "verify_depth_tie",
  "line_too_short",
  "reproof_failed",
  "budget_exceeded",
] as const;
type Reason = (typeof REASONS)[number];
const zeroReasons = (): Record<Reason, number> =>
  Object.fromEntries(REASONS.map((r) => [r, 0])) as Record<Reason, number>;
const rejected: Record<Reason, number> = zeroReasons();
let candidates = 0;

// ── The per-candidate budget ──────────────────────────────────────────────────
//
// `solve()` is bounded by `maxNodes`, but the three places that call it in a
// *loop* are not bounded by anything: `winningMoves` runs one solve per root
// move, `provenLine` runs `winningMoves` at up to four steps, and `provenGoal`
// walks the whole proof at one solve per ply. A candidate deep enough to be
// interesting to all three can therefore run for as long as it likes, and one
// measured here ran past twenty minutes with a whole shard waiting behind it —
// and, worse, would have been re-entered on every resume, because a checkpoint
// faithfully records where you were stuck.
//
// Abandoning a candidate is always safe in the direction that matters. The whole
// pipeline only ever *drops* material, so a budget cannot put a wrong puzzle in
// the bank; it can only leave a right one out. That asymmetry is why this is a
// budget and not a deadline that ships what it has.
//
// It is counted like every other door out (`budget_exceeded`), because a filter
// nobody can see the cost of is a filter nobody can argue with.
const BUDGET_MS = flag("budget", 180_000);
let candidateStart = 0;
const overBudget = (): boolean => performance.now() - candidateStart > BUDGET_MS;

// ── The moves the solver would play, and whether it has a choice ──────────────

/**
 * Every root move that forces a win for `side`, fastest first, ties by encoding
 * so a regeneration is byte-stable. The uniqueness filter is `wins.length === 1`
 * and `!uncertain`.
 *
 * `uncertain` is set when a child ran out of budget: the solver never lies, so
 * an UNKNOWN is "not determined", never "not a win". A move that might be a
 * rival has to count as one, because the whole cost of getting this wrong is a
 * learner playing an equally-good move into a scripted reply that no longer
 * fits the board.
 */
function winningMoves(
  state: GameState,
  side: Side,
): { wins: Array<{ move: Move; dtm: number }>; uncertain: boolean } {
  const wins: Array<{ move: Move; dtm: number }> = [];
  let uncertain = false;
  for (const m of allMoves(state.board, state.turn, rules)) {
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status)) {
      if (winnerOf(child.status) === side) wins.push({ move: m, dtm: 1 });
      continue;
    }
    const r = solve(child, rules, { maxNodes: NODES });
    if (r.value === side) wins.push({ move: m, dtm: r.dtm + 1 });
    else if (r.value === "unknown") uncertain = true;
    if (wins.length > 1) break; // a second winner is already the whole answer
    // Out of budget with root moves left unexamined is the same state of
    // knowledge as a child that ran out of nodes: one of the moves we did not
    // look at might be a rival, so we do not get to say there was only one.
    if (overBudget()) {
      uncertain = true;
      break;
    }
  }
  wins.sort((a, b) => a.dtm - b.dtm || byEncoding(a.move, b.move));
  return { wins, uncertain };
}

/** The opponent's best defence: the slowest forced loss, ties by encoding. The
 *  tie-break is what makes regeneration reproducible — `solve` is deterministic
 *  but its move ordering is not a promise, and a stored line that shuffles on
 *  every run is a bank whose numbers mean nothing. */
function bestDefence(state: GameState, winner: Side): Move | null {
  let best: { move: Move; dtm: number } | null = null;
  for (const m of allMoves(state.board, state.turn, rules)) {
    const child = applyMove(state, m, rules);
    let dtm: number;
    if (isGameOver(child.status)) {
      if (winnerOf(child.status) !== winner) return m; // escaping the loss beats delaying it
      dtm = 1;
    } else {
      const r = solve(child, rules, { maxNodes: NODES });
      if (r.value !== winner) return m;
      dtm = r.dtm + 1;
    }
    if (best === null || dtm > best.dtm || (dtm === best.dtm && byEncoding(m, best.move) < 0)) {
      best = { move: m, dtm };
    }
  }
  return best?.move ?? null;
}

/** The exact-tie set at `depth`, ordered by encoding. */
function bestAt(state: GameState, depth: number): { best: number; moves: Move[] } {
  resetTT();
  const { best, within } = scoreRootMoves(state, rules, depth, 0);
  return { best, moves: within.map((w) => w.move).sort(byEncoding) };
}

const sameMove = (a: Move, b: Move): boolean => encodeMove(a) === encodeMove(b);

// ── Line construction ─────────────────────────────────────────────────────────

interface Built {
  line: Move[];
  goal: PuzzleGoal;
  dtm: number;
  truncated: boolean;
}

/**
 * A proven line, truncated by the predicate above.
 *
 * The full proof is walked to the end so the goal can be read off the terminal
 * status rather than guessed from who won; only the prefix is returned.
 */
function provenLine(start: GameState, solver: Side, rootDtm: number): Built | Reason {
  const shipped: Move[] = [];
  let state = start;
  let truncated = false;

  for (let step = 0; step < MAX_SOLVER_MOVES; step++) {
    const { wins, uncertain } = winningMoves(state, solver);
    if (wins.length === 0 || (wins.length === 1 && uncertain && step === 0)) return "solver_tie";
    if (wins.length > 1 || uncertain) {
      // No single right answer left — or none we can prove is single — so there
      // is nothing further to test. The prefix already shipped is the puzzle,
      // and the rest is proven but untested.
      if (step === 0) return "solver_tie";
      truncated = true;
      break;
    }
    shipped.push(wins[0].move);
    state = applyMove(state, wins[0].move, rules);
    if (isGameOver(state.status)) break;
    const reply = bestDefence(state, solver);
    if (reply === null) break;
    shipped.push(reply);
    state = applyMove(state, reply, rules);
    if (isGameOver(state.status)) return "solver_tie"; // the defence ended it; not our line
    if (step + 1 === MAX_SOLVER_MOVES) truncated = true;
  }

  if (shipped.length === 0) return "line_too_short";
  // The goal is read off the end of the *proof*, not off the prefix: it says what
  // kind of evidence the puzzle rests on. Only two terminal statuses have names in
  // the goal vocabulary, and a win that arrives any other way is not shipped.
  const goal = provenGoal(start, solver);
  if (goal === null) return "unprovable_goal";
  return { line: shipped, goal, dtm: rootDtm, truncated: truncated || rootDtm > shipped.length };
}

/**
 * Play the proof out to its terminal position and name it.
 *
 * Walked with `solve().bestMove`, which is the fastest win for the winner and
 * the slowest loss for the loser — one solve per ply rather than the full
 * uniqueness scan, because naming the ending does not need to know whether the
 * winner had a choice. Returns null when the win arrives by encirclement,
 * no-moves or repetition: real wins, with no name in the four-value goal
 * vocabulary, and the bank does not invent one.
 *
 * The states are returned as well as the name, because they are the **Guillotine**
 * recogniser's only possible input: the motif lives past the end of the shipped
 * **Line** and is read off the solver's working rather than off the board. They
 * are not stored — `solve()` is a pure function of the position and the params
 * the shard records, so the merge re-derives this walk exactly rather than
 * carrying it around. See `tagOf` and the note on re-derivation in `emit`.
 */
function walkProof(start: GameState, solver: Side): { states: GameState[]; goal: PuzzleGoal } | null {
  const states: GameState[] = [start];
  let state = start;
  for (let ply = 0; ply < 128 && !isGameOver(state.status); ply++) {
    if (overBudget()) return null; // unnamed ending; the caller rejects it
    const r = solve(state, rules, { maxNodes: NODES });
    if (r.value !== solver || r.bestMove === null) return null;
    state = applyMove(state, r.bestMove, rules);
    states.push(state);
  }
  if (state.status === "defenders_win_escape") return { states, goal: "escape" };
  if (state.status === "attackers_win_capture") return { states, goal: "regicide" };
  return null;
}

const provenGoal = (start: GameState, solver: Side): PuzzleGoal | null =>
  walkProof(start, solver)?.goal ?? null;

/**
 * An evaluated line: the solver's unique best move and the opponent's best
 * reply, repeated until the position is `crushing`, the answer stops being
 * unique, or four solver moves are up.
 *
 * Never truncated: truncation means "a prefix of a *proven* line", and there is
 * no proof here to be a prefix of. Saying so is the difference between the two
 * kinds of evidence, kept visible in the data as well as in the prose.
 */
function evaluatedLine(start: GameState, solver: Side): Built | Reason {
  const shipped: Move[] = [];
  let state = start;

  for (let step = 0; step < MAX_SOLVER_MOVES; step++) {
    const solving = bestAt(state, DEPTH).moves;
    if (solving.length !== 1) break; // no single right answer left
    shipped.push(solving[0]);
    state = applyMove(state, solving[0], rules);
    // A line that ends the game is a proof's job. Letting an evaluation claim a
    // finished position would be exactly the conflation ADR-0002 forbids.
    if (isGameOver(state.status)) return "unprovable_goal";
    if (evalGoal(bestAt(state, DEPTH).best, solver) === "crushing") break;
    if (step + 1 === MAX_SOLVER_MOVES) break;
    const reply = bestAt(state, DEPTH).moves[0];
    if (!reply) break;
    shipped.push(reply);
    state = applyMove(state, reply, rules);
    if (isGameOver(state.status)) return "unprovable_goal";
  }

  // A **Line** always ends on a solver move; a trailing reply means the loop
  // stopped between the two halves of a step, so it is not part of the answer.
  if (shipped.length % 2 === 0) shipped.pop();
  if (shipped.length === 0) return "line_too_short";
  const goal = evalGoal(bestAt(replay(start, shipped), DEPTH).best, solver);
  if (goal === null) return "not_decisive";
  return { line: shipped, goal, dtm: Infinity, truncated: false };
}

const replay = (from: GameState, line: Move[]): GameState =>
  line.reduce((s, m) => applyMove(s, m, rules), from);

// ── Grade measurements ────────────────────────────────────────────────────────

/**
 * The smallest depth at which the engine returns the step-1 solving move as its
 * single best — "returns the answer", not "has the answer somewhere in a tie".
 * A move the search only picks out once it has looked four plies ahead is a
 * harder move to find than one it picks at a glance, and a move that is merely
 * *among* the best at depth 1 has not been found at all.
 *
 * Bounded above by VERIFY, because the verify-depth filter has already
 * established that it is uniquely best there. That bound is a real limit on the
 * grade formula and is called out in the generator's header.
 */
function depthToFind(start: GameState, move: Move): number {
  for (let d = 1; d <= VERIFY; d++) {
    const { moves } = bestAt(start, d);
    if (moves.length === 1 && sameMove(moves[0], move)) return d;
  }
  return VERIFY;
}

/** Rank-and-file distance to the nearest corner — the King's own metric, since
 *  a corner is reached along ranks and files and never diagonally. */
const cornerDistance = (sq: Square): number =>
  Math.min(...CORNERS.map((k) => Math.abs(k.row - sq.row) + Math.abs(k.col - sq.col)));

function salienceOf(start: GameState, move: Move): Salience {
  const piece = start.board[move.from.row][move.from.col];
  // `allMoves` does not resolve captures — `applyMove` does, and records them on
  // the history entry — so the capture flag is read from the played move.
  const after = applyMove(start, move, rules);
  const played = after.history[after.history.length - 1]?.move;
  const ownMoves = allMoves(start.board, start.turn, rules).filter(
    (m) => m.from.row === move.from.row && m.from.col === move.from.col,
  );
  return {
    capture: (played?.captures?.length ?? 0) > 0,
    movesKing: piece === "king",
    towardCorner:
      isCorner(move.to.row, move.to.col) || cornerDistance(move.to) < cornerDistance(move.from),
    onlyMoveOfPiece: ownMoves.length === 1,
  };
}

// ── One candidate, end to end ─────────────────────────────────────────────────

interface Candidate {
  before: GameState;
  leadIn: Move;
  start: GameState;
}

type Assessed = Omit<Puzzle, "id" | "grade" | "band">;

function assess(c: Candidate): Assessed | Reason {
  const solver = c.start.turn;
  candidateStart = performance.now();

  // A position nobody is winning has nothing to ask about. Gated at the verify
  // depth rather than shallower, and deliberately not on uniqueness:
  //
  //   • a *shallower* score gate would admit only wins the engine can already
  //     see at a glance, which pins `depthToFind` near 1 for the whole bank and
  //     flattens the grade formula's dominant term — measured, not feared: at a
  //     depth-2 gate, 8 of 9 puzzles in a trial run came out with depthToFind 1.
  //   • a uniqueness gate here would do the same thing for the same reason.
  //
  // One depth-VERIFY search is cheap beside the hundreds of thousands of solver
  // nodes a real assessment costs, so this is the right place to spend it.
  if (evalGoal(bestAt(c.start, VERIFY).best, solver) === null) return "not_decisive";

  const proved = solve(c.start, rules, { maxNodes: NODES });
  const built = proved.value === solver ? provenLine(c.start, solver, proved.dtm) : evaluatedLine(c.start, solver);
  // A rejection that coincides with the budget running out is attributed to the
  // budget, not to the door it happened to leave by: reporting it as
  // `solver_tie` would claim the position was examined and found ambiguous when
  // in fact it was abandoned half-examined.
  if (typeof built === "string") return overBudget() ? "budget_exceeded" : built;

  // The fast-suite invariant, enforced here so it is true of what ships.
  let state = c.start;
  for (let i = 0; i < built.line.length; i++) {
    if (i % 2 === 0) {
      const cheap = bestAt(state, VERIFY);
      if (cheap.moves.length !== 1 || !sameMove(cheap.moves[0], built.line[i])) return "verify_depth_tie";
    }
    state = applyMove(state, built.line[i], rules);
  }

  const measurements: GradeMeasurements = {
    depthToFind: depthToFind(c.start, built.line[0]),
    lineLength: solverMoves(built.line),
    salience: salienceOf(c.start, built.line[0]),
  };

  return {
    position: encodePosition(c.before),
    leadIn: c.leadIn,
    line: built.line,
    goal: built.goal,
    truncated: built.truncated,
    dtm: built.dtm,
    measurements,
    // Left empty here on purpose. Tagging is a merge-time job (see `tagOf`): a
    // shard holds *evidence*, and a motif is a conclusion drawn from it, exactly
    // as a shard holds measurements and the merge computes the grade. That is
    // what lets a recogniser change without re-mining an afternoon.
    motif: null,
    tags: [],
  };
}

// ── Tagging (8c) ──────────────────────────────────────────────────────────────

/**
 * Motif and **Tags** for one puzzle, at merge time.
 *
 * ## Why the proof is re-derived rather than stored
 *
 * The **Guillotine** recogniser's input is the full proven continuation, which
 * the miner walked in `provenGoal` and threw away. The obvious fix is to widen
 * the shard record and re-mine — and it is the wrong one, because `solve()` is a
 * pure function of the position and the shard records the exact params it was
 * mined under, so the walk re-runs here and produces the same states it produced
 * then. Re-mining would have cost 78 minutes of the four cores to recover
 * something arithmetic already had, and it would have invalidated the checked-in
 * shards, which are the repo's copy of the mined evidence.
 *
 * The re-derivation is self-checking: the walk's length must equal the stored
 * `dtm`, which was measured by an independent call (`solve(c.start).dtm`) at
 * mining time. A mismatch means the walk is not the proof the puzzle was
 * accepted on, and it is reported rather than swallowed.
 *
 * Only `regicide` and `escape` are proofs, so this runs over a small minority of
 * the bank. The other goals are evaluations, which have no proof to be a
 * continuation of (ADR-0002) and therefore can never carry a Guillotine.
 */
interface Tagged {
  motif: Motif | null;
  tags: Tag[];
  byHand: boolean;
}

const proofStats = {
  derived: 0,
  plies: 0,
  longest: 0,
  unwalkable: [] as string[],
  mismatched: [] as string[],
  ms: 0,
};

function tagOf(p: Assessed & { id: string; key: string }, ledger: Ledger): Tagged {
  const parsed = parsePosition(p.position);
  if (!parsed.ok) return { motif: null, tags: [], byHand: false };
  const start = applyMove(parsed.state, p.leadIn, rules);
  const solver = start.turn;

  const states: GameState[] = [start];
  let s = start;
  for (const m of p.line) {
    s = applyMove(s, m, rules);
    states.push(s);
  }

  let proof: GameState[] | null = null;
  if (isProof(p.goal)) {
    const t0 = performance.now();
    candidateStart = t0; // the same per-candidate budget bounds the walk
    const walked = walkProof(start, solver);
    proofStats.ms += performance.now() - t0;
    if (!walked) {
      proofStats.unwalkable.push(p.id);
    } else {
      proofStats.derived++;
      const walkedPlies = walked.states.length - 1;
      proofStats.plies += walkedPlies;
      proofStats.longest = Math.max(proofStats.longest, walkedPlies);
      if (walkedPlies !== p.dtm) proofStats.mismatched.push(`${p.id} walked ${walkedPlies}, dtm ${p.dtm}`);
      else proof = walked.states;
    }
  }

  const found = recogniseMotifs({ states, proof }, rules);
  // A hand-written **Note** outranks anything computed: it is a person saying
  // what the position is, and this script does not argue.
  const hand = ledger[p.key]?.motif;
  const byHand = hand !== undefined && (MOTIFS as readonly string[]).includes(hand);
  if (hand !== undefined && !byHand) {
    console.warn(`\nledger note for ${p.id} names an unknown motif ${JSON.stringify(hand)}; ignored`);
  }
  const motif = byHand ? (hand as Motif) : primaryMotif(found);
  return { motif, tags: computeTags({ side: solver, states, motifs: found, primary: motif }), byHand };
}

/** Re-prove a shipped line from scratch, at the end, once. The expensive check
 *  lives here and only here: `npm test` re-checks the cheap invariants, and the
 *  suite staying fast is what makes the split worth having. */
function reproof(p: Assessed): boolean {
  const parsed = parsePosition(p.position);
  if (!parsed.ok) return false;
  const start = applyMove(parsed.state, p.leadIn, rules);
  const solver = start.turn;
  // Every ply legal from the position it is played in.
  let state = start;
  for (const m of p.line) {
    if (!allMoves(state.board, state.turn, rules).some((l) => sameMove(l, m))) return false;
    state = applyMove(state, m, rules);
  }
  if (isProof(p.goal)) {
    const r = solve(start, rules, { maxNodes: NODES * 2 });
    return r.value === solver && r.dtm === p.dtm;
  }
  return evalGoal(bestAt(state, DEPTH).best, solver) === p.goal;
}

// ── Sources ───────────────────────────────────────────────────────────────────

/**
 * Seeded self-play with a third of moves played at random — `easy`'s blunder
 * rate (`ai.ts:1141`), and the `scripts/annotate-calibrate.ts` precedent. Real
 * errors are what leave puzzles behind: two perfect players never blunder into
 * one, and a bank mined from perfect play would be a bank of positions nobody
 * ever reaches.
 *
 * A ply is only offered as a candidate when the move that produced it actually
 * gave something up — `annotate.ts`'s blunder band, in the same units. That is
 * the domain's own definition of a position worth asking about, it costs two
 * shallow searches where assessing a candidate costs hundreds of thousands of
 * solver nodes, and it is why the lead-in is stored at all: a puzzle should
 * arrive as a position someone just moved into.
 */
function gameCandidates(g: number): Candidate[] {
  const out: Candidate[] = [];
  seedGame(g);
  resetTT();
  let state = initialState();
  let before = bestAt(state, 3).best;
  for (let p = 0; p < MAX_PLIES && !isGameOver(state.status); p++) {
    const legal = allMoves(state.board, state.turn, rules);
    if (!legal.length) break;
    const mover = state.turn;
    const move =
      rng() < 0.35 ? legal[Math.floor(rng() * legal.length)] : chooseMove(state, "medium", rules, rng);
    if (!move) break;
    const from = state;
    state = applyMove(state, move, rules);
    const after = isGameOver(state.status) ? before : bestAt(state, 3).best;
    const loss = mover === "attackers" ? before - after : after - before;
    before = after;
    // Collected, not assessed: the whole game is played before any of these are
    // looked at, so nothing the assessor does to the transposition table can
    // reach the moves still to be played. See the header.
    if (!isGameOver(state.status) && loss >= BLUNDER) out.push({ before: from, leadIn: move, start: state });
  }
  return out;
}

/** Hand-added positions, in `position.ts` format, one per line, `#` for a
 *  comment. **Provenance** never changes how a puzzle is verified: these go
 *  through every filter above exactly as a mined position does.
 *
 *  A hand-add is written as the position *before* the lead-in plus the lead-in
 *  move, `<position> <frfctrtc>`, because that is what a puzzle is.
 *
 *  The reading lives in `scripts/handadds.ts` so that the two commands which do
 *  *not* mine can still tell the owner what they are skipping; see the header
 *  there. A `HandAdd` is a `Candidate` with a line number and a key attached. */
const readHandAddFile = (): HandAddFile => readHandAdds(HANDADDS, rules);

/** Unreadable lines, said once and counted, rather than one stray `console.warn`
 *  per line from inside a loop. Every mode that opens the file asks; a one-shot
 *  run opens it twice (mining, then emitting) and the flag keeps the answer to
 *  one telling, because a warning repeated is a warning discounted. */
let handAddProblemsSaid = false;
function reportHandAddProblems(file: HandAddFile): void {
  if (handAddProblemsSaid) return;
  const problems = handAddProblemReport(file);
  if (!problems) return;
  console.warn(`\n${problems}`);
  handAddProblemsSaid = true;
}

/** Say what a shard that will not open the hand-adds file is skipping by not
 *  opening it. Only the range holding game 0 owns them, so no other range is
 *  entitled to an opinion; see the note on `Shard.handAdds`. */
function reportSkippedHandAdds(seen: ReadonlySet<string>): void {
  if (FROM !== 0) return;
  const file = readHandAddFile();
  reportHandAddProblems(file);
  const stale = shardHandAddWarning(file, seen);
  if (stale) console.warn(`\n${stale}`);
}

// ── Ledger ────────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id: string;
  /** Hand-written prose about the position. Generator input only: it outranks
   *  anything computed and this script does not argue with it. Never bundled. */
  note?: string;
  /** A **Motif** assigned by hand, which 8c's tagger honours over a recogniser. */
  motif?: string;
}
type Ledger = Record<string, LedgerEntry>;

const readLedger = (): Ledger => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {});

const nextNumber = (ledger: Ledger): number =>
  Object.values(ledger).reduce((n, e) => Math.max(n, Number(e.id)), 0) + 1;

// ── Shards ────────────────────────────────────────────────────────────────────

/**
 * `Assessed` as it travels on disk.
 *
 * `dtm` is `Infinity` for an evaluation goal and JSON has no such number, so it
 * goes as null and comes back as `Infinity`. `key` rides along because the merge
 * dedupes on it and re-deriving it would mean re-parsing and re-folding every
 * position to learn something the miner already knew.
 */
type StoredAssessed = Omit<Assessed, "dtm"> & { dtm: number | null; key: string };

const toStored = (a: Assessed, key: string): StoredAssessed => ({
  ...a,
  dtm: Number.isFinite(a.dtm) ? a.dtm : null,
  key,
});
const fromStored = (s: StoredAssessed): Assessed & { key: string } => ({
  ...s,
  dtm: s.dtm === null ? Infinity : s.dtm,
});

/**
 * One mined range of games. The unit of both parallelism and crash-safety: a
 * shard is rewritten after every game, so an interruption costs the game in
 * flight and nothing else.
 *
 * It holds *assessed* puzzles and no ids. Numbering is "order of first
 * appearance" over the whole bank, which only the merge is in a position to
 * know, so a shard that assigned numbers would be asserting something it cannot
 * see. The ledger is written by the merge and by nothing else, for the same
 * reason.
 */
interface Shard {
  /** What it was mined under. The merge refuses to mix shards that disagree: a
   *  bank half-mined at depth 6 and half at depth 8 is not a bank. */
  params: { depth: number; verify: number; seed: number; nodes: number };
  from: number;
  to: number;
  /** The next game to mine, `=== to` when the shard is complete. The resume
   *  cursor and the done flag are deliberately one field, so there is no way to
   *  be finished and wrong about it. */
  next: number;
  /**
   * How many of game `next`'s candidates are already assessed.
   *
   * The checkpoint is per *candidate*, not per game, because the cost is per
   * candidate and wildly uneven: a candidate whose position the solver can prove
   * runs `winningMoves` (a full `solve` for every root move) at up to four steps
   * and then walks the whole proof in `provenGoal`, which is minutes, while a
   * candidate rejected as `not_decisive` is one shallow search. A per-game
   * checkpoint would happily throw away twenty minutes.
   *
   * Resuming re-plays the game to recover its candidate list and skips this many.
   * Replaying self-play is seconds against assessment's minutes, which is what
   * makes storing an index cheaper than storing the positions.
   */
  nextInGame: number;
  /** Whether the hand-adds have been through. They belong to the range holding
   *  game 0 and are assessed before it, which is a boundary `next` cannot
   *  express. */
  handAdds: boolean;
  candidates: number;
  rejected: Record<Reason, number>;
  found: StoredAssessed[];
  /**
   * Every position key this shard has already looked at, including the ones it
   * threw away.
   *
   * Rebuilding this from `found` alone would be the cheap-looking mistake: the
   * keys it would lose are exactly the *rejected* ones, and a rejected candidate
   * is not a cheap candidate — `solver_tie` is returned by `winningMoves` after
   * a full `solve()` on every root move. A resume would then spend ten minutes
   * re-deciding something this shard had already decided, which is the failure
   * the checkpoint exists to prevent.
   */
  seen: string[];
}

const paramsNow = (): Shard["params"] => ({ depth: DEPTH, verify: VERIFY, seed: SEED, nodes: NODES });

/**
 * Write a shard so that losing power during the write cannot lose the shard.
 *
 * Write-then-rename, because `rename` within a filesystem is atomic and a
 * half-finished `writeFileSync` is not: a shard truncated mid-JSON would fail to
 * parse on the next run and take every game in it down with it. That would be a
 * peculiar way for a checkpoint to fail — only ever during the one event it was
 * built for.
 */
function writeShard(s: Shard): void {
  mkdirSync(SHARD_DIR, { recursive: true });
  const path = shardPath(s.from, s.to);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(s)}\n`);
  renameSync(tmp, path);
}

/**
 * Every position key a shard has already decided about, the kept ones and the
 * thrown-away ones alike.
 *
 * This is the set a hand-add has to be measured against, not `found`: a
 * hand-add that went through every filter and was rejected has been *looked
 * at*, and a report that told its owner to mine it again would be crying wolf
 * about the one outcome the pipeline is entitled to reach.
 *
 * `?? found` only for a shard written before `seen` was recorded; it under-reads
 * by the rejected keys, which costs time on one resume and nothing after.
 */
const shardSeen = (s: Shard): Set<string> => new Set(s.seen ?? s.found.map((f) => f.key));

/** Every shard on disk, in game order — which is the order the merge needs, and
 *  the only reason the range is in the filename. */
function readShards(): Shard[] {
  if (!existsSync(SHARD_DIR)) return [];
  return readdirSync(SHARD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(SHARD_DIR, f), "utf8")) as Shard)
    .sort((a, b) => a.from - b.from);
}

// ── Mining ────────────────────────────────────────────────────────────────────

/**
 * Assess the candidates in `[FROM, TO)`, resuming an existing shard unless
 * `--restart`.
 *
 * The target only stops a one-shot run. A shard cannot honour it, because it
 * cannot see how many the other shards have found; it mines its whole range and
 * everything it found ships. That costs some assessment a smaller bank would not
 * have paid for, and buys ranges that do not have to talk to each other.
 */
function mine(): Shard {
  const path = shardPath(FROM, TO);
  let shard: Shard = {
    params: paramsNow(),
    from: FROM,
    to: TO,
    next: FROM,
    nextInGame: 0,
    handAdds: false,
    candidates: 0,
    rejected: zeroReasons(),
    found: [],
    seen: [],
  };

  if (!RESTART && existsSync(path)) {
    const prior = JSON.parse(readFileSync(path, "utf8")) as Shard;
    if (JSON.stringify(prior.params) !== JSON.stringify(shard.params)) {
      throw new Error(
        `${path}\n  was mined under ${JSON.stringify(prior.params)}\n  but this run is ${JSON.stringify(shard.params)}.\n` +
          `  Re-run with matching flags, or --restart to discard it.`,
      );
    }
    shard = prior;
    shard.nextInGame ??= 0;
    if (shard.next >= shard.to && shard.handAdds) {
      console.log(`${shard.found.length} puzzles already mined in games ${FROM}-${TO}; nothing to do.`);
      // "Nothing to do in this range" and "nothing to do" are different claims,
      // and this return has only ever made the second one. The hand-adds flag is
      // checked before the file is opened, so a position appended since this
      // shard was mined is skipped here without the file being read at all,
      // which is exactly the case in which the owner is waiting to hear about it.
      reportSkippedHandAdds(shardSeen(shard));
      return shard;
    }
    console.log(
      `resuming games ${FROM}-${TO} at game ${shard.next}` +
        (shard.nextInGame ? ` candidate ${shard.nextInGame}` : "") +
        `, ${shard.found.length} already found`,
    );
  }

  // Restored so a resumed run's report reads as if it had never stopped.
  candidates = shard.candidates;
  for (const r of REASONS) rejected[r] = shard.rejected[r] ?? 0;
  // `?? found` only for a shard written before `seen` was recorded; it under-
  // reads by the rejected keys, which costs time on one resume and nothing after.
  const seen = new Set(shard.seen ?? shard.found.map((f) => f.key));

  const take = (c: Candidate): void => {
    candidates++;
    const key = canonicalKey(c.start);
    if (seen.has(key)) {
      rejected.duplicate_position++;
      return;
    }
    seen.add(key);
    const result = assess(c);
    if (typeof result === "string") {
      rejected[result]++;
      return;
    }
    if (!reproof(result)) {
      rejected.reproof_failed++;
      return;
    }
    shard.found.push(toStored(result, key));
  };

  const checkpoint = (): void => {
    shard.candidates = candidates;
    shard.rejected = { ...rejected };
    shard.seen = [...seen];
    if (!DRY) writeShard(shard);
  };

  const enough = (): boolean => !MINE_ONLY && shard.found.length >= TARGET;

  if (FROM === 0 && !shard.handAdds) {
    const file = readHandAddFile();
    reportHandAddProblems(file);
    if (file.entries.length) console.log(`hand-adds: assessing ${file.entries.length} before game 0`);
    for (const c of file.entries) {
      if (enough()) break;
      take(c);
    }
    shard.handAdds = true;
    checkpoint();
  } else if (FROM === 0) {
    // Resuming a shard that already did the hand-add pass. It did it against
    // whatever the file said then, which is not necessarily what it says now.
    reportSkippedHandAdds(seen);
  }

  const progress = (g: number, i: number, of: number): void => {
    process.stdout.write(
      `\rgame ${g + 1}/${TO} · candidate ${i}/${of} · ${candidates} assessed · ${shard.found.length} found   `,
    );
  };

  for (let g = shard.next; g < TO && !enough(); g++) {
    shard.next = g; // so an interruption inside the loop below resumes in this game
    const cs = gameCandidates(g);
    progress(g, shard.nextInGame, cs.length);
    for (let i = shard.nextInGame; i < cs.length && !enough(); i++) {
      take(cs[i]);
      shard.nextInGame = i + 1;
      checkpoint();
      progress(g, i + 1, cs.length);
    }
    // Only past the game when every candidate in it was assessed. A run stopped
    // early by the target must not leave the game marked done, or a later run
    // with a larger target would skip candidates it never looked at.
    if (shard.nextInGame >= cs.length) {
      shard.next = g + 1;
      shard.nextInGame = 0;
    }
    checkpoint();
  }
  process.stdout.write("\n");
  return shard;
}

// ── Merge and emit ────────────────────────────────────────────────────────────

/**
 * Turn shards into the data module and the ledger.
 *
 * Cheap, and separate from mining so it can be re-run on its own: `--merge`
 * re-bands the whole bank from what is already on disk. `BAND_CUTS` is
 * explicitly a guess until 8f fits it, so the difference between tuning it in a
 * second and tuning it in an afternoon is the difference between tuning it and
 * not.
 */
function emit(shards: Shard[]): void {
  const t0 = performance.now();
  const disagreeing = shards.filter(
    (s) => JSON.stringify(s.params) !== JSON.stringify(shards[0].params),
  );
  if (disagreeing.length) {
    throw new Error(
      `shards disagree about how they were mined:\n` +
        shards.map((s) => `  ${s.from}-${s.to}: ${JSON.stringify(s.params)}`).join("\n"),
    );
  }
  const incomplete = shards.filter((s) => s.next < s.to);
  if (incomplete.length) {
    console.log(
      `note: ${incomplete.length} shard(s) still mid-range (${incomplete
        .map((s) => `${s.from}-${s.to} at ${s.next}`)
        .join(", ")}). Merging what they have.`,
    );
  }
  for (let i = 1; i < shards.length; i++) {
    if (shards[i].from !== shards[i - 1].to) {
      console.log(
        `note: game coverage is not contiguous between ${shards[i - 1].from}-${shards[i - 1].to} and ${shards[i].from}-${shards[i].to}.`,
      );
    }
  }

  const ledger = readLedger();
  let number = nextNumber(ledger);
  const seen = new Set<string>();
  const found: Array<Assessed & { id: string; key: string }> = [];
  let cands = 0;
  const rej = zeroReasons();

  for (const s of shards) {
    cands += s.candidates;
    for (const r of REASONS) rej[r] += s.rejected[r] ?? 0;
    for (const st of s.found) {
      // A position two shards both reached is not two puzzles. The miner already
      // rejected duplicates within its own range; this is the same rule applied
      // across ranges, and the only place it can be.
      if (seen.has(st.key)) {
        rej.duplicate_position++;
        continue;
      }
      seen.add(st.key);
      // Numbers are assigned in order of first appearance and never reused, keyed
      // on the position alone — so a re-run that reaches this position again gives
      // it back the same number even if the answer has changed.
      const entry = (ledger[st.key] ??= { id: String(number++).padStart(5, "0") });
      found.push({ ...fromStored(st), id: entry.id });
    }
  }
  const candidates = cands;
  for (const r of REASONS) rejected[r] = rej[r];

  console.log(
    `merging ${shards.length} shard(s) covering games ${shards[0].from}-${shards[shards.length - 1].to}`,
  );

  // Stable output order: by puzzle number, which is order of first appearance.
  found.sort((a, b) => a.id.localeCompare(b.id));

  const graded = found.map((p, i) => {
    const grade = gradeOf(p.measurements);
    process.stdout.write(`\rtagging ${i + 1}/${found.length}   `);
    const t = tagOf(p, ledger);
    return { ...p, grade, band: bandOf(grade), motif: t.motif, tags: t.tags, byHand: t.byHand };
  });
  process.stdout.write("\r");

  // ── Report ──────────────────────────────────────────────────────────────────
  const count = <T extends string>(keys: readonly T[], of: (p: (typeof graded)[number]) => T) =>
    keys.map((k) => `${k}: ${graded.filter((p) => of(p) === k).length}`).join(", ");

  console.log(`\n${graded.length} puzzles from ${candidates} candidates (${((100 * graded.length) / Math.max(1, candidates)).toFixed(1)}% yield)`);
  console.log(`  by goal:  ${count(PUZZLE_GOALS, (p) => p.goal)}`);
  console.log(`  by band:  ${count(["easy", "medium", "hard", "ollamh"] as const, (p) => p.band)}`);
  console.log(
    `  by side:  attackers: ${graded.filter((p) => p.line.length && solverOf(p) === "attackers").length}, ` +
      `defenders: ${graded.filter((p) => solverOf(p) === "defenders").length}`,
  );
  console.log(`  truncated: ${graded.filter((p) => p.truncated).length}`);
  console.log(`  line length: ${[1, 2, 3, 4].map((n) => `${n}: ${graded.filter((p) => solverMoves(p.line) === n).length}`).join(", ")}`);
  console.log(`  depthToFind: ${Array.from({ length: VERIFY }, (_, i) => `${i + 1}: ${graded.filter((p) => p.measurements.depthToFind === i + 1).length}`).join(", ")}`);
  console.log(`  grade range: ${Math.min(...graded.map((p) => p.grade))}–${Math.max(...graded.map((p) => p.grade))}`);
  // The distribution the band cuts are calibrated against, in the shape
  // `puzzleBank.ts`'s EVAL_CUTS comment records for its own. Cuts are set on
  // *this*, not guessed: a cut outside the observed range names an empty band,
  // and `depthToFind` is capped at BANK_VERIFY_DEPTH by construction, so the
  // reachable range is narrower than a reading of GRADE_WEIGHTS suggests.
  const sorted = graded.map((p) => p.grade).sort((a, b) => a - b);
  const pct = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor((q / 100) * sorted.length))];
  console.log(
    `  grades:   ${[10, 25, 50, 75, 90].map((q) => `p${q} ${pct(q)}`).join("    ")}` +
      `   (reachable max ${VERIFY * GRADE_WEIGHTS.depthToFind + 3 * GRADE_WEIGHTS.linePastFirst})`,
  );
  // ── Motifs and tags ─────────────────────────────────────────────────────────
  // Every motif in the vocabulary gets a row, zeros included (ADR-0003). A
  // recogniser that finds nothing is a result about Brandubh, and a row silently
  // missing from a report is a result nobody can read.
  const motifCount = (m: Motif): number => graded.filter((p) => p.motif === m).length;
  const carrying = (m: Motif): number =>
    graded.filter((p) => p.motif === m || (p.tags as string[]).includes(m)).length;
  console.log(`\nmotifs (primary, then carried anywhere):`);
  for (const m of MOTIFS) {
    const hand = graded.filter((p) => p.byHand && p.motif === m).length;
    console.log(
      `  ${m.padEnd(12)} ${String(motifCount(m)).padStart(4)}  (carrying ${carrying(m)}` +
        (hand ? `, ${hand} by hand` : "") +
        `)`,
    );
  }
  console.log(`  ${"(none)".padEnd(12)} ${String(graded.filter((p) => p.motif === null).length).padStart(4)}  — the Pool`);
  const counts = new Map<Motif, number>(MOTIFS.map((m) => [m, motifCount(m)]));
  const byHandSet = new Set<Motif>(graded.filter((p) => p.byHand && p.motif).map((p) => p.motif as Motif));
  const sets = namedSets(counts, byHandSet);
  console.log(
    `  named sets (≥${MOTIF_SET_THRESHOLD}, or any size by hand): ${sets.length ? sets.join(", ") : "none"}`,
  );
  console.log(
    `  tags:     ${PLAIN_TAGS.map((t) => `${t}: ${graded.filter((p) => (p.tags as string[]).includes(t)).length}`).join(", ")}`,
  );
  console.log(
    `  proofs:   ${proofStats.derived}/${graded.filter((p) => isProof(p.goal)).length} re-derived, ` +
      `${proofStats.plies} plies (longest ${proofStats.longest}), ${proofStats.ms.toFixed(0)}ms ` +
      (proofStats.mismatched.length ? "" : `— every walk matched its stored dtm `) +
      `(no shard re-mine; see tagOf)`,
  );
  if (proofStats.unwalkable.length)
    console.log(`  !! proof would not re-walk for: ${proofStats.unwalkable.join(", ")}`);
  if (proofStats.mismatched.length)
    console.log(
      `  !! WALK LENGTH DISAGREES WITH STORED dtm — the re-derived line is not the` +
        `\n     proof the puzzle was accepted on, so it was not offered to the recognisers:` +
        `\n     ${proofStats.mismatched.join("\n     ")}`,
    );
  console.log(`\nrejected:`);
  for (const r of REASONS) console.log(`  ${r.padEnd(20)} ${rejected[r]}`);

  const empty = (["easy", "medium", "hard", "ollamh"] as const).filter(
    (b) => !graded.some((p) => p.band === b),
  );
  if (empty.length) {
    console.log(
      `\n!! EMPTY BAND(S): ${empty.join(", ")}. The cuts in src/game/grade.ts describe a bank that` +
        `\n   does not exist. That is a finding about the cuts, not a shrug — see BAND_CUTS.`,
    );
  }

  // ── Hand-adds ───────────────────────────────────────────────────────────────
  // Read here as well as in `mine()`, because `--merge` is the command a person
  // types after appending a position to the file and it never calls `mine()`. A
  // hand-add no shard has assessed is not in any number printed above and will
  // not be in the module written below; without this the run reports yesterday's
  // count, writes a byte-identical file, and looks exactly like a success.
  const handAdds = readHandAddFile();
  reportHandAddProblems(handAdds);
  const minedKeys = new Set(shards.flatMap((s) => [...shardSeen(s)]));
  if (handAdds.entries.length) {
    const assessed = handAdds.entries.filter((e) => minedKeys.has(e.key)).length;
    const inBank = handAdds.entries.filter((e) => seen.has(e.key)).length;
    console.log(
      `\nhand-adds: ${handAdds.entries.length} live in ${handAdds.path}` +
        `: ${assessed} assessed, ${inBank} in this bank`,
    );
  }
  const gap = mergeHandAddWarning(handAdds, minedKeys);
  if (gap) console.log(`\n${gap}`);

  console.log(`\ntotal: ${((performance.now() - t0) / 1000 / 60).toFixed(1)} min`);

  if (DRY) {
    console.log("(--dry: not writing)");
    return;
  }

  const lines = graded.map((p) => encodePuzzle(p)).join("\n");
  const summary =
    `${graded.length} puzzles (${count(PUZZLE_GOALS, (p) => p.goal)}), ` +
    `${graded.filter((p) => p.truncated).length} truncated, ` +
    `${((100 * graded.length) / Math.max(1, candidates)).toFixed(1)}% of ${candidates} candidates`;
  const covered = shards[shards.length - 1].to;
  const file = `// AUTO-GENERATED by scripts/genpuzzles.ts — do not edit by hand.
// Regenerate: npx tsx scripts/genpuzzles.ts --games ${covered} --depth ${DEPTH} --verify ${VERIFY} --target ${TARGET} --seed ${SEED}
// Or, from the checked-in shards in data/puzzle-shards/ and without re-mining:
//   npx tsx scripts/genpuzzles.ts --merge
// ${summary}.
// By band: ${count(["easy", "medium", "hard", "ollamh"] as const, (p) => p.band)}.
// By primary motif, zeros included (ADR-0003): ${MOTIFS.map((m) => `${m}: ${motifCount(m)}`).join(", ")},
// none: ${graded.filter((p) => p.motif === null).length}.
// Format: one line per puzzle, \`id|pos|leadIn|line|goal|flags|dtm|depthToFind|salience|motif|tags\`
// — see src/game/puzzleBank.ts for the exact contract.

/** Gameplay-flag fingerprint of the ruleset every line here was verified under
 *  (empty ⇒ no bank). A Puzzle belongs to exactly one ruleset and is invalid
 *  under any other, so the loader serves an exact match and nothing else.
 *  Typed \`string\` (not the literal) so the loader's guard stays a real
 *  comparison. */
export const BANK_RULES_FINGERPRINT: string =
  ${JSON.stringify(rulesFingerprint(rules))};

/** The board these positions were verified on. The field exists so a future 9×9
 *  fork inherits the format unchanged; the engine is deliberately NOT
 *  generalised, and \`BOARD_SIZE\` stays a const. */
export const BANK_BOARD_SIZE: number = ${BOARD_SIZE};

/** The depth \`npm test\` re-checks uniqueness at. Low on purpose: the generator
 *  holds the strong claim, and re-running the generation-depth search over every
 *  solver move in the fast suite would add another \`ai.test.ts\`. Every shipped
 *  solving move is uniquely best here as well as at the generation depth,
 *  because the generator rejects the ones that are not. */
export const BANK_VERIFY_DEPTH: number = ${VERIFY};

export const BANK_DATA: string = \`${lines}\`;
`;
  writeFileSync(OUT, file);
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`wrote ${OUT} (${(file.length / 1024).toFixed(1)} KB raw)`);
  console.log(`wrote ${LEDGER} (${Object.keys(ledger).length} numbers)`);
}

/** Whose puzzle it is: the side to move once the lead-in has been played. */
function solverOf(p: Assessed): Side {
  const parsed = parsePosition(p.position);
  return parsed.ok ? other(parsed.state.turn) : "attackers";
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  if (MERGE_ONLY && MINE_ONLY) throw new Error("--shard and --merge are different jobs; pick one.");

  if (MERGE_ONLY) {
    const shards = readShards();
    if (!shards.length) throw new Error(`no shards in ${SHARD_DIR}. Mine some first.`);
    console.log(`genpuzzles --merge: every puzzle every shard found`);
    emit(shards);
    return;
  }

  console.log(
    `genpuzzles: games ${FROM}-${TO}, depth ${DEPTH}, verify ${VERIFY}, target ${TARGET}, seed ${SEED}, nodes ${NODES}` +
      (MINE_ONLY ? " (shard only)" : ""),
  );
  const t0 = performance.now();
  const shard = mine();
  console.log(`mined in ${((performance.now() - t0) / 1000 / 60).toFixed(1)} min`);

  // A shard alone is not a bank, and saying "wrote" of something the app cannot
  // read would be the script claiming more than it has.
  if (MINE_ONLY) {
    console.log(
      `${shard.found.length} assessed puzzles in ${DRY ? "(nothing: --dry)" : shardPath(FROM, TO)}\n` +
        `Emit the bank once every shard is in: npx tsx scripts/genpuzzles.ts --merge`,
    );
    return;
  }
  emit([shard]);
}

main();
