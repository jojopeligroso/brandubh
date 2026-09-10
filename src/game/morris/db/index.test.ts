// The database index. These are the tests that make a shipped table readable: a
// wrong canonical form or a wrong rank does not crash, it returns a *different
// position's* perfect answer. So the index is checked the only way that settles it
// — by enumerating a whole table's worth of positions and looking for two of them
// in the same byte.

import { describe, expect, it } from "vitest";

import { FULL_MASK, PERMS, popcount, transformMask } from "./geometry";
import {
  MAX_DEPTH,
  VAL_DRAW,
  VAL_LOSS,
  VAL_WIN,
  binomial,
  canonical,
  canonicalIndexOf,
  canonicalMask,
  canonicalMaskCount,
  canonicalMasks,
  colexRank,
  dbKey,
  decodeEntry,
  encodeEntry,
  entriesFor,
  entryDepth,
  entryValue,
  indexOf,
  masksAt,
  parseDbKey,
  rankSubset,
  unrankSubset,
  wdlOf,
} from "./index";

/** Deterministic rng — a test that samples must sample the same way every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random mask of `k` stones drawn from `pool`. */
function randomMask(pool: number, k: number, next: () => number): number {
  const points: number[] = [];
  for (let i = 0; i < 24; i++) if (pool & (1 << i)) points.push(i);
  let mask = 0;
  for (let n = 0; n < k; n++) {
    const pick = points.splice(Math.floor(next() * points.length), 1)[0];
    mask |= 1 << pick;
  }
  return mask;
}

describe("keys and binomials", () => {
  it("names tables by the mover's stones first", () => {
    expect(dbKey(4, 3)).toBe("4-3");
    expect(parseDbKey("4-3")).toEqual({ m: 4, o: 3 });
    expect(parseDbKey("2-3")).toBeNull(); // below three stones is a finished game
    expect(parseDbKey("4-3-3")).toBeNull();
    expect(parseDbKey("four-three")).toBeNull();
  });

  it("knows its binomials", () => {
    expect(binomial(24, 3)).toBe(2024);
    expect(binomial(21, 3)).toBe(1330);
    expect(binomial(24, 0)).toBe(1);
    expect(binomial(3, 4)).toBe(0);
  });
});

describe("subset ranking", () => {
  it("ranks and unranks every 3-subset of a 21-point complement", () => {
    const mover = 0b111; // points 0,1,2
    const free = FULL_MASK & ~mover;
    const seen = new Set<number>();
    for (let a = 0; a < 24; a++) {
      if (!(free & (1 << a))) continue;
      for (let b = a + 1; b < 24; b++) {
        if (!(free & (1 << b))) continue;
        for (let c = b + 1; c < 24; c++) {
          if (!(free & (1 << c))) continue;
          const sub = (1 << a) | (1 << b) | (1 << c);
          const rank = rankSubset(sub, free);
          expect(rank).toBeGreaterThanOrEqual(0);
          expect(rank).toBeLessThan(binomial(21, 3));
          expect(seen.has(rank)).toBe(false);
          seen.add(rank);
          expect(unrankSubset(rank, free, 3)).toBe(sub);
        }
      }
    }
    expect(seen.size).toBe(binomial(21, 3));
  });

  it("ranks masks of one size into ascending mask order", () => {
    // colexRank is the position of a mask among the masks of its own size, and
    // that ordering is plain numeric order — which is what lets the canonical
    // masks be numbered by sweeping upward, with the rank as a counter.
    const twos: number[] = [];
    for (let mask = 0; mask < 1 << 12; mask++) if (popcount(mask) === 2) twos.push(mask);
    expect(twos.map(colexRank)).toEqual([...twos.keys()]);
    expect(colexRank(0b11)).toBe(0);
    expect(colexRank(0)).toBe(0);
  });
});

describe("canonical form", () => {
  it("folds the mask counts to the numbers the contract derives", () => {
    expect([3, 4, 5, 6, 7, 8, 9].map(canonicalMaskCount)).toEqual([
      158, 757, 2830, 8774, 22188, 46879, 82880,
    ]);
    for (const k of [3, 4, 5]) {
      const masks = canonicalMasks(k);
      expect(masks).toHaveLength(canonicalMaskCount(k));
      // Ascending, all of the right size, and each its own canonical form.
      for (let i = 1; i < masks.length; i++) expect(masks[i]).toBeGreaterThan(masks[i - 1]);
      for (const mask of masks) {
        expect(popcount(mask)).toBe(k);
        expect(canonicalMask(mask)).toBe(mask);
      }
    }
  });

  it("is invariant under all 16 symmetries", () => {
    const next = rng(20260909);
    for (let trial = 0; trial < 400; trial++) {
      const m = 3 + Math.floor(next() * 3);
      const o = 3 + Math.floor(next() * 3);
      const mover = randomMask(FULL_MASK, m, next);
      const opp = randomMask(FULL_MASK & ~mover, o, next);
      const base = canonical(mover, opp);
      const index = indexOf(mover, opp);
      for (let t = 0; t < PERMS.length; t++) {
        const image = canonical(transformMask(mover, t), transformMask(opp, t));
        expect(image).toEqual(base);
        expect(indexOf(transformMask(mover, t), transformMask(opp, t))).toBe(index);
      }
      // The canonical pair is a fixed point of canonicalisation.
      expect(canonical(base.mover, base.opp)).toEqual(base);
      expect(canonicalIndexOf(mover)).toBe(canonicalIndexOf(base.mover));
    }
  });
});

