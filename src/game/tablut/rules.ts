// ── Tablut rules ──────────────────────────────────────────────────────────────
//
// A deliberate fork of `../rules.ts` rather than a generalisation of it. The two
// games share rook movement and custodial capture — about a hundred lines — and
// disagree about everything the *evaluation* and *teaching* layers care about,
// starting with where the king is trying to get to. See
// docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md.
//
// The shape below is intentionally the same as the Brandubh file, function for
// function, so a fix to custodial capture is recognisable in both places. Where
// the logic genuinely differs it is because a rule differs, and the comment says
// which rule.

import {
  BOARD_SIZE,
  FILES,
  LAST,
  type Board,
  type GameState,
  type GameStatus,
  type Move,
  type Piece,
  type Side,
  type Square,
} from "./types";
import type { TablutRuleSet } from "./variants";

// ── Special squares ───────────────────────────────────────────────────────────
/** The throne — `e5`, the centre of the 9×9 board. */
export const THRONE: Square = { row: 4, col: 4 };

export const CORNERS: Square[] = [
  { row: 0, col: 0 },
  { row: 0, col: LAST },
  { row: LAST, col: 0 },
  { row: LAST, col: LAST },
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
  (r === 0 || r === LAST) && (c === 0 || c === LAST);

/**
 * Any square on the board's rim. This is the king's goal under baseline rule 5,
 * which is the single largest difference from Brandubh: there are 32 winning
 * squares here, not four, and they are not a special kind of square — they are
 * just the outside of the board.
 */
export const isEdge = (r: number, c: number): boolean =>
  r === 0 || r === LAST || c === 0 || c === LAST;

/**
 * Squares only the king may ever stand on. The throne always; the corners only
 * when the ruleset makes them special, which under edge escape it does not — a
 * baseline Tablut corner is an ordinary square a soldier may sit on.
 */
export const isRestricted = (r: number, c: number, rules: TablutRuleSet): boolean =>
  isThrone(r, c) || (rules.cornersRestricted && isCorner(r, c));

/** The squares that win the game for the defenders, under this ruleset. */
export const isEscapeSquare = (r: number, c: number, rules: TablutRuleSet): boolean =>
  rules.escape === "corners" ? isCorner(r, c) : isEdge(r, c);

export const sideOf = (p: Piece | null): Side | null =>
  p === "attacker" ? "attackers" : p === "defender" || p === "king" ? "defenders" : null;

export const isEnemy = (p: Piece | null, side: Side): boolean => {
  const s = sideOf(p);
  return s !== null && s !== side;
};

// ── Setup ─────────────────────────────────────────────────────────────────────
/**
 * The Tablut cross: the king on the throne at `e5`, eight defenders filling the
 * rest of the central cross, and sixteen attackers in four groups of four — a
 * row of three on each edge with one man stepped forward behind it.
 */
export function initialBoard(): Board {
  const b: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  );

  b[4][4] = "king";

  // defenders — the rest of the central cross
  for (const [r, c] of [
    [2, 4],
    [3, 4],
    [5, 4],
    [6, 4],
    [4, 2],
    [4, 3],
    [4, 5],
    [4, 6],
  ] as const)
    b[r][c] = "defender";

  // attackers — three on the edge plus one stepped forward, on each side
  for (const [r, c] of [
    [0, 3], [0, 4], [0, 5], [1, 4], // top
    [LAST, 3], [LAST, 4], [LAST, 5], [LAST - 1, 4], // bottom
    [3, 0], [4, 0], [5, 0], [4, 1], // left
    [3, LAST], [4, LAST], [5, LAST], [4, LAST - 1], // right
  ] as const)
    b[r][c] = "attacker";

  return b;
}

/**
 * The opening position. Unlike Brandubh's, this needs the ruleset: baseline rule
 * 2 gives White the first move, which is the opposite of tafl's usual
 * attackers-first convention, and `firstMove` is a flag the custom editor can
 * turn round. Everything that rebuilds a game from a move list therefore has to
 * start from the *same* ruleset the moves were played under — see `replay.ts`.
 */
