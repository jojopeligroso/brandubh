// ── Nine Men's Morris engine ──────────────────────────────────────────────────
//
// A separate engine, sharing no code with the three tafl engines — by owner
// decision and for the reason ADR-0006 and ADR-0007 spend their length on: the
// search machinery *looks* portable and the evaluation never is. Here the
// divergence is not even a matter of geometry. A tafl engine's leaf asks "how
// close is the king to a corner"; this one asks about mills, open twos and
// mobility on a 24-point graph, there is no king, and — uniquely in this project
// — **a move is an atomic full turn including its capture**. That last point
// removes quiescence from the file entirely: there is no "the capture happens on
// the opponent's reply" horizon to paper over, because a mill's removal is inside
// the move that closed it. A tafl engine without quiescence hangs pieces; this one
// has nothing to hang.
//
// What *is* reproduced from `../copenhagen/engine.ts`, deliberately and by hand:
// iterative deepening, the module-state transposition table, killer and history
// move ordering, exact root tie collection through a null-window re-search,
// symmetry folding of root moves, mate-distance scoring, and the time management
// (floor deadline, ABORT every 2048 nodes, predictive iteration stopping with a
// capped EBF estimate). Those are genuinely board-agnostic, they are the best-
// understood part of this project, and writing them again by hand keeps the
// fork's promise that each engine reads as a complete engine on its own.
//
// Two things here no tafl engine has:
//
//   • **Negamax, not attacker-positive minimax.** The tafl engines score from one
//     fixed side's view because their two sides are not interchangeable (a king
//     escaping is not a mirror of soldiers capturing). Morris is symmetric: the
//     two colours want the same things. Negamax says that in the type system —
//     every score below is from the side to move's point of view — and halves the
//     number of sign mistakes available.
//   • **A database probe hook.** `ollamh` is meant to be *perfect* once play
//     reaches a shipped endgame table (Gasser's retrograde analysis, scaled
//     down — see §7 of the design contract and `db/` when it lands). The probe is
//     consulted as a terminal at every moving-phase node, and at the root it
//     replaces the search outright: a won endgame is won by following the
//     database's depth, not by a search that can cycle inside its own horizon.
//     Deep search is best-effort before that, and the UI says so.
//
// ## What is NOT tuned
//
// Every number below. Brandubh's weights came off a hundreds-of-games A/B
// gauntlet; Tablut's and Copenhagen's never did and say so; these have not even
// been self-played. They are reasoned from the structure of the game (see the
// comment on `DEFAULT_WEIGHTS`) and they are the first thing to measure once the
// surface exists. **Do not quote them as measured.**

import {
  ADJ,
  MILLS,
  MILLS_OF,
  MILL_MASKS,
  allMoves,
  applyMove,
  isGameOver,
  masksOf,
  phaseOf,
  popcount,
  winnerOf,
} from "./rules";
import { stabilizer, type Perm } from "./symmetry";
import { POINT_COUNT, cellOf, other, type Board, type GameState, type Move, type Side } from "./types";
import type { MorrisRuleSet } from "./variants";

/** The difficulty ladder, in order. Also the whitelist for anything restored from
 *  storage or read back out of a settings key. */
