import {
  BOARD_SIZE,
  type Board,
  type GameState,
  type GameStatus,
  type Move,
  type Piece,
  type Side,
  type Square,
} from "./types";
import type { RuleSet } from "./variants";

// ── Special squares ───────────────────────────────────────────────────────────
export const THRONE: Square = { row: 3, col: 3 };
export const CORNERS: Square[] = [
  { row: 0, col: 0 },
  { row: 0, col: 6 },
  { row: 6, col: 0 },
  { row: 6, col: 6 },
];

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ── Small square helpers ──────────────────────────────────────────────────────
export const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

export const isThrone = (r: number, c: number): boolean =>
  r === THRONE.row && c === THRONE.col;

export const isCorner = (r: number, c: number): boolean =>
  (r === 0 || r === 6) && (c === 0 || c === 6);

/** Corner or throne — the squares only the king may ever land on. */
export const isRestricted = (r: number, c: number): boolean =>
  isThrone(r, c) || isCorner(r, c);

export const sideOf = (p: Piece | null): Side | null =>
  p === "attacker" ? "attackers" : p === "defender" || p === "king" ? "defenders" : null;

export const isEnemy = (p: Piece | null, side: Side): boolean => {
  const s = sideOf(p);
  return s !== null && s !== side;
};

// ── Setup ─────────────────────────────────────────────────────────────────────
/**
 * Classic Brandubh cross: king on the throne, four defenders orthogonally
 * adjacent, eight attackers in pairs at the middle of each edge.
 */
export function initialBoard(): Board {
  const b: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  );
  b[3][3] = "king";
  // defenders — the king's four warriors
  b[2][3] = "defender";
  b[4][3] = "defender";
  b[3][2] = "defender";
  b[3][4] = "defender";
  // attackers — two at the head of each arm
  b[0][3] = b[1][3] = "attacker"; // top
  b[6][3] = b[5][3] = "attacker"; // bottom
  b[3][0] = b[3][1] = "attacker"; // left
  b[3][6] = b[3][5] = "attacker"; // right
  return b;
}

export function initialState(): GameState {
  return {
    board: initialBoard(),
    turn: "attackers", // attackers move first (they hold the initiative)
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
  };
}

export const cloneBoard = (b: Board): Board => b.map((row) => row.slice());

export function findKing(b: Board): Square | null {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (b[r][c] === "king") return { row: r, col: c };
  return null;
}

// ── Move generation ───────────────────────────────────────────────────────────
/** All legal destination squares for the piece at (r,c). Rook-like sliding. */
export function movesFrom(b: Board, r: number, c: number, rules: RuleSet): Square[] {
  const piece = b[r][c];
  if (!piece) return [];
  const isKing = piece === "king";
  const out: Square[] = [];

  for (const [dr, dc] of DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc) && b[nr][nc] === null) {
      const throneHere = isThrone(nr, nc);
      const cornerHere = isCorner(nr, nc);

      if (isKing) {
        // King may enter corners; may re-enter throne only if allowed.
        const canLand = cornerHere || !throneHere || rules.kingMayReoccupyThrone;
        if (canLand) out.push({ row: nr, col: nc });
      } else {
        // Soldiers may never stop on a restricted square, but may pass over the
        // empty throne when the variant allows it. They can never pass a corner
        // (corners sit at the board's edge, so this only guards the throne).
        if (!throneHere && !cornerHere) out.push({ row: nr, col: nc });
        else if (throneHere && !rules.soldiersPassThroughThrone) break; // blocked
      }
      nr += dr;
      nc += dc;
    }
  }
  return out;
}

export function allMoves(b: Board, side: Side, rules: RuleSet): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (sideOf(b[r][c]) !== side) continue;
      for (const to of movesFrom(b, r, c, rules)) moves.push({ from: { row: r, col: c }, to });
    }
  }
  return moves;
}

// ── Capture resolution ────────────────────────────────────────────────────────
/**
 * A square acts as an "anvil" for capturing an enemy *soldier* when it holds a
 * friendly piece or is a hostile square (corner / empty throne, per variant).
 */
