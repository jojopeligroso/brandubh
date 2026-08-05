// ── The Pool, and the Named sets that are shortcuts into it ──────────────────
//
// How the Learn screen turns 161 **Puzzles** into something a person can walk
// through. Pure, so the ordering and the set threshold are testable without a
// component; the screen is a rendering of what is decided here.
//
// The glossary is explicit that a **Named set** is *a shortcut into the Pool,
// not a separate collection*, and that shape is load-bearing rather than
// decorative: one list, one order, one place a puzzle lives. A set row is a
// filter that happens to have a name, which is why `namedSets` returns ids and
// not puzzles — nothing here can hand out a second copy of a puzzle for a set
// row to own.

import type { Difficulty } from "./ai";
import type { Puzzle } from "./puzzleBank";

/**
 * How many puzzles a recogniser-found **Motif** needs before it earns a **Named
 * set** row.
 *
 * Four, from the glossary. A motif that turns up three times is a coincidence
 * with a name; a row promises a body of puzzles that rewards working through it
 * together, and three does not.
 *
 * The glossary's other half — that *a motif assigned by a hand-written **Note**
 * earns a row at any size, because a person deciding it matters is better
 * evidence than a count* — is not enforceable from here. The bank format carries
 * no provenance for the motif field, so this file cannot tell a recogniser's
 * verdict from a note's. 8c owns that distinction and the data it needs; when it
 * lands, the exemption belongs beside it and this constant moves there.
 */
export const SET_THRESHOLD = 4;

/** A **Named set**: a **Primary motif** and the puzzles filed under it, in pool
 *  order. Ids, not puzzles — a set is a view of the Pool, not a copy of it. */
export interface NamedSet {
  motif: string;
  ids: string[];
}

/**
 * The **Pool** order: easiest first, ties broken by **Puzzle number**.
 *
 * Grade rather than band, so the order inside a band is meaningful too. The tie
 * break is not cosmetic — `grade.ts` records that 92 of 161 puzzles grade at
 * exactly 30, so without it the order would be whatever the data module happened
 * to be written in, and would move under any regeneration.
 */
export const poolOrder = (puzzles: readonly Puzzle[]): Puzzle[] =>
  [...puzzles].sort((a, b) => a.grade - b.grade || a.id.localeCompare(b.id));

/**
 * The **Named sets** that qualify, largest first.
 *
 * Correct and empty when no motif has been recognised, which is the state of the
 * bank until 8c lands and — by the plan's own expectation — the state of most of
 * it afterwards: most puzzles have no motif and live in the Pool.
 */
export function namedSets(puzzles: readonly Puzzle[]): NamedSet[] {
  const byMotif = new Map<string, string[]>();
  for (const p of poolOrder(puzzles)) {
    if (!p.motif) continue;
    const ids = byMotif.get(p.motif);
    if (ids) ids.push(p.id);
    else byMotif.set(p.motif, [p.id]);
  }
  return [...byMotif.entries()]
    .filter(([, ids]) => ids.length >= SET_THRESHOLD)
    .map(([motif, ids]) => ({ motif, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.motif.localeCompare(b.motif));
}

/** Every **Tag** in the pool, sorted, deduplicated. Empty until 8c computes
 *  them, which is the normal case and not a degraded one. */
export function poolTags(puzzles: readonly Puzzle[]): string[] {
  const tags = new Set<string>();
  for (const p of puzzles) for (const tag of p.tags) tags.add(tag);
  return [...tags].sort();
}

/**
 * The Pool as the screen shows it: only the bands that are open, in pool order,
 * narrowed by at most one band and at most one tag.
 *
 * **One tag at a time, deliberately.** Combining chips needs an answer to
 * whether two tags mean "and" or "or", and that answer depends on a tag
 * vocabulary 8c has not shipped yet — with `side:attackers` and
 * `side:defenders` both present, "and" is guaranteed to yield nothing and "or"
 * is guaranteed to yield everything. A single active tag is a filter under
 * either reading, and it is the reading that cannot be wrong before the
 * vocabulary exists.
 */
export function pool(
  puzzles: readonly Puzzle[],
  opts: {
    unlocked: ReadonlySet<Difficulty>;
    band?: Difficulty | null;
    tag?: string | null;
    ids?: ReadonlySet<string> | null;
  },
): Puzzle[] {
  return poolOrder(
    puzzles.filter(
      (p) =>
        opts.unlocked.has(p.band) &&
        (!opts.band || p.band === opts.band) &&
        (!opts.tag || p.tags.includes(opts.tag)) &&
        (!opts.ids || opts.ids.has(p.id)),
    ),
  );
}