export const DIFFICULTIES = ["easy", "medium", "hard", "ollamh"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/** The magnitude of a won position. Scores are **mover-relative**: `+WIN` means
 *  the side to move wins. */
export const WIN = 1_000_000;

/** Scores this close to ±WIN are decisive; deepening can stop. Comfortably above
 *  anything the heuristic terms below can produce, and above `WIN` minus the
 *  deepest distance-to-mate either the search (≤ 24 plies) or a database entry
 *  (≤ 63 plies) can report. */
export const DECISIVE = WIN - 1000;

/** Absolute ceiling for reaching a difficulty's depth floor, so honouring the
 *  floor can never hang even on a pathological position. */
const MIN_DEPTH_SAFETY_MS = 8000;

/** Ceiling on the observed effective-branching-factor estimate used for
 *  predictive time management — see the note at the bottom of `pickMove`. */
const EBF_CAP = 4;

// ── Endgame database probe ────────────────────────────────────────────────────
/**
 * What a database lookup says about a position, **from the side to move's point
 * of view**: `wdl` +1 win, 0 draw, −1 loss, and `depth` the distance to the end
 * of the game in plies (0 for a draw, ≤ 63 — the entry encoding caps it there).
 */
export interface DbValue {
  wdl: -1 | 0 | 1;
  depth: number;
}

/**
 * A probe: the position's exact value, or `null` when no shipped table covers it.
 *
 * Passed in rather than imported, so this module has no opinion about where
 * tables come from (a worker's `fetch`, Node's `zlib`, or a test's hand-written
 * stub) and the search stays pure and synchronous. `null` must mean "not in a
 * table" and never "I am not sure": every non-null answer is treated as a
 * terminal, so a wrong one is a wrong move, not a slow one.
 */
export type DbProbe = (state: GameState) => DbValue | null;

// ── Evaluation ────────────────────────────────────────────────────────────────
export interface EvalWeights {
  /** Per stone of advantage, counting stones in hand as well as on the board.
   *  The dominant term by a wide margin: a stone is the only thing in Morris that
   *  never comes back. */
  material: number;
  /** Per completed mill. A mill is worth less than the stone it took — it is a
   *  *position*, and an opponent can often neutralise it — so this sits well under
   *  `material`. */
  mill: number;
  /** Per line holding two own stones with its third point empty: a mill threatened
   *  next turn. */
  openTwo: number;
  /** Per empty point that would complete **two** mills at once — an unblockable
   *  threat, and the formation that decides most games between strong players.
   *  Worth several open twos on its own. */
  doubleThreat: number;
  /** Per move of mobility advantage, in the moving phase only (in the placing
   *  phase every empty point is a legal move for both sides, so the term would be
   *  a constant). 0 ⇒ skip, and it is the most expensive term here. */
  mobility: number;
  /** Per stone with no empty point beside it. Subtracted for own stones, added for
   *  the opponent's: a blocked stone is a stone that cannot answer a threat, and
   *  blocking *all* of them wins the game outright. */
  blocked: number;
  /** Flat bonus for having the opponent down to three stones (hand empty): one
   *  more removal ends it. Subtracted when it is us. */
  flyingThreat: number;
}

/**
 * Provisional shipping weights.
 *
 * ⚠ **Reasoned, not tuned** — see the note at the top of this file. The reasoning,
 * so that a later measurement has something to disagree with:
 *
 *  • `material` at 100 is the unit. Everything else is priced as a fraction of a
 *    stone, which is the only way these numbers can be read at all.
 *  • `mill` at 26 — roughly a quarter of a stone. A closed mill has *already* been
 *    paid for by the stone it removed; what it is worth from here is the option to
 *    re-open and re-close it, which is real but much smaller than the stone.
 *  • `openTwo` at 12 and `doubleThreat` at 45. A single open two is usually
 *    blocked for free, so it is worth little; a double threat cannot be blocked at
 *    all and converts to a stone, so it is worth nearly half of one. The ratio
 *    between them matters more than either value.
 *  • `mobility` at 3, on in the moving phase. Morris endgames are decided by
 *    mobility — being blocked *is* a loss condition — so unlike the tafl engines
 *    (where this term is parked at 0 for cost) it earns its place here: the board
 *    has 24 points and `allMoves` is cheap.
 *  • `blocked` at 14, which deliberately double-counts a little with `mobility`:
 *    a stone with no liberty at all is a step toward the blocked-player loss, not
 *    merely one fewer move.
 *  • `flyingThreat` at 35: being down to three stones is not yet lost (flying is
 *    strong), but it is one removal from lost.
 */
export const DEFAULT_WEIGHTS: EvalWeights = {
  material: 100,
  mill: 26,
  openTwo: 12,
  doubleThreat: 45,
  mobility: 3,
  blocked: 14,
  flyingThreat: 35,
};

/** Scratch for `lineTerms`, module-scoped so the evaluation allocates nothing per
 *  leaf. Safe because `lineTerms` neither recurses nor yields. */
const COMPLETES = new Int8Array(POINT_COUNT);

/** One side's structural terms, in one pass over the 16 lines. */
function lineTerms(
  own: number,
  foe: number,
): { mills: number; openTwos: number; doubleThreats: number } {
  let mills = 0;
  let openTwos = 0;
  // A point that completes two mills at once: count the lines each empty point
  // would complete, then look for a point counted twice.
  COMPLETES.fill(0);
  let doubleThreats = 0;
  for (let m = 0; m < MILL_MASKS.length; m++) {
    const mask = MILL_MASKS[m];
    if ((foe & mask) !== 0) continue; // the line is contested — nothing to say
    const ours = own & mask;
    if (ours === mask) {
      mills++;
      continue;
    }
    // Exactly two of three, with the third empty (the line holds no enemy stone).
    if (ours !== 0 && (ours & (ours - 1)) !== 0) {
      openTwos++;
      const gap = mask ^ ours;
      const i = 31 - Math.clz32(gap);
      if (++COMPLETES[i] === 2) doubleThreats++;
    }
  }
  return { mills, openTwos, doubleThreats };
}

/** Stones of `side` with no empty point beside them. Adjacency only — a flying
 *  player is never blocked, which `flyingThreat` accounts for separately. */
function blockedStones(board: Board, side: Side): number {
  const cell = cellOf(side);
  let n = 0;
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] !== cell) continue;
    let free = false;
    for (const j of ADJ[i]) {
      if (board[j] === 0) {
        free = true;
        break;
      }
    }
    if (!free) n++;
  }
  return n;
}

/** Adjacency moves available to `side` in the moving phase (ignoring flying and
 *  ignoring the victim multiplication — this counts *turns in outline*, which is
 *  what a mobility term wants). */
function slideCount(board: Board, side: Side): number {
  const cell = cellOf(side);
  let n = 0;
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] !== cell) continue;
    for (const j of ADJ[i]) if (board[j] === 0) n++;
  }
  return n;
}

/**
 * The position's value **from the side to move's point of view**, in hundredths
 * of a stone (`material` = 100 = one stone).
 *
 * Terminal positions short-circuit to ±`WIN`/0 with no distance decay; the
 * ply-decayed form the search uses is `evaluateAtPly`.
 */
