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
    sinceCapture: 0,
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

/** True if `side` has at least one legal move. Early-exits at the first piece
 *  that can move, so in the common (has-moves) case it is far cheaper than
 *  `allMoves(...).length !== 0` — which matters because the "no legal move = loss"
 *  test runs at every search node. Reuses movesFrom so it stays rule-exact. */
export function hasAnyMove(b: Board, side: Side, rules: RuleSet): boolean {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (sideOf(b[r][c]) === side && movesFrom(b, r, c, rules).length > 0) return true;
  return false;
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

// ── Shieldwall capture ────────────────────────────────────────────────────────
/**
 * Copenhagen-style shieldwall (see variants.ts): a row of two or more enemy
 * men along the board edge falls together when the row is bracketed at both
 * ends and every man in it has a `moverSide` man directly in front. A hostile
 * corner may stand in for one bracket. Any move by the capturing side that
 * closes the trap captures — bracket or front man alike (only the king may
 * ever occupy a corner, so a corner-anchored wall can rarely be closed at a
 * bracket). A king inside the row survives; his soldiers do not.
 * Mutates `b`, returns the captured squares.
 */
function resolveShieldwallCaptures(
  b: Board,
  tr: number,
  tc: number,
  moverSide: Side,
  rules: RuleSet,
): Square[] {
  // A weaponless king cannot close (or take part in) a shieldwall.
  if (b[tr][tc] === "king" && !rules.armedKing) return [];

  const last = BOARD_SIZE - 1;
  // A man participates as bracket or front only; an unarmed king participates
  // not at all (armedKing is checked for the mover above, and for wall members
  // here).
  const moverMan = (r: number, c: number): boolean =>
    sideOf(b[r][c]) === moverSide && (b[r][c] !== "king" || rules.armedKing);

  // The moved piece can only be part of a wall on its own edge (as a bracket)
  // or the line one square in (as a front man).
  const edges: Array<{ edge: number; horiz: boolean }> = [];
  if (tr <= 1) edges.push({ edge: 0, horiz: true });
  if (tr >= last - 1) edges.push({ edge: last, horiz: true });
  if (tc <= 1) edges.push({ edge: 0, horiz: false });
  if (tc >= last - 1) edges.push({ edge: last, horiz: false });

  const captured: Square[] = [];
  for (const { edge, horiz } of edges) {
    const inner = edge === 0 ? 1 : last - 1; // the line the front men stand on
    const sq = (i: number): Square => (horiz ? { row: edge, col: i } : { row: i, col: edge });
    const pieceAt = (i: number): Piece | null => (horiz ? b[edge][i] : b[i][edge]);
    const frontSq = (i: number): Square => (horiz ? { row: inner, col: i } : { row: i, col: inner });

    // Scan the edge for maximal runs of enemy men (a king may stand in a run).
    let i = 0;
    while (i <= last) {
      if (!isEnemy(pieceAt(i), moverSide)) {
        i++;
        continue;
      }
      let j = i;
      while (j < last && isEnemy(pieceAt(j + 1), moverSide)) j++;

      if (j - i + 1 >= 2) {
        const bracket = (idx: number): boolean => {
          if (idx < 0 || idx > last) return false; // runs never reach past a corner
          const s = sq(idx);
          if (isCorner(s.row, s.col) && b[s.row][s.col] === null) return rules.cornersHostile;
          return moverMan(s.row, s.col);
        };
        const fronts = Array.from({ length: j - i + 1 }, (_, n) => frontSq(i + n));
        const walled =
          bracket(i - 1) &&
          bracket(j + 1) &&
          fronts.every((f) => moverMan(f.row, f.col));
        // Active capture: the trap must be closed by this very move — the moved
        // piece is one of the brackets or front men. A wall completed by the
        // victims' own move never fires.
        const closedByMove =
          fronts.some((f) => f.row === tr && f.col === tc) ||
          [sq(i - 1), sq(j + 1)].some((s) => s.row === tr && s.col === tc);
        if (walled && closedByMove) {
          for (let n = i; n <= j; n++) {
            const s = sq(n);
            if (b[s.row][s.col] === "king") continue; // the king survives a shieldwall
            b[s.row][s.col] = null;
            captured.push(s);
          }
        }
      }
      i = j + 1;
    }
  }
  return captured;
}

// ── King capture ──────────────────────────────────────────────────────────────
/**
 * Is the king captured by the attacker that just moved to `movedTo`?
 * Active-capture rule: the piece that just moved must participate in the
 * sandwich, so it must land adjacent to the king. A king that walks between
 * two raiders is safe (passive — the raiders didn't make the move).
 *
 * - Strong-king variants: on/next-to the throne the king must be surrounded on
 *   every available cardinal side (throne counts as a hostile flank), and the
 *   piece that just moved must be one of those flanking squares.
 * - Elsewhere: custodial — two hostile squares on opposite sides, at least one
 *   of which is the square the attacker just moved to.
 */
export function kingIsCaptured(b: Board, rules: RuleSet, movedTo: Square): boolean {
  const k = findKing(b);
  if (!k) return true; // no king on the board = captured/removed
  const { row: r, col: c } = k;

  // Active capture: the moved piece must be adjacent to the king.
  const movedAdjacentToKing = DIRS.some(
    ([dr, dc]) => r + dr === movedTo.row && c + dc === movedTo.col,
  );
  if (!movedAdjacentToKing) return false;

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

  // Custodial capture on two opposite sides. The piece that just moved must be
  // one of the two flanks, otherwise a move on the perpendicular axis could
  // "reuse" a pair the king merely walked into (passive capture).
  const isMovedSquare = (fr: number, fc: number): boolean =>
    fr === movedTo.row && fc === movedTo.col;
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
    if (!isMovedSquare(ar, ac) && !isMovedSquare(br, bc)) continue;
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
 * reaches the board edge without crossing an attacker, AND every remaining
 * defender lies within that same reachable region (a defender the king's
 * flood never reaches — free or sealed in its own separate pocket — is not
 * encircled together with the king under one unbroken ring). Board edges do
 * NOT count as part of the ring (WTF rule).
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
  // The king's own region is sealed. The contract is "the king AND all
  // remaining defenders" under one unbroken ring, so a defender that the
  // flood above never reached — whether it has its own free path to the
  // edge, or sits in a separate attacker-sealed pocket — is not encircled
  // together with the king and must fail the check.
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (b[r][c] === "defender" && !visited.has(r * BOARD_SIZE + c)) return false;
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
  if (rules.shieldwallCapture)
    captures.push(...resolveShieldwallCaptures(board, move.to.row, move.to.col, mover, rules));
  const captured = { ...state.captured };
  captured[mover === "attackers" ? "defenders" : "attackers"] += captures.length;

  const nextTurn: Side = mover === "attackers" ? "defenders" : "attackers";
  const history = [
    ...state.history,
    { move: { ...move, captures }, hashBefore, sideThatMoved: mover },
  ];

  // A capture resets the clock; anything else advances it. The fallback for a
  // state that never carried the count assumes no capture has ever happened,
  // which is the conservative direction (see `computeStatus`).
  const sinceCapture = captures.length ? 0 : (state.sinceCapture ?? state.history.length) + 1;

  const status = computeStatus(board, nextTurn, mover, move, rules, history, sinceCapture);

  return {
    board,
    turn: nextTurn,
    status,
    moveCount: state.moveCount + 1,
    history,
    captured,
    sinceCapture,
  };
}

function computeStatus(
  board: Board,
  nextTurn: Side,
  mover: Side,
  lastMove: Move,
  rules: RuleSet,
  history: GameState["history"],
  sinceCapture: number,
): GameStatus {
  // 1. Defender escape: king just reached a corner.
  if (mover === "defenders") {
    const p = board[lastMove.to.row][lastMove.to.col];
    if (p === "king" && isCorner(lastMove.to.row, lastMove.to.col))
      return "defenders_win_escape";
  }

  // 2. Attacker capture of the king (active capture — the moved piece must participate).
  if (mover === "attackers" && kingIsCaptured(board, rules, lastMove.to)) return "attackers_win_capture";

  // 3. Attacker encirclement win.
  if (mover === "attackers" && rules.encirclementWin && isEncircled(board))
    return "attackers_win_encirclement";

  // 4. Threefold repetition.
  //
  // Guarded on plies-since-capture, because `hashBoard` builds a fresh string
  // per call and then scans `history`, and this runs on every node the search
  // visits.
  //
  // The saving is not one number, and quoting one understates it. Measured at
  // fixed depth 6, cold TT, WTF — identical node counts and identical scores in
  // both arms, so this is pure overhead removed and not a different search:
  //
  //     opening (ply 0)    528ms -> 431ms    18% less
  //     midgame (ply 6)   4869ms -> 3100ms   36% less
  //     endgame (ply 10)  122.3s -> 39.1s    68% less  (3.1x)
  //
  // It grows through a game because both factors grow: `history` is what the
  // scan walks, and the deeper searches happen later. An opening-only
  // measurement is where "~20%" comes from, and the endgame is where the search
  // actually needs the time.
  //
  // Sound, and exactly so rather than approximately: a capture makes every
  // earlier position unreachable (tafl only ever removes pieces, never adds),
  // and `seen >= 3` needs three occurrences of one position at a minimum period
  // of four plies — two plies cannot return the position with the same side to
  // move, since that needs both sides' moves to be null. So the third occurrence
  // cannot land sooner than eight plies after a capture, which is the boundary
  // below. No reachable threefold is missed. The check itself is unchanged.
  if (rules.repetitionResult !== "none" && sinceCapture >= 8) {
    const currentHash = hashBoard(board, nextTurn);
    let seen = 1;
    for (const h of history) if (h.hashBefore === currentHash) seen++;
    if (seen >= 3)
      return rules.repetitionResult === "draw" ? "draw_repetition" : "attackers_win_repetition";
  }

  // 5. Side to move has no legal move → they lose (a "block").
  if (!hasAnyMove(board, nextTurn, rules))
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
    case "defenders_win_time":
      return "defenders";
    case "attackers_win_capture":
    case "attackers_win_encirclement":
    case "attackers_win_repetition":
    case "attackers_win_no_moves":
    case "attackers_win_resign":
    case "attackers_win_time":
      return "attackers";
    case "draw_repetition":
      return "draw";
    default:
      return null;
  }
}
