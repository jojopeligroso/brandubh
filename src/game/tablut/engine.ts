import {
  allMoves,
  applyMove,
  findKing,
  hashBoard,
  inBounds,
  isCorner,
  isEnemy,
  isEscapeSquare,
  isGameOver,
  isThrone,
  movesFrom,
  sideOf,
  winnerOf,
} from "./rules";
import { BOARD_SIZE, LAST, type Board, type GameState, type Move, type Piece, type Side } from "./types";
import type { TablutRuleSet } from "./variants";
import { SYM } from "./d4";

// ── Why this is a fork of ../engine.ts ────────────────────────────────────────
//
// The search machinery here — iterative deepening, the transposition table,
// killers, LMR, quiescence, D4 root folding — is the Brandubh engine's, and
// deliberately unchanged: it is board-agnostic, it is well measured, and a
// gratuitous rewrite would throw that away. What is *not* portable is everything
// that answers "how close is the king to winning", and that turns out to be most
// of the interesting code:
//
//   Brandubh                        Tablut
//   ────────────────────────────    ─────────────────────────────────────────
//   clearPathToCorner (≤2 lanes)    clearLanesToEdge (≤4 lanes, always aligned)
//   kingCornerMoves                 kingEscapeMoves
//   Manhattan-ish corner distance   distance to the nearest rim square
//   king-to-corner ordering bonus   king-to-rim ordering bonus
//
// The difference is not a recalibration. In Brandubh a king has at most two
// lanes and only when he shares a rank or file with a corner; here every one of
// his four rays terminates on the rim, so *every* ray is a potential lane and a
// king in the open centre of an empty board has four. That is why Tablut is a
// harder game for Black and why the attackers' whole task is a blockade.
//
// One thing that looks portable and is NOT: Brandubh's "one lane is enough when
// the king already touches the corner" shape. It is sound there because no
// soldier may ever stand on a corner, so that lane cannot be blocked at all.
// Under edge escape the rim is ordinary ground — an attacker can simply stand on
// the square the king was aiming for — so the single-lane shape is *unsound*
// here and is not ported. The recognizer requires two lanes.

/** The difficulty ladder, in order. Also the whitelist for anything restored
 *  from storage or read back out of a settings key. */
export const DIFFICULTIES = ["easy", "medium", "hard", "ollamh"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * The magnitude of a won position. Every score in this engine is
 * **attacker-positive**: `+WIN` means the attackers win, `−WIN` means the
 * defenders (the king's side) win.
 */
export const WIN = 1_000_000;
/** Scores this close to ±WIN are decisive; deepening can stop. Also the eval
 *  bar's fill-or-verdict threshold, and it sits below `RECOGNIZED_WIN` so one
 *  test catches both. */
export const DECISIVE = WIN - 1000;
/** Absolute ceiling for reaching a difficulty's depth floor, so honouring the
 *  floor can never hang even on a pathological position. */
const MIN_DEPTH_SAFETY_MS = 8000;
/** Move-ordering index at which late-move reductions begin. */
const LMR_MIN_INDEX = 4;
/** Ceiling on the observed effective-branching-factor estimate used for
 *  predictive time management — see the note at the bottom of `pickMove`. */
const EBF_CAP = 4;

/** Centre of the board, for the ordering tie-break. */
const CENTER = (BOARD_SIZE - 1) / 2;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// ── Evaluation (attacker-positive) ────────────────────────────────────────────
export interface EvalWeights {
  /** Per (attackers − 2·defenders). Defenders are scarcer (8 v 16), so worth ~2×. */
  material: number;
  /** Per square of the king's distance to the nearest rim square. Positive ⇒ the
   *  attackers want him deep in the middle. Range 0–4 on a 9×9 board. */
  kingEdge: number;
  /** Subtracted per open escape lane². One lane is worrying, two is lost — which
   *  is exactly what the recognizer below proves, so the quadratic is a gradient
   *  toward a fact rather than a guess. */
  escapeLane: number;
  /** Per attacker orthogonally adjacent to the king (capture pressure). */
  hug: number;
  /** Per empty orthogonal square around the king. Subtracted, so fewer liberties
   *  favour the attackers. */
  liberties: number;
  /** Subtracted per defender orthogonally adjacent to the king (a shield that
   *  blocks custodial capture). */
  shield: number;
  /** Per (attacker legal moves − defender legal moves). 0 ⇒ skip: it costs a full
   *  move-gen for both sides, and on 81 squares that is not cheap. */
  mobility: number;
  /** Per empty square the king can reach through open orthogonal paths, capped.
   *  Subtracted, so a boxed-in king favours the attackers. Under edge escape this
   *  is the single most descriptive positional term there is: the attackers' only
   *  plan is to shrink this number, because the moment the region touches the rim
   *  they have lost. 0 ⇒ skip the flood fill. */
  kingRegion: number;
  /**
   * Consult the exact recognizers at leaf nodes. `forcedDefenderWin` proves a
   * two-lane fork; `forcedAttackerWin` proves an imminent king capture. Both are
   * sound subsets — a false result only ever means "not proven".
   */
  endgameRecognizers: boolean;
  /** The attacker twin, which needs move generation rather than an O(1) geometric
   *  test and so is metered separately — the same split as Brandubh's. */
  attackerRecognizer: boolean;
}

/**
 * Provisional shipping weights.
 *
 * ⚠ These are **reasoned, not tuned.** Brandubh's numbers came off an A/B
 * gauntlet (`scripts/evaltune.ts`) over hundreds of games, and nothing of the
 * sort has been run for Tablut yet — the balance of the game is different enough
 * (16 v 8, four lanes instead of two, 81 squares) that Brandubh's numbers cannot
 * simply be assumed to transfer. What is deliberate here:
 *
 *  • `material` and the 2× defender premium carry over: the piece ratio is the
 *    same 2:1, so the term means the same thing.
 *  • `kingEdge` at 30 spans 0–4, so the whole term is worth ~3 soldiers across
 *    the board — comparable to Brandubh's corner-distance term.
 *
 *    A consequence worth knowing before reading the eval bar: the opening
 *    position scores **+120** (measured), and all of it is this term — the king
 *    starts as deep in the board as he can be, and nothing offsets it. That is
 *    the same shape as Brandubh, whose opening scores about +51 for the same
 *    reason, but it is more than twice as large. It is a constant offset, not an
 *    opinion about the position, and it does not affect move choice at a given
 *    root; it does mean "+120 at move one" must not be read as Black being three
 *    soldiers up.
 *  • `escapeLane` at 90 with a quadratic: two lanes scores 360, deliberately more
 *    than any plausible material swing, because two lanes is a proven loss.
 *  • `kingRegion` at 4 against a cap of 24 — the same total contribution as
 *    Brandubh's 6 × 12, spread over a board with more room in it.
 *
 * Until the gauntlet has been run, do not quote these as measured.
 */
export const DEFAULT_WEIGHTS: EvalWeights = {
  material: 40,
  kingEdge: 30,
  escapeLane: 90,
  hug: 30,
  liberties: 0,
  shield: 0,
  mobility: 0,
  kingRegion: 4,
  endgameRecognizers: true,
  attackerRecognizer: false,
};

/** Cap on the king's flood-filled confinement region. Scaled from Brandubh's 12
 *  by board area (81/49 ≈ 1.65) and rounded, so an open board saturates the term
 *  rather than letting sheer space dominate material. */
const KING_REGION_CAP = 24;

/** Number of empty squares the king can reach via open orthogonal paths (walls =
 *  any piece), capped. A small region means the king is being blockaded. */
export function kingRegionSize(b: Board, kr: number, kc: number): number {
  const seen = new Set<number>([kr * BOARD_SIZE + kc]);
  const stack: Array<[number, number]> = [[kr, kc]];
  let count = 0;
  while (stack.length && count < KING_REGION_CAP) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc) || b[nr][nc] !== null) continue;
      const id = nr * BOARD_SIZE + nc;
      if (seen.has(id)) continue;
      seen.add(id);
      count++;
      stack.push([nr, nc]);
    }
  }
  return count;
}