export function evaluate(
  state: GameState,
  w: EvalWeights = DEFAULT_WEIGHTS,
  rules?: MorrisRuleSet,
): number {
  if (isGameOver(state.status)) {
    const winner = winnerOf(state.status);
    if (winner === "draw" || winner === null) return 0;
    return winner === state.turn ? WIN : -WIN;
  }

  const me = state.turn;
  const foe = other(me);
  const { white, black } = masksOf(state.board);
  const mine = me === "white" ? white : black;
  const theirs = me === "white" ? black : white;

  const myStones = state.inHand[me] + popcount(mine);
  const theirStones = state.inHand[foe] + popcount(theirs);

  let score = (myStones - theirStones) * w.material;

  const ours = lineTerms(mine, theirs);
  const theirsT = lineTerms(theirs, mine);
  score += (ours.mills - theirsT.mills) * w.mill;
  score += (ours.openTwos - theirsT.openTwos) * w.openTwo;
  score += (ours.doubleThreats - theirsT.doubleThreats) * w.doubleThreat;

  const moving = phaseOf(state) === "moving";
  if (moving) {
    if (w.mobility !== 0)
      score += (slideCount(state.board, me) - slideCount(state.board, foe)) * w.mobility;
    score += (blockedStones(state.board, foe) - blockedStones(state.board, me)) * w.blocked;
    // "Down to three" is only meaningful once the hands are empty, which `moving`
    // already guarantees. `rules` is consulted only so the term is silent when
    // flying is off and three stones is not a special number — without a ruleset
    // the term is simply absent rather than wrong.
    if (rules === undefined || rules.flying === "three") {
      if (theirStones === 3) score += w.flyingThreat;
      if (myStones === 3) score -= w.flyingThreat;
    }
  }

  return score;
}

/**
 * `evaluate`, with terminal scores decayed by distance from the search root so a
 * faster win scores higher than a slower one. Every leaf and terminal return in
 * `search` goes through here.
 *
 * Exported because `searchInvariants.test.ts` builds an independent plain
 * minimax out of it: an oracle that shared the search's own leaf function would
 * be testing the ordering, not the value.
 */
export function evaluateAtPly(
  state: GameState,
  ply: number,
  w: EvalWeights = DEFAULT_WEIGHTS,
  rules?: MorrisRuleSet,
): number {
  const raw = evaluate(state, w, rules);
  if (raw >= DECISIVE) return raw - ply;
  if (raw <= -DECISIVE) return raw + ply;
  return raw;
}

/** A probed position's value as a search score, mover-relative and decayed by the
 *  node's distance from the root exactly as a terminal is. A database depth is a
 *  *true* distance to the end of the game, so it decays the same way a mate
 *  distance does and the two are directly comparable. */
function probeScore(v: DbValue, ply: number): number {
  if (v.wdl === 0) return 0;
  // The entry encoding caps `depth` at 63, so the clamp here is belt-and-braces
  // against a malformed table: it keeps a probed win above `DECISIVE` (and so
  // recognisable as a win) whatever depth arrives.
  const mag = WIN - Math.min(v.depth, 900);
  return v.wdl > 0 ? mag - ply : -(mag - ply);
}

// ── Search configuration ──────────────────────────────────────────────────────
export type Ordering = "smart" | "legacy" | "none";

export interface SearchConfig {
  ordering: Ordering;
  useTT: boolean;
  useKillers: boolean;
  /** The history heuristic (a per-(from,to) cutoff counter). Separate from
   *  `useKillers` so the invariants test can isolate either. */
  useHistory: boolean;
}

export const FULL_CONFIG: SearchConfig = {
  ordering: "smart",
  useTT: true,
  useKillers: true,
  useHistory: true,
};

/** A fixed-depth searcher with none of the machinery — the baseline for measuring
 *  a change rather than for playing, and what the invariants test compares
 *  against a plain minimax. */
export const LEGACY_CONFIG: SearchConfig = {
  ordering: "none",
  useTT: false,
  useKillers: false,
  useHistory: false,
};

export interface SearchLimits {
  maxDepth: number;
  deadlineMs?: number;
  minDepth?: number;
}

// ── Transposition table (persists across moves) ───────────────────────────────
// Keyed by the two 24-bit occupancy masks, the side to move and both hands —
// which is the whole position, except for the move history. That exception is the
// same graph-history hazard the tafl engines carry and accept: two paths to one
// position can differ in how close they are to a repetition draw, and the table
// cannot tell them apart. It is bounded here (`repetitionResult: "draw"` needs
// three occurrences since the last removal) and the cost of keying on history
// instead would be a table that never hits.
//
// The key is a *string* rather than a packed number because two 24-bit masks do
// not fit in one JS integer and a `Map` of strings is the simplest thing that is
// correct. Base-36 keeps it to ~11 characters — a quarter of Brandubh's 50-
// character board hash, on a far smaller tree. No measurement says this is the
// fastest shape; it says the hash is not the thing to optimise first.
const enum Flag {
  Exact = 0,
  Lower = 1,
  Upper = 2,
}
interface TTEntry {
  depth: number;
  value: number;
  flag: Flag;
  move: Move | null;
  gen: number;
}
const TT = new Map<string, TTEntry>();
const TT_MAX = 400_000;
/**
 * The hard ceiling `ttStore` itself enforces, as opposed to `TT_MAX`, which is
 * only looked at when a search *starts*.
 *
 * The difference matters because one search can outgrow the table on its own. A
 * deadline-free deep search (`{maxDepth: 20}` with `now` pinned, which is how the
 * tests drive a deterministic search) never returns to the entry check, so the
 * `Map` grows until the engine does not lose a game but *throws* —
 * `RangeError: Map maximum size exceeded` at ~16.7M entries, which is the worst
 * possible way for a transposition table to be full.
 *
 * Four × `TT_MAX` rather than `TT_MAX` because the entry check is the policy
 * ("start a search with at most this much carried over") and this is the
 * safety-valve ("never hold more than this at all"), and a valve that trips at
 * the policy's own number would throw away a live search's work every time a
 * single search reached the steady state the policy is happy with.
 */
const TT_CEILING = 4 * TT_MAX;
// Injectable only so a test can drive a real search past it; production never
// changes it. See `setTtCeiling`.
let ttCeiling = TT_CEILING;
let TT_GEN = 0;

/** The position's transposition key. */
export function ttKey(state: GameState): string {
  const { white, black } = masksOf(state.board);
  return `${white.toString(36)}.${black.toString(36)}.${state.turn === "white" ? "w" : "b"}${state.inHand.white}${state.inHand.black}`;
}

