import type { Move } from "../types";

// ── D4 board symmetry (shared) ────────────────────────────────────────────────
// The board, throne and corners are invariant under the 8 dihedral transforms of
// the square, on any board size a tafl game in this project uses (7×7, 9×9,
// 11×11), so a position and its D4 image are game-identical. `../d4.ts`,
// `../tablut/d4.ts` and `../copenhagen/d4.ts` were three copies of this same
// nine lines of arithmetic differing only in the module-scope `N` constant
// (ADR-0007, "what this defers", item 1). This is the extraction: one factory
// taking the board size, with each game's `d4.ts` now a thin re-export bound to
// its own `BOARD_SIZE`, so the root-move folding in each `engine.ts`, each
// opening-book loader and each offline generator still all agree on the group —
// they always did, and still do, because they still call through the same
// three import paths.
//
// Hot path: `foldRootMoves`/`stabilizer` run at every root of every search, and
// the solver's canonical key calls `canonicalHash` per node. `makeD4` itself
// allocates (the SYM array and the closures over `N`), but it runs exactly once
// per game, at module load, when a game's `d4.ts` calls `makeD4(BOARD_SIZE)` at
// module scope. The functions it returns are the same functions the old
// per-game copies defined — no wrapper, no extra indirection, no per-call
// closure or array allocation that was not already there.

/** One of the 8 transforms: maps (r,c) to its image under a board symmetry. */
export type Transform = (r: number, c: number) => [number, number];

export interface D4 {
  /** The 8 transforms: identity, rotations, reflections. Each maps (r,c) to
   *  its image. Index 0 is always the identity. */
  readonly SYM: ReadonlyArray<Transform>;
  /** Apply a transform to a `hashBoard`-format string (turn char + N² board
   *  glyphs, row-major). The turn is symmetric, so it rides along unchanged. */
  transformHash(hash: string, t: Transform): string;
  /** Apply a transform to a move's from/to squares. */
  transformMove(m: Move, t: Transform): Move;
  /** The lexicographically smallest D4 image of a position hash — one
   *  canonical representative per orbit — plus the transform that produced it
   *  (needed to carry moves into the same orientation). */
  canonicalHash(hash: string): { hash: string; transform: Transform };
}

/** Build the D4 symmetry group for an N×N board. Call once per game, at
 *  module scope, bound to that game's `BOARD_SIZE` — see `../d4.ts`,
 *  `../tablut/d4.ts` and `../copenhagen/d4.ts`. */
export function makeD4(n: number): D4 {
  const N = n;

  const SYM: ReadonlyArray<Transform> = [
    (r, c) => [r, c],
    (r, c) => [c, N - 1 - r],
    (r, c) => [N - 1 - r, N - 1 - c],
    (r, c) => [N - 1 - c, r],
    (r, c) => [r, N - 1 - c],
    (r, c) => [N - 1 - r, c],
    (r, c) => [c, r],
    (r, c) => [N - 1 - c, N - 1 - r],
  ];

  function transformHash(hash: string, t: Transform): string {
    const out = new Array<string>(N * N);
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const [nr, nc] = t(r, c);
        out[nr * N + nc] = hash[1 + r * N + c];
      }
    return hash[0] + out.join("");
  }

  function transformMove(m: Move, t: Transform): Move {
    const [fr, fc] = t(m.from.row, m.from.col);
    const [tr, tc] = t(m.to.row, m.to.col);
    return { from: { row: fr, col: fc }, to: { row: tr, col: tc } };
  }

  function canonicalHash(hash: string): { hash: string; transform: Transform } {
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

  return { SYM, transformHash, transformMove, canonicalHash };
}
