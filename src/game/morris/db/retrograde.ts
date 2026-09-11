// ── Retrograde analysis: solving a stone-count level exactly ──────────────────
//
// Gasser's method, scaled down to the tables this project can actually ship.
// "Solving Nine Men's Morris" (Computational Intelligence 12(1):24–41, 1996)
// computed 28 databases of ≈10¹⁰ states by an improved retrograde analysis and
// then proved the opening a draw with an 18-ply search over the placing phase
// (⚠ UNVERIFIED (excerpt) — every host carrying the paper's full text is blocked
// by this environment's egress proxy, so the algorithm below is the standard
// retrograde fixpoint built from the excerpts' description and from first
// principles, not a transcription; see docs/morris-rules.md).
//
// The structure that makes it work is the stone count. A moving-phase turn either
// keeps both counts (a plain step) or takes exactly one stone from the side *not*
// to move. So:
//
//   • Levels are totals, solved ascending: 6 = {3-3}, 7 = {3-4, 4-3}, 8 = {4-4}
//     and {3-5, 5-3}.
//   • Within a level the pair {(m,o), (o,m)} is one problem: a step in (m,o)
//     lands in (o,m) and vice versa, so neither can be solved alone.
//   • A capture leaves the level for (o−1, m), which is a *lower total* and is
//     therefore already solved — it reads as a constant. A capture that would
//     leave the opponent with two stones needs no table at all: it wins.
//
// The fixpoint. Initialise a blocked mover as LOSS(0) — it cannot move, it has
// lost — and every capture that drops the opponent below three stones as WIN(1).
// Then sweep the *unresolved* set: a state is WIN(d+1) as soon as some successor is
// a LOSS(d) for its mover, and LOSS(d+1) once *every* successor is a WIN(≤d). Each
// sweep uses only values that stood at its start (Jacobi, not Gauss–Seidel), and a
// resolution is committed at the sweep whose number equals its depth, which is
// what makes the depths exactly minimal-distance rather than merely consistent.
// When a sweep changes nothing and nothing is scheduled for a later one, the
// remainder is DRAW: neither side can force a win, which is exactly Gasser's
// definition of a drawn database entry.
//
// Then `verifyTable` re-derives every entry from its successors, as Gasser's
// separate verifier program did. It is not a sampling test and not the same code
// path: the solver works forward from an unresolved set with cached successor
// lists, the verifier re-generates every successor of every entry and checks the
// three defining implications. A table that does not verify is not shipped.
//
// What it deliberately does not do:
//
//   • No draw rules. Threefold repetition and the 50-move no-mill rule are
//     properties of a *path*; a database entry is addressed by a position. The
//     tables therefore answer "can the mover force a win", which is the question
//     Gasser's tables answer too. Consequence, documented rather than hidden: a
//     database win of depth d needs d plies and the shipped preset draws after 100
//     plies without a mill, so a probed win is only truthful while `sinceMill` +
//     d ≤ 100. `probe.ts` is where that caveat is enforced or waived.
//   • No placing phase, and no table with a side below three stones: both are
//     outside the databases' domain by construction.
//   • No backward (predecessor) edge generation. Gasser's "improved" retrograde
//     analysis propagates along inverse moves; this sweeps forward over a shrinking
//     unresolved set with the successor lists cached, because at these sizes the
//     cache fits in memory and an un-move generator would be a second, unverified
//     rules implementation. Noted as the thing to change first if bigger tables
//     are ever wanted.

import {
  GASSER_DB_RULES,
  type MoveGenRules,
  type SuccessorBuffer,
  generateSuccessors,
  newSuccessorBuffer,
} from "./generate";
import {
  MAX_DEPTH,
  VAL_DRAW,
  VAL_LOSS,
  VAL_WIN,
  binomial,
  canonicalMasks,
  dbKey,
  encodeEntry,
  entriesFor,
  entryDepth,
  entryValue,
  indexOf,
} from "./index";
import { FULL_MASK, lowestBit, popcount } from "./geometry";
import { POINT_COUNT } from "../types";

/** Per-table statistics, printed by the generator and pinned by the tests. */
export interface TableStats {
  key: string;
  m: number;
  o: number;
  /** Bytes in the table = slots in the index (including the few slots the
   *  "almost minimal" hash leaves unaddressed — they hold the same value as the
   *  equivalent addressed slot, so counting them changes no answer). */
  entries: number;
  win: number;
  loss: number;
  draw: number;
  maxDepth: number;
  /** Entries whose true distance exceeded the 6-bit depth field. Must be 0 for a
   *  table to be trustworthy about depth; the value bits stay correct regardless. */
  depthOverflow: number;
  /** Sweeps the fixpoint needed. */
  passes: number;
  /** In-level successor edges cached (0 when the cache was declined). */
  successors: number;
  /** Wall-clock milliseconds for the whole level this table belongs to. */
  ms: number;
}

