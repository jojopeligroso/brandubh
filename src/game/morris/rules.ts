// ── Nine Men's Morris rules ───────────────────────────────────────────────────
//
// Pure and immutable, the same contract the three tafl rules modules keep: every
// function takes a position and a ruleset and returns a new value, nothing is
// mutated, and nothing here knows that a screen or a search exists.
//
// The shape is **not** a copy of `../copenhagen/rules.ts`, because almost nothing
// in a tafl game survives the crossing: there is no sliding, no custodial
// capture, no throne and no king. What is copied deliberately is the *order* of
// the file (special points → setup → move generation → capture → hashing →
// applyMove → status → notation) and the division of labour, so a reader who
// knows the tafl files knows where to look.
//
// Three decisions worth knowing before reading:
//
//   • **A turn is one atomic `Move`.** Closing a mill takes an opponent stone,
//     and that removal is a field on the move rather than a second half-turn. It
//     costs the UI a small state machine (select, then choose a victim) and buys
//     everything else: one ply per move in the search, one token per move in a
//     file, undo that cannot land between the two halves, and a move list that
//     replays without a mode flag. See `Move` in `types.ts`.
//   • **The board is a graph, not a grid.** `ADJ` and `MILLS` are the rules;
//     `POINTS` exists only to name and draw the points. Nothing below computes a
//     neighbour from coordinates.
//   • **Geometry is derived once, at module load**, from the indexing rule stated
//     in the comment on `POINTS` — not written out as 24 hand-typed rows. Two
//     real bugs in this project came from constants that were correct in the file
//     they were copied from (see ADR-0007), and a hand-typed adjacency table for
//     a 32-edge graph is exactly that hazard.
//
// Rule sourcing: Ralph Gasser, "Solving Nine Men's Morris", Computational
// Intelligence 12(1):24–41, 1996, for the two debated points (a double mill takes
// one stone; when every opponent stone is in a mill, any of them may be taken)
// and for the 16-fold symmetry in `symmetry.ts`. Everything else is the standard
// ruleset. The paper's full text is unreachable from this environment, so every
// assertion that is not a first-principles derivation is marked
// ⚠ UNVERIFIED (excerpt) in `variants.ts` and `docs/morris-rules.md`.

import {
  FILES,
  GRID_SIZE,
  POINT_COUNT,
  STONES_PER_SIDE,
  cellOf,
  other,
  type Board,
  type Cell,
  type GameState,
  type HistoryEntry,
  type Move,
  type MorrisStatus,
  type Phase,
  type Side,
} from "./types";
import type { MorrisRuleSet } from "./variants";

// ── The 24 points ─────────────────────────────────────────────────────────────
/**
 * Point `ring*8 + k`: ring 0 is the outer square, 1 the middle, 2 the inner, and
 * `k` runs clockwise from each ring's top-left corner —
 * TL, TM, TR, MR, BR, BM, BL, ML. Even `k` is a corner, odd `k` a midpoint, and
 * that parity is load-bearing: the spokes join the odd points and nothing else.
 *
 * Ring `r` occupies the 7×7 lattice rows and columns `lo = r`, `mid = 3`,
 * `hi = 6 − r`, which makes the whole table four lines of arithmetic and the
 * names fall out of it:
 *
 *     0 a7   1 d7   2 g7   3 g4   4 g1   5 d1   6 a1   7 a4     (outer)
 *     8 b6   9 d6  10 f6  11 f4  12 f2  13 d2  14 b2  15 b4     (middle)
 *    16 c5  17 d5  18 e5  19 e4  20 e3  21 d3  22 c3  23 c4     (inner)
 *
 * `x` is the grid column (0 = file `a`), `y` the grid row counting *down* from
 * the top, so rank = 7 − y and `a1` is bottom-left — the same convention the
 * three tafl boards use, which is what lets the shared board coordinates and the
 * flip preferences work unchanged.
 */
export const POINTS: readonly { x: number; y: number; name: string }[] = (() => {
  const out: { x: number; y: number; name: string }[] = [];
  for (let ring = 0; ring < 3; ring++) {
    const lo = ring;
    const hi = GRID_SIZE - 1 - ring;
    const mid = (GRID_SIZE - 1) / 2;
    const order: ReadonlyArray<readonly [number, number]> = [
      [lo, lo],
      [mid, lo],
      [hi, lo],
      [hi, mid],
      [hi, hi],
      [mid, hi],
      [lo, hi],
      [lo, mid],
    ];
    for (const [x, y] of order) out.push({ x, y, name: `${FILES[x]}${GRID_SIZE - y}` });
  }
  return out;
})();