function isAnvilForSoldier(
  b: Board,
  r: number,
  c: number,
  moverSide: Side,
  rules: RuleSet,
): boolean {
  if (!inBounds(r, c)) return false;
  if (isCorner(r, c) && rules.cornersHostile) return true;
  if (isThrone(r, c)) {
    // An *empty* throne is hostile to soldiers; an occupied throne backs up
    // whichever side stands on it (normal friendly-piece logic below).
    if (b[r][c] === null) return rules.throneHostileToSoldiers;
  }
  return sideOf(b[r][c]) === moverSide;
}

/**
 * Resolve captures triggered by `moverSide` having just moved a piece to (tr,tc).
 * Mutates `b`, returns the list of captured squares. Handles soldier custodial
 * capture and (via {@link kingIsCaptured}) special king capture.
 */
function resolveCaptures(
  b: Board,
  tr: number,
  tc: number,
  moverSide: Side,
  rules: RuleSet,
): Square[] {
  const moverPiece = b[tr][tc];
  // A weaponless king cannot flank/capture at all.
  if (moverPiece === "king" && !rules.armedKing) return [];

  const captured: Square[] = [];
  for (const [dr, dc] of DIRS) {
    const mr = tr + dr;
    const mc = tc + dc; // the square being pinned
    if (!inBounds(mr, mc)) continue;
    const victim = b[mr][mc];
    if (victim === null || !isEnemy(victim, moverSide)) continue;

    if (victim === "king") continue; // king capture handled separately (win check)

    const ar = mr + dr;
    const ac = mc + dc; // the anvil square beyond the victim
    if (isAnvilForSoldier(b, ar, ac, moverSide, rules)) {
      b[mr][mc] = null;
      captured.push({ row: mr, col: mc });
    }
  }
  return captured;
}

// ── King capture ──────────────────────────────────────────────────────────────
/**
 * Is the king currently captured? Called after each attacker move.
 * - Strong-king variants: on/next-to the throne the king must be surrounded on
 *   every available cardinal side (throne counts as a hostile flank).
 * - Elsewhere: custodial — two attackers (or attacker + hostile square) on
 *   opposite sides.
 */
export function kingIsCaptured(b: Board, rules: RuleSet): boolean {
  const k = findKing(b);
  if (!k) return true; // no king on the board = captured/removed
  const { row: r, col: c } = k;

  const throneAdjacent =
    (Math.abs(r - THRONE.row) === 1 && c === THRONE.col) ||
    (Math.abs(c - THRONE.col) === 1 && r === THRONE.row);
  const onThrone = isThrone(r, c);

  const flankHostile = (fr: number, fc: number): boolean => {
    if (!inBounds(fr, fc)) return false; // board edge is NOT hostile in Brandubh
    if (b[fr][fc] === "attacker") return true;
    if (isThrone(fr, fc) && b[fr][fc] === null) return rules.throneHostileToKing;
    if (isCorner(fr, fc) && rules.cornersHostile) return true;
    return false;
  };

  const needsAllFour =
    (onThrone && rules.strongKingOnThrone) ||
    (throneAdjacent && rules.strongKingAdjacentToThrone);
  if (needsAllFour) {
    for (const [dr, dc] of DIRS) {
      const fr = r + dr;
      const fc = c + dc;
      if (!inBounds(fr, fc)) return false; // open edge = not surrounded
      if (!flankHostile(fr, fc)) return false;
    }
    return true;
  }

  // Custodial capture on two opposite sides.
  const pairs: Array<[[number, number], [number, number]]> = [
    [
      [r - 1, c],
      [r + 1, c],
    ],
    [
      [r, c - 1],
      [r, c + 1],
    ],
  ];
  for (const [[ar, ac], [br, bc]] of pairs) {
    if (flankHostile(ar, ac) && flankHostile(br, bc)) return true;
  }
  return false;
}

// ── Board hashing (repetition detection) ──────────────────────────────────────
const GLYPH: Record<string, string> = { attacker: "a", defender: "d", king: "k" };
export function hashBoard(b: Board, turn: Side): string {
  let s = turn === "attackers" ? "A" : "D";
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) s += b[r][c] ? GLYPH[b[r][c] as string] : ".";
  return s;
}

// ── Encirclement detection ────────────────────────────────────────────────────
/**
 * Returns true if the king and all remaining defenders are completely encircled
 * by attackers — no path from the king through empty/defender/king squares
 * reaches the board edge without crossing an attacker. Board edges do NOT count
 * as part of the ring (WTF rule).
 */
