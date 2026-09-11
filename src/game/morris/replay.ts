// ── Replay-and-validate (Morris) ──────────────────────────────────────────────
//
// The Morris twin of `../copenhagen/replay.ts`, and the same trust boundary:
// rebuilding a game from a *list of moves* is the one operation every
// serialisation path needs, and the move list is always untrusted input. So no
// path applies a stored board. They replay: start from `initialState(rules)` and,
// for every ply, look the move up in `allMoves()` for the side to move. If it is
// not there, the input is rejected at that ply with the reason why. Status, the
// removal, the repetition count and the no-mill counter are always recomputed by
// `applyMove`, never trusted from the input.
//
// Two things are this board's own, and both make the job *easier* than the tafl
// version rather than harder:
//
//   • **A ply carries its own removal.** A tafl ply is two squares and the engine
//     works out what fell; the file therefore has to cross-check a claimed
//     capture count (`capture_mismatch`) to catch a move list paired with the
//     wrong ruleset. Here the stone taken is part of the move, so a mismatched
//     ruleset shows up as an *illegal move* — the removal either is or is not in
//     `allMoves`. There is no `capture_mismatch` code, and nothing to claim.
//   • **`firstMove` is a rule here too, but the replay cannot police it.** An
//     empty Morris board is colour-blind and a placement names a point and
//     nothing else, so the same move list replays legally under either first
//     mover and simply produces the mirrored game — where a tafl list paired
//     with the wrong `firstMove` fails at ply 0 against an asymmetric setup. The
//     ruleset therefore has to travel *with* the moves (it does: the save stores
//     `variantId`, the file carries `[Variant]`/`[Rules]`), and nothing anywhere
//     may infer it from them. `replay.test.ts` pins the asymmetry.

import { allMoves, applyMove, initialState, isGameOver, pointName } from "./rules";
import { POINT_COUNT, type GameState, type Move, type MorrisStatus } from "./types";
import type { MorrisRuleSet } from "./variants";

/**
 * The terminal statuses **no move list can imply**. Resigning and flagging on
 * time are decisions *about* a game rather than moves within it, so a replay
 * always leaves those games "playing" — every other ending (a side below three
 * stones, a blocked side, a threefold repetition, the fifty-move draw) falls
 * straight out of the moves.
 */
export const EXTERNAL_STATUSES: ReadonlySet<MorrisStatus> = new Set<MorrisStatus>([
  "white_win_resign",
  "black_win_resign",
  "white_win_time",
  "black_win_time",
]);

export const isExternalStatus = (status: MorrisStatus): boolean => EXTERNAL_STATUSES.has(status);

/**
 * One ply as it arrives from untrusted input. Structurally a `Move`, but named
 * apart because it is *a claim about* a move: nothing here has been checked
 * against a position yet, and `findLegalMove` is what turns one into the
 * engine's own `Move` or into a refusal.
 */
export interface PlyInput {
  from: number | null;
  to: number;
  remove: number | null;
  remove2?: number | null;
}

export type ReplayErrorCode =
  /** No such move for the side to move in this position. */
  | "illegal_move"
  /** More plies after the game had already ended. */
  | "moves_after_end";

export interface ReplayError {
  code: ReplayErrorCode;
  /** 0-based index of the offending ply. */
  index: number;
  /** The ply as read, in point notation, for the error message. */
  ply: string;
}

export type ReplayResult =
  /** `states[k]` is the position after k plies; `states[0]` is the opening. */
  | { ok: true; states: GameState[] }
  | { ok: false; error: ReplayError };

/** Point notation for an error message. Not `moveName`, because that indexes
 *  `POINTS` directly and an out-of-range point from a hand-edited file would
 *  throw inside the error path; an unreadable index degrades to `?`. */
const plyText = (p: PlyInput): string => {
  const name = (i: number | null | undefined): string =>
    i === null || i === undefined
      ? ""
      : Number.isInteger(i) && i >= 0 && i < POINT_COUNT
        ? pointName(i)
        : "?";
  const head = p.from === null || p.from === undefined ? name(p.to) : `${name(p.from)}-${name(p.to)}`;
  const takes = [p.remove, p.remove2 ?? null].filter((r) => r !== null).map((r) => `x${name(r)}`);
  return head + takes.join("");
};

/**
 * Find the legal move matching this ply for the side to move, or null.
 *
 * Going through `allMoves` (rather than constructing a `Move`) is what makes the
 * replay rule-exact: the returned move is the engine's own, so a caller can
 * never smuggle in a placement, a step or — the case this board adds — a
 * *removal* the ruleset forbids. The removal is matched as strictly as the two
 * points: taking the wrong stone is a different turn, not the same turn
 * differently annotated.
 */
export function findLegalMove(
  state: GameState,
  move: PlyInput,
  rules: MorrisRuleSet,
): Move | null {
  const remove2 = move.remove2 ?? null;
  return (
    allMoves(state, rules).find(
      (m) =>
        m.from === move.from &&
        m.to === move.to &&
        m.remove === move.remove &&
        (m.remove2 ?? null) === remove2,
    ) ?? null
  );
}

/**
 * Replay `plies` from the opening position under `rules`, returning the full
 * state timeline or the first ply that would not replay legally.
 *
 * A game that ends before the list does is an error rather than a truncation:
 * silently dropping the tail would import a *different* game from the one in the
 * file, which is worse than refusing it.
 */
export function replayPlies(plies: PlyInput[], rules: MorrisRuleSet): ReplayResult {
  const states: GameState[] = [initialState(rules)];

  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i];
    const state = states[states.length - 1];

    if (isGameOver(state.status)) {
      return { ok: false, error: { code: "moves_after_end", index: i, ply: plyText(ply) } };
    }

    const move = findLegalMove(state, ply, rules);
    if (!move) {
      return { ok: false, error: { code: "illegal_move", index: i, ply: plyText(ply) } };
    }

    states.push(applyMove(state, move, rules));
  }

  return { ok: true, states };
}
