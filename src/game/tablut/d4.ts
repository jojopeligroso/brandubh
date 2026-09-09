import { BOARD_SIZE } from "./types";
import { makeD4 } from "../symmetry/d4";

// ── D4 board symmetry (Tablut) ────────────────────────────────────────────────
// The board, throne and corners are invariant under the 8 dihedral transforms of
// the square, so a position and its D4 image are game-identical. That is as true
// of a 9×9 board as a 7×7 one, and Tablut's opening position has the full group:
// it is symmetric under a quarter turn (asserted in rules.test.ts) as well as
// both reflections.
//
// The arithmetic itself lives in `../symmetry/d4.ts` (ADR-0007, "what this
// defers", item 1) — this file is a thin re-export bound to Tablut's own
// `BOARD_SIZE`, so every existing import of `./d4` keeps working unchanged.
// What matters is that the root-move folding, the opening-book loader and the
// offline generator on *this* side all read the same group, or a folded book
// entry would unfold to the wrong squares.
const d4 = makeD4(BOARD_SIZE);

export const SYM = d4.SYM;
export const transformHash = d4.transformHash;
export const transformMove = d4.transformMove;
export const canonicalHash = d4.canonicalHash;
