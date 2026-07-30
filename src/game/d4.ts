import { BOARD_SIZE } from "./types";
import type { Move } from "./types";

// ── D4 board symmetry ─────────────────────────────────────────────────────────
// The board, throne and corners are invariant under the 8 dihedral transforms of
// the square, so a position and its D4 image are game-identical. One shared
// definition of the group: the root-move folding in ai.ts, the opening-book
// loader (openingBook.ts) and the offline generator (scripts/genbook.ts) must
// all agree on it, or a folded book entry would unfold to the wrong squares.
const N = BOARD_SIZE;

/** The 8 transforms: identity, rotations, reflections. Each maps (r,c) to its
 *  image. Index 0 is always the identity. */
export const SYM: ReadonlyArray<(r: number, c: number) => [number, number]> = [
  (r, c) => [r, c],
  (r, c) => [c, N - 1 - r],
  (r, c) => [N - 1 - r, N - 1 - c],
  (r, c) => [N - 1 - c, r],
  (r, c) => [r, N - 1 - c],
  (r, c) => [N - 1 - r, c],
  (r, c) => [c, r],
  (r, c) => [N - 1 - c, N - 1 - r],
];

/** Apply a transform to a `hashBoard`-format string (turn char + N² board
 *  glyphs, row-major). The turn is symmetric, so it rides along unchanged. */
export function transformHash(hash: string, t: (r: number, c: number) => [number, number]): string {
  const out = new Array<string>(N * N);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const [nr, nc] = t(r, c);
      out[nr * N + nc] = hash[1 + r * N + c];
    }
  return hash[0] + out.join("");
}

/** Apply a transform to a move's from/to squares. */
export function transformMove(m: Move, t: (r: number, c: number) => [number, number]): Move {
  const [fr, fc] = t(m.from.row, m.from.col);
  const [tr, tc] = t(m.to.row, m.to.col);
  return { from: { row: fr, col: fc }, to: { row: tr, col: tc } };
}

/** The lexicographically smallest D4 image of a position hash — one canonical
 *  representative per orbit — plus the transform that produced it (needed to
 *  carry moves into the same orientation). */
export function canonicalHash(hash: string): { hash: string; transform: (r: number, c: number) => [number, number] } {
  let best = hash;
  let bestT = SYM[0];
  for (let i = 1; i < SYM.length; i++) {
    const h = transformHash(hash, SYM[i]);
    if (h < best) {
      best = h;
      bestT = SYM[i];
    }
  }
  return { hash: best, transform: bestT };
}
