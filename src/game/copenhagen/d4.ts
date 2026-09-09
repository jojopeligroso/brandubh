import { BOARD_SIZE } from "./types";
import { makeD4 } from "../symmetry/d4";

// ── D4 board symmetry (Copenhagen) ───────────────────────────────────────────
// The board, throne and corners are invariant under the 8 dihedral transforms of
// the square, so a position and its D4 image are game-identical. That holds on
// 11×11 exactly as it does on 9×9 and 7×7, and Copenhagen's opening position has
// the full group: the diamond of defenders and the four groups of six attackers
// are each symmetric under a quarter turn (asserted in rules.test.ts) as well as
// both reflections.
//
// The arithmetic itself lives in `../symmetry/d4.ts` (ADR-0007, "what this
// defers", item 1, done — see the ADR for the commit). This file is a thin
// re-export bound to Copenhagen's own `BOARD_SIZE`, so every existing import of
// `./d4` keeps working unchanged. What must not drift is that root-move folding
// and any future book loader on *this* side read the same group, or a folded
// entry would unfold to the wrong squares.
const d4 = makeD4(BOARD_SIZE);

export const SYM = d4.SYM;
export const transformHash = d4.transformHash;
export const transformMove = d4.transformMove;
export const canonicalHash = d4.canonicalHash;