export function initialState(rules: TablutRuleSet): GameState {
  return {
    board: initialBoard(),
    turn: rules.firstMove,
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
/**
 * True if a soldier of `side` is stopped dead by the empty throne rather than
 * sliding across it. `"attackers"` is the gulo/Dimetr rule — *the throne cannot
 * be crossed by black* — so the answer depends on who is moving, which is the
 * one place Tablut's move generation asks about the mover's side.
 */
const throneBlocksSoldier = (side: Side, rules: TablutRuleSet): boolean =>
  rules.throneBlocks === "soldiers" ||
  (rules.throneBlocks === "attackers" && side === "attackers");

/** All legal destination squares for the piece at (r,c). Rook-like sliding. */
export function movesFrom(b: Board, r: number, c: number, rules: TablutRuleSet): Square[] {
  const piece = b[r][c];
  if (!piece) return [];
  const isKing = piece === "king";
  const side = sideOf(piece)!;
  const out: Square[] = [];

  for (const [dr, dc] of DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc) && b[nr][nc] === null) {
      const throneHere = isThrone(nr, nc);

      if (isKing) {
        // The king may go anywhere he can reach, except back onto his own throne
        // when the variant forbids it — and even then he slides over it, as in
        // Brandubh. Corners are his under `cornersRestricted` and ordinary
        // squares otherwise; either way he may land.
        if (!throneHere || rules.kingMayReoccupyThrone) out.push({ row: nr, col: nc });
      } else if (throneHere) {
        // Soldiers may never *stop* on the throne under any preset. Whether they
        // may cross it is the gulo/Dimetr question.
        if (throneBlocksSoldier(side, rules)) break;
      } else if (rules.cornersRestricted && isCorner(nr, nc)) {
        // A restricted corner is passed over rather than landed on. Corners sit
        // at the rim, so there is never a square beyond one along the same ray;
        // not pushing it is the whole rule.
      } else {
        out.push({ row: nr, col: nc });
      }

      nr += dr;
      nc += dc;
    }
  }
  return out;
}

