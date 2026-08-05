import { describe, expect, it } from "vitest";
import type { Difficulty } from "./ai";
import type { Puzzle } from "./puzzleBank";
import { MOTIFS, PLAIN_TAGS, type Tag } from "./motifs";
import { translations, type Lang } from "../i18n";
import {
  SET_THRESHOLD,
  TAG_LABEL_KEYS,
  namedSets,
  pool,
  poolOrder,
  poolTags,
  setLabel,
  tagFacet,
  tagLabel,
} from "./puzzlePool";

/** Only the five fields the pool reads. */
const puz = (
  id: string,
  grade: number,
  band: Difficulty,
  motif: string | null = null,
  tags: string[] = [],
): Puzzle => ({ id, grade, band, motif, tags }) as unknown as Puzzle;

const ALL: Difficulty[] = ["easy", "medium", "hard", "ollamh"];
const open = (...bands: Difficulty[]) => new Set(bands);

describe("pool order", () => {
  it("is easiest first", () => {
    const puzzles = [puz("00003", 300, "hard"), puz("00001", 30, "easy"), puz("00002", 120, "medium")];
    expect(poolOrder(puzzles).map((p) => p.id)).toEqual(["00001", "00002", "00003"]);
  });

  it("breaks ties by puzzle number, because most of the bank is one grade", () => {
    // `grade.ts` records that 92 of 161 puzzles grade at exactly 30. Without the
    // tie break the order would be whatever the data module happened to be
    // written in, and would move under any regeneration.
    const puzzles = [puz("00009", 30, "easy"), puz("00002", 30, "easy"), puz("00005", 30, "easy")];
    expect(poolOrder(puzzles).map((p) => p.id)).toEqual(["00002", "00005", "00009"]);
  });

  it("does not disturb the array it is given", () => {
    const puzzles = [puz("00002", 90, "easy"), puz("00001", 30, "easy")];
    poolOrder(puzzles);
    expect(puzzles.map((p) => p.id)).toEqual(["00002", "00001"]);
  });
});

describe("named sets", () => {
  it("are empty when no motif has been recognised — the state of the bank today", () => {
    // 161 puzzles, `motif` null on every one of them. This is the normal case
    // and not a degraded one: most puzzles have no motif and live in the Pool.
    const puzzles = Array.from({ length: 161 }, (_, i) =>
      puz(String(i).padStart(5, "0"), 30, "easy"),
    );
    expect(namedSets(puzzles)).toEqual([]);
  });

  it("withhold a row until the threshold is met, and grant it on the nose", () => {
    const under = Array.from({ length: SET_THRESHOLD - 1 }, (_, i) =>
      puz(String(i).padStart(5, "0"), 30, "easy", "cordon"),
    );
    expect(namedSets(under)).toEqual([]);

    const exactly = [...under, puz("00099", 30, "easy", "cordon")];
    expect(namedSets(exactly)).toEqual([
      { motif: "cordon", ids: ["00000", "00001", "00002", "00099"] },
    ]);
  });

  it("list their puzzles in pool order, so a set is a view and not a reordering", () => {
    const puzzles = [
      puz("00004", 300, "hard", "clamp"),
      puz("00001", 30, "easy", "clamp"),
      puz("00003", 120, "medium", "clamp"),
      puz("00002", 30, "easy", "clamp"),
    ];
    expect(namedSets(puzzles)[0].ids).toEqual(["00001", "00002", "00003", "00004"]);
  });

  it("put the biggest set first, and settle ties by name", () => {
    const many = (motif: string, n: number, from: number) =>
      Array.from({ length: n }, (_, i) => puz(String(from + i).padStart(5, "0"), 30, "easy", motif));
    const sets = namedSets([...many("clamp", 4, 1), ...many("spring", 6, 100), ...many("balling", 4, 200)]);
    expect(sets.map((s) => s.motif)).toEqual(["spring", "balling", "clamp"]);
  });

  it("hand out ids rather than puzzles, so no puzzle lives in two places", () => {
    const puzzles = Array.from({ length: 4 }, (_, i) =>
      puz(String(i).padStart(5, "0"), 30, "easy", "cordon"),
    );
    const set = namedSets(puzzles)[0];
    expect(set.ids.every((id) => puzzles.some((p) => p.id === id))).toBe(true);
  });
});

