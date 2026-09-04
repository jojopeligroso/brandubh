// ── Copenhagen Hnefatafl rules ────────────────────────────────────────────────
//
// The third fork of `../rules.ts`, and the one ADR-0006 predicted would justify
// a shared core instead. It did not get one; ADR-0007 records that decision and
// the debt it takes on. The shape below is therefore deliberately the *same*
// shape as the other two files, function for function and in the same order, so
// that a fix to custodial capture is recognisable in all three places. Where the
// logic genuinely differs it is because a rule differs, and the comment says
// which rule.
//
// Three things here exist in neither of the others, and are where the reading is
// worth checking:
//
//   • `kingIsCaptured` implements a king who is strong *everywhere* (rule 7),
//     not only on and beside his throne. What that means on the rim, where the
//     fourth square does not exist, is where the sources contradict each other —
//     see `strongKingEdgeRule` in variants.ts. The shipped reading takes him
//     there with three *attackers*, and with nothing else.
//   • `exitFort` (rule 6b) is a win condition no other tafl game in this project
//     has: a terminal decided by a structural property of the whole board rather
//     than by the move just played.
//   • `kingIsEntombed` is the one rule in any of the three games that is in no
//     published ruleset at all. It closes the hole the reading above opens — a
//     king pinned to the rim by two attackers and one of his own men — and it
//     says so at length where it is defined.

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
import type { CopenhagenRuleSet } from "./variants";

// ── Special squares ───────────────────────────────────────────────────────────
/** The throne — `f6`, the centre of the 11×11 board. */
export const THRONE: Square = { row: 5, col: 5 };

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

/** The two capture axes, as pairs of opposite offsets. */
const AXES: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [0, -1],
    [0, 1],
  ],
];

// ── Small square helpers ──────────────────────────────────────────────────────
export const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

export const isThrone = (r: number, c: number): boolean =>
  r === THRONE.row && c === THRONE.col;

export const isCorner = (r: number, c: number): boolean =>
  (r === 0 || r === LAST) && (c === 0 || c === LAST);

/** Any square on the board's rim. Not a goal under Copenhagen — the corners are
 *  — but the rim is where the shieldwall and the exit fort both live, so it is
 *  asked about more here than in either of the other two games. */
export const isEdge = (r: number, c: number): boolean =>
  r === 0 || r === LAST || c === 0 || c === LAST;

/**
 * Squares only the king may ever stand on (rule 5). The throne always; the
 * corners whenever the ruleset makes them special, which under Copenhagen it
 * does.
 */
export const isRestricted = (r: number, c: number, rules: CopenhagenRuleSet): boolean =>
  isThrone(r, c) || (rules.cornersRestricted && isCorner(r, c));

/** The squares that win the game for the defenders (rule 6). */
export const isEscapeSquare = (r: number, c: number, rules: CopenhagenRuleSet): boolean =>
  rules.escape === "corners" ? isCorner(r, c) : isEdge(r, c);

export const sideOf = (p: Piece | null): Side | null =>
  p === "attacker" ? "attackers" : p === "defender" || p === "king" ? "defenders" : null;

export const isEnemy = (p: Piece | null, side: Side): boolean => {
  const s = sideOf(p);
  return s !== null && s !== side;
};

// ── Setup ─────────────────────────────────────────────────────────────────────
/**
 * Rule 1's position: the king on the throne at `f6` inside a diamond of twelve
 * defenders, and twenty-four attackers in four groups of six — a rank of five
 * on the middle of each edge with a sixth man stepped forward behind it.
 *
 * Twice as many attackers as defenders, and the whole of the difference between
 * this and Tablut's cross is that the defenders here form a *diamond*: the four
 * men at the diamond's points (`f4`, `d6`, `h6`, `f8` in the notation this file
 * exports) are what give the defence its shape.
 */
