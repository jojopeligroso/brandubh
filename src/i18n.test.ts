import { describe, expect, it } from "vitest";
import { VISIBLE_LANGS, translations, type Lang, type Translations } from "./i18n";
import { isGaelicLang, toSeanchloTable } from "./gaelic";
import { TUTORIALS, type TutorialMistake } from "./game/tutorials";
import { CUSTOM_RULE_DEFAULTS as TABLUT_RULE_DEFAULTS } from "./game/tablut/variants";
import { CUSTOM_RULE_DEFAULTS as COPENHAGEN_RULE_DEFAULTS } from "./game/copenhagen/variants";
import { CUSTOM_RULE_DEFAULTS as MORRIS_RULE_DEFAULTS } from "./game/morris/variants";
import type { MorrisStatus } from "./game/morris/types";

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

// The tutorial copy is keyed by data that lives in game/tutorials.ts, so key
// parity between the tables is not enough — a new drill or a new kind of
// refusal has to bring its wording with it, in every language.
describe("tutorial copy covers the tutorial data", () => {
  const MISTAKES: TutorialMistake[] = [
    "roadOpen",
    "losesGame",
    "noCapture",
    "wrongCapture",
    "kingStands",
    "noEscape",
    "notForcing",
  ];

  it.each(LANGS)("%s names every drill and every mistake", (code) => {
    const table = translations[code];
    for (const sc of TUTORIALS) {
      expect(table.tutorialTitles[sc.id], `${code} title for ${sc.id}`).toBeTruthy();
      expect(table.tutorialGoals[sc.id], `${code} goal for ${sc.id}`).toBeTruthy();
      expect(table.tutorialHints[sc.id], `${code} hint for ${sc.id}`).toBeTruthy();
    }
    for (const m of MISTAKES) {
      expect(table.tutorialMistakes[m], `${code} wording for mistake "${m}"`).toBeTruthy();
    }
    expect(Object.keys(table.tutorialMistakes).sort()).toEqual([...MISTAKES].sort());
  });
});

// ── The rule editors' copy ────────────────────────────────────────────────────
// Both custom rule editors are driven by `Object.keys(CUSTOM_RULE_DEFAULTS)` and
// look each flag up in `taflRules` / `taflRuleHints`. Those are
// `Record<string, string>`, so `tsc` cannot notice a rule that was added to a
// ruleset and never explained to the player — the card would simply render
// `undefined` where its name should be. These tests are what notices instead.
//
// Enum *values* matter for the same reason and are easier to miss: adding a
// fourth `repetitionResult` shows up in the editor as a radio button labelled
// `undefined`, and nothing else in the project would fail.

describe("every rule the editors can show has copy for it", () => {
  // Each entry names the ruleset *and the tables its editor reads*, because the
  // fourth board does not read the same ones: Morris is not a tafl game
  // (ADR-0008), so `MorrisScreen`'s editor looks its flags up in `morrisRules` /
  // `morrisRuleHints` / `morrisRuleValues`. Before these names were part of the
  // loop, adding a board here meant this test asserted copy in a table that
  // board never renders — passing while the card showed `undefined`.
  const RULESETS = [
    ["Tablut", TABLUT_RULE_DEFAULTS as Record<string, unknown>, "taflRules", "taflRuleHints", "taflRuleValues"],
    ["Copenhagen", COPENHAGEN_RULE_DEFAULTS as Record<string, unknown>, "taflRules", "taflRuleHints", "taflRuleValues"],
    ["Morris", MORRIS_RULE_DEFAULTS as Record<string, unknown>, "morrisRules", "morrisRuleHints", "morrisRuleValues"],
  ] as const;

  for (const lang of LANGS) {
    const t = translations[lang];

    for (const [game, defaults, namesKey, hintsKey, valuesKey] of RULESETS) {
      it(`names and explains every ${game} flag in ${lang}`, () => {
        for (const key of Object.keys(defaults)) {
          expect(t[namesKey][key], `${lang}: ${namesKey}.${key}`).toBeTruthy();
          expect(t[hintsKey][key], `${lang}: ${hintsKey}.${key}`).toBeTruthy();
        }
      });

      it(`labels every ${game} enum value in ${lang}`, () => {
        for (const value of Object.values(defaults)) {
          if (typeof value !== "string") continue;
          // The default value is the one the editor is guaranteed to render; the
          // rest are covered where each game's full value list lives — the
          // ENUM_RULE_VALUES parity test in the tafl games' gameFile.test.ts, and
          // `game/morris/ruleChoices.test.ts` for Morris, whose own
          // gameFile.test.ts does not carry that list.
          expect(t[valuesKey][value], `${lang}: ${valuesKey}.${value}`).toBeTruthy();
        }
      });
    }
  }
});

// ── Morris endings ────────────────────────────────────────────────────────────
// `morrisGameOverText` (game/morris/gameOverText.ts) is a lookup into
// `morrisStatuses` rather than the tafl version's `switch`, so `tsc` cannot
// notice a status with no sentence — a finished game would simply show a blank
// result line. This is what notices. The list is written out rather than derived
// because `MorrisStatus` is a type: a new member has to be added here too, which
// is the prompt to write its copy.

describe("every Morris ending has copy for it", () => {
  const ENDINGS: Exclude<MorrisStatus, "playing">[] = [
    "white_win_stones",
    "black_win_stones",
    "white_win_blocked",
    "black_win_blocked",
    "white_win_resign",
    "black_win_resign",
    "white_win_time",
    "black_win_time",
    "draw_repetition",
    "draw_no_mill",
  ];

  it.each(LANGS)("%s names every way a Morris game can end", (code) => {
    const t = translations[code];
    for (const status of ENDINGS) {
      expect(t.morrisStatuses[status], `${code}: morrisStatuses.${status}`).toBeTruthy();
    }
    // And nothing else: a stale key here is a sentence for an ending that no
    // longer exists, which would read as copy for a status the game can reach.
    expect(Object.keys(t.morrisStatuses).sort()).toEqual([...ENDINGS].sort());
  });
});