/** The king's distance to the nearest rim square: 0 on the rim, 4 on the throne. */
export const kingEdgeDistance = (kr: number, kc: number): number =>
  Math.min(kr, kc, LAST - kr, LAST - kc);

/**
 * The king's four rays, scanned once.
 *
 * `open` counts rays that are empty all the way to the rim — each such ray is a
 * one-move escape, because every ray of an interior square terminates on a rim
 * square. `blockers` is how many occupied squares stand in the four rays
 * altogether, which the recognizer uses only as a cheap "is this position even
 * close?" gate.
 *
 * The four rays are pairwise disjoint (they share only the king's own square), so
 * one enemy piece can never sit in two of them. That fact is the whole soundness
 * argument for the two-lane fork below, and it is cleaner here than in Brandubh,
 * where two corner lanes could in principle be considered together.
 */
export function laneScan(b: Board, kr: number, kc: number): { open: number; blockers: number } {
  let open = 0;
  let blockers = 0;
  for (const [dr, dc] of DIRS) {
    let r = kr + dr;
    let c = kc + dc;
    let clear = true;
    while (inBounds(r, c)) {
      if (b[r][c] !== null) {
        clear = false;
        blockers++;
      }
      r += dr;
      c += dc;
    }
    if (clear) open++;
  }
  return { open, blockers };
}

/** Open lanes only — the escape-lane eval term and the recognizer's gate. */
export const clearLanesToEdge = (b: Board, kr: number, kc: number): number =>
  laneScan(b, kr, kc).open;

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

/**
 * Real king-moves to *any* winning square: 1 (a clear lane), 2 (a clear L-path via
 * an empty pivot), else 3 (capped). A rook reaches any square in ≤2 moves via one
 * of two pivots, so this is exact for 1 and 2.
 *
 * Unlike Brandubh's `kingCornerMoves` there are 32 targets rather than four, so
 * the loop runs over the rim rather than over `CORNERS`. It is still cheap: the
 * 1-move case is the lane scan, and the 2-move case only ever tests two pivots
 * per target.
 */
export function kingEscapeMoves(b: Board, kr: number, kc: number, rules: TablutRuleSet): number {
  let best = 3;
  if (clearLanesToEdge(b, kr, kc) >= 1) return 1;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isEscapeSquare(r, c, rules)) continue;
      if (b[r][c] !== null) continue;
      for (const [pr, pc] of [
        [kr, c],
        [r, kc],
      ] as const) {
        if (b[pr][pc] !== null) continue; // the pivot must be empty to stop on
        if (isThrone(pr, pc) && !rules.kingMayReoccupyThrone) continue;
        if (
          (pr === kr || pc === kc) &&
          lineClear(b, kr, kc, pr, pc) &&
          lineClear(b, pr, pc, r, c)
        )
          best = Math.min(best, 2);
      }
    }
  return best;
}

// ── Exact recognizers ─────────────────────────────────────────────────────────
// These return a *proof*, not a heuristic, and the discipline is Brandubh's: a
// shallow fully-verified lookahead behind a cheap precondition, with every
// terminal read from the engine (`applyMove` → status) rather than re-derived. A
// false result only ever means "not proven".
//
// The escape value sits just below a literal terminal escape, so the search still
// prefers an *immediate* win when it has one.
const RECOGNIZED_WIN = WIN - 2;

/**
 * Every attacker move that lands on `(tr, tc)`, appended to `out`.
 *
 * Found by scanning outward from the destination rather than by generating every
 * attacker move and keeping the few that land here — on 81 squares that matters
 * more than it did on 49. Mirrors `movesFrom` exactly, in the opposite direction,
 * including the gulo/Dimetr rule that Black may be barred from crossing the
 * throne at all.
 */
