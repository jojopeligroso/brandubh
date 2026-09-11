// ── Core domain types for Nine Men's Morris ───────────────────────────────────
//
// The fourth boardgame in the project, and the first that is not a tafl game at
// all. ADR-0007 warned that the *shell* is what gets worse with every board, and
// this file is the first place that shows: unlike `../tablut/types.ts` and
// `../copenhagen/types.ts`, which re-export the shared tafl vocabulary and
// change only the geometry, nothing in `../types.ts` survives the crossing.
// There is no king, no throne, no attacker and no defender here; there are two
// colours, stones in hand, a placing phase and a mill. So the vocabulary forks
// with the rules, and the *shell* pieces (PlayerBar, GameToolbar, clock, records)
// are what get reused instead.
//
// What this file deliberately does not do:
//
//   • It does not model the board as a grid. A Morris board is a graph of 24
//     points, and every rule (adjacency, mills, flying) is stated over that
//     graph. The 7×7 grid exists only so the board can be *drawn* and a point
//     can be *named* (`a7`…`g1`), and it lives in `rules.ts`'s `POINTS` table,
//     not in the state.
//   • It does not split the turn into "move" and "then remove". A mill's removal
//     is part of the turn that closed it, so `Move` carries it. That keeps
//     `applyMove` atomic, which is what lets the search treat one move as one
//     ply and skip quiescence entirely — see `engine.ts`.
//   • It keeps no derived fields. `Phase` is a function of the two hands and
//     nothing else (`phaseOf`), so it is never stored and can never disagree
//     with the hands.

/** The two players. White places first under the shipped ruleset. */
export type Side = "white" | "black";

/** What stands on a point: nothing, a white stone, or a black stone. */
export type Cell = 0 | 1 | 2;

/** The cell value for a side's own stones. */
export const cellOf = (side: Side): Cell => (side === "white" ? 1 : 2);

/** The other side. */
export const other = (side: Side): Side => (side === "white" ? "black" : "white");

/**
 * The board: 24 points, indexed `ring*8 + k` with ring 0 = outer and `k` running
 * clockwise from each ring's top-left corner. The full table, with names, is
 * `POINTS` in `rules.ts`; every module in this directory uses that one indexing
 * and nothing else.
 */
export type Board = readonly Cell[];

/** How many points a Morris board has. */
export const POINT_COUNT = 24;

/** Stones each player starts with, in hand. */
export const STONES_PER_SIDE = 9;

/** The side of the 7×7 lattice the 24 points are drawn on (naming only). */
export const GRID_SIZE = 7;

/** File letters for point names, `a` at grid column 0. */
export const FILES = "abcdefg";

/**
 * One complete turn.
 *
 * `from === null` is a placement (placing phase); otherwise the stone at `from`
 * moves to `to`. `remove` is the opponent stone taken because the move closed a
 * mill, and is `null` whenever no mill was closed.
 *
 * `remove2` exists only for the non-Gasser `doubleMillRemoves: "two"` reading and
 * is absent (or null) under every shipped preset — see `variants.ts`. Keeping it
 * on the same object rather than inventing a second "removal move" is what keeps
 * one turn equal to one ply everywhere else in the codebase.
 */
export interface Move {
  from: number | null;
  to: number;
  remove: number | null;
  remove2?: number | null;
}

/** Placing while either player still has stones in hand; moving once both hands
 *  are empty. Derived — see `phaseOf` in `rules.ts`. */
export type Phase = "placing" | "moving";

/**
 * Every way a game can stand. The `_stones` endings are the "fewer than three
 * stones" loss and the `_blocked` endings the "cannot move" loss; `resign` and
 * `time` come from outside the rules, exactly as they do in the tafl games.
 *
 * Both draws are *practical* terminations the shipped preset adds, and neither is
 * in Gasser's paper — see `variants.ts`.
 */
export type MorrisStatus =
  | "playing"
  | "white_win_stones"
  | "black_win_stones"
  | "white_win_blocked"
  | "black_win_blocked"
  | "white_win_resign"
  | "black_win_resign"
  | "white_win_time"
  | "black_win_time"
  | "draw_repetition"
  | "draw_no_mill";

/**
 * One played turn, kept for the move log, undo, and repetition detection.
 *
 * `hashBefore` is `hashState` of the position *before* the move, which is what
 * makes threefold detection a scan of this list rather than a replay.
 * `formedMill` records that the turn closed a mill even in the rare case where
 * no opponent stone could legally be taken.
 */
export interface HistoryEntry {
  move: Move;
  sideThatMoved: Side;
  hashBefore: string;
  formedMill: boolean;
}

/**
 * A whole game position. Immutable: `applyMove` returns a new one.
 *
 * `sinceMill` counts plies since a mill was last closed, and runs only in the
 * moving phase — it is the counter behind the 50-move draw, and the placing
 * phase is bounded at 18 plies anyway.
 */
export interface GameState {
  board: Board;
  turn: Side;
  inHand: Record<Side, number>;
  status: MorrisStatus;
  history: readonly HistoryEntry[];
  sinceMill: number;
}

/** Which seat the human takes. The tafl screens call these
 *  attackers/defenders/hotseat; the colours are this game's own vocabulary, and
 *  the screen maps them onto the shared seat helpers rather than the reverse. */
export type PlayMode = "white" | "black" | "hotseat";