describe("the 3-3 index", () => {
  it("gives every 3-3 position a slot, with no two positions sharing one", () => {
    const entries = entriesFor(3, 3);
    expect(entries).toBe(210_140);
    expect(entries).toBe(canonicalMaskCount(3) * binomial(21, 3));

    // Every one of the 2,691,920 ordered 3-v-3 positions, indexed. No `expect` in
    // the loop: at 2.7 M iterations the assertion machinery costs more than the
    // index does, so failures are collected and asserted once.
    const slotOf = new Int32Array(entries).fill(-1);
    const slotKey = new Float64Array(entries);
    let positions = 0;
    let addressed = 0;
    let collisions = 0;
    let outOfRange = 0;
    for (let a = 0; a < 24; a++)
      for (let b = a + 1; b < 24; b++)
        for (let c = b + 1; c < 24; c++) {
          const mover = (1 << a) | (1 << b) | (1 << c);
          for (let d = 0; d < 24; d++) {
            if (mover & (1 << d)) continue;
            for (let e = d + 1; e < 24; e++) {
              if (mover & (1 << e)) continue;
              for (let f = e + 1; f < 24; f++) {
                if (mover & (1 << f)) continue;
                const opp = (1 << d) | (1 << e) | (1 << f);
                const slot = indexOf(mover, opp);
                positions++;
                if (slot < 0 || slot >= entries) {
                  outOfRange++;
                  continue;
                }
                const canon = canonical(mover, opp);
                const key = canon.mover * 16_777_216 + canon.opp;
                if (slotOf[slot] < 0) {
                  slotOf[slot] = slot;
                  slotKey[slot] = key;
                  addressed++;
                } else if (slotKey[slot] !== key) {
                  // Two *inequivalent* positions in one byte: the failure that
                  // would make a table answer a different game's question.
                  collisions++;
                }
              }
            }
          }
        }
    expect({ positions, outOfRange, collisions }).toEqual({
      positions: 2_691_920,
      outOfRange: 0,
      collisions: 0,
    });
    // 169,626 orbits under the 16 symmetries; the remaining slots are the slack in
    // Gasser's "almost minimal" — the opponent's mask is not folded by the
    // stabiliser of the mover's, so ~19% of a 3-3 table is never addressed.
    expect(addressed).toBe(169_626);
    expect(entries - addressed).toBe(40_514);
  }, 60_000);

  it("round-trips slot ↔ masks on the slots a probe can reach", () => {
    const canon = canonicalMasks(3);
    const stride = binomial(21, 3);
    let addressed = 0;
    let wrongMover = 0;
    let wrongRank = 0;
    let wrongSlot = 0;
    for (let ci = 0; ci < canon.length; ci++) {
      const mover = canon[ci];
      const free = FULL_MASK & ~mover;
      for (let r = 0; r < stride; r++) {
        const slot = ci * stride + r;
        const decoded = masksAt(3, 3, slot);
        if (decoded.mover !== mover) wrongMover++;
        if (rankSubset(decoded.opp, free) !== r) wrongRank++;
        const pair = canonical(decoded.mover, decoded.opp);
        if (pair.mover === decoded.mover && pair.opp === decoded.opp) {
          if (indexOf(decoded.mover, decoded.opp) !== slot) wrongSlot++;
          addressed++;
        }
      }
    }
    expect({ wrongMover, wrongRank, wrongSlot, addressed }).toEqual({
      wrongMover: 0,
      wrongRank: 0,
      wrongSlot: 0,
      addressed: 169_626,
    });
  }, 30_000);
});

describe("entry encoding", () => {
  it("round-trips every value and depth", () => {
    for (const value of [VAL_DRAW, VAL_WIN, VAL_LOSS]) {
      for (let depth = 0; depth <= MAX_DEPTH; depth++) {
        const byte = encodeEntry(value, depth);
        expect(byte).toBeGreaterThanOrEqual(0);
        expect(byte).toBeLessThan(256);
        expect(entryValue(byte)).toBe(value);
        expect(entryDepth(byte)).toBe(depth);
        expect(decodeEntry(byte)).toEqual({ value, depth });
      }
    }
  });

  it("saturates rather than wrapping, and maps onto the engine's win/draw/loss", () => {
    expect(entryDepth(encodeEntry(VAL_WIN, 99))).toBe(MAX_DEPTH);
    expect(entryValue(encodeEntry(VAL_WIN, 99))).toBe(VAL_WIN);
    expect(entryDepth(encodeEntry(VAL_DRAW, -5))).toBe(0);
    expect([wdlOf(VAL_WIN), wdlOf(VAL_DRAW), wdlOf(VAL_LOSS)]).toEqual([1, 0, -1]);
  });
});
