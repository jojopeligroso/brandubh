// ── Board orientation (view only) ────────────────────────────────────────────
//
// A flipped board is a 180° rotation of the *view*: both axes reverse together,
// so the square that was bottom-left is drawn top-right. Nothing here touches
// the game: `game/sides.ts` explains why orientation never followed the side
// you play (Brandubh's opening is D4-symmetric, so there is no near half and
// far half to swap), and that stays true — this is a preference about which way
// up you like to look at the board, not a fact about the position.
//
// Every consumer that draws *on* the board must map through this module rather
// than reading `row`/`col` straight: the board itself, square highlighting, and
// the best-move arrow overlay (Session 7a). One mapping means they cannot drift
// out of alignment with each other.

import { BOARD_SIZE, type Move, type Square } from "./game/types";

export const BOARD_FLIP_KEY = "brandubh.boardFlipped";

/**
 * Map one axis index between board space and view space.
 *
 * This is an *involution* — applying it twice returns the original index — so
 * the same function serves both directions. `toView` and `fromView` below are
 * therefore identical in implementation and differ only in name; both exist so
 * a call site says which way it means.
 */
export const viewIndex = (i: number, flipped: boolean): number =>
  flipped ? BOARD_SIZE - 1 - i : i;

/** Where a board square is drawn. */
export const toView = (sq: Square, flipped: boolean): Square => ({
  row: viewIndex(sq.row, flipped),
  col: viewIndex(sq.col, flipped),
});

/** Which board square a drawn cell stands for — what a click resolves to. */
export const fromView = (sq: Square, flipped: boolean): Square => ({
  row: viewIndex(sq.row, flipped),
  col: viewIndex(sq.col, flipped),
});

/**
 * The centre of a square as a fraction (0–1) of the board box, in view space:
 * `x` grows rightwards, `y` downwards, matching CSS and SVG user units.
 *
 * This is the hook the best-move arrow overlay (7a) draws from. An arrow that
 * takes its endpoints from here is orientation-aware for free, and can never
 * point at a different square than the one the board is showing.
 */
export function viewCenter(sq: Square, flipped: boolean): { x: number; y: number } {
  const v = toView(sq, flipped);
  return { x: (v.col + 0.5) / BOARD_SIZE, y: (v.row + 0.5) / BOARD_SIZE };
}

/** Both endpoints of a move in view space, ready to be drawn as an arrow. */
export function viewArrow(
  move: Move,
  flipped: boolean,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  return { from: viewCenter(move.from, flipped), to: viewCenter(move.to, flipped) };
}

// ── Coordinate labels ────────────────────────────────────────────────────────
// The labels are facts about the *board*, not the view: d4 is the throne from
// either chair. Flipping moves which drawn edge carries them — files sit along
// the visually bottom row, ranks up the visually left column — but never
// renames a square.

const FILES = "abcdefg";

/** Chessboard-style name of a square: files a–g across, ranks 1–7 up the side. */
export const squareName = (sq: Square): string =>
  `${FILES[sq.col]}${BOARD_SIZE - sq.row}`;

/** The file letter for a board column. */
export const fileLabel = (col: number): string => FILES[col];

/** The rank number for a board row. */
export const rankLabel = (row: number): string => String(BOARD_SIZE - row);

/** True when this board row is drawn along the bottom edge, so it carries the files. */
export const isLabelledFileRow = (row: number, flipped: boolean): boolean =>
  viewIndex(row, flipped) === BOARD_SIZE - 1;

/** True when this board column is drawn along the left edge, so it carries the ranks. */
export const isLabelledRankCol = (col: number, flipped: boolean): boolean =>
  viewIndex(col, flipped) === 0;
