import { describe, expect, it } from "vitest";
import { translations, type Lang } from "../../i18n";
import {
  CUSTOM_RULE_DEFAULTS,
  ENUM_CHOICES,
  VARIANTS,
  type CustomRuleSet,
  type EnumRuleKey,
} from "./variants";

// The Morris twin of `../copenhagen/ruleChoices.test.ts`, and it exists for the
// bug that file records rather than for symmetry: before `ENUM_CHOICES` was one
// table, the custom rule editor and the game file's `Rules` tag each kept their
// own copy of the permitted values, and the editor's was a stale copy of another
// game's — so opening Custom threw `undefined.map`. Both now read this table
// (`MorrisScreen.tsx` and `gameFile.ts`), so the parity it has to hold is: every
// string-valued flag has choices, nothing else does, every shipped preset's value
// is among them, and every value has copy in every locale.
//
// The copy half looks the same as the Copenhagen test and is not: Morris reads
// `morrisRuleValues`, not `taflRuleValues` (ADR-0008 — the `tafl*` keys say
// nothing here). Asserting against the tafl table would have passed while the
// editor rendered `undefined`.

const LANGS = Object.keys(translations) as Lang[];

const ALL_KEYS = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
/** Independent of `ENUM_CHOICES` itself: derived straight from the runtime type
 *  of each default, the same way the editor and `gameFile.ts` derive which flags
 *  are enums at all. */
const ENUM_KEYS = ALL_KEYS.filter(
  (k): k is EnumRuleKey => typeof CUSTOM_RULE_DEFAULTS[k] === "string",
);

describe("Morris's ENUM_CHOICES", () => {
  it("has an entry for every string-valued flag in CustomRuleSet", () => {
    for (const key of ENUM_KEYS) {
      expect(Object.keys(ENUM_CHOICES), `missing choices for "${key}"`).toContain(key);
    }
  });

  it("has no entry for a flag that is not string-valued", () => {
    // Catches the reverse mistake too: a leftover or copy-pasted key that does
    // not name a flag in the current ruleset shape at all.
    expect(Object.keys(ENUM_CHOICES).sort()).toEqual([...ENUM_KEYS].sort());
  });

  it("offers every shipped preset's value for each of its enum flags", () => {
    for (const [id, preset] of Object.entries(VARIANTS)) {
      for (const key of ENUM_KEYS) {
        expect(ENUM_CHOICES[key], `${id}.${key} = ${preset[key]}`).toContain(preset[key]);
      }
    }
  });

  it("offers at least two values per flag — a control with one choice is a label", () => {
    for (const key of ENUM_KEYS) {
      expect(ENUM_CHOICES[key].length, key).toBeGreaterThan(1);
      expect(new Set(ENUM_CHOICES[key]).size, key).toBe(ENUM_CHOICES[key].length);
    }
  });

  it.each(LANGS)("has %s copy for every value it offers", (lang) => {
    const t = translations[lang];
    for (const key of ENUM_KEYS) {
      for (const value of ENUM_CHOICES[key]) {
        expect(t.morrisRuleValues[value], `${lang}: morrisRuleValues.${value}`).toBeTruthy();
      }
    }
  });
});
