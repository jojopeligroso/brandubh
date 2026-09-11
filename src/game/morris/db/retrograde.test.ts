// The retrograde analysis, on the one level small enough to solve inside a test.
//
// 3-3 is 210,140 entries and solves in under two seconds, so this suite does the
// real thing rather than a mock of it: solve the level, run Gasser's verifier over
// every entry, pin the statistics, and then check the answers against a *third*
// implementation — a plain bounded minimax written here, over the same generator
// but with no table, no canonical form and no fixpoint. The verifier proves the
// table is internally consistent; the minimax is the only thing in the suite that
// could catch a consistent table being consistently wrong.
//
// The pinned statistics are evidence, not taste: if a rule flag, the generator or
// the index changes, these numbers move, and a moved number means every shipped
// table must be regenerated. They are quoted in docs/morris-rules.md.

import { beforeAll, describe, expect, it } from "vitest";

import {
  GASSER_DB_RULES,
  generateSuccessors,
  hasAnyStep,
  millsThrough,
  newSuccessorBuffer,
  removableMask,
} from "./generate";
import { MILL_MASK, MILLS, popcount } from "./geometry";
import { VAL_DRAW, VAL_LOSS, VAL_WIN, entryDepth, entryValue, indexOf, masksAt } from "./index";
import { type SolvedTable, levelOrder, solveLevel, verifyTable } from "./retrograde";
import { probeMasks } from "./probe";

let table: SolvedTable;
let tables: Map<string, Uint8Array>;

beforeAll(() => {
  table = solveLevel(3, 3, GASSER_DB_RULES)[0];
  tables = new Map([[table.key, table.values]]);
}, 60_000);

// ── An independent bounded minimax over the same successor generator ───────────
// Deliberately naive: no memoisation, no table, no symmetry. It answers "can the
// side to move force a win within d plies", which is exactly what a database WIN of
// depth ≤ d asserts. Budgeted, because 3-v-3 with the flying rule branches ~63 wide
// and an unbudgeted depth-5 search is not a test, it is a hang.

interface Budget {
  nodes: number;
}

/** One successor buffer per recursion level, allocated once. A buffer is ~70 KB,
 *  and allocating one per node made this suite's own minimax the slowest thing in
 *  the project — the generator is allocation-free precisely so callers can be. */
const POOL = Array.from({ length: 10 }, () => newSuccessorBuffer());

function winWithin(mover: number, opp: number, d: number, budget: Budget): boolean {
  if (popcount(opp) < 3) return true;
  if (popcount(mover) < 3 || d <= 0) return false;
  if (budget.nodes-- <= 0) throw new Error("minimax budget exhausted");
  const buf = POOL[d];
  generateSuccessors(mover, opp, GASSER_DB_RULES, buf);
  if (buf.steps === 0) return false; // blocked: the mover has lost, not won
  const count = buf.count;
  const movers = buf.nextMover.slice(0, count);
  const opps = buf.nextOpp.slice(0, count);
  for (let k = 0; k < count; k++) {
    if (lossWithin(movers[k], opps[k], d - 1, budget)) return true;
  }
  return false;
}

function lossWithin(mover: number, opp: number, d: number, budget: Budget): boolean {
  if (popcount(mover) < 3) return true;
  if (popcount(opp) < 3) return false;
  if (budget.nodes-- <= 0) throw new Error("minimax budget exhausted");
  const buf = POOL[d];
  generateSuccessors(mover, opp, GASSER_DB_RULES, buf);
  if (buf.steps === 0) return true; // blocked
  if (d <= 0) return false;
  const count = buf.count;
  const movers = buf.nextMover.slice(0, count);
  const opps = buf.nextOpp.slice(0, count);
  for (let k = 0; k < count; k++) {
    if (!winWithin(movers[k], opps[k], d - 1, budget)) return false;
  }
  return true;
}

/** Slots of the 3-3 table whose stored value and depth match a filter, in index
 *  order, at most `limit` of them, sampled by stride so they are not all neighbours. */
function sample(
  values: Uint8Array,
  want: (value: number, depth: number) => boolean,
  limit: number,
  stride: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length && out.length < limit; i += stride) {
    if (want(entryValue(values[i]), entryDepth(values[i]))) out.push(i);
  }
  return out;
}