function attackerMovesInto(
  b: Board,
  tr: number,
  tc: number,
  rules: TablutRuleSet,
  out: Move[],
): void {
  if (b[tr][tc] !== null) return; // occupied — nothing can land here
  if (isThrone(tr, tc)) return; // no soldier may ever stop on the throne
  if (rules.cornersRestricted && isCorner(tr, tc)) return;
  const throneBlocked = rules.throneBlocks !== "none"; // "attackers" or "soldiers" both stop Black
  for (const [dr, dc] of DIRS) {
    let r = tr + dr;
    let c = tc + dc;
    while (inBounds(r, c)) {
      const p = b[r][c];
      if (p !== null) {
        if (p === "attacker") out.push({ from: { row: r, col: c }, to: { row: tr, col: tc } });
        break; // the first piece on the ray blocks it either way
      }
      if (isThrone(r, c) && throneBlocked) break;
      r += dr;
      c += dc;
    }
  }
}

/**
 * Attackers to move, but the king's escape cannot be shut: **two or more clear
 * lanes to the rim.**
 *
 * The counting argument is exact. The king's four rays are pairwise disjoint, so
 * one attacker move occupies a square in at most one of them; with two lanes
 * open, at least one survives every possible reply, and a surviving lane is a
 * king move onto a winning square. Only a capture can save the attackers, which
 * is what the loop below checks.
 *
 * ## Which replies have to be built
 *
 * Building a child is the whole cost — `applyMove` clones the board, resolves
 * captures and runs `computeStatus` — and on 9×9 there can be well over a hundred
 * attacker replies. Almost all of them provably cannot change the answer, so only
 * replies landing orthogonally beside the king are built. `computeStatus` has
 * five ways to end a game and for any other reply four are unreachable:
 *
 *  - **King captured.** `kingIsCaptured` opens with "the moved piece must be
 *    adjacent to the king" and returns false otherwise. That is exactly, and
 *    only, the case the restricted loop keeps.
 *  - **Encirclement.** `isEncircled` floods from the king through non-attacker
 *    squares and returns false the moment it reaches the rim. An open lane *is*
 *    such a path, and a lane survives every reply, so the flood always escapes.
 *    (Note this is a different argument from Brandubh's, which leaned on the king
 *    standing on an edge — true of a corner lane, false of a Tablut one, since a
 *    king with four lanes can be dead centre.)
 *  - **Defenders have no move.** A surviving lane is a king move.
 *  - **Defender escape.** Needs a defender to have moved; the mover is Black.
 *
 * That leaves **repetition**, handled by counting rather than geometry: a
 * threefold needs eight plies since the last capture, so when the child cannot
 * reach eight the branch is dead and the reply is safe to skip. Above that the
 * loop runs in full — rare, and correct.
 */
function forkWinAttackerToMove(state: GameState, rules: TablutRuleSet): boolean {
  const b = state.board;
  const k = findKing(b);
  if (!k) return false;
  if (clearLanesToEdge(b, k.row, k.col) < 2) return false;

  // The one branch the geometry above cannot rule out. A capture resets the
  // count, so a capturing reply cannot repeat either; this only has to bound the
  // quiet case. The `??` fallback overestimates, erring towards the full loop.
  const captureOnly =
    rules.repetitionResult === "none" || (state.sinceCapture ?? state.history.length) + 1 < 8;

  let replies: Move[];
  if (captureOnly) {
    replies = [];
    for (const [dr, dc] of DIRS) {
      const tr = k.row + dr;
      const tc = k.col + dc;
      if (inBounds(tr, tc)) attackerMovesInto(b, tr, tc, rules, replies);
    }
  } else {
    replies = allMoves(b, "attackers", rules);
  }

  for (const m of replies) {
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status)) {
      if (winnerOf(child.status) !== "defenders") return false; // a saving/winning reply
      continue;
    }
    const kk = findKing(child.board);
    if (!kk || clearLanesToEdge(child.board, kk.row, kk.col) < 1) return false; // escape sealed
  }
  return true; // every reply leaves a lane ⇒ White wins next move
}

/**
 * How many blockers in the king's rays still leave the fork search worth running.
 *
 * A trim, not a rule: it only ever costs completeness. With the rays this
 * congested the king is not one move from a two-lane square often enough to pay
 * an `applyMove` per king move at every leaf.
 */
const FORK_STEP_MAX_BLOCKERS = 4;

/**
 * Is `state` a proven defender win — an escape in hand, a two-lane fork, or a
 * king move that steps into one? Sound subset; a false result just means "not
 * proven". Exported for cross-validation against the exhaustive solver.
 *
 * Only meaningful under edge escape. A corner-escape game is Brandubh's shape
 * with a bigger board and none of this geometry applies to it, so the recognizer
 * declines rather than guessing — the search still plays it, just without a proof
 * at the horizon.
 */
export function forcedDefenderWin(state: GameState, rules: TablutRuleSet): boolean {
  if (rules.escape !== "edges") return false;
  const b = state.board;
  const k = findKing(b);
  if (!k) return false;

  const { open, blockers } = laneScan(b, k.row, k.col);

  if (state.turn === "attackers") {
    if (open < 2) return false; // cheap gate: nothing to prove
    return forkWinAttackerToMove(state, rules);
  }

  // Defenders to move: escape now if a lane is already open …
  if (open >= 1) return true;
  // … otherwise look for a king move that lands on a two-lane square. Gated so a
  // congested position does not pay for the loop.
  if (blockers > FORK_STEP_MAX_BLOCKERS) return false;
  for (const to of movesFrom(b, k.row, k.col, rules)) {
    // A cheap pre-filter before the expensive per-reply loop: unless the
    // destination itself has two lanes there is no fork to verify. Computed on the
    // live board, which is why it is only a filter — the king's own departure can
    // open a lane, so this can only under-count, never over-count.
    const child = applyMove(state, { from: { row: k.row, col: k.col }, to }, rules);
    if (winnerOf(child.status) === "defenders") return true; // stepped straight out
    if (isGameOver(child.status)) continue;
    const kk = findKing(child.board);
    if (!kk || clearLanesToEdge(child.board, kk.row, kk.col) < 2) continue;
    if (forkWinAttackerToMove(child, rules)) return true; // stepped into a fork
  }
  return false;
}

/** A genuine net has few defender replies (an endgame). Beyond this the loop
 *  bails rather than pay O(D·A) at a leaf where a forced capture is implausible.
 *  Raised from Brandubh's 14 in proportion to the larger defender force. */
const NET_MAX_DEFENDER_MOVES = 20;