/**
 * Mate-distance conversion for the table: a search value is root-relative
 * (mate-in-N-from-this-search's-root) but the table is shared across searches
 * whose roots differ, so what is stored is node-relative — add the storing ply,
 * subtract the probing ply. Exact inverses; non-decisive values pass through
 * untouched.
 */
function mateToTT(v: number, ply: number): number {
  if (v >= DECISIVE) return v + ply;
  if (v <= -DECISIVE) return v - ply;
  return v;
}
function mateFromTT(v: number, ply: number): number {
  if (v >= DECISIVE) return v - ply;
  if (v <= -DECISIVE) return v + ply;
  return v;
}

function ttStore(key: string, depth: number, value: number, flag: Flag, move: Move | null): void {
  // Dropped whole rather than evicted entry by entry: a `Map` has no cheap "oldest
  // key", the generation counter already means a surviving entry is not trusted
  // blindly, and losing the table costs a search time while overflowing it costs
  // the search. Clearing mid-iteration is safe because nothing outside the table
  // points into it — the running search holds its own best move and score.
  if (TT.size >= ttCeiling) TT.clear();
  const prev = TT.get(key);
  if (prev && prev.gen === TT_GEN && prev.depth > depth) return;
  TT.set(key, { depth, value, flag, move, gen: TT_GEN });
}

/** Exposed for tests and benchmarks that want a clean slate. */
export function resetTT(): void {
  TT.clear();
  TT_GEN = 0;
}

// ── Test seams for the ceiling ────────────────────────────────────────────────
// The ceiling is a number that only matters in the one case nothing else in the
// suite reaches (millions of stores inside a single search), so it is injectable:
// a test lowers it, drives a real search past it, and asserts the table was
// dropped instead of the engine throwing. Filling 1.6M entries for real would cost
// the suite a gigabyte to prove arithmetic.
/** How many entries the table currently holds. Tests only. */
export const ttSize = (): number => TT.size;
/** Lower (or, with no argument, restore) the hard ceiling. Tests only. */
export function setTtCeiling(entries?: number): void {
  ttCeiling = entries ?? TT_CEILING;
}

// ── Search context ────────────────────────────────────────────────────────────
const ABORT = Symbol("search-aborted");

/** History-heuristic table size: `(from + 1) * 24 + to`, with `from = −1` for a
 *  placement. */
const HIST_SIZE = (POINT_COUNT + 1) * POINT_COUNT;
const histIndex = (m: Move): number => ((m.from ?? -1) + 1) * POINT_COUNT + m.to;

interface Ctx {
  rules: MorrisRuleSet;
  cfg: SearchConfig;
  weights: EvalWeights;
  deadline: number; // Infinity ⇒ no time limit (fixed-depth, deterministic)
  now: () => number;
  nodes: number;
  killers: Array<[Move | null, Move | null]>;
  hist: Int32Array;
  probe: DbProbe | null;
}

const sameMove = (a: Move | null, b: Move | null): boolean =>
  a != null &&
  b != null &&
  a.from === b.from &&
  a.to === b.to &&
  a.remove === b.remove &&
  (a.remove2 ?? null) === (b.remove2 ?? null);

function recordKiller(ctx: Ctx, ply: number, m: Move): void {
  const slot = (ctx.killers[ply] ??= [null, null]);
  if (sameMove(slot[0], m)) return;
  slot[1] = slot[0];
  slot[0] = m;
}

// ── Move ordering ─────────────────────────────────────────────────────────────
/**
 * Order: the table's move, then mill-closing moves (which are this game's only
 * captures), then moves that open a two or block the opponent's, then killers and
 * history, then the rest.
 *
 * The "opens a two" score is read off the lines through the destination, treating
 * the origin as already vacated — exact, not an approximation, and cheap because
 * a point lies on at most three lines.
 */
function orderMoves(state: GameState, moves: Move[], ttMove: Move | null, ply: number, ctx: Ctx): Move[] {
  if (ctx.cfg.ordering === "none") return moves;
  const board = state.board;
  const mine = cellOf(state.turn);
  const theirs = cellOf(other(state.turn));
  const killers = ctx.cfg.useKillers ? ctx.killers[ply] : undefined;

  const scored = moves.map((m) => {
    let s = 0;
    if (ctx.cfg.ordering === "legacy") {
      if (m.remove !== null) s += 10_000;
      return { m, s };
    }

    if (sameMove(m, ttMove)) s += 1_000_000_000;
    if (m.remove !== null) s += 1_000_000 + (m.remove2 != null ? 1000 : 0);

    for (const lineIndex of MILLS_OF[m.to]) {
      const line = MILLS[lineIndex];
      let own = 0;
      let foe = 0;
      let empty = 0;
      for (const p of line) {
        if (p === m.to) continue;
        const cell = p === m.from ? 0 : board[p];
        if (cell === mine) own++;
        else if (cell === theirs) foe++;
        else empty++;
      }
      if (foe === 0 && own === 1 && empty === 1) s += 5000; // makes a threat
      else if (foe === 2 && own === 0) s += 4000; // blocks theirs
    }

    if (killers) {
      if (sameMove(m, killers[0])) s += 90_000;
      else if (sameMove(m, killers[1])) s += 80_000;
    }
    if (ctx.cfg.useHistory) s += Math.min(ctx.hist[histIndex(m)], 50_000);
    return { m, s };
  });

  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.m);
}

