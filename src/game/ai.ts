import {
  allMoves,
  applyMove,
  CORNERS,
  findKing,
  hashBoard,
  inBounds,
  isCorner,
  isEnemy,
  isGameOver,
  isThrone,
  sideOf,
  winnerOf,
} from "./engine";
import { BOARD_SIZE, type Board, type GameState, type Move, type Piece, type Side } from "./types";
import type { RuleSet } from "./variants";

export type Difficulty = "easy" | "medium" | "hard";

const WIN = 1_000_000;
/** Scores this close to ±WIN are decisive (a forced mate); deepening can stop. */
const DECISIVE = WIN - 1000;

/** Centre of the board, derived so ordering works for any size (7×7, 9×9 Tablut…). */
const CENTER = (BOARD_SIZE - 1) / 2;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ── Evaluation (attacker-positive) ────────────────────────────────────────────
// Every term is weighted so eval variants can be compared head-to-head via
// self-play (scripts/aibench.ts). All terms read from CORNERS / BOARD_SIZE and
// the RuleSet, so they stay variant- and board-size-agnostic (Tablut etc.).
export interface EvalWeights {
  /** Per (attackers − 2·defenders). Defenders are scarcer, so worth ~2×. */
  material: number;
  /** Per unit of king→corner distance. Positive ⇒ attackers want the king far. */
  kingCorner: number;
  /** Subtracted per open escape lane². One lane is worrying, two nearly lost. */
  escapeLane: number;
  /** Per attacker orthogonally adjacent to the king (capture pressure). */
  hug: number;
  /** Per empty orthogonal square around the king that is *not* an open lane —
   *  raw breathing room. Subtracted, so fewer liberties favour attackers. */
  liberties: number;
  /** Subtracted per defender orthogonally adjacent to the king (a shield that
   *  blocks custodial capture). */
  shield: number;
  /** Per (attacker legal moves − defender legal moves). 0 ⇒ skip (it costs a
   *  full move-gen for both sides, so only pay it when it earns its keep). */
  mobility: number;
  /** Use the blocker-aware king→corner distance (1/2/3 real king-moves) instead
   *  of the crude aligned?1:2 estimate that ignores pieces in the lane. */
  blockerAwareKingDist: boolean;
}

/**
 * The shipping weights for Brandubh. These are the original hand-tuned heuristic,
 * kept after an A/B gauntlet (scripts/evaltune.ts) found no candidate term beat it
 * at the depths the game actually plays: shield/liberties were worse (redundant
 * with the king-safety terms), mobility helped only at depth 2 (gone by depth 3)
 * and cost ~2× per node, and blocker-aware king distance was neutral. The extra
 * terms remain as opt-in knobs for retuning on differently-balanced variants.
 */
export const DEFAULT_WEIGHTS: EvalWeights = {
  material: 40,
  kingCorner: 25,
  escapeLane: 120,
  hug: 30,
  liberties: 0,
  shield: 0,
  mobility: 0,
  blockerAwareKingDist: false,
};

function clearPathToCorner(b: Board, kr: number, kc: number): number {
  // Count corners the king could slide to *right now* with an unobstructed
  // straight path. Two or more open paths is a near-certain escape.
  let open = 0;
  for (const corner of CORNERS) {
    if (corner.row !== kr && corner.col !== kc) continue; // not aligned
    let blocked = false;
    if (corner.row === kr) {
      const step = corner.col > kc ? 1 : -1;
      for (let c = kc + step; c !== corner.col; c += step)
        if (b[kr][c] !== null) {
          blocked = true;
          break;
        }
    } else {
      const step = corner.row > kr ? 1 : -1;
      for (let r = kr + step; r !== corner.row; r += step)
        if (b[r][kc] !== null) {
          blocked = true;
          break;
        }
    }
    if (!blocked) open++;
  }
  return open;
}

