import {
  allMoves,
  applyMove,
  CORNERS,
  findKing,
  inBounds,
  isCorner,
  isGameOver,
  isThrone,
  winnerOf,
} from "./engine";
import { BOARD_SIZE, type Board, type GameState, type Move, type Side, type Square } from "./types";
import type { RuleSet } from "./variants";

export type Difficulty = "easy" | "medium" | "hard";
// Brandubh is sharp and asymmetric — the king can assemble a two-move escape
// that a shallow search never sees coming, so the attacker needs real lookahead
// to hold the line.
//
// `MAX_DEPTH` is the deepest a level will look; `BUDGET_MS` caps the wall-clock
// spent per move. Easy and medium always search their full (small) depth, so
// they are deterministic. Hard searches with iterative deepening up to depth 4
// but bails to the best fully-searched depth once the budget is spent, so a
// tangled position never freezes the board.
const MAX_DEPTH: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 4 };
const BUDGET_MS: Record<Difficulty, number> = {
  easy: Infinity,
  medium: Infinity,
  hard: 900,
};

const WIN = 1_000_000;

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// The edge squares immediately beside each corner. The king can only enter a
// corner along a rank or file, so these eight squares are the gateways to every
// escape — an attacker parked on one seals off that approach.
const CORNER_GUARDS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, 5],
  [1, 6],
  [6, 1],
  [5, 0],
  [6, 5],
  [5, 6],
];
const CORNER_GUARD_KEYS = new Set(CORNER_GUARDS.map(([r, c]) => r * BOARD_SIZE + c));

const UNREACHABLE = 9;

// ── King escape analysis ──────────────────────────────────────────────────────
/**
 * How many rook-moves the king needs to reach each square, via a BFS over the
 * squares it can actually slide across (empty cells; it may glide over the empty
 * throne but only rest there when the ruleset allows). This is the heart of the
 * evaluation: it sees the *multi-move* escapes a one-ply lane check is blind to,
 * so the attacker can plug a run before it becomes unstoppable.
 */
function kingMoveDistances(b: Board, kr: number, kc: number, rules: RuleSet): number[][] {
  const dist: number[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<number>(BOARD_SIZE).fill(-1),
  );
  dist[kr][kc] = 0;
  const queue: Array<[number, number]> = [[kr, kc]];
  for (let head = 0; head < queue.length; head++) {
    const [r, c] = queue[head];
    const d = dist[r][c];
    for (const [dr, dc] of ORTHO) {
      let nr = r + dr;
      let nc = c + dc;
      // Slide until blocked; every empty square along the ray is one move away.
      while (inBounds(nr, nc) && b[nr][nc] === null) {
        const landable = !isThrone(nr, nc) || rules.kingMayReoccupyThrone;
        if (landable && dist[nr][nc] === -1) {
          dist[nr][nc] = d + 1;
          queue.push([nr, nc]);
        }
        nr += dr;
        nc += dc;
      }
    }
  }
  return dist;
}

interface Escape {
  /** Fewest rook-moves to the nearest corner (UNREACHABLE if boxed in). */
  minDist: number;
  /** Corners reachable in a single move — a win if it is the king's turn. */
  open1: number;
  /** Distinct corners reachable within two moves — the run-to-the-corner plan. */
  open2: number;
}

function kingEscape(b: Board, k: Square, rules: RuleSet): Escape {
  const dist = kingMoveDistances(b, k.row, k.col, rules);
  let minDist = UNREACHABLE;
  let open1 = 0;
  let open2 = 0;
  for (const corner of CORNERS) {
    const d = dist[corner.row][corner.col];
    if (d <= 0) continue; // -1 unreachable, 0 impossible (king not on a corner mid-game)
    if (d < minDist) minDist = d;
    if (d === 1) open1++;
    if (d <= 2) open2++;
  }
  return { minDist, open1, open2 };
}

// ── Evaluation (attacker-positive) ────────────────────────────────────────────
// Exported for tests: higher = better for the attackers.
export function evaluate(state: GameState, rules: RuleSet): number {
  if (isGameOver(state.status)) {
    const w = winnerOf(state.status);
    if (w === "attackers") return WIN;
    if (w === "defenders") return -WIN;
    return 0; // draw
  }

  const b = state.board;
  let attackers = 0;
  let defenders = 0;
  let guards = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = b[r][c];
      if (p === "attacker") {
        attackers++;
        if (CORNER_GUARD_KEYS.has(r * BOARD_SIZE + c)) guards++;
      } else if (p === "defender") defenders++;
    }

  let score = 0;
  score += (attackers - defenders * 2) * 40; // defenders are scarcer → worth more
  // Attackers holding the corner gateways throttle the king's escape routes.
  score += guards * 12;

  const k = findKing(b);
  if (k) {
    const { minDist, open1, open2 } = kingEscape(b, k, rules);

    // The further the king is (in real rook-moves) from any corner, the safer
    // for the attackers. A boxed-in king (UNREACHABLE) is ideal.
    score += Math.min(minDist, UNREACHABLE) * 24;

    // Escape threats. The key insight the old AI missed: a *single* open route
    // is defensible (the attacker blocks it next turn), but two or more
    // independent routes cannot all be blocked, so they are nearly a loss. The
    // penalty is therefore strongly super-linear — it must dwarf material so the
    // search steers away from letting a double threat form a move *earlier*,
    // while staying well short of the ±WIN terminals.
    //  · open1 — the king can step into a corner right now.
    //  · open2 — the two-move run to a corner that beat the old AI.
    if (open1 >= 2) score -= 60_000;
    else if (open1 === 1) score -= 5_000;
    if (open2 >= 2) score -= 4_000 + open2 * 600;
    else if (open2 === 1) score -= 160;

    // Reward attackers hugging the king (progress toward a capture).
    let hug = 0;
    for (const [dr, dc] of ORTHO) {
      const nr = k.row + dr;
      const nc = k.col + dc;
      if (inBounds(nr, nc) && b[nr][nc] === "attacker") hug++;
    }
    score += hug * 30;
  }

  return score;
}