/** The name of a point, `a7`–`g1`. */
export const pointName = (i: number): string => POINTS[i].name;

/** The index of a named point, or −1 — the inverse of `pointName`. */
export function pointIndex(name: string): number {
  const i = POINTS.findIndex((p) => p.name === name);
  return i === -1 ? -1 : i;
}

/**
 * Adjacency: along a ring, `k ± 1` (mod 8); and for odd `k` (the midpoints), the
 * same `k` on the neighbouring ring(s). 32 edges.
 *
 * Note what this says about corners: `k ± 1` from an even `k` is always odd, so
 * two corners are never adjacent and a corner has exactly two neighbours, both
 * midpoints. A midpoint on the middle ring has four. That is the whole board.
 */
export const ADJ: readonly (readonly number[])[] = (() => {
  const out: number[][] = Array.from({ length: POINT_COUNT }, () => []);
  for (let i = 0; i < POINT_COUNT; i++) {
    const ring = Math.floor(i / 8);
    const k = i % 8;
    out[i].push(ring * 8 + ((k + 1) % 8), ring * 8 + ((k + 7) % 8));
    if (k % 2 === 1) {
      if (ring > 0) out[i].push((ring - 1) * 8 + k);
      if (ring < 2) out[i].push((ring + 1) * 8 + k);
    }
    out[i].sort((a, b) => a - b);
  }
  return out;
})();

/**
 * The 16 mills: three consecutive points of a ring starting at an even `k` (four
 * per ring, twelve in all), plus the four spokes, each joining the same odd `k`
 * across all three rings.
 *
 * Starting only at even `k` is what makes these the *twelve ring sides* rather
 * than eight overlapping triples: a side of the drawn square runs corner →
 * midpoint → corner.
 */
export const MILLS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let ring = 0; ring < 3; ring++)
    for (const k of [0, 2, 4, 6])
      out.push([ring * 8 + k, ring * 8 + ((k + 1) % 8), ring * 8 + ((k + 2) % 8)]);
  for (const k of [1, 3, 5, 7]) out.push([k, 8 + k, 16 + k]);
  return out;
})();

/** The indices into `MILLS` of every mill through a point — two for a corner
 *  (its two ring sides), two for an outer/inner midpoint, three for a middle-ring
 *  midpoint. */
export const MILLS_OF: readonly (readonly number[])[] = (() => {
  const out: number[][] = Array.from({ length: POINT_COUNT }, () => []);
  MILLS.forEach((mill, m) => mill.forEach((p) => out[p].push(m)));
  return out;
})();

// ── Bit-mask views ────────────────────────────────────────────────────────────
// 24 points fit in a 24-bit integer, so occupancy is a pair of numbers and a mill
// test is one `&`. The authoritative state stays the `Cell[]` board (it is what
// persists, replays and renders); these are the engine's and the endgame
// databases' view of it, and they are built here so there is exactly one
// definition of "bit `i` means point `i`".

/** Mill `m` as a bit mask. */
export const MILL_MASKS: readonly number[] = MILLS.map(
  (mill) => (1 << mill[0]) | (1 << mill[1]) | (1 << mill[2]),
);

/** The board as two occupancy masks. */
export function masksOf(board: Board): { white: number; black: number } {
  let white = 0;
  let black = 0;
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] === 1) white |= 1 << i;
    else if (board[i] === 2) black |= 1 << i;
  }
  return { white, black };
}

/** How many bits are set — stones on the board, for a mask. Kernighan's loop
 *  rather than a SWAR trick: 24 bits means at most 24 iterations, and a
 *  bit-twiddle here would be an unmeasured cleverness in a file whose job is to
 *  be obviously right. */