export function initialBoard(): Board {
  const b: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  );

  b[5][5] = "king";

  // defenders — the diamond around the throne
  for (const [r, c] of [
    [3, 5],
    [4, 4], [4, 5], [4, 6],
    [5, 3], [5, 4], [5, 6], [5, 7],
    [6, 4], [6, 5], [6, 6],
    [7, 5],
  ] as const)
    b[r][c] = "defender";

  // attackers — five on the edge plus one stepped forward, on each side
  for (const [r, c] of [
    [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [1, 5], // top
    [LAST, 3], [LAST, 4], [LAST, 5], [LAST, 6], [LAST, 7], [LAST - 1, 5], // bottom
    [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [5, 1], // left
    [3, LAST], [4, LAST], [5, LAST], [6, LAST], [7, LAST], [5, LAST - 1], // right
  ] as const)
    b[r][c] = "attacker";

  return b;
}

/**
 * The opening position. Takes the ruleset for the same reason Tablut's does:
 * `firstMove` is a flag the custom editor can turn round, so everything that
 * rebuilds a game from a move list has to start from the *same* ruleset the
 * moves were played under — see `replay.ts`. Copenhagen itself gives the move to
 * the attackers (rule 2), which is the tafl norm and the opposite of Tablut.
 */
export function initialState(rules: CopenhagenRuleSet): GameState {
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
/** True if a soldier of `side` is stopped dead by the empty throne rather than
 *  sliding across it. Copenhagen says nobody is (`throneBlocks: "none"` — *all
 *  pieces may pass through the throne when it is empty*); the other settings are
 *  there for the custom editor. */
const throneBlocksSoldier = (side: Side, rules: CopenhagenRuleSet): boolean =>
  rules.throneBlocks === "soldiers" ||
  (rules.throneBlocks === "attackers" && side === "attackers");

/** All legal destination squares for the piece at (r,c). Rook-like sliding
 *  (rule 3). */
export function movesFrom(b: Board, r: number, c: number, rules: CopenhagenRuleSet): Square[] {
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
        // Rule 5 reserves the restricted squares for the king, so all of them
        // are his to land on — and rule 6 makes a corner the win. The only thing
        // that can stop him is a variant forbidding the return to his own
        // throne, which Copenhagen does not.
        if (!throneHere || rules.kingMayReoccupyThrone) out.push({ row: nr, col: nc });
      } else if (throneHere) {
        // Soldiers may never *stop* on the throne. Whether they may cross it is
        // the `throneBlocks` question; Copenhagen lets them.
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

export function allMoves(b: Board, side: Side, rules: CopenhagenRuleSet): Move[] {
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
 *  `allMoves(...).length !== 0` — which matters more here than in either of the
 *  other two games, because this board has 121 squares and 37 pieces on it and
 *  the "no legal move = loss" test runs at every search node. */
export function hasAnyMove(b: Board, side: Side, rules: CopenhagenRuleSet): boolean {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (sideOf(b[r][c]) === side && movesFrom(b, r, c, rules).length > 0) return true;
  return false;
}

// ── Capture resolution ────────────────────────────────────────────────────────
/**
 * A square acts as an "anvil" for capturing an enemy *soldier* when it holds a
 * friendly piece or is a hostile square (rule 4, plus rule 5's "restricted
 * squares are hostile"). Copenhagen's readings:
 *
 *  • **Off the board** is never an anvil. The rim is not hostile, and rule 4b's
 *    shieldwall is what Copenhagen has *instead* of a hostile rim.
 *  • **The empty throne** is hostile to both sides (`throneAnvil: "both"`). An
 *    *occupied* throne holds the king and is not special at all — it backs him
 *    through the ordinary friendly-piece test at the bottom.
 *  • **A corner** is hostile to both sides.
 */
function isAnvilForSoldier(
  b: Board,
  r: number,
  c: number,
  moverSide: Side,
  rules: CopenhagenRuleSet,
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
 * This is rule 4, and the "only when the opponent closes the trap" half of it is
 * structural rather than a check: captures are only ever looked for around the
 * square just moved to, so a piece that walks *between* two enemies is never
 * even considered.
 */
function resolveCaptures(
  b: Board,
  tr: number,
  tc: number,
  moverSide: Side,
  rules: CopenhagenRuleSet,
): Square[] {
  const moverPiece = b[tr][tc];
  // A weaponless king cannot flank/capture at all. Copenhagen's king is armed.
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
 * Rule 4b, Copenhagen's signature capture: *a row of two or more taflmen along
 * the board edge may be captured together, by bracketing the whole group at both
 * ends, as long as every member of the row has an enemy taflman directly in
 * front of him. A corner square may stand in for one of the bracketing pieces at
 * one end of the row.*
 *
 * Three details the wording decides, and which this implementation follows:
 *
 *  • **A man in front, not a square.** The rule says "an enemy *taflman*
 *    directly in front", so a hostile square cannot stand in along the front
 *    rank — only at a bracket, and only a corner at that.
 *  • **The trap must be closed by this move.** The same active-capture principle
 *    as rule 4: a wall the victims complete themselves never fires.
 *  • **The king survives.** He may be in the row, and his soldiers around him
 *    fall, but he is only ever taken by rule 7.
 *
 * Mutates `b`, returns the captured squares. Unchanged in substance from the
 * Brandubh and Tablut twins of this function, which is the point of writing it
 * the same way three times: this is the rule those two borrow *from here*.
 */
function resolveShieldwallCaptures(
  b: Board,
  tr: number,
  tc: number,
  moverSide: Side,
  rules: CopenhagenRuleSet,
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
 * Is the king captured by the attacker that just moved to `movedTo`? (Rule 7.)
 *
 * Copenhagen's king is `kingStrength: "strong"` — he needs all four cardinal
 * squares hostile, anywhere on the board, with the empty throne standing in as
 * one of the four when he is beside it. Two consequences worth naming, because
 * they are what the whole endgame is built on:
 *
 *  • **He is safe on the rim**, where a fourth square does not exist. That is
 *    the shipped reading, and it is contested — `strongKingEdgeRule` in
 *    variants.ts sets out both sides and lets the other one be played.
 *  • **He is safe from a shieldwall**, which takes his soldiers and leaves him.
 *
 * The `"weak"` and `"near_throne"` settings reproduce the Brandubh and
 * Linnaeus/Tablut readings on this board, for custom play.
 */
export function kingIsCaptured(
  b: Board,
  rules: CopenhagenRuleSet,
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
    if (!inBounds(fr, fc)) return false; // the rim is never hostile to the king
    if (b[fr][fc] === "attacker") return true;
    if (isThrone(fr, fc) && b[fr][fc] === null) return rules.throneHostileToKing;
    if (isCorner(fr, fc) && rules.cornersHostile) return true;
    return false;
  };

  const needsAllFour =
    rules.kingStrength === "strong" ||
    (rules.kingStrength === "near_throne" && (onThrone || throneAdjacent));

  if (needsAllFour) {
    // Every cardinal square must be hostile. What "every" means on the rim is
    // the contested part, and `strongKingEdgeRule` picks between three readings
    // — see variants.ts for who says which.
    let anyOffBoard = false;
    for (const [dr, dc] of DIRS) {
      const fr = r + dr;
      const fc = c + dc;
      if (!inBounds(fr, fc)) {
        anyOffBoard = true;
        continue;
      }
      if (!flankHostile(fr, fc)) return false;
    }

    // Away from the rim there is nothing to decide: four squares, all hostile.
    if (!anyOffBoard) return true;

    // `"uncapturable"` — the missing square can never be filled, so the king
    // with his back to the edge is safe. The Fetlar reading.
    if (rules.strongKingEdgeRule === "uncapturable") return false;

    // `"available_sides"` — only the squares that exist are required, and
    // hostile means what it means everywhere else, so a corner counts.
    if (rules.strongKingEdgeRule === "available_sides") return true;

    // `"three_attackers"` — the shipped reading. On the rim a hostile *square*
    // does not stand in for a man: every side that exists must hold an actual
    // attacker. The loop above has already established that each of them is
    // hostile, so this can only ever tighten the result — and the one position
    // it changes is the important one, a king orthogonally beside a corner. The
    // corner is hostile but no soldier may stand on it, so the third attacker
    // has nowhere to be and the king cannot be taken there at all. He is a rook
    // step from the corner and the game, which is the point.
    return DIRS.every(([dr, dc]) => {
      const fr = r + dr;
      const fc = c + dc;
      return !inBounds(fr, fc) || b[fr][fc] === "attacker";
    });
  }

  // Ordinary two-sided custodial capture. The piece that just moved must be one
  // of the two flanks, otherwise a move on the perpendicular axis could "reuse"
  // a pair the king merely walked into (passive capture).
  const isMovedSquare = (fr: number, fc: number): boolean =>
    fr === movedTo.row && fc === movedTo.col;
  for (const [[dr1, dc1], [dr2, dc2]] of AXES) {
    const [ar, ac] = [r + dr1, c + dc1];
    const [br, bc] = [r + dr2, c + dc2];
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
 * Which squares count as a way out of the king's region, as a flat lookup.
 *
 * Built once per reading rather than asked per square: the flood tests it at
 * every neighbour of every square it visits, and under the rim-as-wall reading it
 * has to run much further before it finds one, so this is the innermost loop in
 * the file. Only four combinations exist and none of them depends on the board.
 */
const WAY_OUT: Record<string, Uint8Array> = {};
function wayOutMask(rules: CopenhagenRuleSet): Uint8Array {
  const id = `${rules.escape}:${rules.edgeCompletesRing ? 1 : 0}`;
  let mask = WAY_OUT[id];
  if (mask) return mask;
  mask = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      mask[r * BOARD_SIZE + c] =
        (rules.edgeCompletesRing ? isEscapeSquare(r, c, rules) : isEdge(r, c)) ? 1 : 0;
  WAY_OUT[id] = mask;
  return mask;
}

/**
 * Rule 7b: true if the king and all remaining defenders are completely
 * encircled — no path from the king through empty/defender/king squares gets
 * *out* without crossing an attacker, AND every remaining defender lies within
 * that same reachable region.
 *
 * What "out" means is `edgeCompletesRing`, and it is the whole difference
 * between the two readings:
 *
 *  • **`false` — the sourced rule.** *Board edges do not count as part of the
 *    ring*, so the ring has to be attackers the whole way round and reaching
 *    any rim square breaks it. A king standing on the rim is by definition not
 *    encircled, which is the cheap guard this used to open with.
 *  • **`true` — shipped.** The rim is a wall like any other, and what breaks
 *    the ring is reaching an *escape square*. A pocket sealed against one edge
 *    by attackers therefore counts, which is the case the sourced reading
 *    misses: a king shut in against the rim with nowhere to go and no corner in
 *    reach is encircled by every meaning of the word except the literal one.
 *
 * The escape-square clause is what stops the second reading from swallowing the
 * board. Any region touching the rim that contains no corner has to be a real
 * pocket: a wall straight across the middle leaves corners on both sides of it,
 * so neither half qualifies. And under `escape: "edges"` every rim square is an
 * escape square, which collapses the second reading back into the first — the
 * right answer for a game where the whole rim wins.
 */
export function isEncircled(b: Board, rules: CopenhagenRuleSet): boolean {
  const king = findKing(b);
  if (!king) return false;
  // What counts as a way out of the region — see the two readings above.
  const wayOut = wayOutMask(rules);
  if (wayOut[king.row * BOARD_SIZE + king.col]) return false;

  // A flat visited buffer and a read cursor rather than a Set and `shift()`.
  // Both matter here and did not before: under the sourced reading the flood gave
  // up the moment it touched the rim, so it stayed small, and `Array.shift()` is
  // O(n) — a flood that now has to run all the way to a corner turns that into
  // quadratic work at every node the search visits. Measured at ~18% of a
  // depth-4 search on the opening before this, and free after it.
  const visited = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  const queue = new Int16Array(BOARD_SIZE * BOARD_SIZE);
  let head = 0;
  let tail = 0;
  queue[tail++] = king.row * BOARD_SIZE + king.col;
  visited[king.row * BOARD_SIZE + king.col] = 1;
  // Unrolled over the four directions and worked in flat indices: `DIRS` is an
  // array of tuples, and destructuring one per neighbour per square is most of
  // the cost of a flood this size.
  while (head < tail) {
    const cell = queue[head++];
    const r = (cell / BOARD_SIZE) | 0;
    const c = cell - r * BOARD_SIZE;
    for (let d = 0; d < 4; d++) {
      const nr = d === 0 ? r - 1 : d === 1 ? r + 1 : r;
      const nc = d === 2 ? c - 1 : d === 3 ? c + 1 : c;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      const key = nr * BOARD_SIZE + nc;
      if (visited[key]) continue;
      if (b[nr][nc] === "attacker") continue;
      if (wayOut[key]) return false;
      visited[key] = 1;
      queue[tail++] = key;
    }
  }
  // The king's region is sealed. The contract is "the king AND all remaining
  // defenders" under one unbroken ring, so a defender the flood never reached —
  // free, or sealed in a pocket of its own — is not encircled together with the
  // king and must fail the check.
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (b[r][c] === "defender" && !visited[r * BOARD_SIZE + c]) return false;
  return true;
}

// ── Entombment ────────────────────────────────────────────────────────────────
/**
 * The attackers win because the king is **entombed**: standing on a rim square
 * with no legal move, walled in by pieces of either colour, and with no way for
 * his own side to open a square beside him.
 *
 * ## Why this exists
 *
 * `strongKingEdgeRule: "three_attackers"` says a king on the rim falls to three
 * attackers and to nothing else. That leaves a hole with a shape: a king held
 * against the edge by *two* attackers and one of his own men is not captured
 * (one of the three squares holds the wrong colour), is not encircled (his side
 * is not shut in), and is not in an exit fort (he has no move). He is simply
 * stuck, and under the sourced rules alone the game grinds on until threefold
 * repetition hands it to whichever side ran out of waiting moves — an ending
 * decided by bookkeeping rather than by the board. This rule ends it on the
 * board instead. It is the owner's decision and is in no published ruleset;
 * `entombedKingLoses` turns it off.
 *
 * ## The four clauses
 *
 * 1. **At the edge.** The rule as stated, and the guard that keeps everything
 *    below off the search's hot path — the same trick `exitFort` opens with.
 * 2. **No legal move.** Asked of the move generator rather than by counting
 *    occupied neighbours, so the throne and corner rules are answered by the one
 *    place that knows them.
 * 3. **No single defender move frees him.** This is the clause that sees a
 *    *capture*: a defender who takes an attacker penning the king opens a square
 *    without any blocker having moved. It also, incidentally, covers a blocker
 *    simply stepping aside — vacating a square beside the king always frees him.
 * 4. **No *sequence* of defender moves frees him either.** Clause 3 is one ply,
 *    and a blocker who is himself boxed in by a friend two squares away is freed
 *    in two: the man behind steps aside, the blocker follows. So relax the
 *    position — freeze the attackers, hand the defenders the board to themselves,
 *    and ask which of them could ever vacate. Monotone, so it terminates: a
 *    square once opened is never closed, and opening one can only free more men.
 *
 * ## What this does *not* prove
 *
 * `exitFort` is a proof: it declares a win only when the attackers provably
 * cannot open the fort. **This is not.** It is a positional rule, in the way
 * stalemate is a positional rule — it describes the shape on the board, not the
 * future. One gap is known and deliberate: clause 3 sees only one-ply captures,
 * so a defender who needs *two* moves to reach the square from which he would
 * take a penning attacker is not counted, and a game the defenders could have
 * saved that way ends here. Clause 4 closes the same gap for blockers, because
 * blockers can be reasoned about monotonically and captures cannot — the honest
 * version of the capture case is a search, not a fixpoint.
 *
 * Making it a proof means adding the pessimism `exitFort` uses: treat any
 * penning attacker that has an empty square on one flank and a defender or
 * hostile square on the other as capturable, whether or not a defender could
 * ever get there. That is one `if` away, and it is not shipped because it would
 * change the rule rather than tighten it — it would demand a phalanx around the
 * king before the tomb ever closed, which is not what "surrounded, without the
 * means to move them" says. `docs/reports/copenhagen-king-capture-edge-cases.md`
 * works both readings through a position.
 */
export function kingIsEntombed(b: Board, rules: CopenhagenRuleSet): boolean {
  const king = findKing(b);
  if (!king) return false;
  const { row: kr, col: kc } = king;

  // Clause 1. A king already standing on an escape square has won, not lost —
  // unreachable in a played game, since landing there ends it, but this is a
  // pure predicate and hand-built positions call it directly.
  if (!isEdge(kr, kc)) return false;
  if (isEscapeSquare(kr, kc, rules)) return false;
  // Clause 2.
  if (movesFrom(b, kr, kc, rules).length > 0) return false;

  // Clause 3. The king has no move of his own, so `allMoves` for his side is
  // exactly the list of other men who might free him.
  for (const m of allMoves(b, "defenders", rules)) {
    const after = cloneBoard(b);
    after[m.to.row][m.to.col] = after[m.from.row][m.from.col];
    after[m.from.row][m.from.col] = null;
    resolveCaptures(after, m.to.row, m.to.col, "defenders", rules);
    if (rules.shieldwallCapture)
      resolveShieldwallCaptures(after, m.to.row, m.to.col, "defenders", rules);
    if (movesFrom(after, kr, kc, rules).length > 0) return false;
  }

  // Clause 4. `relaxed` is the board with every defender who could ever get out
  // of the way taken off it. Sweeping repeatedly is what makes it a fixpoint:
  // emptying one square can hand a move to a man who had none, and there are at
  // most twelve defenders, so it settles in at most twelve passes.
  const relaxed = cloneBoard(b);
  const vacatable = new Set<number>();
  for (;;) {
    let grew = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (relaxed[r][c] !== "defender") continue;
        if (movesFrom(relaxed, r, c, rules).length === 0) continue;
        relaxed[r][c] = null;
        vacatable.add(r * BOARD_SIZE + c);
        grew = true;
      }
    }
    if (!grew) break;
  }
  for (const [dr, dc] of DIRS) {
    const nr = kr + dr;
    const nc = kc + dc;
    if (inBounds(nr, nc) && vacatable.has(nr * BOARD_SIZE + nc)) return false;
  }

  return true;
}

// ── Exit fort detection ───────────────────────────────────────────────────────
/**
 * Rule 6b: *the defenders win if the king has contact with the board edge, is
 * able to move, and it is impossible for the attackers to break the fort.*
 *
 * This is the only terminal in any of the three games decided by a structural
 * property of the whole board rather than by the move just played, and the only
 * one whose third clause is a claim about the *future*. So it is worth being
 * exact about what is proved here and what is merely assumed.
 *
 * ## The three clauses, as implemented
 *
 * 1. **Contact with the edge** — the king stands on a rim square. (The looser
 *    reading, "the fort's inside touches the rim", would admit forts the king
 *    cannot actually leave from; the diagrams in every description of this rule
 *    show the king on the edge itself.)
 * 2. **Able to move** — the king has at least one legal move. A king walled in
 *    so tightly that he cannot move is not an exit fort; he is stalemated, and
 *    rule 8's no-legal-move clause deals with that case if it comes to it.
 * 3. **Unbreakable** — the argument below.
 *
 * ## Why the unbreakability argument is sound
 *
 * Flood the *inside* out from the king through empty squares. The fort is closed
 * when every square bordering that inside is a defender, the king, or off the
 * board — an attacker anywhere on that border means the fort is already open.
 * The defenders on that border are the wall.
 *
 * The wall holds if no man in it can ever be captured. A wall defender is
 * capturable only if some capture axis has *both* of its opposite squares
 * hostile, where hostile means: an attacker stands there now, a hostile square
 * (a corner, or the empty throne) sits there, or it is an empty square
 * **outside** the fort that an attacker could one day occupy. Squares inside the
 * fort are not counted, and that is the one step of the argument that needs
 * defending: it assumes the fort is closed, which is what is being proved.
 *
 * The assumption is safe because it is a *greatest* fixpoint and not a circular
 * one. Attackers can only enter the inside by capturing a wall man; no wall man
 * can be captured while the inside is sealed; therefore the sealed state is
 * self-sustaining, and an induction on attacker moves from the current position
 * never reaches a state where it fails. (Two things the check does *not* assume
 * away: an attacker already trapped inside the wall is a real man on a real
 * square and counts as hostile like any other, and the empty throne counts as
 * hostile wherever it sits, inside or out, because a throne inside the fort is
 * still a square attackers may capture against.)
 *
 * ## Deliberately one-sided
 *
 * Every place the check could guess, it guesses *against* the fort: any empty
 * square outside is treated as though an attacker were already on it, whether or
 * not one could ever get there. So forts this function rejects may still be
 * unbreakable in fact — those games are simply played on, which costs nothing —
 * while a fort it accepts is one the attackers provably cannot open. Ending a
 * game nobody had won is the failure that would matter, and this is the shape
 * that cannot produce it.
 */
export function exitFort(b: Board, rules: CopenhagenRuleSet): boolean {
  const king = findKing(b);
  if (!king) return false;

  // Clause 1 — and the cheap guard that keeps this off the search's hot path.
  // The king is on the rim in a vanishing fraction of positions, so the flood
  // fill below almost never runs.
  if (!isEdge(king.row, king.col)) return false;

  // Clause 2.
  if (movesFrom(b, king.row, king.col, rules).length === 0) return false;

  // Clause 3, part one: flood the inside and check that it is sealed.
  const inside = new Set<number>();
  const key = (r: number, c: number): number => r * BOARD_SIZE + c;
  const queue: Array<[number, number]> = [[king.row, king.col]];
  inside.add(key(king.row, king.col));
  const wall: Array<[number, number]> = [];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue; // the rim is the fort's back wall
      if (inside.has(key(nr, nc))) continue;
      const p = b[nr][nc];
      if (p === "attacker") return false; // an attacker on the border: already open
      if (p === "defender") {
        wall.push([nr, nc]);
        continue;
      }
      // Empty, or the king himself — part of the inside.
      inside.add(key(nr, nc));
      queue.push([nr, nc]);
    }
  }

  // A king standing alone against the rim with no defenders around him has an
  // "inside" and no wall. That is not a fort, it is a king in the open.
  if (wall.length === 0) return false;

  // Clause 3, part two: no wall man can be captured.
  //
  // `hostile` is the pessimistic reading described above — an empty square
  // outside the fort counts as an attacker's square, because one day it may be.
  const hostile = (r: number, c: number): boolean => {
    if (!inBounds(r, c)) return rules.edgeHostileToSoldiers;
    if (isCorner(r, c) && rules.cornersHostile) return true;
    if (isThrone(r, c) && b[r][c] === null)
      return rules.throneAnvil === "both" || rules.throneAnvil === "defenders";
    if (b[r][c] === "attacker") return true;
    if (sideOf(b[r][c]) === "defenders") return false; // a friend, never an anvil
    return !inside.has(key(r, c)); // empty: safe inside the fort, assumed lost outside
  };

  for (const [r, c] of wall) {
    for (const [[dr1, dc1], [dr2, dc2]] of AXES) {
      if (hostile(r + dr1, c + dc1) && hostile(r + dr2, c + dc2)) return false;
    }
  }
  return true;
}

// ── Applying a move ───────────────────────────────────────────────────────────
/**
 * Apply `move` to `state`, returning a *new* GameState with captures resolved,
 * turn flipped, and the win/loss status recomputed. Assumes `move` is legal.
 */
export function applyMove(
  state: GameState,
  move: Move,
  rules: CopenhagenRuleSet,
): GameState {
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
  rules: CopenhagenRuleSet,
  history: GameState["history"],
  sinceCapture: number,
): GameStatus {
  // 1. Defender escape: the king just reached a corner (rule 6).
  if (mover === "defenders") {
    const p = board[lastMove.to.row][lastMove.to.col];
    if (p === "king" && isEscapeSquare(lastMove.to.row, lastMove.to.col, rules))
      return "defenders_win_escape";
  }

  // 2. Attacker capture of the king (rule 7), active capture.
  if (mover === "attackers" && kingIsCaptured(board, rules, lastMove.to))
    return "attackers_win_capture";

  // 3. Entombment — the king walled in at the rim with no way out (see
  // `kingIsEntombed`; not a published rule).
  //
  // Checked after *either* side's move, like the exit fort below and for the
  // same reason: it is a property of the position, not of the move that produced
  // it, and the defenders can perfectly well seal their own king in. Ordering it
  // above encirclement is cosmetic — the two can both hold, and naming the
  // tighter, more local reason reads better on the game-over line.
  if (rules.entombedKingLoses && kingIsEntombed(board, rules))
    return "attackers_win_entombment";

  // 4. Attacker encirclement win (rule 7b).
  if (mover === "attackers" && rules.encirclementWin && isEncircled(board, rules))
    return "attackers_win_encirclement";

  // 5. Exit fort (rule 6b).
  //
  // Checked after *either* side's move, unlike the escape above, because a fort
  // is a property of the position rather than of the move that produced it, and
  // this way nothing here has to reason about move authorship to stay correct.
  // In practice only a defender's move ever completes one — an attacker inside
  // a wall that is otherwise closed can only shuffle around inside it, and an
  // attacker outside changes nothing, because `exitFort` already treats every
  // empty square outside the wall as though an attacker stood on it. The
  // `isEdge` guard inside `exitFort` is what makes checking it at every node
  // affordable either way.
  if (rules.exitFort && exitFort(board, rules)) return "defenders_win_fort";

  // 6. Threefold repetition (rule 8).
  //
  // Guarded on plies-since-capture for the same reason and by the same argument
  // as the other two games: `hashBoard` builds a fresh string per call and then
  // scans `history`, and this runs on every node the search visits. The argument
  // is exact rather than approximate — tafl only ever removes pieces, so a
  // capture makes every earlier position unreachable, and a third occurrence of
  // one position needs a minimum period of four plies, so it cannot land sooner
  // than eight plies after a capture. It matters most here of the three: 121
  // squares make this the longest hash string in the project.
  //
  // `"loss_for_repeater"` is Copenhagen's own reading and the reason this game
  // can end in `defenders_win_repetition`: the side that moved into the position
  // for the third time is the one that failed to break off, so it is the one
  // that loses. The other three settings behave as they do in the other games.
  if (rules.repetitionResult !== "none" && sinceCapture >= 8) {
    const currentHash = hashBoard(board, nextTurn);
    let seen = 1;
    for (const h of history) if (h.hashBefore === currentHash) seen++;
    if (seen >= 3) {
      if (rules.repetitionResult === "draw") return "draw_repetition";
      if (rules.repetitionResult === "loss_for_defenders") return "attackers_win_repetition";
      return mover === "attackers" ? "defenders_win_repetition" : "attackers_win_repetition";
    }
  }

  // 7. Side to move has no legal move → they lose (rule 8's second half).
  if (!hasAnyMove(board, nextTurn, rules))
    return nextTurn === "attackers" ? "defenders_win_no_moves" : "attackers_win_no_moves";

  return "playing";
}

// ── Notation ──────────────────────────────────────────────────────────────────
// Files a–k, ranks 1–11 counting up from the bottom — the same shape as
// Brandubh's a–g/1–7 and Tablut's a–i/1–9, and aagenielsen.dk-compatible, so the
// move text in an exported game reads the way a hnefatafl player expects.
export const squareName = (s: Square): string => `${FILES[s.col]}${BOARD_SIZE - s.row}`;
export const moveName = (m: Move): string =>
  `${squareName(m.from)}-${squareName(m.to)}${m.captures && m.captures.length ? "x" + m.captures.length : ""}`;

export const isGameOver = (status: GameStatus): boolean => status !== "playing";

export function winnerOf(status: GameStatus): Side | "draw" | null {
  switch (status) {
    case "defenders_win_escape":
    case "defenders_win_fort":
    case "defenders_win_repetition":
    case "defenders_win_no_moves":
    case "defenders_win_resign":
    case "defenders_win_time":
      return "defenders";
    case "attackers_win_capture":
    case "attackers_win_entombment":
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