/** All squares strictly between the two aligned points are empty. */
function lineClear(b: Board, r0: number, c0: number, r1: number, c1: number): boolean {
  if (r0 === r1) {
    const step = c1 > c0 ? 1 : -1;
    for (let c = c0 + step; c !== c1; c += step) if (b[r0][c] !== null) return false;
    return true;
  }
  const step = r1 > r0 ? 1 : -1;
  for (let r = r0 + step; r !== r1; r += step) if (b[r][c0] !== null) return false;
  return true;
}

/** Real king-moves to the nearest corner, honouring blockers: 1 (aligned, clear
 *  lane), 2 (one clear L-path via a pivot), else 3 (capped). A rook needs ≤2
 *  moves to any square, via one of two pivots — so this is exact for 1 and 2. */
function kingCornerMoves(b: Board, kr: number, kc: number): number {
  let best = 3;
  for (const corner of CORNERS) {
    const { row: cr, col: cc } = corner;
    if ((kr === cr || kc === cc) && lineClear(b, kr, kc, cr, cc)) return 1;
    for (const [pr, pc] of [
      [kr, cc],
      [cr, kc],
    ] as const) {
      if (b[pr][pc] !== null) continue; // pivot must be empty to stop on
      if ((pr === kr || pc === kc) && lineClear(b, kr, kc, pr, pc) && lineClear(b, pr, pc, cr, cc))
        best = Math.min(best, 2);
    }
  }
  return best;
}

export function evaluate(state: GameState, w: EvalWeights = DEFAULT_WEIGHTS, rules?: RuleSet): number {
  if (isGameOver(state.status)) {
    const winner = winnerOf(state.status);
    if (winner === "attackers") return WIN;
    if (winner === "defenders") return -WIN;
    return 0; // draw
  }

  const b = state.board;
  let attackers = 0;
  let defenders = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = b[r][c];
      if (p === "attacker") attackers++;
      else if (p === "defender") defenders++;
    }

  let score = (attackers - defenders * 2) * w.material;

  const k = findKing(b);
  if (k) {
    // King→corner distance. Attackers want it far, defenders near.
    if (w.blockerAwareKingDist) {
      score += kingCornerMoves(b, k.row, k.col) * w.kingCorner;
    } else {
      let best = 99;
      for (const corner of CORNERS) {
        const d =
          (k.row === corner.row || k.col === corner.col ? 1 : 2) +
          (Math.abs(k.row - corner.row) + Math.abs(k.col - corner.col)) / 100;
        best = Math.min(best, d);
      }
      score += best * w.kingCorner;
    }

    const open = clearPathToCorner(b, k.row, k.col);
    score -= open * open * w.escapeLane;

    // Piece structure around the king: attacker pressure, defender shield, and
    // raw breathing room.
    let hug = 0;
    let shield = 0;
    let liberties = 0;
    for (const [dr, dc] of DIRS) {
      const nr = k.row + dr;
      const nc = k.col + dc;
      if (!inBounds(nr, nc)) continue;
      const p = b[nr][nc];
      if (p === "attacker") hug++;
      else if (p === "defender") shield++;
      else if (p === null) liberties++;
    }
    score += hug * w.hug;
    score -= shield * w.shield;
    score -= liberties * w.liberties;
  }

  if (w.mobility !== 0 && rules) {
    const am = allMoves(b, "attackers", rules).length;
    const dm = allMoves(b, "defenders", rules).length;
    score += (am - dm) * w.mobility;
  }

  return score;
}

