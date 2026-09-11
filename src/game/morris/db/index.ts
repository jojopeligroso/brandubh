// ── Endgame database indexing: canonical form, perfect hash, entry encoding ────
//
// The address book for the shipped endgame tables. One table per ordered pair of
// stone counts (m stones for the side to move, o for the other side), moving
// phase only, both hands empty, both counts ≥ 3; a table is a flat `Uint8Array`
// and this module is the only thing that knows which byte a position is.
//
// The index, per the design contract §7 and Gasser's "perfect and almost minimal"
// hash (⚠ UNVERIFIED (excerpt): the paper's own hash function was not read — only
// the phrase, through a search excerpt; what follows is derived from first
// principles and merely *matches* the sizes the excerpts quote):
//
//     idx = canonicalIndexOf(M*) · C(24 − m, o) + rankSubset(O*, free(M*))
//
// where (M*, O*) is the lexicographically smallest image of the pair of masks
// under the board's 16 symmetries, comparing the mover's mask first. Two halves,
// two reasons:
//
//   • The mover's mask is folded by the symmetry group, so only the 158 (m=3),
//     757 (m=4), 2830 (m=5) … canonical masks get a slot. That is the 16-fold
//     saving, and it is why a 3-3 table is 210,140 bytes and not 3.4 MB.
//   • The other side's mask is then ranked *combinatorially* among the free
//     points, which is dense and exact. It is not folded again, because the
//     residual symmetry (the stabiliser of M*) differs per M*, so folding it would
//     need a second table *per canonical mask*. That is the "almost" in "almost
//     minimal", and it is measured rather than guessed: a 3-3 table has 210,140
//     slots for 169,626 orbits, so 19% of it is never addressed (the tests pin both
//     numbers). The unaddressed slots are not holes — the generator solves them as
//     the equivalent positions they decode to — so a stale or shifted index reads
//     as a wrong answer, never as an obvious crash. Hence the tests.
//
// Entry encoding: one byte. Bits 0–1 the value from the **mover's** point of view
// (0 draw, 1 win, 2 loss, 3 unused), bits 2–7 the distance to the end in plies,
// capped at 63. Depth is what makes a won endgame actually get *won* rather than
// shuffled — the engine picks the child with the smallest opponent depth — and
// one byte is the smallest thing that carries it. `scripts/morris-solve.ts` also
// measures a 2-bit WDL-only packing so the cost of shipping depths is a number
// the owner can look at, not an argument.
//
// What it deliberately does not do: it knows nothing about files, fetching,
// gzip, `GameState`, whose turn it is, the hands, repetition or the 50-move
// counter. A position's *path* is not part of its address — see `probe.ts` for
// the consequence, and `retrograde.ts` for why the tables cannot carry it.

import { POINT_COUNT } from "../types";
import { FULL_MASK, lowestBit, popcount, transformMask, TRANSFORM_COUNT } from "./geometry";

/** Entry values, from the side-to-move's point of view. */
export const VAL_DRAW = 0;
export const VAL_WIN = 1;
export const VAL_LOSS = 2;

/** Depth field width: six bits, so plies saturate here. */
export const MAX_DEPTH = 63;

/** Win/draw/loss as the engine and `probe.ts` speak it. */
export type Wdl = -1 | 0 | 1;

/** A decoded entry. Allocating — use `entryValue`/`entryDepth` in hot loops. */
export interface Entry {
  value: number;
  depth: number;
}

/** `"4-3"`: four stones for the side to move, three for the other. Ordered — a
 *  table and its mirror are different tables, because the mover differs. */
export const dbKey = (m: number, o: number): string => `${m}-${o}`;

/** `"4-3"` → `{ m: 4, o: 3 }`, or null if it is not a table key. */
export function parseDbKey(key: string): { m: number; o: number } | null {
  const parts = key.split("-");
  if (parts.length !== 2) return null;
  const m = Number(parts[0]);
  const o = Number(parts[1]);
  if (!Number.isInteger(m) || !Number.isInteger(o) || m < 3 || o < 3) return null;
  return { m, o };
}

// ── Binomials ─────────────────────────────────────────────────────────────────

const BINOMIAL = (() => {
  const n = POINT_COUNT + 1;
  const out = new Int32Array(n * n);
  for (let i = 0; i < n; i++) {
    out[i * n] = 1;
    for (let k = 1; k <= i; k++) out[i * n + k] = out[(i - 1) * n + k - 1] + out[(i - 1) * n + k];
  }
  return out;
})();

/** C(n, k) for 0 ≤ n, k ≤ 24; 0 when k > n. */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n || n < 0 || n > POINT_COUNT) return 0;
  return BINOMIAL[n * (POINT_COUNT + 1) + k];
}