export function popcount(mask: number): number {
  let m = mask;
  let n = 0;
  while (m !== 0) {
    m &= m - 1;
    n++;
  }
  return n;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
/** The opening: an empty board and nine stones in each hand. Who moves first is
 *  a rule (`firstMove`), not a constant — see `variants.ts`. */
export function initialState(rules: MorrisRuleSet): GameState {
  return {
    board: Array<Cell>(POINT_COUNT).fill(0),
    turn: rules.firstMove,
    inHand: { white: STONES_PER_SIDE, black: STONES_PER_SIDE },
    status: "playing",
    history: [],
    sinceMill: 0,
  };
}

/** Placing while either hand still holds a stone; moving once both are empty. */
export const phaseOf = (state: GameState): Phase =>
  state.inHand.white === 0 && state.inHand.black === 0 ? "moving" : "placing";

/** A side's stones, in hand and on the board — the count the "fewer than three
 *  loses" rule is about. */
export function stonesOf(state: GameState, side: Side): number {
  const cell = cellOf(side);
  let n = state.inHand[side];
  for (let i = 0; i < POINT_COUNT; i++) if (state.board[i] === cell) n++;
  return n;
}

/** Stones of `side` standing on the board. */
function onBoard(board: Board, side: Side): number {
  const cell = cellOf(side);
  let n = 0;
  for (let i = 0; i < POINT_COUNT; i++) if (board[i] === cell) n++;
  return n;
}

// ── Mills ─────────────────────────────────────────────────────────────────────
/** Is the stone on point `i` part of a completed mill? False for an empty point. */
export function inMill(board: Board, i: number): boolean {
  const cell = board[i];
  if (cell === 0) return false;
  for (const m of MILLS_OF[i]) {
    const [a, b, c] = MILLS[m];
    if (board[a] === cell && board[b] === cell && board[c] === cell) return true;
  }
  return false;
}

/** How many mills through `i` are completed by `side` standing there. `i` is
 *  assumed to be empty or already `side`'s — the caller applies the move to a
 *  board first (`applyMove` does), so "formed" is read off the real position
 *  rather than guessed from the one before it. */
export function millsFormedAt(board: Board, i: number, side: Side): number {
  const cell = cellOf(side);
  let n = 0;
  for (const m of MILLS_OF[i]) {
    const [a, b, c] = MILLS[m];
    if (
      (a === i || board[a] === cell) &&
      (b === i || board[b] === cell) &&
      (c === i || board[c] === cell)
    )
      n++;
  }
  return n;
}

/** Does `side` standing on `i` complete at least one mill? */
export const formsMill = (board: Board, i: number, side: Side): boolean =>
  millsFormedAt(board, i, side) > 0;

/**
 * Which of `victim`'s stones a mill-closer may take.
 *
 * Stones in a mill are protected — *unless every one of the victim's stones is in
 * a mill*, in which case Gasser's reading allows any of them
 * (`removeFromMillsWhenAllInMills`, ⚠ UNVERIFIED (excerpt) as a quotation, though
 * the excerpts state it plainly). With the flag off and every stone milled, the
 * returned list is empty and the mill simply takes nothing — see `applyMove`,
 * which accepts a mill-closing move with `remove: null` in exactly that case and
 * no other.
 */
export function removable(board: Board, victim: Side, rules: MorrisRuleSet): number[] {
  const cell = cellOf(victim);
  const all: number[] = [];
  const free: number[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] !== cell) continue;
    all.push(i);
    if (!inMill(board, i)) free.push(i);
  }
  if (free.length > 0) return free;
  return rules.removeFromMillsWhenAllInMills ? all : [];
}

// ── Move generation ───────────────────────────────────────────────────────────
/**
 * May `side` move a stone to *any* empty point rather than along a line?
 *
 * The flying rule (⚠ UNVERIFIED (excerpt): the excerpts say Gasser's solution
 * used it; his own wording was not seen) turns on at exactly three stones, and
 * only once the hand is empty — a player in the placing phase with three stones
 * on the board is not a player reduced to three.
 */
export function flyingFor(state: GameState, side: Side, rules: MorrisRuleSet): boolean {
  return (
    rules.flying === "three" && state.inHand[side] === 0 && onBoard(state.board, side) === 3
  );
}

/** Destinations for the stone on `from`, for the side standing there. */
function destinations(state: GameState, from: number, rules: MorrisRuleSet): number[] {
  const out: number[] = [];
  if (flyingFor(state, state.turn, rules)) {
    for (let i = 0; i < POINT_COUNT; i++) if (state.board[i] === 0) out.push(i);
    return out;
  }
  for (const j of ADJ[from]) if (state.board[j] === 0) out.push(j);
  return out;
}

