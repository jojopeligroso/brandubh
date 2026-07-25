import {
  allMoves,
  applyMove,
  CORNERS,
  findKing,
  isCorner,
  isGameOver,
  winnerOf,
} from "./engine";
import { BOARD_SIZE, type Board, type GameState, type Move, type Side } from "./types";
import type { RuleSet } from "./variants";

export type Difficulty = "easy" | "medium" | "hard";
const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

const WIN = 1_000_000;

// ── Evaluation (attacker-positive) ────────────────────────────────────────────
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

function evaluate(state: GameState): number {
  if (isGameOver(state.status)) {
    const w = winnerOf(state.status);
    if (w === "attackers") return WIN;
    if (w === "defenders") return -WIN;
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

  let score = 0;
  score += (attackers - defenders * 2) * 40; // defenders are scarcer → worth more

  const k = findKing(b);
  if (k) {
    // King's distance to the nearest corner (in rook moves ≈ 1 or 2). Attackers
    // want it far; defenders want it near.
    let best = 99;
    for (const corner of CORNERS) {
      const d =
        (k.row === corner.row || k.col === corner.col ? 1 : 2) +
        (Math.abs(k.row - corner.row) + Math.abs(k.col - corner.col)) / 100;
      best = Math.min(best, d);
    }
    score += best * 25; // larger distance = better for attackers

    // Open escape lanes are dangerous. One is worrying, two is nearly lost.
    const open = clearPathToCorner(b, k.row, k.col);
    score -= open * open * 120;

    // Reward attackers hugging the king (progress toward a capture).
    let hug = 0;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nr = k.row + dr;
      const nc = k.col + dc;
      if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && b[nr][nc] === "attacker")
        hug++;
    }
    score += hug * 30;
  }

  return score;
}

// ── Move ordering: try captures & king-progress first for better pruning ──────
function orderMoves(moves: Move[], side: Side): Move[] {
  return moves
    .map((m) => {
      let s = 0;
      if (side === "defenders" && isCorner(m.to.row, m.to.col)) s += 10_000;
      // Edge-ward attacker pushes and central control are minor nudges.
      s += -(Math.abs(m.to.row - 3) + Math.abs(m.to.col - 3));
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
  if (depth === 0 || isGameOver(state.status)) return evaluate(state);

  const maximizing = state.turn === "attackers";
  const moves = orderMoves(allMoves(state.board, state.turn, rules), state.turn);
  if (moves.length === 0) return evaluate(state);

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
 * and injects a little blunder chance on easy so it feels human.
 */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rules: RuleSet,
  rng: () => number = Math.random,
): Move | null {
  const moves = orderMoves(allMoves(state.board, state.turn, rules), state.turn);
  if (moves.length === 0) return null;

  // Easy sometimes just plays a random legal move.
  if (difficulty === "easy" && rng() < 0.35) return moves[Math.floor(rng() * moves.length)];

  const depth = DEPTH[difficulty];
  const maximizing = state.turn === "attackers";
  let bestScore = maximizing ? -Infinity : Infinity;
  const best: Move[] = [];

  for (const m of moves) {
    const score = search(applyMove(state, m, rules), depth - 1, -Infinity, Infinity, rules);
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(m);
    } else if (score === bestScore) {
      best.push(m);
    }
  }

  return best[Math.floor(rng() * best.length)] ?? moves[0];
}