/**
 * The rank of a mask among all masks with the same number of stones, in ascending
 * mask order. (Colexicographic rank: Σ C(pⱼ, j) over the set bits ascending, j
 * from 1. Colex order on equal-size subsets *is* ascending mask order, because the
 * comparison turns on the highest differing bit — which is what lets the
 * canonical masks below be numbered simply by enumerating masks upward.)
 */
export function colexRank(mask: number): number {
  let rank = 0;
  let rest = mask;
  let j = 1;
  const stride = POINT_COUNT + 1;
  while (rest !== 0) {
    const bit = rest & -rest;
    rank += BINOMIAL[lowestBit(bit) * stride + j];
    j++;
    rest ^= bit;
  }
  return rank;
}

/** The combinatorial rank of `sub` among the `k`-subsets of `free`, counting the
 *  free points in ascending point order. A bijection onto [0, C(|free|, k)). */
export function rankSubset(sub: number, free: number): number {
  let rank = 0;
  let rest = sub;
  let j = 1;
  const stride = POINT_COUNT + 1;
  while (rest !== 0) {
    const bit = rest & -rest;
    // Position of this point among the free points, counting from the bottom.
    rank += BINOMIAL[popcount(free & (bit - 1)) * stride + j];
    j++;
    rest ^= bit;
  }
  return rank;
}

/** The inverse of `rankSubset`: the `k`-subset of `free` with this rank. */
export function unrankSubset(rank: number, free: number, k: number): number {
  const freePoints: number[] = [];
  let rest = free;
  while (rest !== 0) {
    const bit = rest & -rest;
    freePoints.push(lowestBit(bit));
    rest ^= bit;
  }
  let remaining = rank;
  let out = 0;
  for (let j = k; j >= 1; j--) {
    // Largest position p with C(p, j) ≤ remaining.
    let p = j - 1;
    while (binomial(p + 1, j) <= remaining) p++;
    remaining -= binomial(p, j);
    out |= 1 << freePoints[p];
  }
  return out;
}

// ── Canonical mover masks, per stone count ────────────────────────────────────

interface MaskTables {
  /** How many masks of this size are canonical. */
  readonly count: number;
  /** The canonical masks, ascending; `canonMasks[i]` has canonical index `i`. */
  readonly canonMasks: Int32Array;
  /** By colex rank of *any* mask of this size: the canonical index of its image. */
  readonly canonIndex: Int32Array;
  /** By colex rank: the set of transforms (as a 16-bit mask) carrying this mask to
   *  its canonical image. Always non-empty; usually a single transform. */
  readonly stab: Uint16Array;
}

const MASK_TABLES = new Map<number, MaskTables>();

/**
 * Build the canonical-mask tables for `k` stones. Cost is C(24, k) × 16 mask
 * transforms — instant for the k ≤ 5 the shipped tables need, ~1.3 M × 16 at
 * k = 9. Built lazily and cached, so a probe for a table that was never shipped
 * never pays for it (contract §7: "do not build for larger m unless a file for it
 * exists").
 */
function maskTables(k: number): MaskTables {
  const hit = MASK_TABLES.get(k);
  if (hit) return hit;
  if (k < 0 || k > POINT_COUNT) throw new Error(`morris/db: no masks with ${k} stones`);
  const total = binomial(POINT_COUNT, k);
  const canonIndex = new Int32Array(total);
  const stab = new Uint16Array(total);
  const canon: number[] = [];
  if (k === 0) {
    canon.push(0);
    stab[0] = (1 << TRANSFORM_COUNT) - 1;
  } else {
    // Gosper's hack: the k-subsets of 24 points in ascending mask order, which is
    // ascending colex rank, so `rank` is just a counter.
    let mask = (1 << k) - 1;
    let rank = 0;
    const limit = 1 << POINT_COUNT;
    while (mask < limit) {
      let best = mask;
      let bestSet = 1;
      for (let t = 1; t < TRANSFORM_COUNT; t++) {
        const img = transformMask(mask, t);
        if (img < best) {
          best = img;
          bestSet = 1 << t;
        } else if (img === best) {
          bestSet |= 1 << t;
        }
      }
      if (best === mask) {
        canonIndex[rank] = canon.length;
        canon.push(mask);
      } else {
        canonIndex[rank] = canonIndex[colexRank(best)];
      }
      stab[rank] = bestSet;
      rank++;
      const c = mask & -mask;
      const r = mask + c;
      mask = r | (((mask ^ r) >>> 2) / c);
    }
  }
  const built: MaskTables = {
    count: canon.length,
    canonMasks: Int32Array.from(canon),
    canonIndex,
    stab,
  };
  MASK_TABLES.set(k, built);
  return built;
}

