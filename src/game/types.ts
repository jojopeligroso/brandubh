// ── Core domain types for Brandubh ───────────────────────────────────────────

/** The 7x7 board is indexed [row][col], row 0 = top, col 0 = left. */
export const BOARD_SIZE = 7;

/** A piece occupying a square. `null` = empty. */
export type Piece = "attacker" | "defender" | "king";

/** Which army is to move / owns a piece. */
export type Side = "attackers" | "defenders";

/**
 * Who is behind each army: the human takes the named side against the
 * computer, or "hotseat" for two people sharing the board.
 */
export type PlayMode = Side | "hotseat";

export interface Square {
  row: number;
  col: number;
}

/** A board is a flat 7x7 grid of pieces or empties. */
export type Board = (Piece | null)[][];

export interface Move {
  from: Square;
  to: Square;
  /** Squares that were captured as a result of this move (for animation/history). */
  captures?: Square[];
}

export type GameStatus =
  | "playing"
  | "defenders_win_escape"
  | "attackers_win_capture"
  | "attackers_win_encirclement"
  | "attackers_win_no_moves"
  | "attackers_win_repetition"
  | "attackers_win_resign"
  | "attackers_win_time"
  | "defenders_win_no_moves"
  | "defenders_win_resign"
  | "defenders_win_time"
  | "draw_repetition";

export interface GameState {
  board: Board;
  turn: Side;
  status: GameStatus;
  moveCount: number;
  /** Full move history for undo + repetition detection + notation. */
  history: HistoryEntry[];
  /** How many defender/attacker soldiers have been captured (king excluded). */
  captured: { attackers: number; defenders: number };
  /**
   * Plies since the last capture, carried so the repetition check can be
   * skipped when repetition is impossible — see `computeStatus` in `rules.ts`.
   * Optional: a hand-built state may omit it, and the fallback there assumes
   * no captures at all, which only ever makes the check run *more* often.
   */
  sinceCapture?: number;
}

export interface HistoryEntry {
  move: Move;
  /** Board hash *before* the move — used for threefold repetition. */
  hashBefore: string;
  sideThatMoved: Side;
}
