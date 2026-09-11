// ── The Morris board's 16-fold symmetry ───────────────────────────────────────
//
// A Nine Men's Morris board has more symmetry than any board in this project.
// The tafl boards have the eight dihedral maps of a square (`../copenhagen/d4.ts`
// and its two copies); a Morris board has those *and* one more: the inner and
// outer rings can be swapped, because every point on the outer ring has exactly
// the same neighbours, mills and role as the point at the same position on the
// inner ring. Sixteen maps in all, and Gasser's "Solving Nine Men's Morris"
// (Computational Intelligence 12(1), 1996) says the same thing in the same terms
// — a 16-fold reduction, "one of the five symmetry axes is redundant"
// (⚠ UNVERIFIED (excerpt): the paper's full text is unreachable from this
// environment; see docs/morris-rules.md).
//
// Why it lives in its own module rather than inside the engine: three different
// things need it and none of them is the search. The endgame databases are
// *indexed* by the canonical form (a wrong canonicalisation there is a wrong
// answer, not a slow one), the solver memoises on it, and the engine folds
// symmetric root moves so its choice is varied rather than 16 copies of one idea.
// Keeping one table, tested on its own, is what stops those three from drifting.
//
// What it deliberately does not do: it does not canonicalise a *position* —
// whose turn it is and how many stones are in hand are not geometry. Callers
// combine `canonical()` with those themselves (`solver.ts`, `db/`), because only
// they know whether the side to move is part of their key.

import { POINTS } from "./rules";
import { POINT_COUNT } from "./types";

/**
 * A point permutation: `perm[i]` is where a stone standing on point `i` ends up.
 * `PERMS[0]` is the identity, and the order of the rest is an implementation
 * detail that the database index depends on — do not reorder it without
 * regenerating the tables.
 */
export type Perm = readonly number[];

/** The eight dihedral maps of the 7×7 lattice, as (x, y) → (x, y). Written out
 *  rather than generated, so the reflection axes are readable. */
const GRID_MAPS: ReadonlyArray<(x: number, y: number) => readonly [number, number]> = [
  (x, y) => [x, y], // identity
  (x, y) => [6 - x, y], // mirror, vertical axis
  (x, y) => [x, 6 - y], // mirror, horizontal axis
  (x, y) => [6 - x, 6 - y], // rotate 180°
  (x, y) => [y, x], // mirror, main diagonal
  (x, y) => [6 - y, x], // rotate 90°
  (x, y) => [y, 6 - x], // rotate 270°
  (x, y) => [6 - y, 6 - x], // mirror, anti-diagonal
];

/** Index of the point at grid coordinates (x, y), or −1. Built once. */
const AT = new Map<number, number>(POINTS.map((p, i) => [p.y * 7 + p.x, i]));

/**
 * The ring inversion: outer ↔ inner, middle fixed, `k` unchanged.
 *
 * This is the map the tafl boards have no analogue of, and the reason the group
 * is 16 and not 8. It is a board symmetry because the adjacency graph cannot tell
 * the rings apart: a ring's eight points are joined in the same cycle whichever
 * ring they are, the spokes join outer–middle and middle–inner symmetrically, and
 * every mill is either inside one ring or is a whole spoke. Swapping the outer
 * and inner ring therefore maps mills to mills and edges to edges — asserted
 * point by point in `symmetry.test.ts` rather than taken on trust.
 */
const ringSwap = (i: number): number => {
  const ring = Math.floor(i / 8);
  const k = i % 8;
  return ring === 1 ? i : (2 - ring) * 8 + k;
};

function buildPerms(): Perm[] {
  const out: Perm[] = [];
  for (const swap of [false, true]) {
    for (const map of GRID_MAPS) {
      const perm = new Array<number>(POINT_COUNT);
      for (let i = 0; i < POINT_COUNT; i++) {
        const src = swap ? ringSwap(i) : i;
        const [x, y] = map(POINTS[src].x, POINTS[src].y);
        const j = AT.get(y * 7 + x);
        // Unreachable: the 24 points are a symmetric set under both factors, so
        // every image is a point. Thrown rather than `!`-asserted so a future
        // edit to POINTS fails loudly at module load instead of silently
        // producing a permutation with a hole in it.
        if (j === undefined) throw new Error(`symmetry: no point at (${x},${y})`);
        perm[i] = j;
      }
      out.push(perm);
    }
  }
  return out;
}

/** The 16 point permutations, identity first. */
export const PERMS: readonly Perm[] = buildPerms();

/** Where point `i` goes under `perm`. */
export const transformPoint = (i: number, perm: Perm): number => perm[i];

/** A 24-bit occupancy mask, transformed. Bit `i` ⇒ bit `perm[i]`. */
export function applyPerm(mask: number, perm: Perm): number {
  let out = 0;
  let rest = mask;
  while (rest !== 0) {
    const bit = rest & -rest;
    const i = 31 - Math.clz32(bit);
    out |= 1 << perm[i];
    rest ^= bit;
  }
  return out;
}

/**
 * The lexicographically smallest image of the pair of masks, comparing the white
 * mask first and the black mask only to break a tie.
 *
 * "Smallest" is an arbitrary but fixed choice, and fixing it is the whole point:
 * it is the index the endgame databases are built under, so changing the
 * comparison invalidates every shipped table.
 */
export function canonical(white: number, black: number): { white: number; black: number } {
  let bw = white;
  let bb = black;
  for (let p = 1; p < PERMS.length; p++) {
    const w = applyPerm(white, PERMS[p]);
    if (w > bw) continue;
    const b = applyPerm(black, PERMS[p]);
    if (w < bw || b < bb) {
      bw = w;
      bb = b;
    }
  }
  return { white: bw, black: bb };
}

/**
 * The subgroup of `PERMS` that leaves this position's stones exactly where they
 * are — its stabiliser. Always contains the identity, so the result is never
 * empty; length 1 means the position has no usable symmetry.
 *
 * The engine folds root moves by this (`foldRootMoves`), which is what stops the
 * opening from being 24 descriptions of four ideas.
 */
export function stabilizer(white: number, black: number): readonly Perm[] {
  return PERMS.filter((p) => applyPerm(white, p) === white && applyPerm(black, p) === black);
}