/** Attackers to move: can some attacker move capture the king right now? Only
 *  moves landing orthogonally beside the king can actively capture, so the loop
 *  skips the rest. The engine decides the terminal, so the capture rule is never
 *  re-derived here. */
function attackerCapturesKingNow(
  state: GameState,
  rules: TablutRuleSet,
  kr: number,
  kc: number,
): boolean {
  const replies: Move[] = [];
  for (const [dr, dc] of DIRS) {
    const tr = kr + dr;
    const tc = kc + dc;
    if (inBounds(tr, tc)) attackerMovesInto(state.board, tr, tc, rules, replies);
  }
  for (const m of replies) {
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status) && winnerOf(child.status) === "attackers") return true;
  }
  return false;
}

/** Defenders to move but netted: every reply leaves Black an immediate king
 *  capture. The mirror of `forkWinAttackerToMove` — a 2-ply proof that White
 *  cannot save the king. */
function defenderNetted(state: GameState, rules: TablutRuleSet): boolean {
  const moves = allMoves(state.board, "defenders", rules);
  if (moves.length === 0 || moves.length > NET_MAX_DEFENDER_MOVES) return false;
  for (const m of moves) {
    const child = applyMove(state, m, rules);
    if (isGameOver(child.status)) {
      if (winnerOf(child.status) === "attackers") continue; // this reply loses too
      return false; // an escape / draw / saving capture ⇒ not netted
    }
    const kk = findKing(child.board);
    if (!kk || !attackerCapturesKingNow(child, rules, kk.row, kk.col)) return false;
  }
  return true; // every reply loses the king ⇒ Black wins next move
}

/**
 * Is `state` a proven *attacker* win — an imminent king capture? Attackers on
 * move: a capture in hand. Defenders on move: the king is netted. Sound subset;
 * a false result only ever means "not proven". Scope is imminent capture; the
 * pure-blockade cases are left to the search, because a capture is not geometry —
 * the active-capture rule needs the *moving* attacker beside the king, so proving
 * one needs move generation.
 *
 * Exported for cross-validation against an independent oracle.
 */
export function forcedAttackerWin(state: GameState, rules: TablutRuleSet): boolean {
  const b = state.board;
  const k = findKing(b);
  if (!k) return false;

  // O(1) gate: the king must be under real capture pressure — a hostile flank
  // already beside him and at most two empty liberties. A king with room to run
  // cannot be force-captured next move. Tighter than strictly necessary; the trim
  // only ever costs completeness.
  let liberties = 0;
  let anchor = false;
  for (const [dr, dc] of DIRS) {
    const nr = k.row + dr;
    const nc = k.col + dc;
    if (!inBounds(nr, nc)) continue; // the rim is not hostile to the king
    const p = b[nr][nc];
    if (p === null) {
      liberties++;
      if (isThrone(nr, nc) && rules.throneHostileToKing) anchor = true;
      if (isCorner(nr, nc) && rules.cornersHostile) anchor = true;
    } else if (p === "attacker") {
      anchor = true;
    }
  }
  if (liberties > 2 || !anchor) return false;

  return state.turn === "attackers"
    ? attackerCapturesKingNow(state, rules, k.row, k.col)
    : defenderNetted(state, rules);
}

