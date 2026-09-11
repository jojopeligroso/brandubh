// ── Bit-level Morris board geometry (for the endgame databases) ───────────────
//
// The 24 points of a Nine Men's Morris board, its 32 edges, its 16 mills and its
// 16-fold symmetry group, all as **24-bit masks** and all *computed* from the
// indexing in the design contract (§2) at module load. Nothing here is a
// hand-typed table: a hand-typed adjacency table is exactly the kind of constant
// that is "correct in the file it was copied from" and wrong here — ADR-0007
// names two real bugs of that shape in this project — and a database indexed by a
// wrong symmetry group is not slow, it is *wrong*, silently, in the one place
// that claims to be perfect.
//
// Why this duplicates `../rules.ts`'s `POINTS`/`ADJ`/`MILLS`:
//
//   • Representation, not content. `rules.ts` speaks `Board = Cell[]` and
//     `Move` objects because it is the authority the game plays under and must be
//     readable; the retrograde generator visits ~10⁷ states per pass and cannot
//     afford an object or an array per state. So this module is the same geometry
//     in the shape a bitboard search needs (`Uint32Array` masks, no allocation).
//   • Dependency direction. `db/` is reachable from the AI worker bundle and from
//     an offline Node script; it deliberately imports *no* rules module, so a
//     table can be generated and probed without pulling in the engine, and a
//     change to the rules' internals can never change a shipped table's index.
//
// The duplication is therefore held to the same standard as the tafl forks:
// `crosscheck.test.ts` asserts point for point that this module and `rules.ts`
// agree — the same 24 names in the same order, the same adjacency, the same 16
// mills, the same symmetry group, and the same successors for thousands of
// positions. If they ever disagree, `rules.ts` is right and every shipped table
// has to be regenerated.
//
// What it deliberately does not do: no game state, no turn, no hands, no rules.
// "Mill" here is a set of three points, nothing about whose stones stand on them.

import { FILES, GRID_SIZE, POINT_COUNT } from "../types";

/** Rings (outer, middle, inner) and points per ring — the §2 indexing is `ring*8 + k`. */
const RING_COUNT = 3;
const RING_POINTS = 8;

/** All 24 bits set: the whole board. */
export const FULL_MASK = (1 << POINT_COUNT) - 1;

/** One point, with the grid coordinates it is *drawn* at and the name it is read
 *  by. The grid is naming and drawing only — every rule is stated on the graph. */
export interface DbPoint {
  readonly ring: number;
  readonly k: number;
  readonly x: number;
  readonly y: number;
  readonly name: string;
}

function buildPoints(): DbPoint[] {
  const out: DbPoint[] = [];
  const mid = (GRID_SIZE - 1) / 2;
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const lo = ring;
    const hi = GRID_SIZE - 1 - ring;
    // k runs clockwise from the ring's top-left corner: TL TM TR MR BR BM BL ML.
    const coords: ReadonlyArray<readonly [number, number]> = [
      [lo, lo],
      [mid, lo],
      [hi, lo],
      [hi, mid],
      [hi, hi],
      [mid, hi],
      [lo, hi],
      [lo, mid],
    ];
    for (let k = 0; k < RING_POINTS; k++) {
      const [x, y] = coords[k];
      out.push({ ring, k, x, y, name: `${FILES[x]}${GRID_SIZE - y}` });
    }
  }
  return out;
}

/** The 24 points, indexed `ring*8 + k` exactly as every other Morris module. */
export const POINTS: readonly DbPoint[] = buildPoints();

/** `"a7"` for point 0. */
export const pointName = (i: number): string => POINTS[i].name;

/** Point index for a name, or −1. Linear over 24 entries; not a hot path. */
export function pointIndexOf(name: string): number {
  for (let i = 0; i < POINT_COUNT; i++) if (POINTS[i].name === name) return i;
  return -1;
}

function buildAdjacency(): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const { ring, k } = POINTS[i];
    const list: number[] = [];
    // Along the ring: k ± 1 (mod 8).
    list.push(ring * RING_POINTS + ((k + 1) % RING_POINTS));
    list.push(ring * RING_POINTS + ((k + RING_POINTS - 1) % RING_POINTS));
    // Across the spokes: only the ring midpoints (odd k) are joined between rings.
    if (k % 2 === 1) {
      if (ring > 0) list.push((ring - 1) * RING_POINTS + k);
      if (ring < RING_COUNT - 1) list.push((ring + 1) * RING_POINTS + k);
    }
    list.sort((a, b) => a - b);
    out.push(list);
  }
  return out;
}