// ── Cheap capture preview ─────────────────────────────────────────────────────
// A soldier's custodial-capture rule, evaluated for a *hypothetical* move without
// cloning the board. Used only for move ordering and quiescence filtering — the
// authoritative capture resolution still happens inside engine.applyMove — so an
// occasional approximation here never corrupts the actual game/eval. Mirrors
// engine.isAnvilForSoldier, but treats the mover's origin as already vacated and
// its destination as occupied.
function previewAnvil(
  b: Board,
  r: number,
  c: number,
  from: Move["from"],
  side: Side,
  rules: RuleSet,
): boolean {
  if (!inBounds(r, c)) return false;
  if (isCorner(r, c) && rules.cornersHostile) return true;
  let occ = b[r][c];
  if (r === from.row && c === from.col) occ = null; // mover has left this square
  if (isThrone(r, c)) {
    if (occ === null) return rules.throneHostileToSoldiers;
    return sideOf(occ) === side; // an occupied throne backs whoever stands on it
  }
  return sideOf(occ) === side;
}

/** How many enemy soldiers the piece would custodially capture landing on `to`. */
function previewCaptureCount(
  b: Board,
  from: Move["from"],
  to: Move["to"],
  piece: Piece | null,
  side: Side,
  rules: RuleSet,
): number {
  if (piece === "king" && !rules.armedKing) return 0; // a weaponless king captures nothing
  let n = 0;
  for (const [dr, dc] of DIRS) {
    const mr = to.row + dr;
    const mc = to.col + dc; // square pinned against the anvil
    if (!inBounds(mr, mc)) continue;
    let victim = b[mr][mc];
    if (mr === from.row && mc === from.col) victim = null; // vacated by the mover
    if (victim === null || victim === "king") continue; // king capture handled by search
    if (!isEnemy(victim, side)) continue;
    if (previewAnvil(b, mr + dr, mc + dc, from, side, rules)) n++;
  }
  return n;
}

// ── Search configuration (lets self-play compare old vs new cleanly) ───────────
export type Ordering = "smart" | "legacy" | "none";

export interface SearchConfig {
  ordering: Ordering;
  useTT: boolean;
  useKillers: boolean;
  useQuiescence: boolean;
  /** Max extra plies the quiescence search may extend. */
  maxQuiescencePly: number;
}

export const FULL_CONFIG: SearchConfig = {
  ordering: "smart",
  useTT: true,
  useKillers: true,
  useQuiescence: true,
  maxQuiescencePly: 6,
};

/** The original engine's behaviour — a fixed-depth searcher with legacy ordering
 *  and none of the new machinery. Used as the self-play baseline. */
export const LEGACY_CONFIG: SearchConfig = {
  ordering: "legacy",
  useTT: false,
  useKillers: false,
  useQuiescence: false,
  maxQuiescencePly: 0,
};

export interface SearchLimits {
  /** Hard cap on iterative-deepening depth. */
  maxDepth: number;
  /** Wall-clock budget in ms. Omit for a pure fixed-depth (deterministic) search. */
  deadlineMs?: number;
}

// ── Transposition table (persists across moves) ───────────────────────────────
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
let TT_GEN = 0;

/** Position value is (almost entirely) determined by board + side to move, so the
 *  table is safe to reuse move-to-move. The lone caveat is repetition-sensitive
 *  lines whose value depends on history; this is the standard, negligible TT
 *  unsoundness that real engines accept. Terminal nodes are never stored. */
function ttStore(key: string, depth: number, value: number, flag: Flag, move: Move | null): void {
  const prev = TT.get(key);
  if (prev && prev.gen === TT_GEN && prev.depth > depth) return; // keep the deeper current-gen entry
  TT.set(key, { depth, value, flag, move, gen: TT_GEN });
}

/** Exposed for tests/benchmarks that want a clean slate. */
export function resetTT(): void {
  TT.clear();
  TT_GEN = 0;
}

// ── Search context ────────────────────────────────────────────────────────────
const ABORT = Symbol("search-aborted");

interface Ctx {
  rules: RuleSet;
  cfg: SearchConfig;
  weights: EvalWeights;
  deadline: number; // Infinity ⇒ no time limit (fixed-depth, deterministic)
  now: () => number;
  nodes: number;
  killers: Array<[Move | null, Move | null]>;
}

