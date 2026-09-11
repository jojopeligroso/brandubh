// Geometry and symmetry for the endgame databases. Everything here is *derived* at
// module load from the board's indexing, so these are the tests that say the
// derivation is the board the rest of the project means — the §2 point names, 32
// edges, 16 mills — and that the 16 symmetries really are symmetries. A wrong
// permutation would not slow the databases down; it would make them answer a
// different game's question with perfect confidence.

import { describe, expect, it } from "vitest";

import {
  ADJ,
  ADJ_MASK,
  FULL_MASK,
  MILLS,
  MILLS_OF,
  MILL_MASK,
  MILL_PARTNERS,
  PERMS,
  POINTS,
  TRANSFORM_COUNT,
  inMillMask,
  lowestBit,
  millPointsOf,
  pointIndexOf,
  pointName,
  popcount,
  transformMask,
} from "./geometry";

/** The point names of contract §2, in index order. If this row changes, every
 *  shipped table is addressed differently — it is the whole indexing. */
const NAMES =
  "a7 d7 g7 g4 g1 d1 a1 a4 b6 d6 f6 f4 f2 d2 b2 b4 c5 d5 e5 e4 e3 d3 c3 c4".split(" ");

describe("morris db geometry", () => {
  it("indexes the 24 points exactly as the contract does", () => {
    expect(POINTS).toHaveLength(24);
    expect(POINTS.map((p) => p.name)).toEqual(NAMES);
    expect(pointName(0)).toBe("a7");
    expect(pointIndexOf("e4")).toBe(19);
    expect(pointIndexOf("d4")).toBe(-1); // the centre is not a point
  });

  it("has 32 edges, all symmetric, none to itself", () => {
    let ends = 0;
    for (let i = 0; i < 24; i++) {
      for (const j of ADJ[i]) {
        expect(j).not.toBe(i);
        expect(ADJ[j]).toContain(i);
        ends++;
      }
      expect(ADJ_MASK[i]).toBe(ADJ[i].reduce((m, j) => m | (1 << j), 0));
    }
    expect(ends / 2).toBe(32);
  });

  it("joins rings only at the ring midpoints", () => {
    for (let i = 0; i < 24; i++) {
      const ring = Math.floor(i / 8);
      const k = i % 8;
      const crossRing = ADJ[i].filter((j) => Math.floor(j / 8) !== ring);
      expect(crossRing).toHaveLength(k % 2 === 1 ? (ring === 1 ? 2 : 1) : 0);
    }
  });

  it("has 16 mills, 12 in rings and 4 spokes, two through every point", () => {
    expect(MILLS).toHaveLength(16);
    expect(new Set(MILL_MASK).size).toBe(16);
    for (const mill of MILLS) expect(mill).toHaveLength(3);
    for (let i = 0; i < 24; i++) {
      expect(MILLS_OF[i]).toHaveLength(2);
      expect(MILL_PARTNERS[i]).toHaveLength(2);
      for (let n = 0; n < 2; n++) {
        expect(MILL_PARTNERS[i][n]).toBe(MILL_MASK[MILLS_OF[i][n]] & ~(1 << i));
      }
    }
    const ringMills = MILLS.filter((m) => new Set(m.map((i) => Math.floor(i / 8))).size === 1);
    expect(ringMills).toHaveLength(12);
    // Every mill is three points in a line on the drawing, too.
    for (const mill of MILLS) {
      const xs = new Set(mill.map((i) => POINTS[i].x));
      const ys = new Set(mill.map((i) => POINTS[i].y));
      expect(xs.size === 1 || ys.size === 1).toBe(true);
    }
  });

  it("reads mills off a mask", () => {
    const mill = MILL_MASK[0];
    expect(millPointsOf(mill)).toBe(mill);
    expect(inMillMask(mill, MILLS[0][1])).toBe(true);
    expect(inMillMask(mill & ~(1 << MILLS[0][2]), MILLS[0][1])).toBe(false);
    expect(millPointsOf(0)).toBe(0);
  });

  it("counts and scans bits", () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(FULL_MASK)).toBe(24);
    expect(popcount((1 << 23) | 1)).toBe(2);
    expect(lowestBit(1 << 23)).toBe(23);
  });
});

describe("the 16-fold symmetry group", () => {
  it("is 16 distinct permutations of the 24 points, identity first", () => {
    expect(PERMS).toHaveLength(16);
    expect(TRANSFORM_COUNT).toBe(16);
    expect([...PERMS[0]]).toEqual([...Array(24).keys()]);
    const seen = new Set(PERMS.map((p) => [...p].join(",")));
    expect(seen.size).toBe(16);
    for (const perm of PERMS) expect(new Set([...perm]).size).toBe(24);
  });

  it("is closed under composition and inverses", () => {
    const key = (p: ArrayLike<number>): string => Array.from(p).join(",");
    const members = new Set(PERMS.map(key));
    for (const a of PERMS) {
      for (const b of PERMS) {
        const composed = Array.from({ length: 24 }, (_, i) => b[a[i]]);
        expect(members.has(key(composed))).toBe(true);
      }
      const inverse = new Array<number>(24);
      for (let i = 0; i < 24; i++) inverse[a[i]] = i;
      expect(members.has(key(inverse))).toBe(true);
    }
  });

  it("preserves adjacency and mills", () => {
    const millKeys = new Set(MILLS.map((m) => [...m].sort((x, y) => x - y).join(",")));
    for (const perm of PERMS) {
      for (let i = 0; i < 24; i++) {
        for (const j of ADJ[i]) expect(ADJ[perm[i]]).toContain(perm[j]);
      }
      for (const mill of MILLS) {
        const image = mill.map((i) => perm[i]).sort((x, y) => x - y).join(",");
        expect(millKeys.has(image)).toBe(true);
      }
    }
  });

  it("transformMask agrees with moving the stones one at a time", () => {
    const masks = [0, 1, FULL_MASK, 0b101010101010101010101010, (1 << 7) | (1 << 15) | (1 << 23)];
    for (let t = 0; t < 16; t++) {
      for (const mask of masks) {
        let slow = 0;
        for (let i = 0; i < 24; i++) if (mask & (1 << i)) slow |= 1 << PERMS[t][i];
        expect(transformMask(mask, t)).toBe(slow);
      }
      expect(transformMask(FULL_MASK, t)).toBe(FULL_MASK);
    }
  });

  it("includes the ring inversion, which is what makes the group 16 and not 8", () => {
    const swaps = PERMS.filter((p) => p[0] === 16 && p[8] === 8 && p[16] === 0);
    expect(swaps.length).toBeGreaterThan(0);
  });
});