// ── Negamax with alpha–beta (mover-relative, fail-soft) ───────────────────────
function search(state: GameState, depth: number, ply: number, alpha: number, beta: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluateAtPly(state, ply, ctx.weights, ctx.rules);

  // The database is consulted before anything else, because it is not an opinion:
  // a hit is the game's true value and the subtree below it has nothing to add.
  // Only the moving phase can be in a table (both hands empty, see `db/`), and
  // the probe itself answers `null` for anything it does not cover.
  if (ctx.probe !== null && phaseOf(state) === "moving") {
    const hit = ctx.probe(state);
    if (hit !== null) return probeScore(hit, ply);
  }

  if (depth <= 0) return evaluateAtPly(state, ply, ctx.weights, ctx.rules);

  const alpha0 = alpha;
  const beta0 = beta;
  const key = ctx.cfg.useTT ? ttKey(state) : "";
  let ttMove: Move | null = null;
  if (ctx.cfg.useTT) {
    const e = TT.get(key);
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        const v = mateFromTT(e.value, ply);
        if (e.flag === Flag.Exact) return v;
        if (e.flag === Flag.Lower && v > alpha) alpha = v;
        else if (e.flag === Flag.Upper && v < beta) beta = v;
        if (alpha >= beta) return v;
      }
    }
  }

  const moves = orderMoves(state, allMoves(state, ctx.rules), ttMove, ply, ctx);
  // Unreachable in a legal game — "no move" is already a terminal status — but a
  // hand-built position can be in that shape, and returning the leaf value is the
  // honest answer for it.
  if (moves.length === 0) return evaluateAtPly(state, ply, ctx.weights, ctx.rules);

  let best = -Infinity;
  let bestMove: Move | null = null;
  for (const m of moves) {
    const child = applyMove(state, m, ctx.rules);
    const v = -search(child, depth - 1, ply + 1, -beta, -alpha, ctx);
    if (v > best) {
      best = v;
      bestMove = m;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      if (m.remove === null) {
        // Quiet cutoffs only: a mill-closing move is already ordered first, so
        // recording it would teach the heuristics nothing.
        if (ctx.cfg.useKillers) recordKiller(ctx, ply, m);
        if (ctx.cfg.useHistory) ctx.hist[histIndex(m)] += depth * depth;
      }
      break;
    }
  }

  if (ctx.cfg.useTT) {
    const flag = best <= alpha0 ? Flag.Upper : best >= beta0 ? Flag.Lower : Flag.Exact;
    ttStore(key, depth, mateToTT(best, ply), flag, bestMove);
  }
  return best;
}

// ── Root-move folding by the position's symmetry ───────────────────────────────
/**
 * Collapse root moves into one representative per orbit under `group` (the
 * position's stabiliser — see `symmetry.ts`).
 *
 * This matters far more here than on any tafl board. An empty Morris board is
 * fixed by all sixteen symmetries, so its 24 placements are **four** distinct
 * ideas — a corner of the outer (or, identically, the inner) ring, a midpoint of
 * it, a corner of the middle ring, a midpoint of the middle ring; `a7`, `d7`,
 * `b6`, `d6` in the order this function returns them. Without folding, a uniform
 * pick among tied root moves would be choosing among eight copies of one idea and
 * four of another, which is not a uniform pick among ideas at all.
 *
 * Caveat, the same one the tafl engines carry: two symmetric positions can differ
 * in their repetition history, so folding is exact for the geometry and
 * approximate for a position deep in a shuffling endgame. It is applied at the
 * root only, where the consequence is at worst a differently-chosen equal-valued
 * move.
 */
export function foldRootMoves(moves: Move[], group: readonly Perm[]): Move[] {
  if (group.length <= 1) return moves;
  const seen = new Set<string>();
  const reps: Move[] = [];
  for (const m of moves) {
    let canon: string | null = null;
    for (const perm of group) {
      const f = m.from === null ? -1 : perm[m.from];
      const t = perm[m.to];
      const takes = [m.remove, m.remove2 ?? null]
        .filter((r): r is number => r !== null)
        .map((r) => perm[r])
        .sort((a, b) => a - b)
        .join("/");
      const s = `${f},${t},${takes}`;
      if (canon === null || s < canon) canon = s;
    }
    if (canon !== null && !seen.has(canon)) {
      seen.add(canon);
      reps.push(m);
    }
  }
  return reps;
}

/** The stabiliser of a position's stones. Thin wrapper over `symmetry.ts` so a
 *  caller with a `GameState` does not have to know about masks. */
export function stabilizerOf(board: Board): readonly Perm[] {
  const { white, black } = masksOf(board);
  return stabilizer(white, black);
}

// ── Root: iterative deepening, tie collection ─────────────────────────────────
export interface SearchResult {
  move: Move | null;
  /** Mover-relative score — `+` is good for the side to move. */
  score: number;
  /** Every root move that scored *exactly* the best score. The shared root bound
   *  is `best − 1`, so a move that ties or beats the best still returns its true
   *  score and only strictly-worse moves fail low — which is what makes this set
   *  exact rather than approximate. */
  bestMoves: Move[];
  depth: number;
  nodes: number;
  /** True when the answer came from an endgame database rather than the search. */
  fromDatabase?: boolean;
}

export const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/**
 * How good a child is for the side to move at the root, when the root itself is
 * in a database: a win for us beats a draw beats an unknown beats a loss.
 *
 * "Unknown" is ranked above a loss and below a draw deliberately. It can only
 * happen when the root is covered and a child is not (a capture crossing into a
 * table that was not shipped), and in that case a searched-but-unknown child is
 * still better than a *proven* loss and worse than a proven draw.
 */
const DB_WIN = 3;
const DB_DRAW = 2;
const DB_UNKNOWN = 1;
const DB_LOSS = 0;

