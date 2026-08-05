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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chooseMove, resetTT, scoreRootMoves } from "../src/game/ai";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "../src/game/engine";
import { encodeMove, rulesFingerprint } from "../src/game/openingBook";
import { encodePosition, parsePosition } from "../src/game/position";
import { canonicalKey, solve } from "../src/game/solver";
import { THRESHOLDS } from "../src/game/annotate";
import { bandOf, gradeOf, type GradeMeasurements, type Salience } from "../src/game/grade";
import {
  encodePuzzle,
  evalGoal,
  isProof,
  PUZZLE_GOALS,
  solverMoves,
  type Puzzle,
  type PuzzleGoal,
} from "../src/game/puzzleBank";
import { BOARD_SIZE, type GameState, type Move, type Side, type Square } from "../src/game/types";
import { VARIANTS } from "../src/game/variants";
import { CORNERS, isCorner } from "../src/game/engine";

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
const TARGET = flag("target", 80);
const SEED = flag("seed", 12345);
const NODES = flag("nodes", 400_000); // solver budget per candidate
const MAX_PLIES = 70;
const DRY = argv.includes("--dry");
const OUT = join(import.meta.dirname, "../src/game/puzzleBank.data.ts");
const LEDGER = join(import.meta.dirname, "../data/puzzle-ledger.json");
const HANDADDS = join(import.meta.dirname, "../data/puzzle-handadds.txt");

/** At most four solver moves — a learner playing out a proven guillotine is
 *  being tested on patience, not recognition (ADR-0002). */
const MAX_SOLVER_MOVES = 4;

/** How much the lead-in has to have given up for the position after it to be
 *  worth assessing. `annotate.ts`'s own blunder band, in the same units and
 *  calibrated by the same script — a **Review Mistake** and a bank puzzle ask
 *  the same question, so they should agree about what counts as a mistake. */
const BLUNDER = THRESHOLDS.blunder;

// ── Seeded rng ────────────────────────────────────────────────────────────────
let seed = SEED;
const rng = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
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
] as const;
type Reason = (typeof REASONS)[number];
const rejected: Record<Reason, number> = Object.fromEntries(REASONS.map((r) => [r, 0])) as Record<
  Reason,
  number
>;
let candidates = 0;

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
 */
function provenGoal(start: GameState, solver: Side): PuzzleGoal | null {
  let state = start;
  for (let ply = 0; ply < 128 && !isGameOver(state.status); ply++) {
    const r = solve(state, rules, { maxNodes: NODES });
    if (r.value !== solver || r.bestMove === null) return null;
    state = applyMove(state, r.bestMove, rules);
  }
  if (state.status === "defenders_win_escape") return "escape";
  if (state.status === "attackers_win_capture") return "regicide";
  return null;
}

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
  if (typeof built === "string") return built;

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
    motif: null, // 8c
    tags: [], // 8c
  };
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
function* selfPlayCandidates(): Generator<Candidate> {
  for (let g = 0; g < GAMES; g++) {
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
      if (!isGameOver(state.status) && loss >= BLUNDER) yield { before: from, leadIn: move, start: state };
    }
    process.stdout.write(`\rself-play game ${g + 1}/${GAMES} · ${candidates} candidates`);
  }
}

/** Hand-added positions, in `position.ts` format, one per line, `#` for a
 *  comment. **Provenance** never changes how a puzzle is verified: these go
 *  through every filter above exactly as a mined position does.
 *
 *  A hand-add is written as the position *before* the lead-in plus the lead-in
 *  move, `<position> <frfctrtc>`, because that is what a puzzle is. */
function* handAddCandidates(): Generator<Candidate> {
  if (!existsSync(HANDADDS)) return;
  for (const raw of readFileSync(HANDADDS, "utf8").split("\n")) {
    const text = raw.trim();
    if (!text || text.startsWith("#")) continue;
    const at = text.lastIndexOf(" ");
    const parsed = parsePosition(text.slice(0, at));
    if (!parsed.ok) {
      console.warn(`\nhand-add skipped (${parsed.error.code}): ${text}`);
      continue;
    }
    const leadIn = { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
    const code = text.slice(at + 1);
    leadIn.from = { row: Number(code[0]), col: Number(code[1]) };
    leadIn.to = { row: Number(code[2]), col: Number(code[3]) };
    const legal = allMoves(parsed.state.board, parsed.state.turn, rules).find((m) => sameMove(m, leadIn));
    if (!legal) {
      console.warn(`\nhand-add skipped (illegal lead-in): ${text}`);
      continue;
    }
    yield { before: parsed.state, leadIn: legal, start: applyMove(parsed.state, legal, rules) };
  }
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

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(
    `genpuzzles: games ${GAMES}, depth ${DEPTH}, verify ${VERIFY}, target ${TARGET}, seed ${SEED}, nodes ${NODES}`,
  );
  const t0 = performance.now();
  const ledger = readLedger();
  let number = nextNumber(ledger);

  const seen = new Set<string>();
  const found: Array<Assessed & { id: string; key: string }> = [];

  const take = (c: Candidate): boolean => {
    candidates++;
    const key = canonicalKey(c.start);
    if (seen.has(key)) {
      rejected.duplicate_position++;
      return false;
    }
    seen.add(key);
    const result = assess(c);
    if (typeof result === "string") {
      rejected[result]++;
      return false;
    }
    if (!reproof(result)) {
      rejected.reproof_failed++;
      return false;
    }
    // Numbers are assigned in order of first appearance and never reused, keyed
    // on the position alone — so a re-run that reaches this position again gives
    // it back the same number even if the answer has changed.
    const entry = (ledger[key] ??= { id: String(number++).padStart(5, "0") });
    found.push({ ...result, id: entry.id, key });
    return true;
  };

  for (const c of handAddCandidates()) {
    if (found.length >= TARGET) break;
    take(c);
  }
  for (const c of selfPlayCandidates()) {
    if (found.length >= TARGET) break;
    take(c);
  }
  process.stdout.write("\n");

  // Stable output order: by puzzle number, which is order of first appearance.
  found.sort((a, b) => a.id.localeCompare(b.id));

  const graded = found.map((p) => {
    const grade = gradeOf(p.measurements);
    return { ...p, grade, band: bandOf(grade) };
  });

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
  console.log(`  motifs:   (none — the recognisers arrive in 8c)`);
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
  const file = `// AUTO-GENERATED by scripts/genpuzzles.ts — do not edit by hand.
// Regenerate: npx tsx scripts/genpuzzles.ts --games ${GAMES} --depth ${DEPTH} --verify ${VERIFY} --target ${TARGET} --seed ${SEED}
// ${summary}.
// By band: ${count(["easy", "medium", "hard", "ollamh"] as const, (p) => p.band)}.
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

main();
