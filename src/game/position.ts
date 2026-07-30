// ── Position setup (FEN-equivalent) ──────────────────────────────────────────
//
// A one-line text encoding of a board plus the side to move, so a position can
// be copied out of one place and pasted into another for analysis. The sibling
// format in `gameFile.ts` encodes a whole *game* (a move list replayed from the
// opening); this encodes a single *position*, which is the thing that format
// deliberately cannot express.
//
// ## Why this never touches persistence or export
//
// `CLAUDE.md`'s replay-from-opening invariant: `persist.ts` and `gameFile.ts`
// replay move lists from `initialState()` only, and custom starting positions
// must not be threaded through them. A pasted position therefore lives exactly
// where the tutorial set-plays live — in component state — and reaches the board
// only as the *root of an analysis tree* (`moveTree.ts` roots at any GameState,
// so this needs nothing new from it). Analysis has never written to storage, so
// the invariant holds without a guard of its own.
//
// The one place it could leak is game *export*, which would happily write out a
// move list that replays from the opening into a completely different game.
// `App.tsx` blocks export while a pasted position is loaded, for that reason.
//
// ## The format
//
//     A2A2A/3D3/...  a
//
// Seven ranks, top (rank 7) first, separated by `/`, then the side to move.
// Within a rank: `A` raider, `D` defender, `K` king, and a digit for that many
// consecutive empty squares. Deliberately FEN-shaped — anyone who has seen a
// chess position pasted into a chat window can read it — but with tafl's own
// three piece kinds and no castling/en-passant baggage to carry.

import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import { isCorner, isRestricted, isThrone } from "./engine";

const PIECE_TO_CHAR: Record<Piece, string> = {
  attacker: "A",
  defender: "D",
  king: "K",
};
const CHAR_TO_PIECE: Record<string, Piece> = {
  A: "attacker",
  D: "defender",
  K: "king",
};

export type PositionErrorCode =
  /** Not seven ranks separated by `/`. */
  | "bad_rank_count"
  /** A rank that does not add up to seven squares. */
  | "bad_rank_width"
  /** A character that is not a piece letter or a digit. */
  | "bad_symbol"
  /** The side-to-move token is missing or unreadable. */
  | "bad_side"
  /** No king, or more than one. */
  | "king_count"
  /** A soldier standing on a corner or the throne, which only the king may occupy. */
  | "restricted_square"
  /** Nothing that looked like a position at all. */
  | "empty";

export interface PositionError {
  code: PositionErrorCode;
  /** 1-based rank (7 down to 1 as written) when the problem is locatable. */
  rank?: number;
  /** The offending text, quoted back to the user. */
  token?: string;
  /** English detail, appended after the localized headline. */
  detail: string;
}

export type PositionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: PositionError };

/** The side-to-move token, kept to one letter so the whole thing stays one line. */
const SIDE_TO_CHAR: Record<Side, string> = { attackers: "a", defenders: "d" };

/**
 * Write a position out. Only the board and the side to move: a position has no
 * history by definition, and inventing one would be a lie the importer would
 * then have to believe.
 */
export function encodePosition(state: GameState): string {
  const ranks: string[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let out = "";
    let empties = 0;
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = state.board[r][c];
      if (piece === null) {
        empties++;
        continue;
      }
      if (empties) {
        out += String(empties);
        empties = 0;
      }
      out += PIECE_TO_CHAR[piece];
    }
    if (empties) out += String(empties);
    ranks.push(out);
  }
  return `${ranks.join("/")} ${SIDE_TO_CHAR[state.turn]}`;
}

/**
 * Read a position back, or say exactly why it cannot be read.
 *
 * Tolerant about whitespace and letter case, strict about everything that would
 * put an unplayable board on screen. The checks are not decoration: a board with
 * two kings or none breaks `findKing`, and a soldier sitting on a corner is a
 * position the rules could never have produced, so the engine's own invariants
 * would be false from move one.
 */