function classifyChild(
  state: GameState,
  move: Move,
  rules: MorrisRuleSet,
  probe: DbProbe,
): { rank: number; depth: number } {
  const child = applyMove(state, move, rules);
  if (isGameOver(child.status)) {
    const w = winnerOf(child.status);
    if (w === state.turn) return { rank: DB_WIN, depth: 1 };
    if (w === "draw" || w === null) return { rank: DB_DRAW, depth: 0 };
    return { rank: DB_LOSS, depth: 1 };
  }
  const hit = probe(child);
  if (hit === null) return { rank: DB_UNKNOWN, depth: 0 };
  // `hit` is from the *child's* mover — our opponent — so its loss is our win.
  if (hit.wdl < 0) return { rank: DB_WIN, depth: hit.depth + 1 };
  if (hit.wdl === 0) return { rank: DB_DRAW, depth: 0 };
  return { rank: DB_LOSS, depth: hit.depth + 1 };
}

/**
 * Choose purely from the database when the root is covered by one, or `null` when
 * it is not (or when the best the tables can say is "unknown", in which case the
 * search is the better witness).
 *
 * This is the half of the feature that makes a won endgame actually get won. A
 * search with a database as its leaf evaluator still has a horizon: it can pick a
 * move that preserves a win without ever *shortening* it, and then do it again,
 * and a won position shuffles until the fifty-move draw. Picking the smallest
 * winning depth strictly decreases a finite number every turn.
 */
function chooseFromDatabase(
  state: GameState,
  rules: MorrisRuleSet,
  rootMoves: Move[],
  probe: DbProbe,
  rng: () => number,
): SearchResult | null {
  if (phaseOf(state) !== "moving") return null;
  const rootValue = probe(state);
  if (rootValue === null) return null;

  let bestRank = -1;
  let bestDepth = 0;
  let ties: Move[] = [];
  for (const m of rootMoves) {
    const { rank, depth } = classifyChild(state, m, rules, probe);
    // Inside a class: win as fast as possible, lose as slowly as possible.
    const better =
      rank > bestRank ||
      (rank === bestRank &&
        ((rank === DB_WIN && depth < bestDepth) || (rank === DB_LOSS && depth > bestDepth)));
    if (better) {
      bestRank = rank;
      bestDepth = depth;
      ties = [m];
    } else if (rank === bestRank && depth === bestDepth) {
      ties.push(m);
    }
  }
  if (bestRank === DB_UNKNOWN || ties.length === 0) return null;

  const folded = foldRootMoves(ties, stabilizerOf(state.board));
  const chosen = folded[Math.floor(rng() * folded.length)] ?? folded[0];
  const score =
    bestRank === DB_WIN ? WIN - bestDepth : bestRank === DB_LOSS ? -(WIN - bestDepth) : 0;
  return { move: chosen, score, bestMoves: folded, depth: 0, nodes: rootMoves.length, fromDatabase: true };
}

/**
 * Choose a move via iterative-deepening alpha–beta negamax. Deterministic when
 * `limits` carries no `deadlineMs` and `rng` is seeded — which is how the tests
 * drive it.
 *
 * `probe`, when given, is both a leaf oracle inside the search and — when the root
 * itself is covered — a replacement for it.
 */
export function pickMove(
  state: GameState,
  rules: MorrisRuleSet,
  limits: SearchLimits,
  config: SearchConfig = FULL_CONFIG,
  rng: () => number = Math.random,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  now: () => number = defaultNow,
  probe: DbProbe | null = null,
): SearchResult {
  const rootMoves = allMoves(state, rules);
  if (rootMoves.length === 0)
    return { move: null, score: evaluate(state, weights, rules), bestMoves: [], depth: 0, nodes: 0 };

  if (probe !== null) {
    const exact = chooseFromDatabase(state, rules, rootMoves, probe, rng);
    if (exact !== null) return exact;
  }

  TT_GEN++;
  if (TT.size > TT_MAX) TT.clear();

  const t0 = now();
  const floorDepth = limits.minDepth ?? 0;
  const hardDeadline = limits.deadlineMs != null ? t0 + limits.deadlineMs : Infinity;
  const floorDeadline =
    limits.deadlineMs != null ? t0 + Math.max(limits.deadlineMs, MIN_DEPTH_SAFETY_MS) : Infinity;

  const ctx: Ctx = {
    rules,
    cfg: config,
    weights,
    deadline: hardDeadline,
    now,
    nodes: 0,
    killers: [],
    hist: new Int32Array(HIST_SIZE),
    probe,
  };
  const rootKey = config.useTT ? ttKey(state) : "";
  const foldedRoots = foldRootMoves(rootMoves, stabilizerOf(state.board));

  let bestMove: Move = foldedRoots[0];
  let bestTies: Move[] = [foldedRoots[0]];
  let bestScore = -Infinity;
  let reached = 0;
  let prevIterMs = 0;

  for (let d = 1; d <= limits.maxDepth; d++) {
    ctx.deadline = d <= floorDepth ? floorDeadline : hardDeadline;
    const iterStart = now();
    try {
      const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
      const ordered = orderMoves(state, foldedRoots, ttMove, 0, ctx);
      let localBest = -Infinity;
      let ties: Move[] = [];
      for (const m of ordered) {
        // A null window just below the best so far: a move that ties or beats it
        // still returns its exact value, and only strictly-worse moves fail low.
        const alpha = localBest === -Infinity ? -Infinity : localBest - 1;
        const v = -search(applyMove(state, m, rules), d - 1, 1, -Infinity, -alpha, ctx);
        if (v > localBest) {
          localBest = v;
          ties = [m];
        } else if (v === localBest) {
          ties.push(m);
        }
      }
      bestScore = localBest;
      bestTies = ties;
      bestMove = ties[0];
      reached = d;
      if (config.useTT) ttStore(rootKey, d, localBest, Flag.Exact, ties[0]);
      if (Math.abs(localBest) >= DECISIVE) break; // forced result — no need to go deeper
    } catch (e) {
      if (e === ABORT) break; // keep the last fully-completed depth
      throw e;
    }
    // Predictive time management, as in the tafl engines: don't *start* a depth
    // that cannot finish, so a generous budget never means waiting the whole time
    // for a shallower answer. The EBF estimate is capped (`EBF_CAP`) because a
    // single-sample ratio across the depth where the table starts hitting is not a
    // branching factor; a too-optimistic prediction can only cost time that was
    // already budgeted, since `search` checks the real deadline every 2048 nodes
    // and an aborted iteration keeps the last completed depth.
    const iterMs = now() - iterStart;
    if (hardDeadline < Infinity && d >= floorDepth) {
      const ebf = prevIterMs > 0 ? Math.min(Math.max(2, iterMs / prevIterMs), EBF_CAP) : 5;
      if (now() - t0 + iterMs * ebf > hardDeadline - t0) break;
    }
    prevIterMs = iterMs;
  }

  const chosen = bestTies[Math.floor(rng() * bestTies.length)] ?? bestMove;
  return {
    move: chosen,
    score: bestScore,
    bestMoves: bestTies.length ? bestTies : [bestMove],
    depth: reached,
    nodes: ctx.nodes,
  };
}