/** A solved table, ready to write or probe. */
export interface SolvedTable {
  key: string;
  m: number;
  o: number;
  values: Uint8Array;
  stats: TableStats;
}

/** Options for one level. */
export interface SolveOptions {
  /** Progress lines. Silent by default. */
  log?: (line: string) => void;
  /** Ceiling on the in-level successor cache, in bytes. Above it, successors are
   *  re-generated every sweep: much slower, but the level still completes. */
  cacheBudgetBytes?: number;
}

const DEFAULT_CACHE_BUDGET = 1_400_000_000;
const UNKNOWN = 0;
const DRAWN = 3;
const NO_WIN = 255;
const MAX_PASSES = 600;

interface Working {
  key: string;
  m: number;
  o: number;
  entries: number;
  /** 0 unknown, 1 win, 2 loss, 3 draw. */
  val: Uint8Array;
  /** Plies to the end, uncapped (the output byte caps at 63). */
  depth: Uint8Array;
  /** Win distance available by capturing into an already-solved table, or 255 for
   *  "none" — which cannot collide with a real distance, since a lower table's own
   *  depth is capped at 63 and this is one more than that. */
  capWin: Uint8Array;
  /** Largest win distance among capture successors, for the LOSS distance. */
  capWinMax: Uint8Array;
  /** A capture successor is a draw, so the state can never be a loss. */
  capDraw: Uint8Array;
  succStart: Int32Array | null;
  succIdx: Int32Array | null;
  unresolved: Int32Array;
  unresolvedCount: number;
  pendingIdx: Int32Array;
  pendingVal: Uint8Array;
  pendingDepth: Uint8Array;
  pendingCount: number;
  /** The table a plain step lands in: the twin, or this table when m === o. */
  twin: Working;
}

/** The (m, o) pairs of a level, in table order. */
const levelKeys = (a: number, b: number): ReadonlyArray<readonly [number, number]> =>
  a === b ? [[a, b]] : [
    [a, b],
    [b, a],
  ];

/**
 * Walk every slot of a table, handing the decoded masks and the slot index to
 * `visit`. Enumerates canonical mover masks in index order and, for each, the
 * opponent's stones as subsets of the free points in rank order — so the slot
 * index is a running counter and no `unrankSubset` is ever needed.
 */
function forEachSlot(
  m: number,
  o: number,
  visit: (index: number, mover: number, opp: number) => void,
): void {
  const canon = canonicalMasks(m);
  const stride = binomial(POINT_COUNT - m, o);
  const freeCount = POINT_COUNT - m;
  const freePoints = new Uint8Array(freeCount);
  const limit = 1 << freeCount;
  for (let ci = 0; ci < canon.length; ci++) {
    const mover = canon[ci];
    let rest = FULL_MASK & ~mover;
    let n = 0;
    while (rest !== 0) {
      const bit = rest & -rest;
      rest ^= bit;
      freePoints[n++] = lowestBit(bit);
    }
    const base = ci * stride;
    let comp = (1 << o) - 1;
    let r = 0;
    while (comp < limit) {
      let opp = 0;
      let bits = comp;
      while (bits !== 0) {
        const bit = bits & -bits;
        bits ^= bit;
        opp |= 1 << freePoints[lowestBit(bit)];
      }
      visit(base + r, mover, opp);
      r++;
      const c = comp & -comp;
      const rr = comp + c;
      comp = rr | (((comp ^ rr) >>> 2) / c);
    }
  }
}

/**
 * Solve the level {(a,b), (b,a)} and return its tables. `solved` must already hold
 * every lower-total table a capture can reach — `(b−1, a)` and `(a−1, b)` — keyed
 * by `dbKey`; a capture that drops the opponent below three stones needs none.
 */
