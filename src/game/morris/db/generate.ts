// ── Moving-phase successor generation, on bitmasks ────────────────────────────
//
// The move generator the retrograde analysis runs on: given the two occupancy
// masks and the three rule flags that can change the answer, write every
// successor *position* into a caller-owned buffer. It exists because
// `../rules.ts` — which is the authority the game actually plays under — allocates
// a `GameState`, a `Board` array and a `Move` object per move, and the generator
// below is called ~10⁸ times per table. The cross-check test asserts the two
// agree on the successor *sets* of thousands of random positions; where they ever
// disagree, `rules.ts` is right and this is the bug.
//
// Moving phase only, on purpose. The placing phase is not in the databases
// (Gasser searched it — 18-ply alpha-beta over the placing phase, with the
// endgame databases at the leaves; ⚠ UNVERIFIED (excerpt)), and a placing-phase
// generator here would be a second authority on a phase nothing in `db/` can
// answer.
//
// What it deliberately does not do:
//
//   • No `Move`s. A successor is a *pair of masks* and a removal count; which
//     stone moved where is not something the databases store or need. That is also
//     why a mill-closing move with three legal victims appears as three
//     successors and not one move with three options.
//   • No status, no draw rules. Repetition and the 50-move no-mill rule are
//     properties of the *path*, and a database entry is addressed by position
//     alone — see `retrograde.ts`'s head comment for what that costs.
//   • No turn flip to track: the successor is written mover-first *for the side
//     that is about to move*, i.e. `nextMover` is the old opponent. Getting that
//     backwards would index the twin table as though it were this one, so it is
//     stated here and asserted in the tests.

import { ADJ_MASK, FULL_MASK, MILL_PARTNERS, lowestBit, millPointsOf, popcount } from "./geometry";

/**
 * The rule flags a moving-phase successor set depends on. A subset of
 * `MorrisRuleSet` (`../variants.ts`) by design: `firstMove` cannot matter to a
 * table addressed by "the side to move", and the two practical draw rules are
 * path properties the tables cannot see.
 */
export interface MoveGenRules {
  /** A side reduced to three stones may move to any empty point. Gasser used the
   *  flying rule (⚠ UNVERIFIED (excerpt)). */
  readonly flying: "three" | "none";
  /** When every opponent stone stands in a mill, any of them may be taken
   *  (Gasser's reading of the debated point). */
  readonly removeFromMillsWhenAllInMills: boolean;
  /** Closing two mills at once takes one stone (Gasser) or two. */
  readonly doubleMillRemoves: "one" | "two";
}

/**
 * The flags the shipped tables were generated under — the moving-phase projection
 * of `morris-gasser-1`. Kept here rather than imported from `../variants.ts` so
 * that `db/` depends on no rules module; the cross-check test asserts the preset
 * and this literal still agree, which is the check that matters.
 */
export const GASSER_DB_RULES: MoveGenRules = {
  flying: "three",
  removeFromMillsWhenAllInMills: true,
  doubleMillRemoves: "one",
};

/** Worst case: 9 stones × 23 destinations × 36 victim pairs is the "two" reading's
 *  bound; the shipped reading needs 207 × 9. Sized once, reused forever. */
const CAPACITY = 8192;

/**
 * A reusable successor buffer. One per worker/solver thread of control; never
 * allocated inside a loop. `nextMover`/`nextOpp` are written from the point of
 * view of the side that moves *next*.
 */
export interface SuccessorBuffer {
  /** Mask of the side to move in the successor (the old opponent, less captures). */
  readonly nextMover: Int32Array;
  /** Mask of the side that has just moved. */
  readonly nextOpp: Int32Array;
  /** Stones taken by this turn: 0, 1 or 2. Tells the solver which table holds it. */
  readonly removed: Uint8Array;
  /** How many successors were written. */
  count: number;
  /** How many distinct from→to steps were legal, regardless of removal choice.
   *  Zero means the mover is blocked and has lost. */
  steps: number;
  /** Some successor leaves the opponent with fewer than three stones — an
   *  immediate win, with no table to look it up in. */
  immediateWin: boolean;
}

/** A fresh successor buffer. */
export function newSuccessorBuffer(): SuccessorBuffer {
  return {
    nextMover: new Int32Array(CAPACITY),
    nextOpp: new Int32Array(CAPACITY),
    removed: new Uint8Array(CAPACITY),
    count: 0,
    steps: 0,
    immediateWin: false,
  };
}

/** Whether the flying rule is in force for a side holding this mask. */
export const fliesWith = (mask: number, rules: MoveGenRules): boolean =>
  rules.flying === "three" && popcount(mask) === 3;