// ── Multi-PV root scoring (offline book / analysis generation) ─────────────────
export interface RootMoveScore {
  move: Move;
  score: number;
}

/**
 * Exact scores for every root move within `margin` of the best, at a fixed depth —
 * the multi-PV query an offline generator needs. Deterministic (no deadline).
 * Root moves are symmetry-folded, so at a symmetric position the result is one
 * representative per orbit.
 *
 * The margin-0 path deliberately stops after pass 1: values reproduced through
 * foreign transposition bounds can drift (ordinary search instability), and a
 * drifted value that sneaks a strictly-worse move into an "exact ties" list is
 * exactly the corruption an offline generator must not ship.
 */
export function scoreRootMoves(
  state: GameState,
  rules: MorrisRuleSet,
  depth: number,
  margin: number,
  config: SearchConfig = FULL_CONFIG,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): { best: number; within: RootMoveScore[]; nodes: number } {
  const rootMoves = allMoves(state, rules);
  if (rootMoves.length === 0) return { best: evaluate(state, weights, rules), within: [], nodes: 0 };

  TT_GEN++;
  if (TT.size > TT_MAX) TT.clear();

  const ctx: Ctx = {
    rules,
    cfg: config,
    weights,
    deadline: Infinity,
    now: defaultNow,
    nodes: 0,
    killers: [],
    hist: new Int32Array(HIST_SIZE),
    probe: null,
  };
  const rootKey = config.useTT ? ttKey(state) : "";
  const foldedRoots = foldRootMoves(rootMoves, stabilizerOf(state.board));

  let best = -Infinity;
  let ties: Move[] = [];
  let ordered: Move[] = foldedRoots;
  for (let d = 1; d <= depth; d++) {
    const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
    ordered = orderMoves(state, foldedRoots, ttMove, 0, ctx);
    let localBest = -Infinity;
    let localTies: Move[] = [];
    for (const m of ordered) {
      const alpha = localBest === -Infinity ? -Infinity : localBest - 1;
      const v = -search(applyMove(state, m, rules), d - 1, 1, -Infinity, -alpha, ctx);
      if (v > localBest) {
        localBest = v;
        localTies = [m];
      } else if (v === localBest) {
        localTies.push(m);
      }
    }
    best = localBest;
    ties = localTies;
    if (config.useTT) ttStore(rootKey, d, localBest, Flag.Exact, localTies[0]);
    if (Math.abs(localBest) >= DECISIVE) break;
  }

  const within: RootMoveScore[] = ties.map((m) => ({ move: m, score: best }));
  if (margin > 0) {
    for (const m of ordered) {
      if (ties.some((t) => sameMove(t, m))) continue;
      const v = -search(applyMove(state, m, rules), depth - 1, 1, -best, -(best - margin - 1), ctx);
      if (v >= best - margin) within.push({ move: m, score: Math.min(v, best) });
    }
    within.sort((a, b) => b.score - a.score);
  }
  return { best, within, nodes: ctx.nodes };
}