const ADJ_LISTS = buildAdjacency();

/** Adjacency lists, ascending. 32 edges in all — asserted in the tests. */
export const ADJ: readonly (readonly number[])[] = ADJ_LISTS;

/** `ADJ_MASK[i]` = the mask of points a stone on `i` may step to. The move
 *  generator's inner loop reads this and nothing else. */
export const ADJ_MASK: Uint32Array = (() => {
  const out = new Uint32Array(POINT_COUNT);
  for (let i = 0; i < POINT_COUNT; i++) for (const j of ADJ_LISTS[i]) out[i] |= 1 << j;
  return out;
})();

function buildMills(): [number, number, number][] {
  const out: [number, number, number][] = [];
  // 12 ring mills: three consecutive points starting at each corner (even k).
  for (let ring = 0; ring < RING_COUNT; ring++) {
    for (let k = 0; k < RING_POINTS; k += 2) {
      out.push([
        ring * RING_POINTS + k,
        ring * RING_POINTS + ((k + 1) % RING_POINTS),
        ring * RING_POINTS + ((k + 2) % RING_POINTS),
      ]);
    }
  }
  // 4 spokes: the same midpoint (odd k) on all three rings.
  for (let k = 1; k < RING_POINTS; k += 2) out.push([k, RING_POINTS + k, 2 * RING_POINTS + k]);
  return out;
}

const MILL_TRIPLES = buildMills();

/** The 16 mills as point triples: 12 ring sides, then the 4 spokes. The order is
 *  an implementation detail — nothing is stored keyed by a mill index. */
export const MILLS: readonly (readonly [number, number, number])[] = MILL_TRIPLES;

/** `MILL_MASK[m]` = the three bits of mill `m`. A side holds mill `m` iff
 *  `(mask & MILL_MASK[m]) === MILL_MASK[m]`. */
export const MILL_MASK: Uint32Array = (() => {
  const out = new Uint32Array(MILL_TRIPLES.length);
  MILL_TRIPLES.forEach((t, m) => {
    out[m] = (1 << t[0]) | (1 << t[1]) | (1 << t[2]);
  });
  return out;
})();

/** Mill indices through each point — every point is in exactly two. */
export const MILLS_OF: readonly (readonly number[])[] = (() => {
  const out: number[][] = Array.from({ length: POINT_COUNT }, () => []);
  MILL_TRIPLES.forEach((t, m) => {
    for (const i of t) out[i].push(m);
  });
  return out;
})();

/**
 * `MILL_PARTNERS[i]` = for each mill through point `i`, the mask of that mill's
 * *other two* points. "Does a stone arriving at `i` close a mill?" is then two
 * `&`-tests and no loop over 16 mills — the single hottest question in the
 * generator, asked once per candidate move.
 */
export const MILL_PARTNERS: readonly Uint32Array[] = (() => {
  const out: Uint32Array[] = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const mills = MILLS_OF[i];
    const arr = new Uint32Array(mills.length);
    mills.forEach((m, n) => {
      arr[n] = MILL_MASK[m] & ~(1 << i);
    });
    out.push(arr);
  }
  return out;
})();

/** Mask of every point that is part of a mill held by `mask`. Used to pick
 *  capture victims (a stone in a mill is normally immune). */
export function millPointsOf(mask: number): number {
  let out = 0;
  for (let m = 0; m < MILL_MASK.length; m++) {
    const mm = MILL_MASK[m];
    if ((mask & mm) === mm) out |= mm;
  }
  return out;
}

/** Whether the stone `mask` holds on point `i` is part of a mill. `i` is assumed
 *  to be occupied by `mask`; the two mills through it are the only candidates. */
export function inMillMask(mask: number, i: number): boolean {
  const partners = MILL_PARTNERS[i];
  for (let n = 0; n < partners.length; n++) if ((mask & partners[n]) === partners[n]) return true;
  return false;
}

// ── The symmetry group ────────────────────────────────────────────────────────
//
// The eight dihedral maps of the 7×7 lattice, composed with the optional ring
// inversion (outer ↔ inner, middle fixed). Sixteen maps; Gasser reports the same
// 16-fold reduction, "one of the five symmetry axes is redundant"
// (⚠ UNVERIFIED (excerpt): the paper's full text is unreachable from this
// environment — see docs/morris-rules.md).
//
// The ring inversion is a board symmetry because the adjacency graph cannot tell
// the outer ring from the inner one: each ring is the same 8-cycle, the spokes
// join outer–middle and middle–inner alike, and every mill lies inside one ring
// or spans a whole spoke. The tests assert that, rather than trusting it.
//
// The composition order (ring swap on the *source* point, then the grid map) is
// the same as `../symmetry.ts`'s, and the two modules are asserted to generate
// the same set of 16 permutations. Nothing depends on the *order* of the list:
// the database index is built from the group's *minimum*, which is order-free.

