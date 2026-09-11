// A table is an answer about the game its generator played.
//
// This is the one thing the database path got wrong: `probeFor` and `makeProbe`
// took a position and no ruleset, the manifest's own `rules` field was parsed and
// never compared, and so `Setup → Custom → Flying = None → Ollamh` read Gasser's
// flying tables and reported what it found as *perfect play*. The position below is
// the reviewer's repro and it is as sharp as the bug gets: three stones each, and
// the table's "win in 1" is a flight to the far corner that no player may make when
// `flying` is `"none"`.
//
// What is asserted is the whole chain: the flags are compared field by field
// (`sameMoveGenRules`), the probe refuses a mismatched table set outright
// (`makeProbe`), the fetch refuses it before spending the download (`probeFor`), and
// the engine handed the refusing probe answers out of its own search with no
// `fromDatabase` claim attached — while the matching case still reads the table, one
// flag away, in the same call.
//
// The last block is the other half of the same path: `parseManifest` has to answer
// "no" to a hostile manifest rather than throw, because the rules it carries are the
// thing now being trusted to gate all of the above.

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_WEIGHTS, FULL_CONFIG, pickMove } from "../engine";
import { allMoves, masksOf, moveName, pointIndex } from "../rules";
import { POINT_COUNT, type Board, type Cell, type GameState } from "../types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor, type MorrisRuleSet } from "../variants";
import { GASSER_DB_RULES, sameMoveGenRules } from "./generate";
import { VAL_WIN, encodeEntry, entriesFor, indexOf } from "./index";
import { DB_FORMAT, parseManifest } from "./loader";
import { makeProbe } from "./probe";
import { probeFor, resetProbeCache } from "./probeFor";

const GASSER = VARIANTS["morris-gasser-1"];
/** The same game with flying switched off — reachable from the setup sheet's custom
 *  editor, which is what makes this a user-facing bug rather than a theoretical
 *  one. */
const NOFLY = rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, flying: "none" });
/** The shipped preset with one flag changed. A named function rather than an inline
 *  literal so the argument is a `MorrisRuleSet` — which is what the real callers
 *  pass — and not a fresh literal measured against the narrower `MoveGenRules`. */
const patched = (patch: Partial<MorrisRuleSet>): MorrisRuleSet => ({ ...GASSER, ...patch });

function boardOf(white: string[], black: string[]): Board {
  const b = Array<Cell>(POINT_COUNT).fill(0);
  for (const n of white) b[pointIndex(n)] = 1;
  for (const n of black) b[pointIndex(n)] = 2;
  return b;
}

/** White to move, three stones each, both hands empty: the moving phase, in the
 *  3-3 table's domain. */
const REPRO: GameState = {
  board: boardOf(["a7", "g7", "g4"], ["d7", "d1", "a1"]),
  turn: "white",
  inHand: { white: 0, black: 0 },
  status: "playing",
  history: [],
  sinceMill: 0,
};

/**
 * A 3-3 table saying exactly one thing: the repro position is a win in one ply for
 * the side to move. Hand-built rather than read off disk so the test holds in a
 * checkout with no generated tables, and so the *only* entry it can possibly answer
 * from is the one being reasoned about.
 */
function tablesSayingWinInOne(): Map<string, Uint8Array> {
  const { white, black } = masksOf(REPRO.board);
  const table = new Uint8Array(entriesFor(3, 3));
  table[indexOf(white, black)] = encodeEntry(VAL_WIN, 1);
  return new Map([["3-3", table]]);
}

describe("a table's rules against the game's", () => {
  it("compares the three moving-phase flags and nothing else", () => {
    expect(sameMoveGenRules(GASSER_DB_RULES, GASSER)).toBe(true);
    // The two practical draw rules and `firstMove` are not the tables' business:
    // a table is addressed by position, so a path rule cannot change its contents.
    expect(sameMoveGenRules(GASSER_DB_RULES, patched({ noMillDrawMoves: "none" }))).toBe(true);
    expect(sameMoveGenRules(GASSER_DB_RULES, patched({ repetitionResult: "none" }))).toBe(true);
    expect(sameMoveGenRules(GASSER_DB_RULES, patched({ firstMove: "black" }))).toBe(true);
    // Each of the three that is.
    expect(sameMoveGenRules(GASSER_DB_RULES, NOFLY)).toBe(false);
    expect(sameMoveGenRules(GASSER_DB_RULES, patched({ doubleMillRemoves: "two" }))).toBe(false);
    expect(sameMoveGenRules(GASSER_DB_RULES, patched({ removeFromMillsWhenAllInMills: false }))).toBe(
      false,
    );
    // A manifest's `rules` is unknown data whatever its declared type.
    expect(sameMoveGenRules(null, GASSER)).toBe(false);
    expect(sameMoveGenRules(undefined, GASSER)).toBe(false);
    expect(sameMoveGenRules({}, GASSER)).toBe(false);
  });
});

