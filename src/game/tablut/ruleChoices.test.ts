import { describe, expect, it } from "vitest";
import { translations, type Lang } from "../../i18n";
import {
  CUSTOM_RULE_DEFAULTS,
  ENUM_CHOICES,
  VARIANTS,
  type CustomRuleSet,
  type EnumRuleKey,
} from "./variants";

// The Tablut twin of `../copenhagen/ruleChoices.test.ts`. Tablut's own
// `ENUM_CHOICES` was never wrong the way Copenhagen's stale copy of it was —
// this file exists so the two screens stay structurally identical and so a
// future flag added only to `TablutRuleSet` gets the same guard Copenhagen's
// bug taught the project to want.

const LANGS = Object.keys(translations) as Lang[];

const ALL_KEYS = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
const ENUM_KEYS = ALL_KEYS.filter(
  (k): k is EnumRuleKey => typeof CUSTOM_RULE_DEFAULTS[k] === "string",
);

describe("Tablut's ENUM_CHOICES", () => {
  it("has an entry for every string-valued flag in CustomRuleSet", () => {
    for (const key of ENUM_KEYS) {
      expect(Object.keys(ENUM_CHOICES), `missing choices for "${key}"`).toContain(key);
    }
  });

  it("has no entry for a flag that is not string-valued", () => {
    expect(Object.keys(ENUM_CHOICES).sort()).toEqual([...ENUM_KEYS].sort());
  });

  it("offers every shipped preset's value for each of its enum flags", () => {
    for (const [id, preset] of Object.entries(VARIANTS)) {
      for (const key of ENUM_KEYS) {
        expect(ENUM_CHOICES[key], `${id}.${key} = ${preset[key]}`).toContain(preset[key]);
      }
    }
  });

  it.each(LANGS)("has %s copy for every value it offers", (lang) => {
    const t = translations[lang];
    for (const key of ENUM_KEYS) {
      for (const value of ENUM_CHOICES[key]) {
        expect(t.taflRuleValues[value], `${lang}: taflRuleValues.${value}`).toBeTruthy();
      }
    }
  });
});
