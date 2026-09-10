// ── Perft helper for the Morris move generator ────────────────────────────────
//
// "Perft" (performance test, borrowed from chess engine testing): count the leaf
// positions of the full legal-move tree, exactly `depth` plies deep, with no
// pruning and no shortcuts. It pins what `allMoves`/`applyMove` actually produce,
// which is the one thing in this directory that a later refactor could break
// silently — a move-generation bug does not crash, it just plays a different game.
//
// Why this is a separate module rather than a use of `../perft.ts`, which already
// serves all three tafl boards: that helper is generic over
// `(board, turn, rules) => Move[]`, and Morris's `allMoves` takes the whole state
// because a legal turn depends on the hands (placing vs. moving) and on the stone
// count (flying), not only on the board. Generalising the shared helper to take a
// state would change three call sites in three games to serve a fourth; a
// fourteen-line function here changes none of them. If a fifth board arrives with
// a state-shaped move generator, that is the moment to merge the two.
//
// A position whose status is already decided contributes exactly one leaf and is
// never expanded: an ended game has no more plies to play out.

import { allMoves, applyMove, isGameOver } from "./rules";
import type { GameState, Move } from "./types";
import type { MorrisRuleSet } from "./variants";

export function perft(state: GameState, rules: MorrisRuleSet, depth: number): number {
  if (isGameOver(state.status)) return 1;
  if (depth === 0) return 1;
  let total = 0;
  for (const move of allMoves(state, rules)) {
    total += perft(applyMove(state, move, rules), rules, depth - 1);
  }
  return total;
}

/** Perft split by first move — the standard way to localise a move-generation
 *  disagreement to one branch instead of bisecting the whole tree by hand. */
export function perftDivide(
  state: GameState,
  rules: MorrisRuleSet,
  depth: number,
): Array<{ move: Move; nodes: number }> {
  return allMoves(state, rules).map((move) => ({
    move,
    nodes: perft(applyMove(state, move, rules), rules, depth - 1),
  }));
}
