import { describe, expect, it } from "vitest";
import { VISIBLE_LANGS, translations, type Lang, type Translations } from "./i18n";
import { isGaelicLang, toSeanchloTable } from "./gaelic";

const LANGS = Object.keys(translations) as Lang[];

// `VISIBLE_LANGS` was exported and then never imported: the header hardcoded its
// own EN/ES buttons, so the list said one thing and the UI did another. These
// tests pin the list as the single source of truth for what is on offer — which
// is what makes holding a locale back a deliberate, one-place decision rather
// than an accident of where the buttons happen to be written.

describe("VISIBLE_LANGS is the language list", () => {
  it("only ever offers a language that has a translation table", () => {
    for (const { code } of VISIBLE_LANGS) expect(LANGS).toContain(code);
  });

  it("holds Irish back until its translation has been reviewed", () => {
    // The table is complete and the cló rendering works (below); what it has
    // not had is a translation review, so the interface surface stays hidden.
    // Delete this test in the same change that reveals it.
    expect(translations.ga).toBeDefined();
    expect(VISIBLE_LANGS.map((l) => l.code)).not.toContain("ga");
  });

  it("gives each one a distinct, non-empty label", () => {
    const labels = VISIBLE_LANGS.map((l) => l.label);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("names no language twice", () => {
    const codes = VISIBLE_LANGS.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

// Every table is checked, offered or not. A locale held back for review still
// has to be complete and still has to render — otherwise "hidden" quietly turns
// into "rotting", and the day it is revealed becomes a day of surprises.
describe("every language table is complete", () => {
  const keysOf = (t: Translations): string[] => {
    const out: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") out.push(path);
      else if (v && typeof v === "object")
        for (const [k, sub] of Object.entries(v)) walk(sub, `${path}.${k}`);
    };
    walk(t, "");
    return out.sort();
  };

  it.each(LANGS)("%s has the whole table filled in", (code) => {
    const table = translations[code];
    expect(keysOf(table)).toEqual(keysOf(translations.en));
    const blanks = keysOf(table).filter((path) => {
      const v = path
        .split(".")
        .slice(1)
        .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], table);
      return typeof v === "string" && v.trim() === "";
    });
    expect(blanks).toEqual([]);
  });

  it("leaves a Gaelic locale legible after the overdot conversion", () => {
    // The whole table is rewritten into overdot orthography before it is shown
    // (see gaelic.ts). The conversion drops the "h" of every séimhiú, so the
    // result must still be non-empty everywhere and must carry no bare "h"
    // hanging off a lenitable consonant.
    for (const code of LANGS.filter(isGaelicLang)) {
      const converted = toSeanchloTable(translations[code]);
      const leftovers: string[] = [];
      const walk = (v: unknown, path: string) => {
        if (typeof v === "string") {
          expect(v.trim(), path).not.toBe("");
          if (/[bcdfgmpstBCDFGMPST][hH]/.test(v)) leftovers.push(`${path}: ${v}`);
        } else if (v && typeof v === "object")
          for (const [k, sub] of Object.entries(v)) walk(sub, `${path}.${k}`);
      };
      walk(converted, code);
      // "bhf" is eclipsis, not séimhiú: the b stays and only the f is dotted,
      // so a "bḟ" is correct and anything else is an unconverted séimhiú.
      expect(leftovers).toEqual([]);
    }
  });
});
