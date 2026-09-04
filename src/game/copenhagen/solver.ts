// ── Exhaustive game solver (bounded) ──────────────────────────────────────────
//
// The Copenhagen twin of `../tablut/solver.ts`, and a near-verbatim one: the
// algorithm is three-valued minimax over whatever rules module it is handed, so
// the only thing that had to change is which rules module that is. It exists here
// for one job in particular — being the *independent oracle* the engine's
// recognizers are cross-validated against, in the way `recognizers.test.ts` does
// for both other games. A recognizer and the search it feeds must never be each
// other's only witness.
//
// It solves less of Copenhagen than either twin solves of its own game, and by a
// long way: 121 squares, 37 pieces and an opening branching factor around 116
// put anything but the shallowest tree out of reach — Brandubh's own opening is
// already unsolved (see docs/solving.md), and this is the largest board in the
// project by a wide margin. What it does reach is near-terminal positions and
// thinned endgames, which is exactly, and only, what a soundness test needs.
//
// A sound, *partial* solver for Copenhagen positions. It reuses the authoritative
// engine (allMoves / applyMove / status) so the rules it solves under are exactly
// the rules the game plays under — including the exit fort and the
// loss-for-the-repeater rule, both of which the engine derives from the position
// and the move history rather than from anything restated here. Correctness over
// speed: a solver is only worth anything if it never lies.
//
// Three-valued minimax with an explicit UNKNOWN:
//   • A returned WIN or LOSS or DRAW is *proven* (game-theoretic, under the caveats
//     below) — it does not depend on the node/time budget.
//   • UNKNOWN means "not determined within the budget", never a guess.
// So a solve that runs out of budget degrades to UNKNOWN at the frontier and
// propagates soundly: a node is only WIN if it has a genuinely winning child, only
// LOSS/DRAW if *every* child was resolved.
//
// Caveats (documented, not hidden):
//   • Graph-history interaction: memoization keys a position by board+turn (folded
//     over the board's 8-fold D4 symmetry), but threefold repetition depends on
//     the path taken to reach it. Two histories reaching the same board can differ
//     only in repetition outcomes — and under Copenhagen's `loss_for_repeater`
//     rule they can differ in *who* the repetition falls on, which is a sharper
//     version of the same hazard than either other game has. `memo:false` disables
//     the table for full rigor on small positions; the default `memo:true` accepts
//     the unsoundness to make endgame solves tractable.
//   • This does not make the opening solvable — see docs/solving.md for the
//     state-space and throughput numbers.

import { allMoves, applyMove, isGameOver, winnerOf } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import type { CopenhagenRuleSet as RuleSet } from "./variants";

export type Proven = "attackers" | "defenders" | "draw";
export type Value = Proven | "unknown";

export interface SolveOptions {
  /** Stop exploring once this many nodes have been visited (frontier ⇒ UNKNOWN). */
  maxNodes?: number;
  /** Wall-clock budget in ms. */
  deadlineMs?: number;
  /** Hard ply cap; beyond it the frontier is UNKNOWN. */
  maxDepth?: number;
  /** Transposition table across the D4-canonical position key. Default true. */
  memo?: boolean;
  now?: () => number;
}

export interface SolveResult {
  /** Proven game value from the *attackers'* perspective, or "unknown". */
  value: Value;
  /** Distance to mate in plies for a proven WIN/LOSS (0 for an already-terminal
   *  root, Infinity for draw/unknown). The solver plays the fastest win / slowest
   *  loss, so this is usable as book metadata. */
  dtm: number;
  /** The move that achieves `value` from the root (null at a terminal root). */
  bestMove: GameState["history"][number]["move"] | null;
  nodes: number;
  /** True if any branch was cut by the budget — i.e. an UNKNOWN anywhere. */
  budgetHit: boolean;
}

const PIECE_CHAR: Record<Piece, string> = { attacker: "a", defender: "d", king: "k" };

// ── D4 canonicalisation ───────────────────────────────────────────────────────
// The board, throne (centre) and the four corners are all symmetric under the
// dihedral group of the square, so a position and its 8 images are game-equivalent.
// Folding them into one key shrinks the search/table by up to 8×.
type Transform = (r: number, c: number, n: number) => [number, number];
const TRANSFORMS: Transform[] = [
  (r, c) => [r, c],
  (r, c, n) => [c, n - 1 - r],
  (r, c, n) => [n - 1 - r, n - 1 - c],
  (r, c, n) => [n - 1 - c, r],
  (r, c, n) => [r, n - 1 - c],
  (r, c, n) => [n - 1 - r, c],
  (r, c) => [c, r],
  (r, c, n) => [n - 1 - c, n - 1 - r],
];

function serialize(board: Board, t: Transform): string {
  const n = BOARD_SIZE;
  const out = new Array<string>(n * n).fill(".");
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (p === null) continue;
      const [nr, nc] = t(r, c, n);
      out[nr * n + nc] = PIECE_CHAR[p];
    }
  return out.join("");
}

/** A canonical string key for a position, minimal over the 8 D4 images. */
export function canonicalKey(state: GameState): string {
  let best: string | null = null;
  for (const t of TRANSFORMS) {
    const s = serialize(state.board, t);
    if (best === null || s < best) best = s;
  }
  return `${state.turn === "attackers" ? "A" : "D"}${best}`;
}

// ── Value algebra ─────────────────────────────────────────────────────────────
// Values are ABSOLUTE (who wins), not relative to the side to move — so no
// perspective-flipping is needed: the mover simply prefers the child whose
// absolute value is a win for *itself*.
const other = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");