describe("retrograde analysis of 3-3", () => {
  it("pins the level's statistics", () => {
    expect(table.stats.entries).toBe(210_140);
    expect(table.stats.win).toBe(174_485);
    expect(table.stats.loss).toBe(35_303);
    expect(table.stats.draw).toBe(352);
    expect(table.stats.maxDepth).toBe(26);
    expect(table.stats.depthOverflow).toBe(0);
    expect(table.stats.win + table.stats.loss + table.stats.draw).toBe(table.stats.entries);
    // With the flying rule a three-stone side always has a move, so no entry in
    // this table is the "blocked and therefore lost" terminal.
    const blocked = sample(table.values, (v, d) => v === VAL_LOSS && d === 0, 1, 1);
    expect(blocked).toHaveLength(0);
  });

  it("verifies every entry against its successors, as Gasser's verifier did", () => {
    const report = verifyTable(table, GASSER_DB_RULES, tables, new Map());
    expect(report.checked).toBe(210_140);
    expect(report.problems).toEqual([]);
    expect(report.valueErrors).toBe(0);
    expect(report.depthErrors).toBe(0);
  }, 60_000);

  it("orders levels by total stones, pair by pair", () => {
    expect(levelOrder(8)).toEqual([
      [3, 3],
      [3, 4],
      [3, 5],
      [4, 4],
    ]);
    expect(levelOrder(6)).toEqual([[3, 3]]);
  });

  it("agrees with a bounded minimax on shallow wins", () => {
    const budget: Budget = { nodes: 4_000_000 };
    const wins = [
      ...sample(table.values, (v, d) => v === VAL_WIN && d === 1, 6, 1),
      ...sample(table.values, (v, d) => v === VAL_WIN && d === 3, 6, 7),
      ...sample(table.values, (v, d) => v === VAL_WIN && d === 5, 2, 101),
    ];
    expect(wins.length).toBe(14);
    for (const slot of wins) {
      const { mover, opp } = masksAt(3, 3, slot);
      const depth = entryDepth(table.values[slot]);
      expect(winWithin(mover, opp, depth, budget)).toBe(true);
      // And not faster than the table says, which is what makes the depth a
      // distance rather than a bound. Checked up to depth 3: at 63 flying moves a
      // side, refuting a depth-5 win costs a 63⁴ tree per position and buys the
      // same property the depth-1 and depth-3 cases already establish.
      if (depth <= 3) expect(winWithin(mover, opp, depth - 1, budget)).toBe(false);
    }
  }, 120_000);

  it("agrees with a bounded minimax that draws and losses are not quick wins", () => {
    const budget: Budget = { nodes: 4_000_000 };
    for (const slot of sample(table.values, (v) => v === VAL_DRAW, 4, 13)) {
      const { mover, opp } = masksAt(3, 3, slot);
      expect(winWithin(mover, opp, 4, budget)).toBe(false);
    }
    for (const slot of sample(table.values, (v, d) => v === VAL_LOSS && d === 2, 4, 29)) {
      const { mover, opp } = masksAt(3, 3, slot);
      expect(winWithin(mover, opp, 3, budget)).toBe(false);
      expect(lossWithin(mover, opp, 2, budget)).toBe(true);
    }
  }, 120_000);

  it("probes the table it just solved, symmetrically", () => {
    const slot = sample(table.values, (v, d) => v === VAL_WIN && d === 1, 1, 1)[0];
    const { mover, opp } = masksAt(3, 3, slot);
    const hit = probeMasks(tables, mover, opp);
    expect(hit).toEqual({ wdl: 1, depth: 1 });
    // The same position with the two sides' masks swapped is a different position
    // (the other side is to move) and must be looked up as one.
    expect(probeMasks(tables, opp, mover)).not.toBeNull();
    expect(probeMasks(new Map(), mover, opp)).toBeNull();
    expect(probeMasks(tables, mover & ~(mover & -mover), opp)).toBeNull(); // two stones
  });
});

describe("the bitmask move generator", () => {
  it("counts mills through a point and picks victims Gasser's way", () => {
    const mill = MILLS[0];
    const after = MILL_MASK[0];
    expect(millsThrough(after, mill[1])).toBe(1);
    // A stone on a spoke midpoint can close two mills at once.
    const spoke = MILLS.findIndex((m) => new Set(m.map((i) => Math.floor(i / 8))).size === 3);
    const crossPoint = MILLS[spoke][0];
    const ringMill = MILLS.findIndex((m, i) => i !== spoke && m.includes(crossPoint));
    const both = MILL_MASK[spoke] | MILL_MASK[ringMill];
    expect(millsThrough(both, crossPoint)).toBe(2);
    // Milled stones are immune — until every one of them is milled.
    const opp = MILL_MASK[0] | (1 << 12);
    expect(removableMask(opp, GASSER_DB_RULES)).toBe(1 << 12);
    expect(removableMask(MILL_MASK[0], GASSER_DB_RULES)).toBe(MILL_MASK[0]);
    expect(removableMask(MILL_MASK[0], { ...GASSER_DB_RULES, removeFromMillsWhenAllInMills: false }))
      .toBe(0);
  });

  it("sees a four-stone side blocked in the ring corners", () => {
    const corners = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 6);
    const mids = (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7);
    expect(hasAnyStep(corners, mids, GASSER_DB_RULES)).toBe(false);
    const buf = newSuccessorBuffer();
    generateSuccessors(corners, mids, GASSER_DB_RULES, buf);
    expect(buf.steps).toBe(0);
    expect(buf.count).toBe(0);
    // The same four stones may fly if the flying rule counted them — it does not,
    // flying is three stones — and the midpoint side is not blocked at all.
    expect(hasAnyStep(mids, corners, GASSER_DB_RULES)).toBe(true);
  });

  it("writes successors for the side that moves next, and flags immediate wins", () => {
    const buf = newSuccessorBuffer();
    // White: a7 d7 (one step from a mill at g7), Black: three stones, none milled.
    const mover = (1 << 0) | (1 << 1);
    const opp = (1 << 12) | (1 << 13) | (1 << 20);
    const white = mover | (1 << 23);
    generateSuccessors(white, opp, GASSER_DB_RULES, buf);
    let capture = -1;
    for (let k = 0; k < buf.count; k++) if (buf.removed[k] === 1) capture = k;
    expect(capture).toBeGreaterThanOrEqual(0);
    // Three stones each, so the capture leaves two: an immediate win.
    expect(buf.immediateWin).toBe(true);
    expect(popcount(buf.nextMover[capture])).toBe(2);
    expect(popcount(buf.nextOpp[capture])).toBe(3);
    expect(indexOf(white, opp)).toBeGreaterThanOrEqual(0);
  });
});
