// ── Board orientation (view only) ────────────────────────────────────────────
//
// Two independent mirrors, not one rotation. `flipH` mirrors the board
// east–west (left/right swap, columns reverse); `flipV` mirrors it north–south
// (top/bottom swap, rows reverse). Each is a plain single-axis reflection —
// turning both on at once reproduces the look of a 180° rotation, but either
// can be used on its own. Nothing here touches the game: `game/sides.ts`
// explains why orientation never followed the side you play (Brandubh's
// opening is D4-symmetric, so there is no near half and far half to swap),
// and that stays true — this is a preference about which way up you like to
// look at the board, not a fact about the position.
//
// Every consumer that draws *on* the board must map through this module rather
// than reading `row`/`col` straight: the board itself, square highlighting, and
// the best-move arrow overlay (Session 7a). One mapping means they cannot drift
// out of alignment with each other.

import { BOARD_SIZE, type Move, type Square } from "./game/types";

/** East–west flip (mirrors columns; which side is drawn left vs right). */
export const BOARD_FLIP_H_KEY = "brandubh.boardFlipped";
/** North–south flip (mirrors rows; which side is drawn top vs bottom). */
export const BOARD_FLIP_V_KEY = "brandubh.boardFlippedV";

/**
 * Map one axis index between board space and view space.
 *
 * This is an *involution* — applying it twice returns the original index — so
 * the same function serves both directions.
 */
export const viewIndex = (i: number, flipped: boolean): number =>
  flipped ? BOARD_SIZE - 1 - i : i;

/** Where a board square is drawn. */
export const toView = (sq: Square, flipH: boolean, flipV: boolean): Square => ({
  row: viewIndex(sq.row, flipV),
  col: viewIndex(sq.col, flipH),
});

/** Which board square a drawn cell stands for — what a click resolves to. */
export const fromView = (sq: Square, flipH: boolean, flipV: boolean): Square => ({
  row: viewIndex(sq.row, flipV),
  col: viewIndex(sq.col, flipH),
});

/**
 * The centre of a square as a fraction (0–1) of the board box, in view space:
 * `x` grows rightwards, `y` downwards, matching CSS and SVG user units.
 *
 * This is the hook the best-move arrow overlay (7a) draws from. An arrow that
 * takes its endpoints from here is orientation-aware for free, and can never
 * point at a different square than the one the board is showing.
 */
export function viewCenter(sq: Square, flipH: boolean, flipV: boolean): { x: number; y: number } {
  const v = toView(sq, flipH, flipV);
  return { x: (v.col + 0.5) / BOARD_SIZE, y: (v.row + 0.5) / BOARD_SIZE };
}

/** Both endpoints of a move in view space, ready to be drawn as an arrow. */
export function viewArrow(
  move: Move,
  flipH: boolean,
  flipV: boolean,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  return {
    from: viewCenter(move.from, flipH, flipV),
    to: viewCenter(move.to, flipH, flipV),
  };
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
export const isLabelledFileRow = (row: number, flipV: boolean): boolean =>
  viewIndex(row, flipV) === BOARD_SIZE - 1;

/** True when this board column is drawn along the left edge, so it carries the ranks. */
export const isLabelledRankCol = (col: number, flipH: boolean): boolean =>
  viewIndex(col, flipH) === 0;