export function solveLevel(
  a: number,
  b: number,
  rules: MoveGenRules = GASSER_DB_RULES,
  solved: Map<string, Uint8Array> = new Map(),
  opts: SolveOptions = {},
): SolvedTable[] {
  const log = opts.log ?? (() => {});
  const budget = opts.cacheBudgetBytes ?? DEFAULT_CACHE_BUDGET;
  const started = Date.now();
  const pairs = levelKeys(a, b);

  const tables: Working[] = pairs.map(([m, o]) => {
    const entries = entriesFor(m, o);
    const w: Partial<Working> = {
      key: dbKey(m, o),
      m,
      o,
      entries,
      val: new Uint8Array(entries),
      depth: new Uint8Array(entries),
      capWin: new Uint8Array(entries).fill(NO_WIN),
      capWinMax: new Uint8Array(entries),
      capDraw: new Uint8Array(entries),
      succStart: null,
      succIdx: null,
      unresolved: new Int32Array(entries),
      unresolvedCount: 0,
      pendingIdx: new Int32Array(entries),
      pendingVal: new Uint8Array(entries),
      pendingDepth: new Uint8Array(entries),
      pendingCount: 0,
    };
    return w as Working;
  });
  tables.forEach((t, i) => {
    t.twin = tables.length === 1 ? t : tables[1 - i];
  });

  // ── Count the in-level edges first, so the cache is allocated exactly once ──
  // (Counting is the cheap half of generation — no canonicalisation — and it buys
  // an exact allocation instead of a doubling buffer whose copy would peak at 1.5×
  // the final size. At 3-5 the edge list is ~600 MB; that peak matters.)
  const buf = newSuccessorBuffer();
  const edgeCounts = new Array<number>(tables.length).fill(0);
  let edgeTotal = 0;
  tables.forEach((t, ti) => {
    let edges = 0;
    forEachSlot(t.m, t.o, (_index, mover, opp) => {
      generateSuccessors(mover, opp, rules, buf);
      for (let k = 0; k < buf.count; k++) if (buf.removed[k] === 0) edges++;
    });
    edgeCounts[ti] = edges;
    edgeTotal += edges;
  });
  const cache = edgeTotal * 4 <= budget;
  tables.forEach((t, ti) => {
    t.succStart = cache ? new Int32Array(t.entries + 1) : null;
    t.succIdx = cache ? new Int32Array(edgeCounts[ti]) : null;
  });
  log(
    `level ${a}-${b}: ${tables.map((t) => `${t.key}=${t.entries}`).join(" ")} edges=${edgeTotal}` +
      ` cache=${cache ? `${((edgeTotal * 4) / 1e6).toFixed(1)}MB` : "off"}`,
  );

  // ── Sweep 0: terminal states, capture summaries, successor cache ────────────
  for (const t of tables) {
    let cursor = 0;
    forEachSlot(t.m, t.o, (index, mover, opp) => {
      if (t.succStart !== null) t.succStart[index] = cursor;
      generateSuccessors(mover, opp, rules, buf);
      if (buf.steps === 0) {
        // Blocked: the side to move has lost, here and now.
        t.val[index] = VAL_LOSS;
        t.depth[index] = 0;
        return;
      }
      let capWin = NO_WIN;
      let capWinMax = 0;
      let capDraw = false;
      for (let k = 0; k < buf.count; k++) {
        const nextMover = buf.nextMover[k];
        const nextOpp = buf.nextOpp[k];
        if (buf.removed[k] === 0) {
          if (t.succIdx !== null) t.succIdx[cursor] = indexOf(nextMover, nextOpp);
          cursor++;
          continue;
        }
        const childStones = t.o - buf.removed[k];
        if (childStones < 3) {
          // The opponent is down to two stones: won, in one ply, no table needed.
          if (capWin > 1) capWin = 1;
          continue;
        }
        const child = solved.get(dbKey(childStones, t.m));
        if (child === undefined) {
          throw new Error(`morris/db: level ${t.key} needs table ${dbKey(childStones, t.m)}`);
        }
        const byte = child[indexOf(nextMover, nextOpp)];
        const v = entryValue(byte);
        const d = entryDepth(byte);
        if (v === VAL_LOSS) {
          if (d + 1 < capWin) capWin = d + 1;
        } else if (v === VAL_WIN) {
          if (d > capWinMax) capWinMax = d;
        } else {
          capDraw = true;
        }
      }
      t.capWin[index] = capWin;
      t.capWinMax[index] = capWinMax;
      t.capDraw[index] = capDraw ? 1 : 0;
      t.unresolved[t.unresolvedCount++] = index;
    });
    if (t.succStart !== null) t.succStart[t.entries] = cursor;
  }
  log(
    `  init: ${tables
      .map((t) => `${t.key} blocked=${t.entries - t.unresolvedCount} open=${t.unresolvedCount}`)
      .join(" ")} (${Date.now() - started}ms)`,
  );

  // ── The fixpoint ───────────────────────────────────────────────────────────
  const scratch = new Int32Array(buf.nextMover.length);
  let passes = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    let changed = 0;
    let scheduled = false;
    for (const t of tables) {
      const twin = t.twin;
      let keep = 0;
      t.pendingCount = 0;
      for (let u = 0; u < t.unresolvedCount; u++) {
        const index = t.unresolved[u];
        let cand = t.capWin[index];
        let allWin = cand === NO_WIN && t.capDraw[index] === 0;
        let maxWin = t.capWinMax[index];
        let start: number;
        let end: number;
        let list: Int32Array;
        if (t.succIdx !== null && t.succStart !== null) {
          list = t.succIdx;
          start = t.succStart[index];
          end = t.succStart[index + 1];
        } else {
          const masks = slotMasks(t, index);
          generateSuccessors(masks.mover, masks.opp, rules, buf);
          let n = 0;
          for (let k = 0; k < buf.count; k++) {
            if (buf.removed[k] === 0) scratch[n++] = indexOf(buf.nextMover[k], buf.nextOpp[k]);
          }
          list = scratch;
          start = 0;
          end = n;
        }
        for (let s = start; s < end; s++) {
          const j = list[s];
          const v = twin.val[j];
          if (v === VAL_LOSS) {
            const d = twin.depth[j] + 1;
            if (d < cand) cand = d;
            allWin = false;
          } else if (v === VAL_WIN) {
            const d = twin.depth[j];
            if (d > maxWin) maxWin = d;
          } else {
            allWin = false;
          }
        }
        if (cand !== NO_WIN && cand <= pass) {
          t.pendingIdx[t.pendingCount] = index;
          t.pendingVal[t.pendingCount] = VAL_WIN;
          t.pendingDepth[t.pendingCount] = cand;
          t.pendingCount++;
          continue;
        }
        if (allWin) {
          const d = maxWin + 1;
          if (d <= pass) {
            t.pendingIdx[t.pendingCount] = index;
            t.pendingVal[t.pendingCount] = VAL_LOSS;
            t.pendingDepth[t.pendingCount] = d > 255 ? 255 : d;
            t.pendingCount++;
            continue;
          }
          scheduled = true;
        } else if (cand !== NO_WIN) {
          // A win is available but belongs to a later sweep: hold the depth order.
          scheduled = true;
        }
        t.unresolved[keep++] = index;
      }
      t.unresolvedCount = keep;
    }
    for (const t of tables) {
      for (let p = 0; p < t.pendingCount; p++) {
        const index = t.pendingIdx[p];
        t.val[index] = t.pendingVal[p];
        t.depth[index] = t.pendingDepth[p];
      }
      changed += t.pendingCount;
      t.pendingCount = 0;
    }
    passes = pass;
    if (changed === 0 && !scheduled) break;
    if (pass === MAX_PASSES) throw new Error(`morris/db: level ${a}-${b} did not converge`);
  }

  // ── Everything still open is a draw, and then pack the bytes ───────────────
  const out: SolvedTable[] = [];
  for (const t of tables) {
    for (let u = 0; u < t.unresolvedCount; u++) t.val[t.unresolved[u]] = DRAWN;
    const values = new Uint8Array(t.entries);
    let win = 0;
    let loss = 0;
    let draw = 0;
    let maxDepth = 0;
    let depthOverflow = 0;
    for (let i = 0; i < t.entries; i++) {
      const v = t.val[i];
      if (v === VAL_WIN) win++;
      else if (v === VAL_LOSS) loss++;
      else draw++;
      const d = v === DRAWN || v === UNKNOWN ? 0 : t.depth[i];
      if (d > maxDepth) maxDepth = d;
      if (d > MAX_DEPTH) depthOverflow++;
      values[i] = encodeEntry(v === DRAWN ? VAL_DRAW : v, d);
    }
    out.push({
      key: t.key,
      m: t.m,
      o: t.o,
      values,
      stats: {
        key: t.key,
        m: t.m,
        o: t.o,
        entries: t.entries,
        win,
        loss,
        draw,
        maxDepth,
        depthOverflow,
        passes,
        successors: t.succIdx === null ? 0 : t.succIdx.length,
        ms: Date.now() - started,
      },
    });
  }
  log(
    `  done: ${out
      .map((t) => `${t.key} W=${t.stats.win} L=${t.stats.loss} D=${t.stats.draw} d≤${t.stats.maxDepth}`)
      .join(" ")} in ${((Date.now() - started) / 1000).toFixed(1)}s over ${passes} sweeps`,
  );
  return out;
}

