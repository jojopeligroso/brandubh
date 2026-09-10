// ── Bounded game solver for Nine Men's Morris ─────────────────────────────────
//
// A sound, *partial* solver: three-valued AND-OR search with an explicit UNKNOWN.
// The same shape as `../copenhagen/solver.ts` and its two siblings, for the same
// single job — being the **independent oracle** everything else here is checked
// against. A search and its own evaluation must never be each other's only
// witness, and an endgame *database* even less so: a retrograde table is built by
// a completely different algorithm from this one, so when the two agree on a
// position's value they are genuine corroboration.
//
// That is what it is for in this game specifically:
//
//   • `solver.test.ts` proves the small things the engine is asserted to find
//     (a win in one, a forced loss) by a method the engine shares no code with.
//   • The database generator's verification step (`scripts/morris-solve.ts`, when
//     it lands) cross-checks a random sample of each shipped table's entries
//     against this solver. Gasser ran a separate verifier program over his own
//     databases for exactly this reason; this is ours.
//
// What it cannot do: solve the game. Gasser needed ~10^10 database entries and an
// 18-ply alpha-beta search over the placing phase, with the 8-ply positions cached
// in an intermediate database, to prove the initial position a draw. This is a
// plain recursive prover with a node budget. It reaches near-terminal positions
// and thinned endgames, which is exactly, and only, what a soundness test needs.
//
// Soundness:
//   • A returned "white", "black" or "draw" is a *proof* under the ruleset handed
//     in — it does not depend on the budget.
//   • UNKNOWN means "not determined within the budget", never a guess. A node is
//     WIN only with a genuinely winning child, and LOSS/DRAW only when *every*
//     child resolved.
//
// Caveat, documented rather than hidden — graph-history interaction. The memo
// table keys a position by its stones (folded over the board's 16 symmetries),
// the side to move and both hands, but the shipped ruleset's threefold-repetition
// draw depends on the *path* taken to reach it, and `sinceMill` (the fifty-move
// counter) is not in the key either. Two histories reaching one position can
// therefore differ in their true value. `memo: false` disables the table for full
// rigour on small positions; the default `memo: true` accepts the unsoundness to
// make endgame proofs tractable — and `rules` with `repetitionResult: "none"` and
// `noMillDrawMoves: "none"` (the paper's own game) removes the hazard entirely,
// which is what the database generator uses.

import { allMoves, applyMove, isGameOver, masksOf, winnerOf } from "./rules";
import { canonical } from "./symmetry";
import type { GameState, Move, Side } from "./types";
import type { MorrisRuleSet } from "./variants";

/** A proven game value, **absolute** — who wins, not "good for the mover". */
export type Proven = Side | "draw";
export type Value = Proven | "unknown";

export interface SolveOptions {
  /** Stop exploring once this many nodes have been visited (frontier ⇒ UNKNOWN). */
  maxNodes?: number;
  /** Wall-clock budget in ms. */
  deadlineMs?: number;
  /** Hard ply cap; beyond it the frontier is UNKNOWN. */
  maxDepth?: number;
  /** Memoise on the canonical position key. Default true. */
  memo?: boolean;
  now?: () => number;
}

export interface SolveResult {
  /** The proven value, absolute ("white" / "black" / "draw"), or "unknown". */
  value: Value;
  /** Plies to the end of the game for a proven win or loss (0 for an
   *  already-terminal root, Infinity for a draw or unknown). The solver plays the
   *  fastest win and the slowest loss, so this is usable as book metadata. */
  dtm: number;
  /** The move that achieves `value` from the root (null at a terminal root). */
  bestMove: Move | null;
  nodes: number;
  /** True if any branch was cut by the budget — i.e. an UNKNOWN anywhere. */
  budgetHit: boolean;
}

/**
 * A canonical key for a position: its stones folded over the 16-fold symmetry
 * group, plus the side to move and both hands.
 *
 * Symmetry folding is worth more here than the tafl solvers get from their 8-fold
 * D4: sixteen images, and an *empty-ish* endgame board has a lot of them.
 */
export function canonicalKey(state: GameState): string {
  const { white, black } = masksOf(state.board);
  const c = canonical(white, black);
  return `${state.turn === "white" ? "W" : "B"}${c.white.toString(36)}.${c.black.toString(36)}.${state.inHand.white}${state.inHand.black}`;
}

const terminalValue = (state: GameState): Proven => {
  const w = winnerOf(state.status);
  return w === null || w === "draw" ? "draw" : w;
};

