import { describe, expect, it } from "vitest";
import { PERMS, applyPerm, canonical, stabilizer, transformPoint } from "./symmetry";
import { ADJ, MILLS, POINTS, pointIndex } from "./rules";
import { POINT_COUNT } from "./types";

// The symmetry group is the one thing in this directory that is *load-bearing for
// data on disk*: the endgame databases are indexed by `canonical()`, so a wrong
// permutation is a wrong answer out of a table rather than a slow search. It is
// also the one thing a reader is most likely to take on trust, because "sixteen
// symmetries" is a sentence from a paper rather than something you can see. So it
// is asserted here from first principles — closure, adjacency, mills — rather than
// against a second copy of the same table.

const key = (p: readonly number[]): string => p.join(",");
const IDENTITY = Array.from({ length: POINT_COUNT }, (_, i) => i);

/** Compose: first `a`, then `b`. */
const compose = (a: readonly number[], b: readonly number[]): number[] => a.map((i) => b[i]);

const EDGES = (() => {
  const out = new Set<string>();
  ADJ.forEach((list, i) => list.forEach((j) => out.add([Math.min(i, j), Math.max(i, j)].join("-"))));
  return out;
})();
const MILL_KEYS = new Set(MILLS.map((m) => [...m].sort((a, b) => a - b).join("-")));

describe("the 16 permutations", () => {
  it("has exactly sixteen, all distinct, identity first", () => {
    expect(PERMS).toHaveLength(16);
    expect(new Set(PERMS.map(key)).size).toBe(16);
    expect([...PERMS[0]]).toEqual(IDENTITY);
  });

  it("is a group: closed under composition, every element a bijection", () => {
    const keys = new Set(PERMS.map(key));
    for (const a of PERMS) {
      expect(new Set(a).size).toBe(POINT_COUNT); // a bijection, not just a map
      for (const b of PERMS) expect(keys.has(key(compose(a, b)))).toBe(true);
    }
  });

  it("contains an inverse for every element", () => {
    const keys = new Set(PERMS.map(key));
    for (const p of PERMS) {
      const inv = new Array<number>(POINT_COUNT);
      p.forEach((j, i) => (inv[j] = i));
      expect(keys.has(key(inv))).toBe(true);
      expect(compose(p, inv)).toEqual(IDENTITY);
    }
  });

  it("preserves the adjacency graph — all 32 edges, under all 16 maps", () => {
    expect(EDGES.size).toBe(32);
    for (const p of PERMS)
      for (const e of EDGES) {
        const [i, j] = e.split("-").map(Number);
        const image = [Math.min(p[i], p[j]), Math.max(p[i], p[j])].join("-");
        expect(EDGES.has(image), `edge ${e} → ${image}`).toBe(true);
      }
  });

  it("preserves the set of 16 mills", () => {
    for (const p of PERMS)
      for (const mill of MILLS) {
        const image = mill
          .map((x) => p[x])
          .sort((a, b) => a - b)
          .join("-");
        expect(MILL_KEYS.has(image), `mill ${mill.join("-")} → ${image}`).toBe(true);
      }
  });

  it("includes the ring inversion no tafl board has", () => {
    // The eighth map past the dihedral eight is the outer↔inner swap itself: it
    // fixes the middle ring and sends a7 (outer) to c5 (inner).
    const swap = PERMS.find(
      (p) => p[pointIndex("a7")] === pointIndex("c5") && p[pointIndex("d6")] === pointIndex("d6"),
    );
    expect(swap).toBeDefined();
    expect(transformPoint(pointIndex("c5"), swap!)).toBe(pointIndex("a7"));
  });

  it("keeps each point on its own ring *or* the opposite one, never the middle", () => {
    // A structural consequence worth pinning: the group factorises as (dihedral on
    // the grid) × (ring inversion), so ring 1 is setwise fixed by everything.
    const ringOf = (i: number): number => Math.floor(i / 8);
    for (const p of PERMS)
      for (let i = 0; i < POINT_COUNT; i++) {
        if (ringOf(i) === 1) expect(ringOf(p[i])).toBe(1);
        else expect(ringOf(p[i])).not.toBe(1);
      }
  });
});

