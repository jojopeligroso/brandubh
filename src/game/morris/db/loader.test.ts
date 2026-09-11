// The manifest reader, the "which tables could this game still reach" rule, and —
// when the shipped tables are actually on disk — that the files in
// `public/morris/db/` are the tables the manifest says they are.
//
// The file check is conditional on purpose: the tables are generated artefacts, and
// a checkout without them must still have a green suite (the engine's behaviour
// without tables is a supported mode, not a broken one). When they are there, it is
// the only test that reads a *shipped byte*, so it checks the two things a bad write
// would show up as: a length that disagrees with the index, and a table whose bytes
// decode to values outside the encoding.

import { describe, expect, it } from "vitest";

import { DB_FORMAT, parseManifest, tableKeysFor } from "./loader";
import { readManifest, readTable } from "./loader.node";
import { GASSER_DB_RULES } from "./generate";
import { entriesFor, entryDepth, entryValue } from "./index";

const DB_DIR = "public/morris/db";

describe("the manifest", () => {
  it("accepts a well-formed manifest and rejects everything else", () => {
    const good = JSON.stringify({
      format: DB_FORMAT,
      variant: "morris-gasser-1",
      rules: GASSER_DB_RULES,
      generated: "x",
      tables: [{ key: "3-3", m: 3, o: 3, entries: 1, bytes: 1, gzipBytes: 1, sha256: "" }],
    });
    const parsed = parseManifest(good);
    expect(parsed?.tables.map((t) => t.key)).toEqual(["3-3"]);
    expect(parseManifest("not json")).toBeNull();
    expect(parseManifest("[]")).toBeNull();
    expect(parseManifest(JSON.stringify({ format: "other", tables: [] }))).toBeNull();
    // A format bump must not be read under the current index.
    expect(parseManifest(good.replace(DB_FORMAT, "morris-db-2"))).toBeNull();
    // Keys that are not stone-count pairs are dropped rather than trusted.
    const odd = JSON.parse(good) as { tables: { key: string }[] };
    odd.tables.push({ key: "../../etc/passwd" });
    expect(parseManifest(JSON.stringify(odd))?.tables).toHaveLength(1);
  });

  it("asks only for tables the current stone counts can still reach", () => {
    const available = ["3-3", "3-4", "4-3", "4-4", "3-5", "5-3"];
    expect(tableKeysFor(9, 9, available).sort()).toEqual([...available].sort());
    expect(tableKeysFor(4, 3, available).sort()).toEqual(["3-3", "3-4", "4-3"]);
    expect(tableKeysFor(3, 3, available)).toEqual(["3-3"]);
    expect(tableKeysFor(2, 9, available)).toEqual([]);
    expect(tableKeysFor(9, 9, ["nonsense"])).toEqual([]);
  });
});

describe("the shipped tables, when they are on disk", () => {
  it("match their manifest entries and decode to legal entries", async () => {
    const manifest = await readManifest(DB_DIR);
    if (manifest === null) return; // not generated in this checkout — see head comment
    expect(manifest.format).toBe(DB_FORMAT);
    expect(manifest.rules).toEqual(GASSER_DB_RULES);
    expect(manifest.tables.length).toBeGreaterThan(0);
    for (const entry of manifest.tables) {
      const bytes = await readTable(DB_DIR, entry.key);
      expect(bytes, entry.key).not.toBeNull();
      if (bytes === null) continue;
      expect(bytes.length).toBe(entry.entries);
      expect(bytes.length).toBe(entriesFor(entry.m, entry.o));
      let win = 0;
      let loss = 0;
      let draw = 0;
      let maxDepth = 0;
      let illegal = 0;
      for (let i = 0; i < bytes.length; i++) {
        const value = entryValue(bytes[i]);
        const depth = entryDepth(bytes[i]);
        if (value === 1) win++;
        else if (value === 2) loss++;
        else if (value === 0) draw++;
        else illegal++;
        if (value !== 0 && depth > maxDepth) maxDepth = depth;
        if (value === 0 && depth !== 0) illegal++;
      }
      expect({ key: entry.key, win, loss, draw, maxDepth, illegal }).toEqual({
        key: entry.key,
        win: entry.win,
        loss: entry.loss,
        draw: entry.draw,
        maxDepth: entry.maxDepth,
        illegal: 0,
      });
    }
  }, 60_000);
});