describe("makeProbe", () => {
  it("answers when the tables are about this game", () => {
    const tables = tablesSayingWinInOne();
    const probe = makeProbe(tables, { rules: { tables: GASSER_DB_RULES, game: GASSER } });
    expect(probe(REPRO)).toEqual({ wdl: 1, depth: 1 });
  });

  it("refuses every lookup when they are not", () => {
    const tables = tablesSayingWinInOne();
    // Unchecked, this is the wrong answer the bug served — kept in the test so the
    // next reader can see that the table really does hit this position.
    expect(makeProbe(tables)(REPRO)).toEqual({ wdl: 1, depth: 1 });
    const probe = makeProbe(tables, { rules: { tables: GASSER_DB_RULES, game: NOFLY } });
    expect(probe(REPRO)).toBeNull();
  });
});

describe("probeFor", () => {
  const BASE = "https://example.invalid/morris/db/";
  /** Every URL the stub was asked for, so "refused before the download" is an
   *  assertion and not a hope. */
  let asked: string[] = [];

  function stubFetch(manifest: unknown): void {
    asked = [];
    (globalThis as { fetch: unknown }).fetch = (input: string): Promise<Response> => {
      asked.push(String(input));
      if (String(input).endsWith("manifest.json"))
        return Promise.resolve(
          new Response(JSON.stringify(manifest), { status: 200 }) as unknown as Response,
        );
      return Promise.resolve(new Response(null, { status: 404 }) as unknown as Response);
    };
  }

  const manifestWith = (rules: unknown): unknown => ({
    format: DB_FORMAT,
    variant: "morris-gasser-1",
    rules,
    generated: "test",
    tables: [{ key: "3-3", m: 3, o: 3, entries: entriesFor(3, 3), bytes: 0, gzipBytes: 0, sha256: "" }],
  });

  beforeEach(() => {
    resetProbeCache();
  });

  it("refuses a manifest whose rules are not the rules being played, before fetching a table", async () => {
    stubFetch(manifestWith(GASSER_DB_RULES));
    expect(await probeFor(BASE, REPRO, NOFLY)).toBeNull();
    expect(asked).toEqual([`${BASE}manifest.json`]);
  });

  it("refuses a manifest that does not say what rules it was generated under", async () => {
    stubFetch(manifestWith({ flying: "three" }));
    expect(await probeFor(BASE, REPRO, GASSER)).toBeNull();
    expect(asked.some((u) => u.endsWith(".bin.gz"))).toBe(false);
  });

  it("gets as far as the tables when they do match", async () => {
    stubFetch(manifestWith(GASSER_DB_RULES));
    // The stub serves no table bodies, so the probe is still null — what is
    // asserted is that the rules check let it through to ask for one, which is the
    // difference between "other rules" and "missing file".
    expect(await probeFor(BASE, REPRO, GASSER)).toBeNull();
    expect(asked).toContain(`${BASE}3-3.bin.gz`);
  });
});

describe("the engine, handed a probe for another game's tables", () => {
  it("searches instead, and claims nothing about a database", () => {
    const tables = tablesSayingWinInOne();
    const refusing = makeProbe(tables, { rules: { tables: GASSER_DB_RULES, game: NOFLY } });
    const result = pickMove(
      REPRO,
      NOFLY,
      { maxDepth: 4 },
      FULL_CONFIG,
      () => 0,
      DEFAULT_WEIGHTS,
      () => 0,
      refusing,
    );
    expect(result.fromDatabase).toBeFalsy();
    // And the move it plays is a move this ruleset actually has: with no flying,
    // every legal turn is a step along a line.
    const legal = allMoves(REPRO, NOFLY).map(moveName);
    expect(legal).toContain(moveName(result.move!));
    // The bug's signature was a score next to ±WIN carried out of the table; a
    // search of this position finds nothing of the kind.
    expect(Math.abs(result.score)).toBeLessThan(900_000);
  });

  it("does use the tables when the rules agree — the same call, one flag apart", () => {
    const tables = tablesSayingWinInOne();
    const matching = makeProbe(tables, { rules: { tables: GASSER_DB_RULES, game: GASSER } });
    const result = pickMove(
      REPRO,
      GASSER,
      { maxDepth: 4 },
      FULL_CONFIG,
      () => 0,
      DEFAULT_WEIGHTS,
      () => 0,
      matching,
    );
    expect(result.fromDatabase).toBe(true);
  });
});

describe("parseManifest", () => {
  it("treats a hostile entry as an entry to drop, not an exception to throw", () => {
    // `tables: [null]` threw a TypeError before the guard: the entries were
    // filtered for a parseable key *outside* the try, reading `.key` off whatever
    // the JSON happened to contain.
    const hostile = '{"format":"morris-db-1","variant":"x","rules":{},"tables":[null]}';
    expect(() => parseManifest(hostile)).not.toThrow();
    expect(parseManifest(hostile)?.tables).toEqual([]);
    for (const entry of ["null", "3", '"3-3"', "[]", "{}", '{"key":7}']) {
      const text = `{"format":"morris-db-1","variant":"x","rules":{},"tables":[${entry}]}`;
      expect(() => parseManifest(text), entry).not.toThrow();
      expect(parseManifest(text)?.tables, entry).toEqual([]);
    }
    // …and a manifest that says nothing about its rules cannot be used, which the
    // probe path above is what enforces.
    expect(sameMoveGenRules(parseManifest(hostile)?.rules, GASSER)).toBe(false);
  });
});