export function allMoves(b: Board, side: Side, rules: TablutRuleSet): Move[] {
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
export function hasAnyMove(b: Board, side: Side, rules: TablutRuleSet): boolean {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (sideOf(b[r][c]) === side && movesFrom(b, r, c, rules).length > 0) return true;
  return false;
}

// ── Capture resolution ────────────────────────────────────────────────────────
/**
 * A square acts as an "anvil" for capturing an enemy *soldier* when it holds a
 * friendly piece or is a hostile square. Three Tablut-specific readings live
 * here:
 *
 *  • **Off the board** is an anvil only under `edgeHostileToSoldiers`, which no
 *    shipped preset sets. Baseline Tablut does not capture against the rim.
 *  • **The empty throne** backs up whoever `throneAnvil` says: nobody, both
 *    sides, or White alone (*the throne is friendly to white*). An *occupied*
 *    throne is not special at all — it backs the man standing on it, via the
 *    ordinary friendly-piece test at the bottom.
 *  • **A corner** is an anvil only under `cornersHostile`, which is off unless
 *    the variant made the corners the goal.
 */
function isAnvilForSoldier(
  b: Board,
  r: number,
  c: number,
  moverSide: Side,
  rules: TablutRuleSet,
): boolean {
  if (!inBounds(r, c)) return rules.edgeHostileToSoldiers;
  if (isCorner(r, c) && rules.cornersHostile) return true;
  if (isThrone(r, c) && b[r][c] === null)
    return (
      rules.throneAnvil === "both" ||
      (rules.throneAnvil === "defenders" && moverSide === "defenders")
    );
  return sideOf(b[r][c]) === moverSide;
}

/**
 * Resolve captures triggered by `moverSide` having just moved a piece to (tr,tc).
 * Mutates `b`, returns the list of captured squares.
 *
 * This is baseline rule 4, and the "only if the trap is closed by the opponent's
 * move" half of it is structural rather than a check: captures are only ever
 * looked for around the square just moved to, so a piece that walks *between*
 * two enemies is never even considered.
 */
function resolveCaptures(
  b: Board,
  tr: number,
  tc: number,
  moverSide: Side,
  rules: TablutRuleSet,
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
 * Copenhagen-style shieldwall (see variants.ts — custom play only): a row of two
 * or more enemy men along the board edge falls together when the row is
 * bracketed at both ends and every man in it has a `moverSide` man directly in
 * front. A hostile corner may stand in for one bracket. The trap must be closed
 * by this very move. A king inside the row survives; his soldiers do not.
 * Mutates `b`, returns the captured squares.
 */
function resolveShieldwallCaptures(
  b: Board,
  tr: number,
  tc: number,
  moverSide: Side,
  rules: TablutRuleSet,
): Square[] {
  // A weaponless king cannot close (or take part in) a shieldwall.
  if (b[tr][tc] === "king" && !rules.armedKing) return [];

  const moverMan = (r: number, c: number): boolean =>
    sideOf(b[r][c]) === moverSide && (b[r][c] !== "king" || rules.armedKing);

  // The moved piece can only be part of a wall on its own edge (as a bracket) or
  // the line one square in (as a front man).
  const edges: Array<{ edge: number; horiz: boolean }> = [];
  if (tr <= 1) edges.push({ edge: 0, horiz: true });
  if (tr >= LAST - 1) edges.push({ edge: LAST, horiz: true });
  if (tc <= 1) edges.push({ edge: 0, horiz: false });
  if (tc >= LAST - 1) edges.push({ edge: LAST, horiz: false });

  const captured: Square[] = [];
  for (const { edge, horiz } of edges) {
    const inner = edge === 0 ? 1 : LAST - 1; // the line the front men stand on
    const sq = (i: number): Square => (horiz ? { row: edge, col: i } : { row: i, col: edge });
    const pieceAt = (i: number): Piece | null => (horiz ? b[edge][i] : b[i][edge]);
    const frontSq = (i: number): Square =>
      horiz ? { row: inner, col: i } : { row: i, col: inner };

    // Scan the edge for maximal runs of enemy men (a king may stand in a run).
    let i = 0;
    while (i <= LAST) {
      if (!isEnemy(pieceAt(i), moverSide)) {
        i++;
        continue;
      }
      let j = i;
      while (j < LAST && isEnemy(pieceAt(j + 1), moverSide)) j++;

      if (j - i + 1 >= 2) {
        const bracket = (idx: number): boolean => {
          if (idx < 0 || idx > LAST) return false; // runs never reach past a corner
          const s = sq(idx);
          if (isCorner(s.row, s.col) && b[s.row][s.col] === null) return rules.cornersHostile;
          return moverMan(s.row, s.col);
        };
        const fronts = Array.from({ length: j - i + 1 }, (_, n) => frontSq(i + n));
        const walled =
          bracket(i - 1) && bracket(j + 1) && fronts.every((f) => moverMan(f.row, f.col));
        // Active capture: the trap must be closed by this very move — the moved
        // piece is one of the brackets or front men.
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
 *
 * Baseline rule 4 applies to the king as it does to a soldier — two enemies on
 * opposite sides, with the trap closed by the attackers' own move — and rule 6
 * makes that a win. The strong-king flags are the variant reading on top: on or
 * beside the throne the king may instead need all four sides.
 *
 * The board's rim is **not** hostile to the king. Under edge escape that is
 * nearly moot (a king who reaches the rim has already won), but it decides
 * corner-escape games, and it is the same choice Brandubh makes.
 */
export function kingIsCaptured(
  b: Board,
  rules: TablutRuleSet,
  movedTo: Square,
): boolean {
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
    if (!inBounds(fr, fc)) return false; // the rim is NOT hostile to the king
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
 * True if the king and all remaining defenders are completely encircled: no
 * path from the king through empty/defender/king squares reaches the board
 * edge without crossing an attacker, AND every remaining defender lies within
 * that same reachable region (a defender the king's flood never reaches —
 * free or sealed in its own separate pocket — is not encircled together with
 * the king under one unbroken ring). Board edges do NOT count as part of the
 * ring.
 *
 * Under `escape: "edges"` this is very nearly "White can never win", which is
 * why the minimal presets leave `encirclementWin` off — see variants.ts. The
 * Linnaeus/WTF default and the corner-escape variant both turn it on, and the
 * search uses it as an evaluation term regardless of whether it ends the game.
 */
export function isEncircled(b: Board): boolean {
  const king = findKing(b);
  if (!king) return false;
  if (isEdge(king.row, king.col)) return false;
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
      if (isEdge(nr, nc)) return false;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }
  // The king's own region is sealed. The contract (see variants.ts in the
  // Brandubh fork, whose wording this rule shares) is "the king AND all
  // remaining defenders" under one unbroken ring, so a defender the flood
  // above never reached — whether it has its own free path to the rim, or
  // sits in a separate attacker-sealed pocket — is not encircled together
  // with the king and must fail the check.
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
export function applyMove(state: GameState, move: Move, rules: TablutRuleSet): GameState {
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

  // A capture resets the clock; anything else advances it.
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
  rules: TablutRuleSet,
  history: GameState["history"],
  sinceCapture: number,
): GameStatus {
  // 1. Defender escape: the king just reached a winning square — any edge square
  //    under the baseline (rule 5), a corner under the corner-escape variant.
  if (mover === "defenders") {
    const p = board[lastMove.to.row][lastMove.to.col];
    if (p === "king" && isEscapeSquare(lastMove.to.row, lastMove.to.col, rules))
      return "defenders_win_escape";
  }

  // 2. Attacker capture of the king (active capture — the moved piece must
  //    participate), which is rule 6.
  if (mover === "attackers" && kingIsCaptured(board, rules, lastMove.to))
    return "attackers_win_capture";

  // 3. Attacker encirclement win.
  if (mover === "attackers" && rules.encirclementWin && isEncircled(board))
    return "attackers_win_encirclement";

  // 4. Threefold repetition.
  //
  // Guarded on plies-since-capture for the same reason and by the same argument
  // as Brandubh (see `computeStatus` in ../rules.ts): `hashBoard` builds a fresh
  // string per call and then scans `history`, and this runs on every node the
  // search visits. The argument carries over unchanged, and is exact rather than
  // approximate — tafl only ever removes pieces, so a capture makes every
  // earlier position unreachable, and a third occurrence of one position needs a
  // minimum period of four plies, so it cannot land sooner than eight plies
  // after a capture. It matters more here, not less: 81 squares make the hash
  // string longer than Brandubh's.
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
// Files a–i, ranks 1–9 counting up from the bottom — the same shape as Brandubh's
// a–g/1–7 and aagenielsen.dk-compatible, so the move text in an exported game
// reads the way a Tablut player expects.
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