interface Memo {
  value: Proven;
  dtm: number;
}

/**
 * Solve `root` under `rules`, bounded by `opts`. Any non-"unknown" result is a
 * proof. Returns the absolute game value plus the fastest-win / slowest-loss move
 * and its distance to the end.
 */
export function solve(root: GameState, rules: MorrisRuleSet, opts: SolveOptions = {}): SolveResult {
  const maxNodes = opts.maxNodes ?? Infinity;
  // A finite default bounds the JS call stack and guarantees termination: a
  // Morris endgame with no fifty-move rule can shuffle for thousands of plies.
  const maxDepth = opts.maxDepth ?? 512;
  const useMemo = opts.memo ?? true;
  const now =
    opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const deadline = opts.deadlineMs != null ? now() + opts.deadlineMs : Infinity;
  const table = new Map<string, Memo>();

  let nodes = 0;
  let budgetHit = false;

  /** Absolute value of `state`, and the plies from here to the end. */
  function go(state: GameState, depth: number): [Value, number] {
    nodes++;
    if (isGameOver(state.status)) return [terminalValue(state), 0];
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

    const children = allMoves(state, rules).map((m) => applyMove(state, m, rules));
    // Immediate wins first, so a proof terminates on the shortest line and the
    // budget is spent where it can still prove something.
    const order = children
      .map((child, i) => ({ i, win: isGameOver(child.status) && winnerOf(child.status) === side }))
      .sort((a, b) => Number(b.win) - Number(a.win));

    let minWinDtm = Infinity; // fastest win for the side to move
    let maxLossDtm = 0; // slowest forced loss
    let sawDraw = false;
    let sawUnknown = false;

    for (const { i } of order) {
      const [cv, cdtm] = go(children[i], depth + 1);
      if (cv === side) {
        if (cdtm + 1 < minWinDtm) minWinDtm = cdtm + 1;
        if (minWinDtm === 1) break; // a one-ply win cannot be beaten
      } else if (cv === "draw") {
        sawDraw = true;
      } else if (cv === "unknown") {
        sawUnknown = true;
      } else {
        if (cdtm + 1 > maxLossDtm) maxLossDtm = cdtm + 1;
      }
    }

    let value: Value;
    let dtm: number;
    if (minWinDtm !== Infinity) {
      value = side;
      dtm = minWinDtm;
    } else if (sawUnknown) {
      value = "unknown"; // cannot prove draw or loss with a frontier still open
      dtm = Infinity;
    } else if (sawDraw) {
      value = "draw";
      dtm = Infinity;
    } else {
      value = side === "white" ? "black" : "white"; // every reply resolved, all lose
      dtm = maxLossDtm;
    }

    if (useMemo && value !== "unknown") table.set(key, { value, dtm });
    return [value, dtm];
  }

  if (isGameOver(root.status))
    return { value: terminalValue(root), dtm: 0, bestMove: null, nodes: 1, budgetHit: false };

  const side = root.turn;
  const foe: Side = side === "white" ? "black" : "white";
  const rootChildren = allMoves(root, rules).map((m) => ({ m, child: applyMove(root, m, rules) }));
  rootChildren.sort(
    (a, b) =>
      Number(isGameOver(b.child.status) && winnerOf(b.child.status) === side) -
      Number(isGameOver(a.child.status) && winnerOf(a.child.status) === side),
  );

  // Rank from the mover's point of view: own win > draw > unknown > own loss.
  const rank = (v: Value): number => (v === side ? 3 : v === "draw" ? 2 : v === "unknown" ? 1 : 0);
  let best: { value: Value; dtm: number; move: Move } | null = null;

  for (const { m, child } of rootChildren) {
    const [v, cdtm] = go(child, 1);
    const dtm = cdtm + 1;
    if (best === null) {
      best = { value: v, dtm, move: m };
    } else {
      const better =
        rank(v) > rank(best.value) ||
        (rank(v) === rank(best.value) &&
          (v === side ? dtm < best.dtm : v === foe ? dtm > best.dtm : false));
      if (better) best = { value: v, dtm, move: m };
    }
    if (best.value === side && best.dtm === 1) break; // nothing beats a win in one
  }

  return {
    value: best ? best.value : "unknown",
    dtm: best && best.value !== "draw" && best.value !== "unknown" ? best.dtm : Infinity,
    bestMove: best ? best.move : null,
    nodes,
    budgetHit,
  };
}