/**
 * Every complete legal turn, including one entry per legal victim when the turn
 * closes a mill. That multiplication is the whole reason the move list is wider
 * than the board: a placement that closes a mill against six free enemy stones is
 * six moves, not one, because they are six different games.
 *
 * Deterministic order — placements and moves by ascending point, victims by
 * ascending point — because an engine whose move list order wobbles is an engine
 * whose search fingerprints wobble.
 */
export function allMoves(state: GameState, rules: MorrisRuleSet): Move[] {
  if (state.status !== "playing") return [];
  const side = state.turn;
  const cell = cellOf(side);
  const victim = other(side);
  const out: Move[] = [];

  const push = (from: number | null, to: number): void => {
    // Mills are read off the board *after* the stone has moved: leaving a point
    // can break the very mill the arrival would otherwise complete.
    const after = state.board.slice() as Cell[];
    if (from !== null) after[from] = 0;
    after[to] = cell;
    const mills = millsFormedAt(after, to, side);
    if (mills === 0) {
      out.push({ from, to, remove: null });
      return;
    }
    const prey = removable(after, victim, rules);
    if (prey.length === 0) {
      out.push({ from, to, remove: null }); // a mill with nothing legal to take
      return;
    }
    if (rules.doubleMillRemoves === "two" && mills >= 2 && prey.length >= 2) {
      // Unordered pairs: taking A then B is the same turn as taking B then A.
      // The pair is chosen from the victims legal *before* either removal, which
      // is a reading and not a derivation — see `doubleMillRemoves` in
      // `variants.ts`.
      for (let a = 0; a < prey.length; a++)
        for (let b = a + 1; b < prey.length; b++)
          out.push({ from, to, remove: prey[a], remove2: prey[b] });
      return;
    }
    for (const p of prey) out.push({ from, to, remove: p });
  };

  if (state.inHand[side] > 0) {
    for (let i = 0; i < POINT_COUNT; i++) if (state.board[i] === 0) push(null, i);
    return out;
  }
  for (let from = 0; from < POINT_COUNT; from++) {
    if (state.board[from] !== cell) continue;
    for (const to of destinations(state, from, rules)) push(from, to);
  }
  return out;
}

/** Has the side to move any legal turn at all? Early-exits, so it is far cheaper
 *  than `allMoves(...).length > 0` — and it runs at every node of the search, to
 *  decide the "blocked player loses" terminal. */
export function hasAnyMove(state: GameState, rules: MorrisRuleSet): boolean {
  return anyMoveFor(state.board, state.inHand, state.turn, rules);
}

function anyMoveFor(
  board: Board,
  inHand: Record<Side, number>,
  side: Side,
  rules: MorrisRuleSet,
): boolean {
  if (inHand[side] > 0) {
    // A placement needs one empty point, and with at most 18 stones on 24 points
    // there is always one. Checked rather than assumed, because a custom ruleset
    // (or a hand-built test board) can break the arithmetic.
    for (let i = 0; i < POINT_COUNT; i++) if (board[i] === 0) return true;
    return false;
  }
  const cell = cellOf(side);
  let stones = 0;
  let free = false;
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] === 0) free = true;
    else if (board[i] === cell) stones++;
  }
  if (rules.flying === "three" && stones === 3) return free; // flying reaches any empty point
  for (let i = 0; i < POINT_COUNT; i++) {
    if (board[i] !== cell) continue;
    for (const j of ADJ[i]) if (board[j] === 0) return true;
  }
  return false;
}

// ── Hashing (repetition detection) ────────────────────────────────────────────
const GLYPH = [".", "w", "b"] as const;

/** A position's identity for repetition purposes: the stones, the side to move,
 *  and both hands. The hands matter — the same 24 points with different stones
 *  still to place is a different position, and including them is what makes a
 *  placing-phase hash unable to collide with a moving-phase one. */
export function hashState(state: GameState): string {
  return hashParts(state.board, state.turn, state.inHand);
}

function hashParts(board: Board, turn: Side, inHand: Record<Side, number>): string {
  let s = turn === "white" ? "W" : "B";
  for (let i = 0; i < POINT_COUNT; i++) s += GLYPH[board[i]];
  return `${s}${inHand.white}${inHand.black}`;
}

// ── Applying a move ───────────────────────────────────────────────────────────
const illegal = (why: string): never => {
  throw new Error(`illegal morris move: ${why}`);
};