/** How many masks of `k` stones survive the 16-fold folding: 158, 757, 2830, … */
export const canonicalMaskCount = (k: number): number => maskTables(k).count;

/** The canonical masks of `k` stones, ascending. Index into this is the first
 *  factor of the database index. */
export const canonicalMasks = (k: number): Int32Array => maskTables(k).canonMasks;

/** The canonical index of a mask of `k` stones (its image's position in
 *  `canonicalMasks(k)`). */
export function canonicalIndexOf(mask: number): number {
  const t = maskTables(popcount(mask));
  return t.canonIndex[colexRank(mask)];
}

/** The smallest image of a single mask under the 16 symmetries. */
export function canonicalMask(mask: number): number {
  const t = maskTables(popcount(mask));
  return t.canonMasks[t.canonIndex[colexRank(mask)]];
}

/**
 * The lexicographically smallest image of the pair under the 16 symmetries,
 * comparing the **mover's** mask first and the other side's only to break a tie.
 * This is the definition the shipped tables are built under: change it and every
 * table is garbage.
 *
 * Identical in meaning to `../symmetry.ts`'s `canonical(white, black)` (asserted
 * in the cross-check test) — it is computed differently here, through the
 * precomputed stabiliser sets, because this one runs per probed successor.
 */
export function canonical(mover: number, opp: number): { mover: number; opp: number } {
  const t = maskTables(popcount(mover));
  const rank = colexRank(mover);
  const canonMover = t.canonMasks[t.canonIndex[rank]];
  let set = t.stab[rank];
  let bestOpp = -1;
  while (set !== 0) {
    const bit = set & -set;
    const img = transformMask(opp, lowestBit(bit));
    if (bestOpp < 0 || img < bestOpp) bestOpp = img;
    set ^= bit;
  }
  return { mover: canonMover, opp: bestOpp < 0 ? 0 : bestOpp };
}

/** How many bytes the (m, o) table has. */
export function entriesFor(m: number, o: number): number {
  return canonicalMaskCount(m) * binomial(POINT_COUNT - m, o);
}

/**
 * The byte offset of a moving-phase position in the (m, o) table, where `mover`
 * is the mask of the side to move. Allocation-free: this is the hot path of both
 * the generator and the engine's probe.
 */
export function indexOf(mover: number, opp: number): number {
  const m = popcount(mover);
  const t = maskTables(m);
  const rank = colexRank(mover);
  const ci = t.canonIndex[rank];
  let set = t.stab[rank];
  let bestOpp = -1;
  while (set !== 0) {
    const bit = set & -set;
    const img = transformMask(opp, lowestBit(bit));
    if (bestOpp < 0 || img < bestOpp) bestOpp = img;
    set ^= bit;
  }
  const canonMover = t.canonMasks[ci];
  return (
    ci * binomial(POINT_COUNT - m, popcount(opp)) +
    rankSubset(bestOpp < 0 ? 0 : bestOpp, FULL_MASK & ~canonMover)
  );
}

/**
 * The inverse of `indexOf` on canonical pairs: the (m, o) position at this index.
 * Used by the generator to walk a table and by the verifier to re-derive every
 * entry's successors. Slots whose `opp` is not itself minimal under the
 * stabiliser of `mover` decode to a position equivalent to the one a probe would
 * address — the "almost" in "almost minimal" — and are solved to the same value.
 */
export function masksAt(m: number, o: number, index: number): { mover: number; opp: number } {
  const stride = binomial(POINT_COUNT - m, o);
  const ci = (index / stride) | 0;
  const mover = canonicalMasks(m)[ci];
  return { mover, opp: unrankSubset(index - ci * stride, FULL_MASK & ~mover, o) };
}

// ── Entry encoding ────────────────────────────────────────────────────────────

/** Pack a value and a ply distance into one byte; depth saturates at 63. */
export function encodeEntry(value: number, depth: number): number {
  const d = depth < 0 ? 0 : depth > MAX_DEPTH ? MAX_DEPTH : depth;
  return (value & 3) | (d << 2);
}

/** The value (0 draw, 1 win, 2 loss) of a packed byte. */
export const entryValue = (byte: number): number => byte & 3;

/** The ply distance of a packed byte. */
export const entryDepth = (byte: number): number => (byte >>> 2) & MAX_DEPTH;

/** Both halves at once. Allocates — not for inner loops. */
export const decodeEntry = (byte: number): Entry => ({
  value: entryValue(byte),
  depth: entryDepth(byte),
});

/** The entry value as the engine's win/draw/loss, from the mover's point of view. */
export function wdlOf(value: number): Wdl {
  return value === VAL_WIN ? 1 : value === VAL_LOSS ? -1 : 0;
}
