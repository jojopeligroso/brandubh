import { describe, expect, it } from "vitest";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  VISIBLE_VARIANTS,
  ruleFlags,
  rulesFor,
  type CustomRuleSet,
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
// Asserted in `ruleChoices.test.ts`, not here. That file is the Morris twin of
// `../copenhagen/ruleChoices.test.ts` and holds the whole parity — every
// string-valued flag has choices and nothing else does, every preset's own value
// is offered, no duplicates, and copy for every value in every locale — so a
// second, shorter copy of three of those five assertions lived here until this
// review and only made two places to update.