/** Decode one slot of a working table (the no-cache path's only allocation, and
 *  it is one small object per state, not per successor). */
function slotMasks(t: Working, index: number): { mover: number; opp: number } {
  const stride = binomial(POINT_COUNT - t.m, t.o);
  const ci = (index / stride) | 0;
  const mover = canonicalMasks(t.m)[ci];
  const free = FULL_MASK & ~mover;
  let rank = index - ci * stride;
  // Inline unranking, ascending over the free points.
  const freePoints: number[] = [];
  let rest = free;
  while (rest !== 0) {
    const bit = rest & -rest;
    rest ^= bit;
    freePoints.push(lowestBit(bit));
  }
  let opp = 0;
  for (let j = t.o; j >= 1; j--) {
    let p = j - 1;
    while (binomial(p + 1, j) <= rank) p++;
    rank -= binomial(p, j);
    opp |= 1 << freePoints[p];
  }
  return { mover, opp };
}

/** What the verifier found. `problems` is capped; `checked` is not. */
export interface VerifyReport {
  key: string;
  checked: number;
  valueErrors: number;
  depthErrors: number;
  problems: string[];
}

/**
 * Re-derive every entry of `table` from its successors and compare. The tables of
 * the *same level* must all be in `tables` (a step's value is read from the twin),
 * and every lower table a capture reaches must be in `solved`.
 *
 * This is Gasser's separate verifier, reproduced: the three implications that
 * define the value are checked against freshly generated successors, not against
 * the solver's cached edge lists.
 */