const sameMove = (a: Move | null, b: Move | null): boolean =>
  a != null &&
  b != null &&
  a.from.row === b.from.row &&
  a.from.col === b.from.col &&
  a.to.row === b.to.row &&
  a.to.col === b.to.col;

function recordKiller(ctx: Ctx, ply: number, m: Move): void {
  const slot = (ctx.killers[ply] ??= [null, null]);
  if (sameMove(slot[0], m)) return;
  slot[1] = slot[0];
  slot[0] = m;
}

// ── Move ordering ─────────────────────────────────────────────────────────────
function orderMoves(state: GameState, moves: Move[], ttMove: Move | null, ply: number, ctx: Ctx): Move[] {
  if (ctx.cfg.ordering === "none") return moves;
  const b = state.board;
  const side = state.turn;
  const rules = ctx.rules;
  const killers = ctx.cfg.useKillers ? ctx.killers[ply] : undefined;
  const king = ctx.cfg.ordering === "smart" && side === "attackers" ? findKing(b) : null;

  const scored = moves.map((m) => {
    let s = 0;
    const piece = b[m.from.row][m.from.col];

    if (ctx.cfg.ordering === "smart") {
      if (sameMove(m, ttMove)) s += 1_000_000_000; // principal-variation move first
      // Immediate king escape (defenders) is decisive.
      if (piece === "king" && side === "defenders" && isCorner(m.to.row, m.to.col)) s += 500_000_000;
      const caps = previewCaptureCount(b, m.from, m.to, piece, side, rules);
      if (caps > 0) s += 1_000_000 + caps * 1000;
      // Attacker landing next to the king may complete a capture — search it early.
      if (king && Math.abs(m.to.row - king.row) + Math.abs(m.to.col - king.col) === 1) s += 200_000;
      if (killers) {
        if (sameMove(m, killers[0])) s += 90_000;
        else if (sameMove(m, killers[1])) s += 80_000;
      }
    } else {
      // Legacy: nudge defenders toward corners, everyone toward the centre.
      if (side === "defenders" && isCorner(m.to.row, m.to.col)) s += 10_000;
    }

    s -= Math.abs(m.to.row - CENTER) + Math.abs(m.to.col - CENTER);
    return { m, s };
  });

  scored.sort((a, b2) => b2.s - a.s);
  return scored.map((x) => x.m);
}

// ── Quiescence: only tactical replies, so the search never stops mid-exchange ──
/** Captures, immediate king escapes, and attacker moves adjacent to the king. */
function tacticalMoves(state: GameState, ctx: Ctx): Move[] {
  const b = state.board;
  const side = state.turn;
  const rules = ctx.rules;
  const king = side === "attackers" ? findKing(b) : null;
  const out: Move[] = [];
  for (const m of allMoves(b, side, rules)) {
    const piece = b[m.from.row][m.from.col];
    if (previewCaptureCount(b, m.from, m.to, piece, side, rules) > 0) {
      out.push(m);
    } else if (piece === "king" && isCorner(m.to.row, m.to.col)) {
      out.push(m); // defender escape
    } else if (king && Math.abs(m.to.row - king.row) + Math.abs(m.to.col - king.col) === 1) {
      out.push(m); // attacker pressing the king (may be a capture the preview can't see)
    }
  }
  return out;
}