/** How many mills a side holding `after` has through point `to` (0, 1 or 2). A
 *  move to `to` closes that many, since `to` was empty before it. */
export function millsThrough(after: number, to: number): number {
  const partners = MILL_PARTNERS[to];
  let n = 0;
  for (let p = 0; p < partners.length; p++) if ((after & partners[p]) === partners[p]) n++;
  return n;
}

/**
 * Which of `opp`'s stones may be taken: those outside a mill, or — when every one
 * of them is in a mill and the rule allows it — any of them. Gasser's reading of
 * the second debated point is the permissive one (⚠ UNVERIFIED (excerpt)); with
 * the flag off, a side whose every stone is milled is immune, and a mill may then
 * be closed with nothing to show for it.
 */
export function removableMask(opp: number, rules: MoveGenRules): number {
  const free = opp & ~millPointsOf(opp);
  if (free !== 0) return free;
  return rules.removeFromMillsWhenAllInMills ? opp : 0;
}

/** Whether the mover has any legal step. Cheaper than generating: it stops at the
 *  first one, and ignores removals entirely. */
export function hasAnyStep(mover: number, opp: number, rules: MoveGenRules): boolean {
  const empty = FULL_MASK & ~(mover | opp);
  if (empty === 0) return false;
  if (fliesWith(mover, rules)) return true;
  let rest = mover;
  while (rest !== 0) {
    const bit = rest & -rest;
    if ((ADJ_MASK[lowestBit(bit)] & empty) !== 0) return true;
    rest ^= bit;
  }
  return false;
}

/**
 * Write every successor of the moving-phase position (`mover` to move) into
 * `out`. Allocation-free; `out.count`, `out.steps` and `out.immediateWin` are
 * reset on entry.
 *
 * A mill-closing step appears once per legal victim, because each victim is a
 * different position. A step that closes a mill but finds every opponent stone
 * immune appears once, with `removed = 0` — rare, and only reachable with
 * `removeFromMillsWhenAllInMills` off.
 */
export function generateSuccessors(
  mover: number,
  opp: number,
  rules: MoveGenRules,
  out: SuccessorBuffer,
): void {
  out.count = 0;
  out.steps = 0;
  out.immediateWin = false;
  const empty = FULL_MASK & ~(mover | opp);
  const flying = fliesWith(mover, rules);
  const oppStones = popcount(opp);
  let victimsCache = -1;

  let stones = mover;
  while (stones !== 0) {
    const fromBit = stones & -stones;
    stones ^= fromBit;
    const from = lowestBit(fromBit);
    let dests = flying ? empty : ADJ_MASK[from] & empty;
    const without = mover ^ fromBit;
    while (dests !== 0) {
      const toBit = dests & -dests;
      dests ^= toBit;
      const to = lowestBit(toBit);
      const after = without | toBit;
      out.steps++;
      const mills = millsThrough(after, to);
      if (mills === 0) {
        out.nextMover[out.count] = opp;
        out.nextOpp[out.count] = after;
        out.removed[out.count] = 0;
        out.count++;
        continue;
      }
      if (victimsCache < 0) victimsCache = removableMask(opp, rules);
      const victims = victimsCache;
      if (victims === 0) {
        // A mill with nothing to take. Still a legal turn.
        out.nextMover[out.count] = opp;
        out.nextOpp[out.count] = after;
        out.removed[out.count] = 0;
        out.count++;
        continue;
      }
      if (mills < 2 || rules.doubleMillRemoves === "one" || popcount(victims) < 2) {
        let rest = victims;
        while (rest !== 0) {
          const vBit = rest & -rest;
          rest ^= vBit;
          const left = opp ^ vBit;
          if (oppStones - 1 < 3) out.immediateWin = true;
          out.nextMover[out.count] = left;
          out.nextOpp[out.count] = after;
          out.removed[out.count] = 1;
          out.count++;
        }
        continue;
      }
      // Two mills at once, under the non-Gasser "two" reading: two stones go, and
      // both are chosen from the victims legal *before* either removal, as
      // unordered pairs. That is `../rules.ts`'s reading (see its `push`), and it
      // is a reading rather than a derivation — the point of matching it here is
      // that the authority and this generator must agree, which the cross-check
      // test asserts move for move.
      let restA = victims;
      while (restA !== 0) {
        const aBit = restA & -restA;
        restA ^= aBit;
        let restB = restA;
        while (restB !== 0) {
          const bBit = restB & -restB;
          restB ^= bBit;
          if (oppStones - 2 < 3) out.immediateWin = true;
          out.nextMover[out.count] = opp ^ aBit ^ bBit;
          out.nextOpp[out.count] = after;
          out.removed[out.count] = 2;
          out.count++;
        }
      }
    }
  }
}
