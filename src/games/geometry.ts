// ── Board geometry: what a board needs to draw itself ─────────────────────────
//
// `docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md` says
// the boardgames share "the contract the shell consumes … a registry at the shell
// boundary, not a shared rules core". This is the view half of that contract, and
// it is deliberately the smallest thing that lets `Board.tsx` draw either game:
// how many squares, what they are called, which of them are special, and which
// ones a selected piece may move to.
//
// It is *not* a rules abstraction. There is no capture, no win condition, no
// turn — nothing that would tempt a future reader to merge the two rule modules
// the ADR keeps apart. Everything here is answerable by looking at the board.
//
// Two properties worth stating, because both are load-bearing:
//
//   • **It holds no ruleset.** Legal moves arrive as a separate `legalFrom`
//     closure on `Board` instead, built by whichever game module already has its
//     own ruleset. That is what lets one component serve two games whose ruleset
//     *types* are unrelated, without a partly-filled geometry object pretending
//     to know how pieces move.
//   • **`isSpecialCorner` asks a rules question, not a geometric one.** Every
//     square board has four corners; whether they are *marked* — the emblem, the
//     `.corner` class, the "only the king may stand here" reading — depends on the
//     variant. A baseline Tablut corner is ordinary ground, so it must draw as
//     ordinary ground.

import { isCorner, isThrone, squareName } from "../game/rules";
import { BOARD_SIZE, type Board, type Square } from "../game/types";

export interface BoardGeometry {
  /** Squares per side. Sets the CSS grid and scales the best-move arrow. */
  size: number;
  /** File letters, `a` at column 0. */
  files: string;
  /** The board's accessible name, e.g. "Brandubh board". */
  label: string;
  /** The centre square, drawn as special on every board and in every variant. */
  isThrone(r: number, c: number): boolean;
  /**
   * True when this corner is a *marked* square under the live ruleset — hostile,
   * restricted, or the king's goal. False for an ordinary corner, which is what
   * a baseline Tablut corner is.
   */
  isSpecialCorner(r: number, c: number): boolean;
  /** The square's name, for the accessible label. */
  squareName(sq: Square): string;
}

/** Where a piece on (r,c) may legally go. Supplied by the game module, which
 *  closes over its own ruleset — see the note above. */
export type LegalFrom = (board: Board, r: number, c: number) => Square[];

/**
 * Brandubh's geometry, and `Board`'s default.
 *
 * A constant rather than a factory because none of it varies by ruleset in a way
 * the *view* can see: the throne and all four corners are special under both
 * shipped presets. Making this the default is what kept adding a second board
 * from touching App, TutorialPlayer or BankPuzzlePlayer at all.
 */
export const BRANDUBH_GEOMETRY: BoardGeometry = {
  size: BOARD_SIZE,
  files: "abcdefg",
  label: "Brandubh board",
  isThrone,
  isSpecialCorner: isCorner,
  squareName,
};