function quiesce(state: GameState, alpha: number, beta: number, qply: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluate(state, ctx.weights, ctx.rules);

  const standPat = evaluate(state, ctx.weights, ctx.rules);
  const maximizing = state.turn === "attackers";
  if (maximizing) {
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return standPat;
    if (standPat < beta) beta = standPat;
  }
  if (qply <= 0) return standPat;

  const tactical = tacticalMoves(state, ctx);
  if (tactical.length === 0) return standPat;
  const ordered = orderMoves(state, tactical, null, 0, ctx);

  let best = standPat;
  for (const m of ordered) {
    const child = applyMove(state, m, ctx.rules);
    const v = quiesce(child, alpha, beta, qply - 1, ctx);
    if (maximizing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

// ── Alpha–beta minimax (attacker-positive, fail-soft) ─────────────────────────
function search(state: GameState, depth: number, ply: number, alpha: number, beta: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluate(state, ctx.weights, ctx.rules);
  if (depth <= 0) return ctx.cfg.useQuiescence ? quiesce(state, alpha, beta, ctx.cfg.maxQuiescencePly, ctx) : evaluate(state, ctx.weights, ctx.rules);

  const alpha0 = alpha;
  const beta0 = beta;
  const key = ctx.cfg.useTT ? hashBoard(state.board, state.turn) : "";
  let ttMove: Move | null = null;
  if (ctx.cfg.useTT) {
    const e = TT.get(key);
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        if (e.flag === Flag.Exact) return e.value;
        if (e.flag === Flag.Lower && e.value > alpha) alpha = e.value;
        else if (e.flag === Flag.Upper && e.value < beta) beta = e.value;
        if (alpha >= beta) return e.value;
      }
    }
  }

  const maximizing = state.turn === "attackers";
  const moves = orderMoves(state, allMoves(state.board, state.turn, ctx.rules), ttMove, ply, ctx);
  if (moves.length === 0) return evaluate(state, ctx.weights, ctx.rules); // no legal move ⇒ status is already terminal

  let best = maximizing ? -Infinity : Infinity;
  let bestMove: Move | null = null;
  for (const m of moves) {
    const child = applyMove(state, m, ctx.rules);
    const v = search(child, depth - 1, ply + 1, alpha, beta, ctx);
    if (maximizing) {
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (best > alpha) alpha = best;
    } else {
      if (v < best) {
        best = v;
        bestMove = m;
      }
      if (best < beta) beta = best;
    }
    if (alpha >= beta) {
      if (ctx.cfg.useKillers && previewCaptureCount(state.board, m.from, m.to, state.board[m.from.row][m.from.col], state.turn, ctx.rules) === 0)
        recordKiller(ctx, ply, m);
      break;
    }
  }

  if (ctx.cfg.useTT) {
    const flag = best <= alpha0 ? Flag.Upper : best >= beta0 ? Flag.Lower : Flag.Exact;
    ttStore(key, depth, best, flag, bestMove);
  }
  return best;
}

// ── Root: iterative deepening, tie-collection for a little randomness ──────────
export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

export const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

/**
 * Choose a move via iterative-deepening alpha–beta. Deterministic when `limits`
 * carries no `deadlineMs` (fixed depth) and `rng` is seeded — which is exactly
 * how the tests drive it.
 */
export function pickMove(
  state: GameState,
  rules: RuleSet,
  limits: SearchLimits,
  config: SearchConfig = FULL_CONFIG,
  rng: () => number = Math.random,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  now: () => number = defaultNow,
): SearchResult {
  const rootMoves = allMoves(state.board, state.turn, rules);
  if (rootMoves.length === 0) return { move: null, score: evaluate(state, weights, rules), depth: 0, nodes: 0 };

  TT_GEN++;
  if (TT.size > TT_MAX) TT.clear();

  const t0 = now();
  const ctx: Ctx = {
    rules,
    cfg: config,
    weights,
    deadline: limits.deadlineMs != null ? t0 + limits.deadlineMs : Infinity,
    now,
    nodes: 0,
    killers: [],
  };
  const maximizing = state.turn === "attackers";
  const rootKey = config.useTT ? hashBoard(state.board, state.turn) : "";

  let bestMove: Move = rootMoves[0];
  let bestTies: Move[] = [rootMoves[0]];
  let bestScore = maximizing ? -Infinity : Infinity;
  let reached = 0;
  let prevIterMs = 0;

  for (let d = 1; d <= limits.maxDepth; d++) {
    const iterStart = now();
    try {
      const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
      const ordered = orderMoves(state, allMoves(state.board, state.turn, rules), ttMove, 0, ctx);
      // Share the best-so-far bound across root moves so strictly-worse moves get
      // pruned (fail-low), while any move that ties or beats the best still returns
      // its exact score — so the set of equal-best moves stays exact and we can
      // still randomise among them. (Scores are integers, so `best ∓ 1` is a tight
      // but tie-preserving window.)
      let localBest = maximizing ? -Infinity : Infinity;
      let ties: Move[] = [];
      for (const m of ordered) {
        const alpha = maximizing && localBest !== -Infinity ? localBest - 1 : -Infinity;
        const beta = !maximizing && localBest !== Infinity ? localBest + 1 : Infinity;
        const v = search(applyMove(state, m, rules), d - 1, 1, alpha, beta, ctx);
        if (maximizing ? v > localBest : v < localBest) {
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
      if (Math.abs(localBest) >= DECISIVE) break; // forced result found — no need to go deeper
    } catch (e) {
      if (e === ABORT) break; // keep the last fully-completed depth
      throw e;
    }
    // Predictive time management: don't *start* a depth we can't finish, so a
    // generous budget never means waiting the full time for a shallower result.
    // Estimate the next iteration from the observed effective branching factor.
    if (ctx.deadline < Infinity) {
      const iterMs = now() - iterStart;
      const ebf = prevIterMs > 0 ? Math.max(2, iterMs / prevIterMs) : 5;
      if (now() - t0 + iterMs * ebf > ctx.deadline - t0) break;
      prevIterMs = iterMs;
    }
  }

  const chosen = bestTies[Math.floor(rng() * bestTies.length)] ?? bestMove;
  return { move: chosen, score: bestScore, depth: reached, nodes: ctx.nodes };
}

// ── Difficulty ladder ─────────────────────────────────────────────────────────
// easy/medium are fixed-depth (instant on any board); hard is time-budgeted and
// deepens as far as the clock allows. Budgets are intentionally conservative and
// tuned against the benchmark; they scale gracefully to larger variants because
// the search deepens to whatever the time allows rather than a fixed ply count.
const DIFFICULTY: Record<Difficulty, { limits: SearchLimits; config: SearchConfig; blunder: number }> = {
  // easy: shallow, no quiescence, and a chunky blunder rate so it stays beatable.
  easy: { limits: { maxDepth: 2 }, config: { ...FULL_CONFIG, useQuiescence: false }, blunder: 0.35 },
  // medium: fixed depth 3 with the full machinery — already stronger than the old
  // hard (depth 3, no quiescence/ordering/TT), and effectively instant (~50ms).
  medium: { limits: { maxDepth: 3 }, config: FULL_CONFIG, blunder: 0 },
  // hard: time-budgeted iterative deepening, run off the main thread in a Web
  // Worker so the ~1.5s budget never freezes the UI. Predictive stopping (see
  // pickMove) means it only spends the whole budget when it can actually use the
  // extra depth — otherwise it returns as soon as the next ply won't finish, so
  // slower devices wait less and simply search shallower. Quiescence extends
  // tactical lines further still.
  hard: { limits: { maxDepth: 6, deadlineMs: 1500 }, config: FULL_CONFIG, blunder: 0 },
};

/**
 * Choose the AI's move for whichever side is to move. `rng` (0..1) breaks ties
 * and injects a little blunder chance on easy so it feels human. Public signature
 * is unchanged; the strength now comes from iterative deepening + a transposition
 * table + quiescence rather than a single shallow fixed-depth pass.
 */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rules: RuleSet,
  rng: () => number = Math.random,
): Move | null {
  const moves = allMoves(state.board, state.turn, rules);
  if (moves.length === 0) return null;

  const { limits, config, blunder } = DIFFICULTY[difficulty];
  if (blunder > 0 && rng() < blunder) return moves[Math.floor(rng() * moves.length)];

  return pickMove(state, rules, limits, config, rng).move;
}
