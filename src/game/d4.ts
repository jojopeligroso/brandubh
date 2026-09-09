import { BOARD_SIZE } from "./types";
import { makeD4 } from "./symmetry/d4";

// ── D4 board symmetry ─────────────────────────────────────────────────────────
// The board, throne and corners are invariant under the 8 dihedral transforms of
// the square, so a position and its D4 image are game-identical. One shared
// definition of the group: the root-move folding in engine.ts, the opening-book
// loader (openingBook.ts) and the offline generator (scripts/genbook.ts) must
// all agree on it, or a folded book entry would unfold to the wrong squares.
//
// The arithmetic itself lives in `symmetry/d4.ts` (ADR-0007, "what this
// defers", item 1) — this file is a thin re-export bound to Brandubh's own
// `BOARD_SIZE`, so every existing import of `./d4` keeps working unchanged.
const d4 = makeD4(BOARD_SIZE);

export const SYM = d4.SYM;
export const transformHash = d4.transformHash;
export const transformMove = d4.transformMove;
export const canonicalHash = d4.canonicalHash;
