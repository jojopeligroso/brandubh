// ── Core domain types for Copenhagen Hnefatafl ───────────────────────────────
//
// The third tafl boardgame in the project, and the largest: 11×11, twenty-four
// attackers against a king and twelve defenders, corner escape. See
// docs/adr/0007-copenhagen-forks-a-third-time-and-defers-the-shared-core.md for why this is another fork
// rather than the shared core ADR-0006 said a third game would justify.
//
// As in `../tablut/types.ts`, the *vocabulary* is not forked. A piece, a side, a
// square, a move, a game state and a game status say exactly the same things on
// an 11×11 board as on a 7×7 one — none of them mentions a size — so they come
// from the shared module. Only the geometry is Copenhagen's own.

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

/** The 11×11 board is indexed [row][col], row 0 = top, col 0 = left. */
export const BOARD_SIZE = 11;

/** The last valid row/column index — the board's edge. */
export const LAST = BOARD_SIZE - 1;

/**
 * File letters, `a` at col 0. Ranks count up from the bottom, so rank =
 * 11 - row, giving `a1`–`k11` and the throne at `f6`.
 *
 * `i` is **not** skipped. Some board games drop it to avoid confusion with `1`
 * (shogi and xiangqi transliterations, some chess variants), but tafl notation
 * on aagenielsen.dk runs a–k unbroken, and an exported game has to read the way
 * a hnefatafl player expects.
 */
export const FILES = "abcdefghijk";