export function evaluate(
  state: GameState,
  w: EvalWeights = DEFAULT_WEIGHTS,
  rules?: TablutRuleSet,
): number {
  if (isGameOver(state.status)) {
    const winner = winnerOf(state.status);
    if (winner === "attackers") return WIN;
    if (winner === "defenders") return -WIN;
    return 0; // draw
  }

  // Mutually exclusive — only one side can have a forced win — so consulting
  // both is safe.
  if (rules) {
    if (w.endgameRecognizers && forcedDefenderWin(state, rules)) return -RECOGNIZED_WIN;
    if (w.attackerRecognizer && forcedAttackerWin(state, rules)) return RECOGNIZED_WIN;
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
    // How deep in the board the king is. Attackers want him far from the rim.
    score += kingEdgeDistance(k.row, k.col) * w.kingEdge;

    const open = clearLanesToEdge(b, k.row, k.col);
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

    // Confinement: the attackers' entire plan, under edge escape.
    if (w.kingRegion !== 0) score -= kingRegionSize(b, k.row, k.col) * w.kingRegion;
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
// authoritative resolution still happens inside `applyMove` — so an occasional
// approximation here never corrupts the game or the eval. Mirrors
// `isAnvilForSoldier`, but treats the mover's origin as already vacated.
function previewAnvil(
  b: Board,
  r: number,
  c: number,
  from: Move["from"],
  side: Side,
  rules: TablutRuleSet,
): boolean {
  if (!inBounds(r, c)) return rules.edgeHostileToSoldiers;
  if (isCorner(r, c) && rules.cornersHostile) return true;
  let occ = b[r][c];
  if (r === from.row && c === from.col) occ = null; // the mover has left this square
  if (isThrone(r, c)) {
    if (occ === null)
      return (
        rules.throneAnvil === "both" || (rules.throneAnvil === "defenders" && side === "defenders")
      );
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
  rules: TablutRuleSet,
): number {
  if (piece === "king" && !rules.armedKing) return 0;
  let n = 0;
  for (const [dr, dc] of DIRS) {
    const mr = to.row + dr;
    const mc = to.col + dc; // the square pinned against the anvil
    if (!inBounds(mr, mc)) continue;
    let victim = b[mr][mc];
    if (mr === from.row && mc === from.col) victim = null; // vacated by the mover
    if (victim === null || victim === "king") continue; // king capture handled by search
    if (!isEnemy(victim, side)) continue;
    if (previewAnvil(b, mr + dr, mc + dc, from, side, rules)) n++;
  }
  return n;
}

// ── Search configuration ──────────────────────────────────────────────────────
export type Ordering = "smart" | "legacy" | "none";

export interface SearchConfig {
  ordering: Ordering;
  useTT: boolean;
  useKillers: boolean;
  useQuiescence: boolean;
  maxQuiescencePly: number;
  useLMR: boolean;
  usePVS: boolean;
  /** Decay decisive scores by ply instead of the flat ±WIN every terminal
   *  returned before this flag existed. Re-derived from ../engine.ts (not
   *  copy-pasted — see the fork note at the top of this file and the note on
   *  `mateToTT`/`mateFromTT` below), same default and same reasoning: sound,
   *  cross-validated, no measured strength gain on the Brandubh gauntlet this
   *  was tuned against, so it ships as an analysis-only knob rather than a
   *  play default, same idiom as `attackerRecognizer`. See the Brandubh
   *  SearchConfig's own comment on this field for the full measured case. */
  useMateDistance: boolean;
}

export const FULL_CONFIG: SearchConfig = {
  ordering: "smart",
  useTT: true,
  useKillers: true,
  useQuiescence: true,
  maxQuiescencePly: 6,
  useLMR: true,
  // PVS ships ON here, where it ships OFF for Brandubh.
  //
  // The Brandubh note explains why it was kept as a knob at all: it measured
  // neutral there because smart ordering plus the TT plus LMR already tighten the
  // windows, "kept as a knob for wider-branching variants (Tablut) where ordering
  // dominates less".
  //
  // ⚠ Tablut is wider, but by less than that note's author (or the first draft of
  // this one) assumed. Measured at the opening position: **80 legal attacker moves
  // and 56 defender moves, against Brandubh's 40** — half again to twice, not the
  // "roughly three times" this comment claimed before anyone counted. So the
  // premise for turning PVS on is weaker than it looked, and this flag is on as a
  // considered default rather than a measured one. A gauntlet should settle it.
  usePVS: true,
  useMateDistance: false,
};

/** A fixed-depth searcher with legacy ordering and none of the machinery — the
 *  self-play baseline, for measuring a change rather than for playing. */
export const LEGACY_CONFIG: SearchConfig = {
  ordering: "legacy",
  useTT: false,
  useKillers: false,
  useQuiescence: false,
  maxQuiescencePly: 0,
  useLMR: false,
  usePVS: false,
  useMateDistance: false,
};

export interface SearchLimits {
  maxDepth: number;
  deadlineMs?: number;
  minDepth?: number;
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

/**
 * Mate-distance adjustment — re-derived from ../engine.ts, not copy-pasted, but
 * the two end up identical. ADR-0006 is about corner-escape geometry (lanes,
 * king-distance, the recognizers) baked into evaluation and search, and *that*
 * genuinely differs board to board — see the fork note at the top of this file.
 * This does not: it decays whatever `evaluate` already returned by ply, and
 * converts a root-relative score to/from the TT's node-relative storage. Both
 * operations only ever look at `WIN`/`DECISIVE` and a ply count — no lane, no
 * corner, no edge-vs-corner escape rule enters into it, so there is no fork
 * question to make a different call on here. A shared search core (the thing
 * ADR-0006's addendum says would have to carry the corner/edge distinction
 * inside itself to be worth having) would still need this exact code twice;
 * writing it twice by hand costs the same and keeps the fork's promise that
 * each file is a complete, readable engine on its own.
 *
 * Gated behind `SearchConfig.useMateDistance` (default OFF — see that field's
 * comment) exactly like the Brandubh twin, for exactly the same reason: no
 * fork question here either.
 *
 * See the fuller comment on this pair in ../engine.ts for the mechanics: a
 * search value is root-relative (mate-in-N-from-this-search's-root), but the
 * TT is shared across searches whose roots differ, so what gets stored is
 * node-relative (mate-in-N-from-this-node) — add the storing ply, subtract the
 * probing ply. `mateToTT`/`mateFromTT` are exact inverses; non-decisive scores
 * (`|v| < DECISIVE`) pass through both untouched.
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
  const prev = TT.get(key);
  if (prev && prev.gen === TT_GEN && prev.depth > depth) return;
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
  rules: TablutRuleSet;
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

/** `evaluate`, decayed by ply when `useMateDistance` is on (the raw value
 *  otherwise) — the one call site every terminal/leaf return in `search`/
 *  `quiesce` goes through. A fresh `evaluate()` result is already
 *  node-relative (mate-in-0-from-here), the same shape a TT probe hands back,
 *  so this reuses `mateFromTT` rather than inventing a second convention. */
function evaluateAtPly(state: GameState, ply: number, ctx: Ctx): number {
  const raw = evaluate(state, ctx.weights, ctx.rules);
  return ctx.cfg.useMateDistance ? mateFromTT(raw, ply) : raw;
}

// ── Move ordering ─────────────────────────────────────────────────────────────
function orderMoves(
  state: GameState,
  moves: Move[],
  ttMove: Move | null,
  ply: number,
  ctx: Ctx,
): Move[] {
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
      // An immediate king escape is decisive — and under edge escape that is any
      // rim square, which is what makes this bonus fire far more often than
      // Brandubh's corner version.
      if (piece === "king" && side === "defenders" && isEscapeSquare(m.to.row, m.to.col, rules))
        s += 500_000_000;
      const caps = previewCaptureCount(b, m.from, m.to, piece, side, rules);
      if (caps > 0) s += 1_000_000 + caps * 1000;
      // An attacker landing beside the king may complete a capture — search early.
      if (king && Math.abs(m.to.row - king.row) + Math.abs(m.to.col - king.col) === 1) s += 200_000;
      if (killers) {
        if (sameMove(m, killers[0])) s += 90_000;
        else if (sameMove(m, killers[1])) s += 80_000;
      }
    } else {
      if (side === "defenders" && isEscapeSquare(m.to.row, m.to.col, rules)) s += 10_000;
    }

    s -= Math.abs(m.to.row - CENTER) + Math.abs(m.to.col - CENTER);
    return { m, s };
  });

  scored.sort((a, b2) => b2.s - a.s);
  return scored.map((x) => x.m);
}

// ── Quiescence ────────────────────────────────────────────────────────────────
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
    } else if (piece === "king" && isEscapeSquare(m.to.row, m.to.col, rules)) {
      out.push(m); // defender escape
    } else if (king && Math.abs(m.to.row - king.row) + Math.abs(m.to.col - king.col) === 1) {
      out.push(m); // attacker pressing the king
    }
  }
  return out;
}

