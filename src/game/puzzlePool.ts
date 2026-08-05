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

import type { Translations } from "../i18n";
import type { Difficulty } from "./ai";
import type { Motif, Tag } from "./motifs";
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

/**
 * A **Named set**: a **Primary motif** and the puzzles filed under it, in pool
 * order. Ids, not puzzles — a set is a view of the Pool, not a copy of it.
 *
 * The motif is the attested union and not a string, for the same reason
 * `Puzzle.motif` is: a set has to be nameable. `setLabel` is total over `Motif`,
 * so a set whose motif is only a string is a row that cannot be guaranteed a
 * label, and this is where that guarantee is cheapest to state.
 */
export interface NamedSet {
  motif: Motif;
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
  const byMotif = new Map<Motif, string[]>();
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

/** Every **Tag** in the pool, sorted, deduplicated. */
export function poolTags(puzzles: readonly Puzzle[]): Tag[] {
  const tags = new Set<Tag>();
  for (const p of puzzles) for (const tag of p.tags) tags.add(tag);
  return [...tags].sort();
}

/** The keys of `Translations` that hold a plain string, so a tag cannot be
 *  pointed at one of the `Record<string, string>` sub-tables by accident. */
type LabelKey = {
  [K in keyof Translations]: Translations[K] extends string ? K : never;
}[keyof Translations];

/**
 * What copy names each **Tag** on the filter row.
 *
 * 8d shipped the chips rendering the raw tag id, because 8c owned the tag
 * vocabulary and inventing a label for someone else's vocabulary would not have
 * been honest. Both are on one branch now, so this is the join: every member of
 * the `Tag` union against the label 8c wrote for it, the seven **plain tags**
 * under 8c's `tag*` keys and the eight **motifs** under its `motif*` keys.
 *
 * Exhaustive by type rather than by care. `Tag` is `PLAIN_TAGS ∪ Motif`, so a
 * `Record` over it means a motif or a tag added to the vocabulary without a
 * label fails the build here, the same lever that already stops a locale
 * shipping short of a key. There is no fallback to the identifier for the same
 * reason `decodeBank` drops a record naming a tag outside the vocabulary: a chip
 * that quietly reads `soldierGivenUp` is a missing translation pretending to be
 * copy.
 */
export const TAG_LABEL_KEYS: Record<Tag, LabelKey> = {
  attackers: "tagAttackers",
  defenders: "tagDefenders",
  moves1: "tagMoves1",
  moves2: "tagMoves2",
  moves3: "tagMoves3",
  moves4: "tagMoves4",
  soldierGivenUp: "tagSoldierGivenUp",
  guillotine: "motifGuillotine",
  snapTrap: "motifSnapTrap",
  clamp: "motifClamp",
  spring: "motifSpring",
  balling: "motifBalling",
  cordon: "motifCordon",
  cornerFight: "motifCornerFight",
  twinTowers: "motifTwinTowers",
};

/** The label for one **Tag** in the active locale. */
export const tagLabel = (t: Translations, tag: Tag): string => t[TAG_LABEL_KEYS[tag]];

/**
 * What copy names a **Named set** on its row: the motif's name, from the same
 * map the chips read.
 *
 * Deliberately *not* `puzzleNoteMotifs`, which the row used until now. The two
 * tables are keyed alike and are about the same eight tactics, which is exactly
 * why the wrong one went unnoticed: `puzzleNoteMotifs` holds the **completion
 * note**, a sentence written to be read once, after a puzzle is solved ("A
 * corner fight: the corner is the King's goal and a hostile anvil at once"),
 * and a set row is a name read before anything has been attempted, beside a
 * count. The note keeps that table; the row was the only thing wrong.
 *
 * Neither branch could see it alone. 8d wrote the row against a bank in which
 * no motif existed, so it never rendered one; 8c named the motifs but never
 * rendered a row. It became visible only when the two met and `cornerFight`'s
 * seven puzzles cleared the threshold.
 *
 * Lifted out of the screen so the choice between two plausible tables is one
 * the suite can hold: a label picked inside a component is a label no
 * pure-logic test can assert, and this is a bug that shipped for want of
 * exactly that assertion.
 */
export const setLabel = (t: Translations, set: NamedSet): string => tagLabel(t, set.motif);

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
        // Compared rather than `includes`d because the two slices met here: 8c
        // narrowed `Puzzle.tags` from `string[]` to the `Tag` union, and this
        // filter is deliberately vocabulary-agnostic — it takes whatever the
        // screen was handed. Neither branch could see the mismatch alone.
        (!opts.tag || p.tags.some((x) => x === opts.tag)) &&
        (!opts.ids || opts.ids.has(p.id)),
    ),
  );
}
