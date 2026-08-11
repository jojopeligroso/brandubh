// ── Core domain types for Tablut ─────────────────────────────────────────────
//
// Tablut is a *Boardgame*, not a Brandubh ruleset: 9×9 instead of 7×7, and the
// king escapes to any edge square rather than to a corner. See
// docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md for
// why that is a fork rather than a parameter.
//
// What Tablut does *not* fork is the vocabulary. A piece, a side, a square, a
// move, a game state and a game status say exactly the same things on either
// board — none of them mentions a size — so they are imported from the shared
// module rather than restated here. Only the geometry is Tablut's own.

export type {
  Piece,
  Side,
  PlayMode,
  Square,
  Board,
  Move,
  GameStatus,
  GameState,
  HistoryEntry,
} from "../types";

/** The 9×9 board is indexed [row][col], row 0 = top, col 0 = left. */
export const BOARD_SIZE = 9;

/** The last valid row/column index — the board's edge. */
export const LAST = BOARD_SIZE - 1;

/** File letters, `a` at col 0. Ranks count up from the bottom, so rank = 9 - row. */
export const FILES = "abcdefghi";