export function verifyTable(
  table: SolvedTable,
  rules: MoveGenRules,
  level: ReadonlyMap<string, Uint8Array>,
  solved: ReadonlyMap<string, Uint8Array>,
  maxProblems = 8,
): VerifyReport {
  const buf: SuccessorBuffer = newSuccessorBuffer();
  const report: VerifyReport = {
    key: table.key,
    checked: 0,
    valueErrors: 0,
    depthErrors: 0,
    problems: [],
  };
  forEachSlot(table.m, table.o, (index, mover, opp) => {
    report.checked++;
    const byte = table.values[index];
    const value = entryValue(byte);
    const depth = entryDepth(byte);
    generateSuccessors(mover, opp, rules, buf);
    let expected: number;
    let expectedDepth: number;
    if (buf.steps === 0) {
      expected = VAL_LOSS;
      expectedDepth = 0;
    } else {
      let best = NO_WIN;
      let maxWin = 0;
      let allWin = true;
      for (let k = 0; k < buf.count; k++) {
        const nextMover = buf.nextMover[k];
        const nextOpp = buf.nextOpp[k];
        const childStones = popcount(nextMover);
        let v: number;
        let d: number;
        if (childStones < 3) {
          v = VAL_LOSS;
          d = 0;
        } else {
          const key = dbKey(childStones, popcount(nextOpp));
          const tbl = level.get(key) ?? solved.get(key);
          if (tbl === undefined) throw new Error(`morris/db: verify ${table.key} needs ${key}`);
          const b = tbl[indexOf(nextMover, nextOpp)];
          v = entryValue(b);
          d = entryDepth(b);
        }
        if (v === VAL_LOSS) {
          if (d + 1 < best) best = d + 1;
          allWin = false;
        } else if (v === VAL_WIN) {
          if (d > maxWin) maxWin = d;
        } else {
          allWin = false;
        }
      }
      if (best !== NO_WIN) {
        expected = VAL_WIN;
        expectedDepth = best;
      } else if (allWin) {
        expected = VAL_LOSS;
        expectedDepth = maxWin + 1;
      } else {
        expected = VAL_DRAW;
        expectedDepth = 0;
      }
    }
    const cappedDepth = expectedDepth > MAX_DEPTH ? MAX_DEPTH : expectedDepth;
    if (value !== expected) {
      report.valueErrors++;
      if (report.problems.length < maxProblems) {
        report.problems.push(
          `${table.key}[${index}] value ${value} but successors say ${expected}` +
            ` (mover=0x${mover.toString(16)} opp=0x${opp.toString(16)})`,
        );
      }
    } else if (depth !== cappedDepth) {
      report.depthErrors++;
      if (report.problems.length < maxProblems) {
        report.problems.push(
          `${table.key}[${index}] depth ${depth} but successors say ${cappedDepth}` +
            ` (mover=0x${mover.toString(16)} opp=0x${opp.toString(16)})`,
        );
      }
    }
  });
  return report;
}

/** Every (m, o) with both ≥ 3 and m + o ≤ `maxStones`, grouped into levels and
 *  ordered so each level's captures read only already-solved tables. */
export function levelOrder(maxStones: number): ReadonlyArray<readonly [number, number]> {
  const out: [number, number][] = [];
  for (let total = 6; total <= maxStones; total++) {
    for (let a = 3; a * 2 <= total; a++) {
      const b = total - a;
      if (b < 3 || b > 9 || a > 9) continue;
      out.push([a, b]);
    }
  }
  return out;
}
