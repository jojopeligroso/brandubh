import { describe, expect, it } from "vitest";
import { translations, type Lang } from "../../i18n";
import {
  CUSTOM_RULE_DEFAULTS,
  ENUM_CHOICES,
  VARIANTS,
  type CustomRuleSet,
  type EnumRuleKey,
} from "./variants";

// The parity `ENUM_CHOICES` exists to hold, now that the custom rule editor
// (`CopenhagenScreen.tsx`) and the game file's `Rules` tag (`gameFile.ts`)
// both read it instead of each keeping their own copy — see the comment
// beside `ENUM_CHOICES` in `variants.ts` for the history.
//
// Before that table existed, the editor's own copy was a stale, hand-copied
// duplicate of Tablut's: it had no entries at all for `kingStrength` or
// `strongKingEdgeRule` — so opening the Custom editor threw `undefined.map` —
// and its `repetitionResult` list omitted `loss_for_repeater`, Copenhagen's
// own shipped default. Every assertion below is chosen to have failed against
// that exact table; see the git history of this file for the failing run
// captured against it.

const LANGS = Object.keys(translations) as Lang[];

const ALL_KEYS = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
/** Independent of `ENUM_CHOICES` itself: derived straight from the runtime
 *  type of each default, the same way the editor and `gameFile.ts` derive
 *  which flags are enums at all. */
const ENUM_KEYS = ALL_KEYS.filter(
  (k): k is EnumRuleKey => typeof CUSTOM_RULE_DEFAULTS[k] === "string",
);

describe("Copenhagen's ENUM_CHOICES", () => {
  it("has an entry for every string-valued flag in CustomRuleSet", () => {
    for (const key of ENUM_KEYS) {
      expect(Object.keys(ENUM_CHOICES), `missing choices for "${key}"`).toContain(key);
    }
  });

  it("has no entry for a flag that is not string-valued", () => {
    // Catches the reverse mistake too: a leftover or copy-pasted key that
    // does not name a flag in the current ruleset shape at all.
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