/** `ply` is the absolute distance from the search's root, not the remaining
 *  quiescence budget `qply` — see the identical note in ../engine.ts. */
function quiesce(state: GameState, alpha: number, beta: number, qply: number, ply: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluateAtPly(state, ply, ctx);

  const standPat = evaluateAtPly(state, ply, ctx);
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
    const v = quiesce(child, alpha, beta, qply - 1, ply + 1, ctx);
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
function search(
  state: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  ctx: Ctx,
): number {
  ctx.nodes++;
  if (ctx.deadline < Infinity && (ctx.nodes & 2047) === 0 && ctx.now() > ctx.deadline) throw ABORT;
  if (isGameOver(state.status)) return evaluateAtPly(state, ply, ctx);
  if (depth <= 0)
    return ctx.cfg.useQuiescence
      ? quiesce(state, alpha, beta, ctx.cfg.maxQuiescencePly, ply, ctx)
      : evaluateAtPly(state, ply, ctx);

  const alpha0 = alpha;
  const beta0 = beta;
  const key = ctx.cfg.useTT ? hashBoard(state.board, state.turn) : "";
  let ttMove: Move | null = null;
  if (ctx.cfg.useTT) {
    const e = TT.get(key);
    if (e) {
      ttMove = e.move;
      if (e.depth >= depth) {
        // node-relative -> this search's root-relative (see mateToTT/mateFromTT).
        // Flag off ⇒ identity, matching pre-flag storage exactly.
        const v = ctx.cfg.useMateDistance ? mateFromTT(e.value, ply) : e.value;
        if (e.flag === Flag.Exact) return v;
        if (e.flag === Flag.Lower && v > alpha) alpha = v;
        else if (e.flag === Flag.Upper && v < beta) beta = v;
        if (alpha >= beta) return v;
      }
    }
  }

  const maximizing = state.turn === "attackers";
  const moves = orderMoves(state, allMoves(state.board, state.turn, ctx.rules), ttMove, ply, ctx);
  if (moves.length === 0) return evaluateAtPly(state, ply, ctx); // no legal move ⇒ status is already terminal

  let best = maximizing ? -Infinity : Infinity;
  let bestMove: Move | null = null;
  let i = 0;
  for (const m of moves) {
    const child = applyMove(state, m, ctx.rules);
    let d2 = depth - 1;
    if (
      ctx.cfg.useLMR &&
      depth >= 3 &&
      i >= LMR_MIN_INDEX &&
      !isGameOver(child.status) &&
      state.board[m.from.row][m.from.col] !== "king" &&
      previewCaptureCount(
        state.board,
        m.from,
        m.to,
        state.board[m.from.row][m.from.col],
        state.turn,
        ctx.rules,
      ) === 0
    ) {
      d2 = Math.max(1, depth - 2 - (i >= LMR_MIN_INDEX + 6 ? 1 : 0));
    }
    let v: number;
    if (!ctx.cfg.usePVS || i === 0) {
      v = search(child, d2, ply + 1, alpha, beta, ctx);
      if (d2 < depth - 1 && (maximizing ? v > alpha : v < beta))
        v = search(child, depth - 1, ply + 1, alpha, beta, ctx);
    } else if (maximizing) {
      v = search(child, d2, ply + 1, alpha, alpha + 1, ctx);
      if (v > alpha) v = search(child, depth - 1, ply + 1, alpha, beta, ctx);
    } else {
      v = search(child, d2, ply + 1, beta - 1, beta, ctx);
      if (v < beta) v = search(child, depth - 1, ply + 1, alpha, beta, ctx);
    }
    i++;
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
      if (
        ctx.cfg.useKillers &&
        previewCaptureCount(
          state.board,
          m.from,
          m.to,
          state.board[m.from.row][m.from.col],
          state.turn,
          ctx.rules,
        ) === 0
      )
        recordKiller(ctx, ply, m);
      break;
    }
  }

  if (ctx.cfg.useTT) {
    const flag = best <= alpha0 ? Flag.Upper : best >= beta0 ? Flag.Lower : Flag.Exact;
    // root-relative -> node-relative for storage (see mateToTT/mateFromTT).
    // Flag off ⇒ store the raw value, matching pre-flag storage exactly.
    ttStore(key, depth, ctx.cfg.useMateDistance ? mateToTT(best, ply) : best, flag, bestMove);
  }
  return best;
}

// ── D4 board symmetry (root-move folding) ─────────────────────────────────────
// At a symmetric position, symmetric root moves are game-identical, so only one
// representative per orbit is searched. Tablut's opening has the full 8-element
// group, and its branching factor is roughly three times Brandubh's, so this
// buys more here than it does there.
const N = BOARD_SIZE;

function serializeUnder(board: Board, t: (r: number, c: number) => [number, number]): string {
  const out = new Array<string>(N * N).fill(".");
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const p = board[r][c];
      if (p === null) continue;
      const [nr, nc] = t(r, c);
      out[nr * N + nc] = p === "attacker" ? "a" : p === "defender" ? "d" : "k";
    }
  return out.join("");
}

/** The transforms under which the position is unchanged: its stabiliser subgroup.
 *  Length 1 ⇒ no usable symmetry. */
export function stabilizer(board: Board): Array<(r: number, c: number) => [number, number]> {
  const id = serializeUnder(board, SYM[0]);
  return SYM.filter((t) => serializeUnder(board, t) === id);
}

/** Collapse root moves into one representative per orbit under `group`. */
export function foldRootMoves(
  moves: Move[],
  group: ReadonlyArray<(r: number, c: number) => [number, number]>,
): Move[] {
  if (group.length <= 1) return moves;
  const seen = new Set<string>();
  const reps: Move[] = [];
  for (const m of moves) {
    let canon: string | null = null;
    for (const t of group) {
      const [fr, fc] = t(m.from.row, m.from.col);
      const [tr, tc] = t(m.to.row, m.to.col);
      const s = `${fr},${fc},${tr},${tc}`;
      if (canon === null || s < canon) canon = s;
    }
    if (!seen.has(canon!)) {
      seen.add(canon!);
      reps.push(m);
    }
  }
  return reps;
}