/**
 * Apply `move`, returning a new state with the stone placed or moved, the mill's
 * victim removed, the turn flipped, the counters advanced and the status
 * recomputed.
 *
 * Unlike the tafl `applyMove`s, which assume legality, this one **throws** on an
 * illegal move. It can afford to: legality here is a handful of O(1) checks
 * against the position (the move carries its own removal, so there is nothing to
 * search for), and the alternative is a silently-wrong game from a malformed save
 * file or a mis-wired board click. The checks are deliberately the same ones
 * `allMoves` generates by, so "throws" and "not in `allMoves`" mean the same
 * thing — which is what lets a replay or an import validate by construction.
 */
export function applyMove(state: GameState, move: Move, rules: MorrisRuleSet): GameState {
  if (state.status !== "playing") illegal("the game is over");
  const side = state.turn;
  const cell = cellOf(side);
  const victim = other(side);
  const placing = state.inHand[side] > 0;

  if (!Number.isInteger(move.to) || move.to < 0 || move.to >= POINT_COUNT)
    illegal(`no such point ${String(move.to)}`);
  if (state.board[move.to] !== 0) illegal(`${pointName(move.to)} is occupied`);

  if (placing) {
    if (move.from !== null) illegal("stones must be placed while a hand holds any");
  } else {
    const from = move.from;
    if (from === null) illegal("no stones left in hand to place");
    else {
      if (!Number.isInteger(from) || from < 0 || from >= POINT_COUNT)
        illegal(`no such point ${String(from)}`);
      if (state.board[from] !== cell) illegal(`${pointName(from)} holds no ${side} stone`);
      if (!flyingFor(state, side, rules) && !ADJ[from].includes(move.to))
        illegal(`${pointName(from)}–${pointName(move.to)} is not a line`);
    }
  }

  const board = state.board.slice() as Cell[];
  if (move.from !== null) board[move.from] = 0;
  board[move.to] = cell;

  const mills = millsFormedAt(board, move.to, side);
  const formedMill = mills > 0;
  const prey = formedMill ? removable(board, victim, rules) : [];
  const takesTwo = rules.doubleMillRemoves === "two" && mills >= 2 && prey.length >= 2;
  const remove2 = move.remove2 ?? null;

  // Range-checked before anything names them, so a malformed file's "take point
  // 99" is an error message rather than a crash inside `pointName`.
  for (const r of [move.remove, remove2])
    if (r !== null && (!Number.isInteger(r) || r < 0 || r >= POINT_COUNT))
      illegal(`no such point ${String(r)}`);

  if (!formedMill) {
    if (move.remove !== null) illegal("no mill was closed, so nothing may be taken");
    if (remove2 !== null) illegal("no mill was closed, so nothing may be taken");
  } else if (prey.length === 0) {
    if (move.remove !== null) illegal("every opponent stone is in a mill and protected");
    if (remove2 !== null) illegal("every opponent stone is in a mill and protected");
  } else {
    if (move.remove === null) illegal("a closed mill must take a stone");
    else if (!prey.includes(move.remove)) illegal(`${pointName(move.remove)} may not be taken`);
    if (takesTwo) {
      if (remove2 === null) illegal("a double mill must take two stones under this ruleset");
      else if (!prey.includes(remove2)) illegal(`${pointName(remove2)} may not be taken`);
      else if (remove2 === move.remove) illegal("a double mill must take two different stones");
    } else if (remove2 !== null) illegal("only one stone may be taken");
  }

  if (move.remove !== null) board[move.remove] = 0;
  if (remove2 !== null) board[remove2] = 0;

  const inHand = { ...state.inHand };
  if (move.from === null) inHand[side] -= 1;

  const entry: HistoryEntry = {
    move: remove2 !== null ? { ...move, remove2 } : { from: move.from, to: move.to, remove: move.remove },
    sideThatMoved: side,
    hashBefore: hashState(state),
    formedMill,
  };
  const history = [...state.history, entry];

  // The 50-move counter runs only in the moving phase: the placing phase is
  // eighteen plies long and cannot stall. A closed mill resets it — that is the
  // rule's own wording ("without a mill being formed"), so it resets even in the
  // rare case where the mill could take nothing.
  const sinceMill =
    phaseOf(state) === "placing" ? 0 : formedMill || move.remove !== null ? 0 : state.sinceMill + 1;

  const nextTurn = victim;
  const status = computeStatus(board, nextTurn, side, inHand, history, sinceMill, rules);

  return { board, turn: nextTurn, inHand, status, history, sinceMill };
}