// ── Move ordering: try the sharpest moves first for better alpha-beta pruning ─
function orderMoves(moves: Move[], side: Side, king: Square | null): Move[] {
  return moves
    .map((m) => {
      let s = 0;
      const { row: tr, col: tc } = m.to;
      if (m.captures && m.captures.length) s += 500 * m.captures.length;
      if (side === "defenders") {
        if (isCorner(tr, tc)) s += 10_000; // an outright escape — always try first
        // Otherwise steer the king toward the corners.
        let near = 99;
        for (const corner of CORNERS)
          near = Math.min(near, Math.abs(tr - corner.row) + Math.abs(tc - corner.col));
        s += -near;
      } else {
        // Attackers: guard the corner gateways and close on the king.
        if (CORNER_GUARD_KEYS.has(tr * BOARD_SIZE + tc)) s += 40;
        if (king) s += -(Math.abs(tr - king.row) + Math.abs(tc - king.col));
      }
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

// ── Alpha–beta minimax (attacker-positive) ────────────────────────────────────
function search(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  rules: RuleSet,
): number {
  if (depth === 0 || isGameOver(state.status)) return evaluate(state, rules);

  const maximizing = state.turn === "attackers";
  const moves = orderMoves(
    allMoves(state.board, state.turn, rules),
    state.turn,
    findKing(state.board),
  );
  if (moves.length === 0) return evaluate(state, rules);

  if (maximizing) {
    let value = -Infinity;
    for (const m of moves) {
      value = Math.max(value, search(applyMove(state, m, rules), depth - 1, alpha, beta, rules));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  } else {
    let value = Infinity;
    for (const m of moves) {
      value = Math.min(value, search(applyMove(state, m, rules), depth - 1, alpha, beta, rules));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }
}

/**
 * Choose the AI's move for whichever side is to move. `rng` (0..1) breaks ties
 * and injects a little blunder chance on easy so it feels human. `now` is
 * injectable purely for testing; it drives the per-move time budget.
 */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rules: RuleSet,
  rng: () => number = Math.random,
  now: () => number = Date.now,
): Move | null {
  const rootMoves = orderMoves(
    allMoves(state.board, state.turn, rules),
    state.turn,
    findKing(state.board),
  );
  if (rootMoves.length === 0) return null;

  // Easy sometimes just plays a random legal move.
  if (difficulty === "easy" && rng() < 0.35)
    return rootMoves[Math.floor(rng() * rootMoves.length)];

  const maximizing = state.turn === "attackers";
  const maxDepth = MAX_DEPTH[difficulty];
  const deadline = now() + BUDGET_MS[difficulty];

  // Iterative deepening: search depth 1, then 2, … keeping each root move's
  // score to order the next (deeper) pass best-first. That ordering sharpens
  // alpha-beta pruning, and it lets us stop at any completed depth when the
  // clock runs out while still returning a fully-searched move.
  let best: Move[] = [rootMoves[0]];
  let scored = rootMoves.map((m) => ({ m, s: 0 }));

  for (let depth = 1; depth <= maxDepth; depth++) {
    const order = scored
      .slice()
      .sort((a, b) => (maximizing ? b.s - a.s : a.s - b.s))
      .map((x) => x.m);

    const results: Array<{ m: Move; s: number }> = [];
    let bestScore = maximizing ? -Infinity : Infinity;
    const bestMoves: Move[] = [];
    let aborted = false;

    for (const m of order) {
      // Full window at the root so every move gets an exact score — needed to
      // gather all genuinely-tied best moves and to order the next pass.
      const score = search(applyMove(state, m, rules), depth - 1, -Infinity, Infinity, rules);
      results.push({ m, s: score });
      if (maximizing ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMoves.length = 0;
        bestMoves.push(m);
      } else if (score === bestScore) {
        bestMoves.push(m);
      }
      if (now() > deadline) {
        aborted = true;
        break;
      }
    }

    // Only adopt a depth we finished; a half-searched depth is misleading.
    if (!aborted) {
      best = bestMoves;
      scored = results;
    }
    if (aborted || Math.abs(bestScore) >= WIN) break; // out of time, or forced result
  }

  return best[Math.floor(rng() * best.length)] ?? rootMoves[0];
}