const GRID_MAPS: ReadonlyArray<(x: number, y: number) => readonly [number, number]> = [
  (x, y) => [x, y],
  (x, y) => [GRID_SIZE - 1 - x, y],
  (x, y) => [x, GRID_SIZE - 1 - y],
  (x, y) => [GRID_SIZE - 1 - x, GRID_SIZE - 1 - y],
  (x, y) => [y, x],
  (x, y) => [GRID_SIZE - 1 - y, x],
  (x, y) => [y, GRID_SIZE - 1 - x],
  (x, y) => [GRID_SIZE - 1 - y, GRID_SIZE - 1 - x],
];

/** Outer ↔ inner ring, middle fixed, position within the ring unchanged. */
const ringSwap = (i: number): number => {
  const ring = (i / RING_POINTS) | 0;
  return ring === 1 ? i : (2 - ring) * RING_POINTS + (i % RING_POINTS);
};

function buildPerms(): Int8Array[] {
  const at = new Map<number, number>();
  POINTS.forEach((p, i) => at.set(p.y * GRID_SIZE + p.x, i));
  const out: Int8Array[] = [];
  for (const swap of [false, true]) {
    for (const map of GRID_MAPS) {
      const perm = new Int8Array(POINT_COUNT);
      for (let i = 0; i < POINT_COUNT; i++) {
        const src = swap ? ringSwap(i) : i;
        const [x, y] = map(POINTS[src].x, POINTS[src].y);
        const j = at.get(y * GRID_SIZE + x);
        // Unreachable: the 24 points are symmetric under both factors. Thrown
        // rather than asserted so a future edit to the indexing fails at load.
        if (j === undefined) throw new Error(`morris/db/geometry: no point at (${x},${y})`);
        perm[i] = j;
      }
      out.push(perm);
    }
  }
  return out;
}

/** The 16 point permutations, identity first. `PERMS[t][i]` is where a stone on
 *  `i` lands under transform `t`. */
export const PERMS: readonly Int8Array[] = buildPerms();

/** How many symmetries the board has. */
export const TRANSFORM_COUNT = PERMS.length;

/**
 * Byte-chunk transform tables: `TRANSFORM_TABLE[t*768 + chunk*256 + byte]` is the
 * image of that byte of the mask under transform `t`. Transforming a mask is then
 * three array reads and two `|`s — no loop over set bits, which matters because
 * canonicalisation applies up to 16 transforms per probed successor and the
 * generator probes ~10⁸ successors per table.
 */
const TRANSFORM_TABLE: Int32Array = (() => {
  const out = new Int32Array(TRANSFORM_COUNT * 3 * 256);
  for (let t = 0; t < TRANSFORM_COUNT; t++) {
    const perm = PERMS[t];
    for (let chunk = 0; chunk < 3; chunk++) {
      const base = t * 768 + chunk * 256;
      for (let byte = 0; byte < 256; byte++) {
        let image = 0;
        for (let b = 0; b < 8; b++) if (byte & (1 << b)) image |= 1 << perm[chunk * 8 + b];
        out[base + byte] = image;
      }
    }
  }
  return out;
})();

/** The image of a 24-bit occupancy mask under transform `t`. Allocation-free. */
export function transformMask(mask: number, t: number): number {
  const base = t * 768;
  return (
    TRANSFORM_TABLE[base + (mask & 0xff)] |
    TRANSFORM_TABLE[base + 256 + ((mask >>> 8) & 0xff)] |
    TRANSFORM_TABLE[base + 512 + ((mask >>> 16) & 0xff)]
  );
}

/** 16-bit population-count table; `popcount` below reads it twice. */
const POPCOUNT16 = (() => {
  const out = new Uint8Array(1 << 16);
  for (let i = 1; i < out.length; i++) out[i] = out[i >> 1] + (i & 1);
  return out;
})();

/** Stones in a mask. */
export const popcount = (mask: number): number =>
  POPCOUNT16[mask & 0xffff] + POPCOUNT16[(mask >>> 16) & 0xffff];

/** Index of the lowest set bit (`mask` must be non-zero). */
export const lowestBit = (mask: number): number => 31 - Math.clz32(mask & -mask);
