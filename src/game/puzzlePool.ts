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
import { MOTIF_SET_THRESHOLD, type Motif, type Tag } from "./motifs";
import type { Puzzle } from "./puzzleBank";

/**
 * How many puzzles a recogniser-found **Motif** needs before it earns a **Named
 * set** row.
 *
 * Four, from the glossary, and now 8c's constant rather than a second copy of
 * the number. Re-exported under the name this file's callers already use.
 *
 * ## The Note exemption, and why it still cannot be enforced here
 *
 * The glossary's other half is that *a motif assigned by a hand-written **Note**
 * earns a row at any size*. 8d left this note saying the exemption would become
 * enforceable when 8c shipped the provenance. 8c shipped the provenance — and
 * not to a place this file can reach, for a reason worth recording rather than
 * working around.
 *
 * A Note lives in `data/puzzle-ledger.json`, and `scripts/genpuzzles.ts` reads
 * it at merge time: `tagOf` prefers a ledger motif over the recogniser's and
 * sets `byHand`, and the generator's own report calls 8c's `namedSets(counts,
 * byHandSet)` with it. But `byHand` is **not encoded into the record**. The
 * ledger is checked in and never bundled, and the bank format carries motif but
 * not its provenance, so at runtime a recogniser's verdict and a note's are the
 * same field with the same value.
 *
 * That is the right split rather than a gap to close. Bundling 161 ledger
 * entries so the Learn screen can apply an exemption that fires on nothing would
 * be paying bundle for a distinction no shipped puzzle draws:
 * `puzzle-handadds.txt` is empty, no ledger entry carries a `motif` key, and
 * every motif in the bank is `cornerFight` found by a recogniser. The generator
 * is where a Note is honoured, and it honours it. If a Note is ever written, the
 * ledger's motif becomes the record's motif and the count it joins is what this
 * file sees; only a Note on a motif with fewer than four puzzles would make the
 * screen and the generator's report disagree, and that is the day the record
 * grows a provenance flag.
 */
export const SET_THRESHOLD = MOTIF_SET_THRESHOLD;

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
 * Which question a **Tag** answers. Chips in the same facet are alternatives;
 * chips in different facets are conditions.
 *
 * The four facets are the glossary's four tags, one each: side to move, line
 * length, whether a soldier is given up, and a carried **Motif**. Anything
 * unrecognised falls in `motif`, which is where a vocabulary extension would
 * land and is the facet whose members genuinely co-occur.
 */
export type TagFacet = "side" | "length" | "sacrifice" | "motif";

export function tagFacet(tag: string): TagFacet {
  if (tag === "attackers" || tag === "defenders") return "side";
  if (/^moves[1-9]$/.test(tag)) return "length";
  if (tag === "soldierGivenUp") return "sacrifice";
  return "motif";
}

/**
 * The Pool as the screen shows it: only the bands that are open, in pool order,
 * narrowed by at most one band, by any number of tags, and by a set's ids.
 *
 * ## "And" within a facet is "or"; "and" across facets is "and"
 *
 * 8d left this open because the answer depended on a vocabulary that did not
 * exist, and named the trap exactly: `attackers` and `defenders` are mutually
 * exclusive, so a flat "and" over every chip returns nothing and a flat "or"
 * returns everything. The vocabulary landed and the trap is not an edge case in
 * it — it is its **shape**. Every puzzle in the bank carries exactly two tags,
 * one side and one length, and both facets are single-valued by construction:
 * `computeTags` pushes one side tag and one `moves*` tag. So there is no global
 * reading that works. "And" is right *between* the two questions and wrong
 * *within* either of them.
 *
 * Hence the faceted reading, which is not a compromise between the two but the
 * only one that answers a question anybody would ask. `attackers` + `defenders`
 * means "either side", which is the whole pool and reads as such. `attackers` +
 * `moves2` means "raiders to move, in two moves". A single chip behaves exactly
 * as it did in 8d, so nothing that worked stops working.
 *
 * The `sacrifice` and `motif` facets are shipped-empty and shipped-nearly-empty
 * respectively (`soldierGivenUp` 0, and the only motif in the bank is primary on
 * its seven puzzles and therefore carried by none), so those branches are
 * exercised by the suite rather than by the bank. That is the honest state of
 * it: the semantics are written for the vocabulary, not for the counts, because
 * the counts move when 8f refits and the vocabulary does not.
 */
export function pool(
  puzzles: readonly Puzzle[],
  opts: {
    unlocked: ReadonlySet<Difficulty>;
    band?: Difficulty | null;
    tags?: readonly string[] | null;
    ids?: ReadonlySet<string> | null;
  },
): Puzzle[] {
  const wanted = new Map<TagFacet, string[]>();
  for (const tag of opts.tags ?? []) {
    const facet = tagFacet(tag);
    const list = wanted.get(facet);
    if (list) list.push(tag);
    else wanted.set(facet, [tag]);
  }
  // Compared rather than `includes`d because the two slices met here: 8c
  // narrowed `Puzzle.tags` from `string[]` to the `Tag` union, and this filter
  // is deliberately vocabulary-agnostic — it takes whatever the screen was
  // handed. Neither branch could see the mismatch alone.
  const matchesTags = (p: Puzzle): boolean => {
    for (const [, alternatives] of wanted) {
      if (!alternatives.some((tag) => p.tags.some((x) => (x as string) === tag))) return false;
    }
    return true;
  };
  return poolOrder(
    puzzles.filter(
      (p) =>
        opts.unlocked.has(p.band) &&
        (!opts.band || p.band === opts.band) &&
        matchesTags(p) &&
        (!opts.ids || opts.ids.has(p.id)),
    ),
  );
}