describe("applyPerm", () => {
  it("moves every stone to its image", () => {
    const p = PERMS[5];
    const mask = (1 << 0) | (1 << 9) | (1 << 23);
    expect(applyPerm(mask, p)).toBe((1 << p[0]) | (1 << p[9]) | (1 << p[23]));
  });

  it("leaves the empty and the full board alone", () => {
    for (const p of PERMS) {
      expect(applyPerm(0, p)).toBe(0);
      expect(applyPerm((1 << POINT_COUNT) - 1, p)).toBe((1 << POINT_COUNT) - 1);
    }
  });
});

describe("canonical", () => {
  const position = (white: string[], black: string[]): [number, number] => [
    white.reduce((m, n) => m | (1 << pointIndex(n)), 0),
    black.reduce((m, n) => m | (1 << pointIndex(n)), 0),
  ];

  it("is invariant under every one of the 16 transforms", () => {
    const cases: Array<[string[], string[]]> = [
      [["a7"], []],
      [["a7", "d7"], ["c5"]],
      [["a7", "d7", "g7"], ["b6", "d6", "f6"]],
      [["b4", "c4", "e3"], ["a1", "d1", "f2", "e5"]],
      [[], []],
    ];
    for (const [w, b] of cases) {
      const [white, black] = position(w, b);
      const base = canonical(white, black);
      for (const p of PERMS) {
        expect(canonical(applyPerm(white, p), applyPerm(black, p))).toEqual(base);
      }
    }
  });

  it("identifies positions that are the same game and separates ones that are not", () => {
    // Every single stone on an outer corner is the same opening move; a corner and
    // a midpoint are not.
    const corner = canonical(1 << pointIndex("a7"), 0);
    for (const n of ["g7", "g1", "a1", "c5", "e5", "e3", "c3"])
      expect(canonical(1 << pointIndex(n), 0)).toEqual(corner);
    expect(canonical(1 << pointIndex("d7"), 0)).not.toEqual(corner);
    // …and colour is not a symmetry: the same stone in the other hand differs.
    expect(canonical(0, 1 << pointIndex("a7"))).not.toEqual(corner);
  });

  it("returns a member of the orbit, not an invented mask", () => {
    const [white, black] = position(["a7", "d6"], ["e3"]);
    const c = canonical(white, black);
    const images = PERMS.map((p) => `${applyPerm(white, p)}.${applyPerm(black, p)}`);
    expect(images).toContain(`${c.white}.${c.black}`);
  });
});

describe("stabilizer", () => {
  it("is the whole group for an empty board", () => {
    expect(stabilizer(0, 0)).toHaveLength(16);
  });

  it("shrinks to exactly the maps that fix the stones", () => {
    const m = (...names: string[]): number =>
      names.reduce((acc, n) => acc | (1 << pointIndex(n)), 0);

    // One stone on an outer corner: two maps survive — the identity and the
    // reflection in the diagonal through that corner. Every map carrying the ring
    // inversion sends an outer point to an inner one, so none of those eight can
    // fix it at all, which is why this is 2 and not 4.
    expect(stabilizer(m("a7"), 0)).toHaveLength(2);
    // An outer midpoint: identity plus the mirror in the axis through it.
    expect(stabilizer(m("d7"), 0)).toHaveLength(2);
    // A *middle*-ring midpoint is fixed by the ring inversion as well, so it keeps
    // twice as much symmetry — the asymmetry between the rings that makes this a
    // 16-element group rather than two copies of D4.
    expect(stabilizer(m("d6"), 0)).toHaveLength(4);
    // One whole side of the outer square: identity plus the mirror in the axis
    // across it, which fixes the mill's midpoint.
    const mill = stabilizer(m("a7", "d7", "g7"), 0);
    expect(mill).toHaveLength(2);
    expect(mill.every((p) => applyPerm(m("d7"), p) === m("d7"))).toBe(true);
    // A corner and its inner partner: the diagonal reflection and the inversion.
    expect(stabilizer(m("a7", "c5"), 0)).toHaveLength(4);
  });

  it("always contains the identity", () => {
    expect([...stabilizer(1 << 3, 1 << 17)[0]]).toEqual(IDENTITY);
  });
});

describe("POINTS, as the symmetry's input", () => {
  it("names the 24 points exactly as the design contract indexes them", () => {
    expect(POINTS.map((p) => p.name)).toEqual([
      "a7", "d7", "g7", "g4", "g1", "d1", "a1", "a4",
      "b6", "d6", "f6", "f4", "f2", "d2", "b2", "b4",
      "c5", "d5", "e5", "e4", "e3", "d3", "c3", "c4",
    ]);
  });
});