export function parsePosition(text: string): PositionResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: { code: "empty", detail: "the text was empty." } };
  }

  const parts = trimmed.split(/\s+/);
  const boardPart = parts[0];
  const sidePart = (parts[1] ?? "").toLowerCase();

  const rankStrings = boardPart.split("/");
  if (rankStrings.length !== BOARD_SIZE) {
    return {
      ok: false,
      error: {
        code: "bad_rank_count",
        token: boardPart,
        detail: `expected ${BOARD_SIZE} ranks separated by "/", found ${rankStrings.length}.`,
      },
    };
  }

  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  );

  for (let r = 0; r < BOARD_SIZE; r++) {
    const rankLabel = BOARD_SIZE - r; // as written: rank 7 first
    let c = 0;
    for (const ch of rankStrings[r]) {
      if (ch >= "1" && ch <= "9") {
        c += Number(ch);
        continue;
      }
      const piece = CHAR_TO_PIECE[ch.toUpperCase()];
      if (!piece) {
        return {
          ok: false,
          error: {
            code: "bad_symbol",
            rank: rankLabel,
            token: ch,
            detail: `"${ch}" is not a piece (A, D, K) or a number of empty squares.`,
          },
        };
      }
      if (c >= BOARD_SIZE) {
        c++; // overflow, reported below
        break;
      }
      board[r][c] = piece;
      c++;
    }
    if (c !== BOARD_SIZE) {
      return {
        ok: false,
        error: {
          code: "bad_rank_width",
          rank: rankLabel,
          token: rankStrings[r],
          detail: `rank ${rankLabel} describes ${c} squares, not ${BOARD_SIZE}.`,
        },
      };
    }
  }

  let turn: Side;
  if (sidePart === "a" || sidePart === "attackers") turn = "attackers";
  else if (sidePart === "d" || sidePart === "defenders") turn = "defenders";
  else {
    return {
      ok: false,
      error: {
        code: "bad_side",
        token: parts[1] ?? "",
        detail: 'the side to move must be "a" (raiders) or "d" (king’s side).',
      },
    };
  }

  const structural = validateBoard(board);
  if (structural) return { ok: false, error: structural };

  return { ok: true, state: stateFromBoard(board, turn) };
}

/**
 * The checks that decide whether a board is playable at all, independent of how
 * it was written down. Returns null when the board is sound.
 */
export function validateBoard(board: Board): PositionError | null {
  // The king count is checked first, deliberately. A board can be wrong in both
  // ways at once, and "there is no king" is the more fundamental thing to be
  // told: it is a fact about the whole position, where a misplaced soldier is a
  // fact about one square. Reporting them in the other order would bury the
  // headline under a detail.
  let kings = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === "king") kings++;
    }
  }
  if (kings !== 1) {
    return {
      code: "king_count",
      detail:
        kings === 0 ? "there is no king on the board." : `there are ${kings} kings on the board.`,
    };
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      // Corners and the throne are the king's alone — a soldier standing on one
      // is a position no sequence of legal moves could have reached.
      if (piece !== null && piece !== "king" && isRestricted(r, c)) {
        return {
          code: "restricted_square",
          rank: BOARD_SIZE - r,
          detail: `${piece === "attacker" ? "a raider" : "a defender"} stands on ${
            isThrone(r, c) ? "the throne" : "a corner"
          }, which only the king may occupy.`,
        };
      }
    }
  }
  return null;
}

/**
 * Wrap a board as a position to analyse from.
 *
 * The history is empty and the move count is zero because that is the literal
 * truth: this position has no past. Repetition detection therefore starts fresh
 * from here, which is the honest behaviour — the moves that led here are not
 * known, so they cannot be counted.
 */
export function stateFromBoard(board: Board, turn: Side): GameState {
  return {
    board: board.map((row) => row.slice()),
    turn,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
  };
}

/** True when a board is one the king has already escaped from. Used to warn
 *  rather than reject: a finished position is still a legal thing to look at. */
export function kingIsHome(board: Board): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === "king" && isCorner(r, c)) return true;
    }
  }
  return false;
}