export function isEncircled(b: Board): boolean {
  const king = findKing(b);
  if (!king) return false;
  if (
    king.row === 0 ||
    king.row === BOARD_SIZE - 1 ||
    king.col === 0 ||
    king.col === BOARD_SIZE - 1
  )
    return false;
  const visited = new Set<number>();
  const queue: Array<[number, number]> = [[king.row, king.col]];
  visited.add(king.row * BOARD_SIZE + king.col);
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const key = nr * BOARD_SIZE + nc;
      if (visited.has(key)) continue;
      if (b[nr][nc] === "attacker") continue;
      if (nr === 0 || nr === BOARD_SIZE - 1 || nc === 0 || nc === BOARD_SIZE - 1) return false;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }
  return true;
}

// ── Applying a move ───────────────────────────────────────────────────────────
/**
 * Apply `move` to `state`, returning a *new* GameState with captures resolved,
 * turn flipped, and the win/loss status recomputed. Assumes `move` is legal.
 */
export function applyMove(state: GameState, move: Move, rules: RuleSet): GameState {
  const board = cloneBoard(state.board);
  const mover = state.turn;
  const piece = board[move.from.row][move.from.col];

  const hashBefore = hashBoard(state.board, state.turn);

  board[move.to.row][move.to.col] = piece;
  board[move.from.row][move.from.col] = null;

  const captures = resolveCaptures(board, move.to.row, move.to.col, mover, rules);
  const captured = { ...state.captured };
  captured[mover === "attackers" ? "defenders" : "attackers"] += captures.length;

  const nextTurn: Side = mover === "attackers" ? "defenders" : "attackers";
  const history = [
    ...state.history,
    { move: { ...move, captures }, hashBefore, sideThatMoved: mover },
  ];

  const status = computeStatus(board, nextTurn, mover, move, rules, history);

  return {
    board,
    turn: nextTurn,
    status,
    moveCount: state.moveCount + 1,
    history,
    captured,
  };
}

function computeStatus(
  board: Board,
  nextTurn: Side,
  mover: Side,
  lastMove: Move,
  rules: RuleSet,
  history: GameState["history"],
): GameStatus {
  // 1. Defender escape: king just reached a corner.
  if (mover === "defenders") {
    const p = board[lastMove.to.row][lastMove.to.col];
    if (p === "king" && isCorner(lastMove.to.row, lastMove.to.col))
      return "defenders_win_escape";
  }

  // 2. Attacker capture of the king.
  if (mover === "attackers" && kingIsCaptured(board, rules)) return "attackers_win_capture";

  // 3. Attacker encirclement win.
  if (mover === "attackers" && rules.encirclementWin && isEncircled(board))
    return "attackers_win_encirclement";

  // 4. Threefold repetition.
  if (rules.repetitionResult !== "none") {
    const currentHash = hashBoard(board, nextTurn);
    let seen = 1;
    for (const h of history) if (h.hashBefore === currentHash) seen++;
    if (seen >= 3)
      return rules.repetitionResult === "draw" ? "draw_repetition" : "attackers_win_repetition";
  }

  // 5. Side to move has no legal move → they lose (a "block").
  if (allMoves(board, nextTurn, rules).length === 0)
    return nextTurn === "attackers" ? "defenders_win_no_moves" : "attackers_win_no_moves";

  return "playing";
}

// ── Notation ──────────────────────────────────────────────────────────────────
const FILES = "abcdefg";
export const squareName = (s: Square): string => `${FILES[s.col]}${BOARD_SIZE - s.row}`;
export const moveName = (m: Move): string =>
  `${squareName(m.from)}-${squareName(m.to)}${m.captures && m.captures.length ? "x" + m.captures.length : ""}`;

export const isGameOver = (status: GameStatus): boolean => status !== "playing";

export function winnerOf(status: GameStatus): Side | "draw" | null {
  switch (status) {
    case "defenders_win_escape":
    case "defenders_win_no_moves":
    case "defenders_win_resign":
      return "defenders";
    case "attackers_win_capture":
    case "attackers_win_encirclement":
    case "attackers_win_repetition":
    case "attackers_win_no_moves":
    case "attackers_win_resign":
      return "attackers";
    case "draw_repetition":
      return "draw";
    default:
      return null;
  }
}