describe("tags", () => {
  it("are empty when nothing carries one, which is not a failure", () => {
    expect(poolTags([puz("00001", 30, "easy")])).toEqual([]);
  });

  it("sort into the glossary's four facets, and nothing lands outside them", () => {
    expect(tagFacet("attackers")).toBe("side");
    expect(tagFacet("defenders")).toBe("side");
    expect(tagFacet("moves1")).toBe("length");
    expect(tagFacet("moves4")).toBe("length");
    expect(tagFacet("soldierGivenUp")).toBe("sacrifice");
    for (const m of MOTIFS) expect(tagFacet(m)).toBe("motif");
  });

  it("come back sorted and deduplicated across the whole pool", () => {
    const puzzles = [
      puz("00001", 30, "easy", null, ["sacrifice", "side:attackers"]),
      puz("00002", 30, "easy", null, ["side:attackers"]),
    ];
    expect(poolTags(puzzles)).toEqual(["sacrifice", "side:attackers"]);
  });
});

describe("what a tag chip says", () => {
  // The chips rendered the raw tag id through 8d because 8c owned the copy.
  // These are the tests that stop them going back to it.
  const LANGS: Lang[] = ["en", "es", "ga"];
  const EVERY_TAG: Tag[] = [...PLAIN_TAGS, ...MOTIFS];

  it("covers the whole Tag vocabulary and nothing beyond it", () => {
    // `Tag` is `PLAIN_TAGS ∪ Motif`, and the two blocks 8c wrote — seven `tag*`
    // keys and eight `motif*` keys — are exactly that union. The Record type
    // already enforces this at build time; asserting it here says out loud that
    // no tag reaches a chip without copy of its own.
    expect(Object.keys(TAG_LABEL_KEYS).sort()).toEqual([...EVERY_TAG].sort());
  });

  it("names every tag in every locale, including the hidden one", () => {
    for (const lang of LANGS) {
      for (const tag of EVERY_TAG) {
        const label = tagLabel(translations[lang], tag);
        expect(label, `${lang}/${tag}`).toBeTruthy();
        // A chip showing the identifier is a missing translation pretending to
        // be copy, so the label must not be the tag itself.
        expect(label, `${lang}/${tag}`).not.toBe(tag);
      }
    }
  });

  it("points each tag at its own string and never at a shared one", () => {
    const keys = Object.values(TAG_LABEL_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("what a set row says", () => {
  // The row rendered `puzzleNoteMotifs` — the completion note, a whole sentence
  // — where a name belongs, and shipped that way, because 8d had no motif to
  // build a row from and 8c rendered no rows. These are the tests that stop the
  // two tables being confused again.
  const LANGS: Lang[] = ["en", "es", "ga"];

  it("names the motif and never reads out its completion note", () => {
    for (const lang of LANGS) {
      const t = translations[lang];
      for (const motif of MOTIFS) {
        const where = `${lang}/${motif}`;
        const label = setLabel(t, { motif, ids: ["00001"] });
        // Both tables are keyed by Motif and both are populated, so the
        // comparison below is a real one rather than a label against undefined.
        expect(t.puzzleNoteMotifs[motif], where).toBeTruthy();
        expect(label, where).toBe(tagLabel(t, motif));
        expect(label, where).not.toBe(t.puzzleNoteMotifs[motif]);
        // A name, not a sentence. Every note in every locale is punctuated
        // "<name>: <explanation>.", so no note can pass this.
        expect(label, where).not.toMatch(/[.:]/);
      }
    }
  });

  it("reads 'Corner fight' beside its count, which is the row the bank builds", () => {
    // cornerFight is the bank's only Named set: 7 puzzles against a threshold
    // of 4, and so the one motif whose note could reach a learner.
    const bank = Array.from({ length: 7 }, (_, i) =>
      puz(String(i + 1).padStart(5, "0"), 30, "easy", "cornerFight"),
    );
    const [set] = namedSets(bank);
    expect(set.ids).toHaveLength(7);
    expect(setLabel(translations.en, set)).toBe("Corner fight");
    expect(setLabel(translations.es, set)).toBe("Lucha de esquina");
  });
});

describe("the pool as the screen shows it", () => {
  // Real tags, because the filter's reading of two chips depends on which
  // *facet* each is in and a fictional vocabulary has no facets.
  const BANK = [
    puz("00001", 30, "easy", null, ["attackers", "moves1"]),
    puz("00002", 90, "easy", null, ["defenders", "moves1"]),
    puz("00003", 120, "medium", "clamp", ["defenders", "moves2"]),
    puz("00004", 330, "ollamh", null, ["attackers", "moves2", "cordon"]),
  ];

  it("hides a locked band entirely — a lock is not a greyed row in the list", () => {
    expect(pool(BANK, { unlocked: open("easy") }).map((p) => p.id)).toEqual(["00001", "00002"]);
  });

  it("narrows to one band when a band row is chosen", () => {
    expect(pool(BANK, { unlocked: open(...ALL), band: "medium" }).map((p) => p.id)).toEqual([
      "00003",
    ]);
  });

  it("narrows to one tag when a single chip is chosen, exactly as it did before", () => {
    expect(pool(BANK, { unlocked: open(...ALL), tags: ["moves2"] }).map((p) => p.id)).toEqual([
      "00003",
      "00004",
    ]);
  });

  it("reads two chips in the same facet as alternatives", () => {
    // The whole reason a flat "and" is wrong: `attackers` and `defenders` are
    // mutually exclusive by construction, so "and" over them yields nothing and
    // says nothing. Within a facet the chips are the options, not the conditions.
    expect(
      pool(BANK, { unlocked: open(...ALL), tags: ["attackers", "defenders"] }).map((p) => p.id),
    ).toEqual(["00001", "00002", "00003", "00004"]);
  });

  it("reads two chips in different facets as conditions", () => {
    expect(
      pool(BANK, { unlocked: open(...ALL), tags: ["defenders", "moves2"] }).map((p) => p.id),
    ).toEqual(["00003"]);
  });

  it("composes three facets at once", () => {
    expect(
      pool(BANK, { unlocked: open(...ALL), tags: ["attackers", "moves2", "cordon"] }).map(
        (p) => p.id,
      ),
    ).toEqual(["00004"]);
    expect(
      pool(BANK, { unlocked: open(...ALL), tags: ["defenders", "moves2", "cordon"] }),
    ).toEqual([]);
  });

  it("treats an unknown tag as a motif, so it narrows rather than widening", () => {
    // A tag the bank cannot produce, since `decodeBank` refuses a record naming
    // one. If one ever reached here it must not quietly select everything.
    expect(pool(BANK, { unlocked: open(...ALL), tags: ["nothing-has-this"] })).toEqual([]);
  });

  it("narrows to a named set's ids, which is all a set row does", () => {
    const ids = new Set(["00003", "00004"]);
    expect(pool(BANK, { unlocked: open(...ALL), ids }).map((p) => p.id)).toEqual([
      "00003",
      "00004",
    ]);
  });

  it("keeps the lock above every other filter", () => {
    // A named set that reaches into a locked band shows only the open part of
    // itself. The set is a shortcut into the Pool, so it cannot outrank the Pool.
    const ids = new Set(["00003", "00004"]);
    expect(pool(BANK, { unlocked: open("easy", "medium"), ids }).map((p) => p.id)).toEqual([
      "00003",
    ]);
  });

  it("comes back in pool order however it was narrowed", () => {
    expect(pool(BANK, { unlocked: open(...ALL) }).map((p) => p.grade)).toEqual([30, 90, 120, 330]);
  });

  it("can come back empty, and says so by being empty", () => {
    expect(pool(BANK, { unlocked: open(...ALL), tags: ["moves3"] })).toEqual([]);
  });
});