// ── Difficulty ladder ─────────────────────────────────────────────────────────
// The depths are *higher* than any tafl tier at the same name, and that is
// arithmetic rather than ambition. Branching here is narrow: 24 placements at the
// opening falling to 3 once a mill multiplies the victims in, and in the moving
// phase at most three or four destinations per stone (≤ 3·stones), against
// Brandubh's ~40, Tablut's ~80 and Copenhagen's ~116 sliding moves. A ply here
// costs a fraction of a tafl ply, so the same budget buys several more.
//
// Two details are specific to this game:
//
//  • The placing phase is where the branching is widest *and* where a shallow
//    search is least punished — the first few stones are nearly interchangeable —
//    so the tiers are not depth-starved at the opening in the way a tafl tier is.
//  • `ollamh` gets the database probe and nothing else does. That is what makes
//    its label honest: perfect once play reaches a shipped table, deep-search
//    best-effort before that. Handing the probe to `hard` as well would make the
//    two tiers indistinguishable in exactly the endgames where a player notices.
const DIFFICULTY: Record<Difficulty, { limits: SearchLimits; config: SearchConfig; blunder: number }> = {
  // easy: two plies, no ordering, and a chunky blunder rate so it stays beatable
  // by a beginner who has just learned what a mill is.
  easy: { limits: { maxDepth: 2 }, config: { ...FULL_CONFIG, ordering: "none", useKillers: false, useHistory: false }, blunder: 0.35 },
  // medium: depth 4 with the full machinery; the deadline is a safety valve for a
  // pathological position rather than the thing that decides the depth.
  medium: { limits: { maxDepth: 4, deadlineMs: 1500 }, config: FULL_CONFIG, blunder: 0 },
  // hard: time-budgeted iterative deepening in a worker, with a floor so a slow
  // phone still gets a real answer.
  hard: { limits: { maxDepth: 8, deadlineMs: 3000, minDepth: 4 }, config: FULL_CONFIG, blunder: 0 },
  // ollamh ("master sage"): the strongest tier — a deep budget, a depth-6 floor,
  // and the endgame databases.
  ollamh: { limits: { maxDepth: 24, deadlineMs: 8000, minDepth: 6 }, config: FULL_CONFIG, blunder: 0 },
};

/** A chosen move plus what the search actually did to find it. `depth`/`nodes`
 *  are 0 for a "no move", a random blunder, or a database answer. */
export interface MoveInfo {
  move: Move | null;
  /** Mover-relative position value, on the same scale as {@link evaluate} — so
   *  `material` (100) is one stone. */
  score: number;
  /** The equal-best set — see `SearchResult.bestMoves`. */
  bestMoves: Move[];
  depth: number;
  nodes: number;
  elapsedMs: number;
  /** True when the move came straight out of an endgame database. */
  fromDatabase?: boolean;
}

/**
 * Choose the AI's move for whichever side is to move, reporting the search stats.
 * `rng` breaks ties and injects the blunder chance on easy.
 *
 * `probe` is passed through to the search **only on `ollamh`**: the ladder's
 * top tier is the one that promises perfect endgame play, and the others promise
 * a search. A caller that hands a probe to a lower tier is ignored rather than
 * quietly upgraded.
 */
export function chooseMoveDetailed(
  state: GameState,
  difficulty: Difficulty,
  rules: MorrisRuleSet,
  rng: () => number = Math.random,
  probe: DbProbe | null = null,
): MoveInfo {
  const moves = allMoves(state, rules);
  if (moves.length === 0)
    return {
      move: null,
      score: evaluate(state, DEFAULT_WEIGHTS, rules),
      bestMoves: [],
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
    };

  const { limits, config, blunder } = DIFFICULTY[difficulty];
  if (blunder > 0 && rng() < blunder)
    return {
      move: moves[Math.floor(rng() * moves.length)],
      score: evaluate(state, DEFAULT_WEIGHTS, rules),
      bestMoves: [],
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
    };

  const t0 = defaultNow();
  const r = pickMove(
    state,
    rules,
    limits,
    config,
    rng,
    DEFAULT_WEIGHTS,
    defaultNow,
    difficulty === "ollamh" ? probe : null,
  );
  return {
    move: r.move,
    score: r.score,
    bestMoves: r.bestMoves,
    depth: r.depth,
    nodes: r.nodes,
    elapsedMs: defaultNow() - t0,
    ...(r.fromDatabase ? { fromDatabase: true } : {}),
  };
}

// ── Analysis search ───────────────────────────────────────────────────────────
// Analysis is a different question from play — "what is this position worth and
// what is the best reply", for a position the user is looking at — so it gets its
// own entry point, limits and worker thread, and deliberately has no blunder roll.

/** Shallow by design: this re-runs on every cursor step, so it has to be cheap
 *  enough to be invisible. Deeper than the tafl equivalents because the tree is
 *  narrower. Nothing consumes it yet (no Morris analysis surface); it is here so
 *  that wiring one is a screen change. */
export const ANALYSIS_LIMITS: SearchLimits = { maxDepth: 4, deadlineMs: 1200 };

/** What "think harder" spends: on demand, never automatically. */
export const ANALYSIS_DEEP_LIMITS: SearchLimits = { maxDepth: 10, deadlineMs: 4000, minDepth: 5 };

/**
 * Evaluate a position for the analysis UI: the best move found and its score.
 *
 * **Deterministic in the position alone** — the tie-break `rng` is pinned and the
 * transposition table is cleared first, because the table feeds move *ordering*
 * and so decides which of several equally-best moves comes out first. Without
 * that, stepping back to a position already passed through could draw a different
 * (equally good) arrow than it drew the first time, which reads as the engine
 * changing its mind when nothing has changed.
 */
export function analysePosition(
  state: GameState,
  rules: MorrisRuleSet,
  limits: SearchLimits = ANALYSIS_LIMITS,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  probe: DbProbe | null = null,
): MoveInfo {
  const t0 = defaultNow();
  resetTT();
  const r = pickMove(state, rules, limits, FULL_CONFIG, () => 0, weights, defaultNow, probe);
  return {
    move: r.move,
    score: r.score,
    bestMoves: r.bestMoves,
    depth: r.depth,
    nodes: r.nodes,
    elapsedMs: defaultNow() - t0,
    ...(r.fromDatabase ? { fromDatabase: true } : {}),
  };
}

/** Thin wrapper: the move only. */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rules: MorrisRuleSet,
  rng: () => number = Math.random,
  probe: DbProbe | null = null,
): Move | null {
  return chooseMoveDetailed(state, difficulty, rules, rng, probe).move;
}