// ── Root: iterative deepening, tie-collection ─────────────────────────────────
export interface SearchResult {
  move: Move | null;
  score: number;
  /** Every root move that scored *exactly* the best score. The shared root bound
   *  is `best ∓ 1`, so a move that ties or beats the best still returns its true
   *  score and only strictly-worse moves fail low — which is what makes this set
   *  exact rather than approximate. */
  bestMoves: Move[];
  depth: number;
  nodes: number;
}

export const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/**
 * Choose a move via iterative-deepening alpha–beta. Deterministic when `limits`
 * carries no `deadlineMs` and `rng` is seeded — which is how the tests drive it.
 */
export function pickMove(
  state: GameState,
  rules: TablutRuleSet,
  limits: SearchLimits,
  config: SearchConfig = FULL_CONFIG,
  rng: () => number = Math.random,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  now: () => number = defaultNow,
): SearchResult {
  const rootMoves = allMoves(state.board, state.turn, rules);
  if (rootMoves.length === 0)
    return { move: null, score: evaluate(state, weights, rules), bestMoves: [], depth: 0, nodes: 0 };

  TT_GEN++;
  if (TT.size > TT_MAX) TT.clear();

  const t0 = now();
  const floorDepth = limits.minDepth ?? 0;
  const hardDeadline = limits.deadlineMs != null ? t0 + limits.deadlineMs : Infinity;
  const floorDeadline =
    limits.deadlineMs != null ? t0 + Math.max(limits.deadlineMs, MIN_DEPTH_SAFETY_MS) : Infinity;

  const ctx: Ctx = { rules, cfg: config, weights, deadline: hardDeadline, now, nodes: 0, killers: [] };
  const maximizing = state.turn === "attackers";
  const rootKey = config.useTT ? hashBoard(state.board, state.turn) : "";

  const foldedRoots = foldRootMoves(rootMoves, stabilizer(state.board));

  let bestMove: Move = foldedRoots[0];
  let bestTies: Move[] = [foldedRoots[0]];
  let bestScore = maximizing ? -Infinity : Infinity;
  let reached = 0;
  let prevIterMs = 0;

  for (let d = 1; d <= limits.maxDepth; d++) {
    ctx.deadline = d <= floorDepth ? floorDeadline : hardDeadline;
    const iterStart = now();
    try {
      const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
      const ordered = orderMoves(state, foldedRoots, ttMove, 0, ctx);
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
      if (Math.abs(localBest) >= DECISIVE) break; // forced result — no need to go deeper
    } catch (e) {
      if (e === ABORT) break; // keep the last fully-completed depth
      throw e;
    }
    // Predictive time management: don't *start* a depth we can't finish, so a
    // generous budget never means waiting the full time for a shallower result.
    //
    // ⚠ The estimate is capped here, which Brandubh's is not, because measurement
    // showed the uncapped version throwing away most of `hard`'s budget on this
    // board. On a midgame position the depth-2 iteration cost 19ms and depth 3
    // cost 330ms — an observed ratio of ~17, which predicted 5.6s for depth 4 and
    // stopped the search. Depth 4 actually cost ~390ms, so `hard` returned a
    // depth-3 move after 324ms of a 3000ms budget.
    //
    // The ratio is wrong because it is a single sample taken across the depth
    // where quiescence starts to bite; it is not a branching factor. Capping it
    // cannot cause a hang or an overrun: `search` checks the real deadline every
    // 2048 nodes and aborts, and an aborted iteration keeps the last completed
    // depth. So the only thing a too-optimistic prediction costs is time that was
    // already budgeted, which is the right way to spend it.
    //
    // Measured, same two positions, uncapped → capped at 4:
    //
    //     midgame  hard     depth 3 (324ms)   ->  depth 5 (2461ms of 3000ms)
    //     opening  ollamh   depth 5 (1035ms)  ->  depth 7 (4893ms of 8000ms)
    //
    // Two extra plies at both tiers, from budget that was being left on the table.
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

// ── Multi-PV root scoring (offline book generation) ───────────────────────────
export interface RootMoveScore {
  move: Move;
  score: number;
}

/**
 * Exact scores for every root move within `margin` of the best, at a fixed depth
 * — the multi-PV query an offline book generator needs. Deterministic (no
 * deadline). Root moves are D4-folded, so at symmetric positions the result is
 * one representative per orbit.
 *
 * The margin-0 path deliberately stops after pass 1: values reproduced through
 * foreign TT bound entries can drift (ordinary search instability), and a drifted
 * value that sneaks a strictly-worse move into an "exact ties" book is exactly
 * the corruption an offline generator must not ship.
 */
export function scoreRootMoves(
  state: GameState,
  rules: TablutRuleSet,
  depth: number,
  margin: number,
  config: SearchConfig = FULL_CONFIG,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): { best: number; within: RootMoveScore[]; nodes: number } {
  const rootMoves = allMoves(state.board, state.turn, rules);
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
  };
  const maximizing = state.turn === "attackers";
  const rootKey = config.useTT ? hashBoard(state.board, state.turn) : "";
  const foldedRoots = foldRootMoves(rootMoves, stabilizer(state.board));

  let best = maximizing ? -Infinity : Infinity;
  let ties: Move[] = [];
  let ordered: Move[] = foldedRoots;
  for (let d = 1; d <= depth; d++) {
    const ttMove = config.useTT ? (TT.get(rootKey)?.move ?? null) : null;
    ordered = orderMoves(state, foldedRoots, ttMove, 0, ctx);
    let localBest = maximizing ? -Infinity : Infinity;
    let localTies: Move[] = [];
    for (const m of ordered) {
      const alpha = maximizing && localBest !== -Infinity ? localBest - 1 : -Infinity;
      const beta = !maximizing && localBest !== Infinity ? localBest + 1 : Infinity;
      const v = search(applyMove(state, m, rules), d - 1, 1, alpha, beta, ctx);
      if (maximizing ? v > localBest : v < localBest) {
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
      const child = applyMove(state, m, rules);
      if (maximizing) {
        const v = search(child, depth - 1, 1, best - margin - 1, best, ctx);
        if (v >= best - margin) within.push({ move: m, score: Math.min(v, best) });
      } else {
        const v = search(child, depth - 1, 1, best, best + margin + 1, ctx);
        if (v <= best + margin) within.push({ move: m, score: Math.max(v, best) });
      }
    }
    within.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
  }
  return { best, within, nodes: ctx.nodes };
}

// ── Difficulty ladder ─────────────────────────────────────────────────────────
// The depth numbers are lower than Brandubh's at the same tier names, and that is
// arithmetic rather than timidity: 9×9 Tablut opens with roughly three times
// Brandubh's legal-move count, so a ply here costs what two or three cost there.
// The time-budgeted tiers self-adjust — they deepen to whatever the clock allows —
// so what actually had to change is the *floors*, which are promises the engine
// has to keep on a slow phone.
const DIFFICULTY: Record<
  Difficulty,
  { limits: SearchLimits; config: SearchConfig; blunder: number }
> = {
  // easy: shallow, no quiescence, and a chunky blunder rate so it stays beatable.
  easy: { limits: { maxDepth: 2 }, config: { ...FULL_CONFIG, useQuiescence: false }, blunder: 0.35 },
  // medium: fixed depth 3 with the full machinery. Fixed rather than budgeted so
  // it stays deterministic; a deadline rides along purely as a safety valve for a
  // pathological position, and with no `minDepth` it is free to return shallower.
  medium: { limits: { maxDepth: 3, deadlineMs: 2500 }, config: FULL_CONFIG, blunder: 0 },
  // hard: time-budgeted iterative deepening in a Web Worker. The floor is 3 rather
  // than Brandubh's 4 because a floored depth-4 search on this board can outrun
  // even the absolute safety cap on a slow device.
  hard: { limits: { maxDepth: 6, deadlineMs: 3000, minDepth: 3 }, config: FULL_CONFIG, blunder: 0 },
  // ollamh ("master sage"): the strongest tier, an 8s budget with a depth-4 floor.
  // No opening book yet on this side — Brandubh's ollamh skips its slowest early
  // moves from one, and generating the Tablut equivalent is its own job.
  ollamh: { limits: { maxDepth: 12, deadlineMs: 8000, minDepth: 4 }, config: FULL_CONFIG, blunder: 0 },
};

/** A chosen move plus what the search actually did to find it. `depth`/`nodes`
 *  are 0 for a "no move" or a random blunder. */
export interface MoveInfo {
  move: Move | null;
  /** The position's value, **attacker-positive**, on the same scale as
   *  {@link evaluate} — so `material` (40) is roughly one soldier. */
  score: number;
  /** The equal-best set — see `SearchResult.bestMoves`. */
  bestMoves: Move[];
  depth: number;
  nodes: number;
  elapsedMs: number;
}

/**
 * Choose the AI's move for whichever side is to move, reporting the search stats.
 * `rng` breaks ties and injects the blunder chance on easy.
 */
export function chooseMoveDetailed(
  state: GameState,
  difficulty: Difficulty,
  rules: TablutRuleSet,
  rng: () => number = Math.random,
): MoveInfo {
  const moves = allMoves(state.board, state.turn, rules);
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
  const r = pickMove(state, rules, limits, config, rng);
  return {
    move: r.move,
    score: r.score,
    bestMoves: r.bestMoves,
    depth: r.depth,
    nodes: r.nodes,
    elapsedMs: defaultNow() - t0,
  };
}

// ── Analysis search ───────────────────────────────────────────────────────────
// Analysis is a different question from play: "what is this position worth and
// what is the best reply", for a position the user is looking at. So it gets its
// own entry point, limits, weights and worker thread, and deliberately has no
// blunder roll and no book shortcut.

/** Shallow by design — this re-runs on every cursor step, so it has to be cheap
 *  enough to be invisible. Depth 3 on 9×9 is roughly what depth 4 costs on 7×7,
 *  which is why the cap is a ply lower than Brandubh's. */
export const ANALYSIS_LIMITS: SearchLimits = { maxDepth: 3, deadlineMs: 1200 };

/** What "think harder" spends: on demand, never automatically, because a
 *  depth-6 search on every cursor step would flatten a phone. The `minDepth`
 *  guarantees the deep answer is meaningfully deeper than the shallow one it
 *  replaces, so on a slow device the button never appears to do nothing. */
export const ANALYSIS_DEEP_LIMITS: SearchLimits = { maxDepth: 6, deadlineMs: 4000, minDepth: 4 };

/** Analysis turns the attacker recognizer ON: one search, on demand, where
 *  naming a forced attacker win exactly beats guessing at it. */
export const ANALYSIS_WEIGHTS: EvalWeights = { ...DEFAULT_WEIGHTS, attackerRecognizer: true };

/**
 * Evaluate a position for the analysis UI: the best move found and its score.
 *
 * **Deterministic in the position alone** — the tie-break `rng` is pinned and the
 * transposition table is cleared first, because the table feeds move *ordering*
 * and so decides which of several equally-best moves comes out first. Without
 * that, stepping back to a position already passed through could draw a different
 * (equally good) arrow than it drew the first time, which reads as the engine
 * changing its mind when nothing has changed.
 *
 * Clearing is safe precisely because analysis owns its worker thread — `TT` is
 * module state, so this is never the playing engine's table.
 */
export function analysePosition(
  state: GameState,
  rules: TablutRuleSet,
  limits: SearchLimits = ANALYSIS_LIMITS,
  weights: EvalWeights = ANALYSIS_WEIGHTS,
): MoveInfo {
  const t0 = defaultNow();
  resetTT();
  const r = pickMove(state, rules, limits, FULL_CONFIG, () => 0, weights);
  return {
    move: r.move,
    score: r.score,
    bestMoves: r.bestMoves,
    depth: r.depth,
    nodes: r.nodes,
    elapsedMs: defaultNow() - t0,
  };
}

/** Thin wrapper: the move only. */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rules: TablutRuleSet,
  rng: () => number = Math.random,
): Move | null {
  return chooseMoveDetailed(state, difficulty, rules, rng).move;
}