/**
 * The terminal tests, in the order the rules apply them:
 *
 *  1. The opponent is below three stones — and only once their hand is empty,
 *     because a player holding stones is not a player who has lost them.
 *  2. The opponent cannot move. Only reachable in the moving phase: a placement
 *     needs one empty point and there are always several.
 *  3. Threefold repetition — a practical draw rule the shipped preset adds, not
 *     Gasser's (`repetitionResult`).
 *  4. Fifty moves by each side with no mill closed — likewise (`noMillDrawMoves`).
 */
function computeStatus(
  board: Board,
  nextTurn: Side,
  mover: Side,
  inHand: Record<Side, number>,
  history: readonly HistoryEntry[],
  sinceMill: number,
  rules: MorrisRuleSet,
): MorrisStatus {
  if (inHand[nextTurn] === 0 && onBoard(board, nextTurn) < 3)
    return mover === "white" ? "white_win_stones" : "black_win_stones";

  const moving = inHand.white === 0 && inHand.black === 0;
  if (moving && !anyMoveFor(board, inHand, nextTurn, rules))
    return mover === "white" ? "white_win_blocked" : "black_win_blocked";

  if (rules.repetitionResult === "draw" && moving) {
    // Scanned backwards and stopped at the last removal, because a removal makes
    // every earlier position unreachable — stones never come back. That bound is
    // exact rather than heuristic, and it is what keeps this affordable at every
    // node of the search: the loop runs for as many plies as the current
    // stone-count has stood, not for the whole game.
    const current = hashParts(board, nextTurn, inHand);
    let seen = 1;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.move.remove !== null || (h.move.remove2 ?? null) !== null) break;
      if (h.hashBefore === current && ++seen >= 3) return "draw_repetition";
    }
  }

  // 50 moves *by each side* is 100 plies.
  if (rules.noMillDrawMoves === "50" && sinceMill >= 100) return "draw_no_mill";

  return "playing";
}

// ── Notation ──────────────────────────────────────────────────────────────────
// `d7` places, `a7-a4` moves, and an `x` suffix names each stone taken:
// `d7xd2`, `a7-a4xb2`. The same shape as the tafl games' move text (`a7-a4`),
// with the victim named rather than counted — in Morris the *choice* of victim is
// the interesting half of the move, so a count would throw away the move.
export function moveName(move: Move): string {
  const head = move.from === null ? pointName(move.to) : `${pointName(move.from)}-${pointName(move.to)}`;
  const takes = [move.remove, move.remove2 ?? null].filter((r): r is number => r !== null);
  return head + takes.map((r) => `x${pointName(r)}`).join("");
}

const MOVE_RE = /^([a-g][1-7])(?:-([a-g][1-7]))?((?:x[a-g][1-7])*)$/;

/** The inverse of `moveName`, or `null` if the token is not a move at all. Parses
 *  shape only: whether the move is *legal* is `applyMove`'s answer, not this
 *  one's. */
export function parseMoveName(s: string): Move | null {
  const m = MOVE_RE.exec(s.trim());
  if (!m) return null;
  const first = pointIndex(m[1]);
  const second = m[2] ? pointIndex(m[2]) : -1;
  if (first === -1 || (m[2] && second === -1)) return null;
  const takes = (m[3].match(/[a-g][1-7]/g) ?? []).map(pointIndex);
  if (takes.some((t) => t === -1) || takes.length > 2) return null;
  const move: Move = {
    from: m[2] ? first : null,
    to: m[2] ? second : first,
    remove: takes.length > 0 ? takes[0] : null,
  };
  return takes.length > 1 ? { ...move, remove2: takes[1] } : move;
}

export const isGameOver = (s: MorrisStatus): boolean => s !== "playing";

export function winnerOf(s: MorrisStatus): Side | "draw" | null {
  switch (s) {
    case "white_win_stones":
    case "white_win_blocked":
    case "white_win_resign":
    case "white_win_time":
      return "white";
    case "black_win_stones":
    case "black_win_blocked":
    case "black_win_resign":
    case "black_win_time":
      return "black";
    case "draw_repetition":
    case "draw_no_mill":
      return "draw";
    default:
      return null;
  }
}