function terminalValue(status: GameState["status"]): Proven {
  const w = winnerOf(status);
  return w === "attackers" ? "attackers" : w === "defenders" ? "defenders" : "draw";
}

interface Memo {
  value: Proven;
  dtm: number;
}

/**
 * Solve `root` under `rules`, bounded by `opts`. Sound: any non-"unknown" result
 * is a proof. Returns the game value from the attackers' perspective plus the
 * fastest-win / slowest-loss move and its distance to mate.
 */
export function solve(root: GameState, rules: RuleSet, opts: SolveOptions = {}): SolveResult {
  const maxNodes = opts.maxNodes ?? Infinity;
  // A finite default bounds recursion depth (JS call stack) and guarantees
  // termination; a single line can otherwise shuffle for thousands of plies.
  const maxDepth = opts.maxDepth ?? 512;
  const useMemo = opts.memo ?? true;
  const now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const deadline = opts.deadlineMs != null ? now() + opts.deadlineMs : Infinity;
  const table = new Map<string, Memo>();

  let nodes = 0;
  let budgetHit = false;

  // Returns [value, dtm] from the perspective of the side to move in `state`.
  function go(state: GameState, depth: number): [Value, number] {
    nodes++;
    if (isGameOver(state.status)) return [terminalValue(state.status), 0];
    if (nodes >= maxNodes || depth >= maxDepth || now() > deadline) {
      budgetHit = true;
      return ["unknown", Infinity];
    }

    const side = state.turn;
    const key = useMemo ? canonicalKey(state) : "";
    if (useMemo) {
      const hit = table.get(key);
      if (hit) return [hit.value, hit.dtm];
    }

    const moves = allMoves(state.board, side, rules);
    // Order immediate wins first so proofs terminate on the shortest line and the
    // budget is spent where it can still prove something.
    const children = moves.map((m) => applyMove(state, m, rules));
    const order = children
      .map((child, i) => ({ i, win: isGameOver(child.status) && winnerOf(child.status) === side }))
      .sort((a, b) => Number(b.win) - Number(a.win));

    const opp = other(side);
    let minWinDtm = Infinity; // fastest win for the side to move
    let maxLossDtm = 0; // slowest forced loss
    let sawDraw = false;
    let sawUnknown = false;

    for (const { i } of order) {
      const [cv, cdtm] = go(children[i], depth + 1); // absolute value of the child
      if (cv === side) {
        if (cdtm + 1 < minWinDtm) minWinDtm = cdtm + 1;
        if (minWinDtm === 1) break; // a 1-ply mate can't be beaten
      } else if (cv === "draw") {
        sawDraw = true;
      } else if (cv === "unknown") {
        sawUnknown = true;
      } else {
        // cv === opp: a forced loss down this line unless a better child exists.
        if (cdtm + 1 > maxLossDtm) maxLossDtm = cdtm + 1;
      }
    }

    let value: Value;
    let dtm: number;
    if (minWinDtm !== Infinity) {
      value = side; // mover can force a win
      dtm = minWinDtm;
    } else if (sawUnknown) {
      value = "unknown"; // can't prove draw/loss with a frontier still open
      dtm = Infinity;
    } else if (sawDraw) {
      value = "draw"; // best the mover can secure is a draw
      dtm = Infinity;
    } else {
      value = opp; // every reply resolved and every one loses
      dtm = maxLossDtm;
    }

    if (useMemo && value !== "unknown") table.set(key, { value: value as Proven, dtm });
    return [value, dtm];
  }

  if (isGameOver(root.status)) {
    return { value: terminalValue(root.status), dtm: 0, bestMove: null, nodes: 1, budgetHit: false };
  }

  // Root: evaluate each move so we can report the achieving move. Try moves that
  // win outright first, so a mate-in-1 is proven before any deep line is explored.
  const side = root.turn;
  const rootChildren = allMoves(root.board, side, rules).map((m) => ({ m, child: applyMove(root, m, rules) }));
  rootChildren.sort(
    (a, b) =>
      Number(isGameOver(b.child.status) && winnerOf(b.child.status) === side) -
      Number(isGameOver(a.child.status) && winnerOf(a.child.status) === side),
  );
  let best: { value: Value; dtm: number; move: GameState["history"][number]["move"] } | null = null;
  // Rank from the mover's perspective: own win > draw > unknown > own loss.
  const rank = (v: Value): number => (v === side ? 3 : v === "draw" ? 2 : v === "unknown" ? 1 : 0);

  for (const { m, child } of rootChildren) {
    const [v, cdtm] = go(child, 1); // absolute value of the resulting position
    const dtm = cdtm + 1;
    if (best === null) {
      best = { value: v, dtm, move: m };
    } else {
      const better =
        rank(v) > rank(best.value) ||
        // same class: prefer faster wins, slower losses
        (rank(v) === rank(best.value) && (v === side ? dtm < best.dtm : v === other(side) ? dtm > best.dtm : false));
      if (better) best = { value: v, dtm, move: m };
    }
    if (best.value === side && best.dtm === 1) break; // mate-in-1 for us; nothing beats it
  }

  return {
    value: best ? best.value : "unknown",
    dtm: best && best.value !== "draw" && best.value !== "unknown" ? best.dtm : Infinity,
    bestMove: best ? best.move : null,
    nodes,
    budgetHit,
  };
}
