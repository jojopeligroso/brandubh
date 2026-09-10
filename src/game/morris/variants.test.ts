import { describe, expect, it } from "vitest";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  ENUM_CHOICES,
  VARIANTS,
  VISIBLE_VARIANTS,
  ruleFlags,
  rulesFor,
  type CustomRuleSet,
  type EnumRuleKey,
} from "./variants";

// A preset is *data*, and a wrong flag in data is silent — it does not fail to
// compile, it just plays a different game. So the shipped preset is asserted flag
// by flag here, written out longhand rather than derived from the object under
// test, exactly as the three tafl games' variant tests do. A test that says
// `expect(v.flying).toBe(v.flying)` passes forever.

describe("the shipped Gasser preset", () => {
  const v = VARIANTS["morris-gasser-1"];

  it("asserts the rules flag by flag", () => {
    expect(ruleFlags(v)).toEqual({
      // ⚠ UNVERIFIED (excerpt): the convention, not a sourced statement — see the
      // field's own comment in variants.ts.
      firstMove: "white",
      // ⚠ UNVERIFIED (excerpt): the excerpts say Gasser's solution used flying.
      flying: "three",
      // Gasser, stated explicitly in the excerpts: when every enemy stone is in a
      // mill, any of them may be taken…
      removeFromMillsWhenAllInMills: true,
      // …and closing two mills at once still takes exactly one.
      doubleMillRemoves: "one",
      // The two practical terminations. NOT in the paper — owner additions, so a
      // played game ends instead of shuffling forever.
      repetitionResult: "draw",
      noMillDrawMoves: "50",
    } satisfies CustomRuleSet);
  });

  it("is the default, the only visible preset, and what the editor starts from", () => {
    expect(DEFAULT_VARIANT).toBe("morris-gasser-1");
    expect(VISIBLE_VARIANTS).toEqual(["morris-gasser-1"]);
    expect(CUSTOM_RULE_DEFAULTS).toEqual(ruleFlags(v));
  });

  it("says in its own blurb that the draw rules are not Gasser's", () => {
    // The honesty the design contract asks for has to survive a blurb rewrite.
    expect(v.blurb).toMatch(/practical additions/);
  });
});

describe("resolving a ruleset", () => {
  it("round-trips every preset through flags and back", () => {
    for (const [id, v] of Object.entries(VARIANTS)) {
      expect(rulesFor(id, CUSTOM_RULE_DEFAULTS)).toEqual(v);
      expect(rulesFor("custom", ruleFlags(v))).toEqual({
        ...v,
        id: "custom",
        name: "Custom",
        blurb: "Your custom ruleset.",
      });
    }
  });

  it("builds a custom ruleset from edited flags", () => {
    const strict = rulesFor("custom", {
      ...CUSTOM_RULE_DEFAULTS,
      flying: "none",
      repetitionResult: "none",
      noMillDrawMoves: "none",
    });
    // The paper's own game, with neither practical draw rule.
    expect(strict.id).toBe("custom");
    expect(strict.flying).toBe("none");
    expect(strict.repetitionResult).toBe("none");
    expect(strict.noMillDrawMoves).toBe("none");
    expect(strict.removeFromMillsWhenAllInMills).toBe(true);
  });

  it("keeps every visible preset resolvable, and every id matching its key", () => {
    for (const id of VISIBLE_VARIANTS) expect(VARIANTS[id]).toBeDefined();
    for (const [id, v] of Object.entries(VARIANTS)) expect(v.id).toBe(id);
  });
});

// ── ENUM_CHOICES ──────────────────────────────────────────────────────────────
// The parity the table exists to hold. Derived from the runtime type of each
// default rather than from `ENUM_CHOICES` itself, so the two cannot agree by
// construction — this is the mistake that shipped in Copenhagen's rule editor
// (a stale copy with two flags missing, which threw `undefined.map` when opened).

const ALL_KEYS = Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>;
const ENUM_KEYS = ALL_KEYS.filter(
  (k): k is EnumRuleKey => typeof CUSTOM_RULE_DEFAULTS[k] === "string",
);

describe("Morris's ENUM_CHOICES", () => {
  it("has an entry for every string-valued flag, and none for anything else", () => {
    for (const key of ENUM_KEYS)
      expect(Object.keys(ENUM_CHOICES), `missing choices for "${key}"`).toContain(key);
    expect(Object.keys(ENUM_CHOICES).sort()).toEqual([...ENUM_KEYS].sort());
  });

  it("offers every shipped preset's own value for each enum flag", () => {
    for (const [id, preset] of Object.entries(VARIANTS))
      for (const key of ENUM_KEYS)
        expect(ENUM_CHOICES[key], `${id}.${key} = ${preset[key]}`).toContain(preset[key]);
  });

  it("offers no duplicate and no empty choice list", () => {
    for (const key of ENUM_KEYS) {
      const values = ENUM_CHOICES[key];
      expect(values.length).toBeGreaterThan(1);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
