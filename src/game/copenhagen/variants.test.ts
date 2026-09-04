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
// compile, it just plays a different game. So every shipped preset is asserted
// flag by flag here, exactly as `../tablut/variants.test.ts` does, and the
// assertions are written out longhand rather than derived from the object under
// test. A test that says `expect(v.escape).toBe(v.escape)` passes forever.

describe("the copenhagen preset", () => {
  const v = VARIANTS.copenhagen;

  it("asserts the eleven rules, flag by flag", () => {
    expect(ruleFlags(v)).toEqual({
      escape: "corners", // rule 6
      firstMove: "attackers", // rule 2
      armedKing: true,
      kingMayReoccupyThrone: true,
      throneBlocks: "none", // rule 5 — pieces pass over the empty throne
      throneAnvil: "both", // rule 5 — the empty throne is hostile to both
      throneHostileToKing: true, // rule 7 — three attackers plus the throne
      cornersRestricted: true, // rule 5
      cornersHostile: true, // rule 5
      edgeHostileToSoldiers: false, // the rim is never hostile
      kingStrength: "strong", // rule 7 — four attackers
      strongKingEdgeRule: "uncapturable", // ⚠ contested; see below
      shieldwallCapture: true, // rule 4b
      exitFort: true, // rule 6b
      encirclementWin: true, // rule 7b
      repetitionResult: "loss_for_repeater", // rule 8
    } satisfies CustomRuleSet);
  });

  it("is the default, and the first thing the picker offers", () => {
    expect(DEFAULT_VARIANT).toBe("copenhagen");
    expect(VISIBLE_VARIANTS[0]).toBe("copenhagen");
  });

  it("is what the custom rule editor starts from", () => {
    // Unlike the other two games, whose editors start from a minimal baseline.
    // Copenhagen's default is a published ruleset, so the useful starting point
    // is "Copenhagen, but…" rather than "assert nothing, then build it up".
    expect(CUSTOM_RULE_DEFAULTS).toEqual(ruleFlags(v));
  });
});

describe("the fetlar preset", () => {
  const v = VARIANTS["copenhagen-fetlar"];

  it("is Copenhagen minus the three rules Copenhagen added", () => {
    expect(v.shieldwallCapture).toBe(false);
    expect(v.exitFort).toBe(false);
    expect(v.encirclementWin).toBe(false);
    expect(v.repetitionResult).toBe("loss_for_defenders");
  });

  it("keeps the board, the goal and the strong king", () => {
    expect(v.escape).toBe("corners");
    expect(v.firstMove).toBe("attackers");
    expect(v.kingStrength).toBe("strong");
    expect(v.strongKingEdgeRule).toBe("uncapturable");
  });

  it("still says UNVERIFIED in the app", () => {
    // This test exists to make the warning hard to remove by accident, not to be
    // permanent. It is reconstructed from secondary descriptions of how Fetlar
    // and Copenhagen differ, not from the Fetlar rules themselves. **If you
    // verify it against a primary source, delete this test in the same commit**
    // — the same contract `../tablut/variants.test.ts` has for `tablut-aage`.
    expect(v.blurb).toContain("UNVERIFIED");
  });
});

describe("the contested edge rule", () => {
  it("ships the reading the aagenielsen-sourced excerpts agree on", () => {
    // Two independently-worded excerpts say the king cannot be captured on the
    // board edge; Cyningstan says he can. The disagreement is recorded in
    // docs/copenhagen-rules.md and reachable in the custom editor, and this
    // assertion is what makes flipping the shipped default a deliberate act.
    expect(VARIANTS.copenhagen.strongKingEdgeRule).toBe("uncapturable");
  });

  it("is reachable the other way through the custom editor", () => {
    const other = rulesFor("custom", {
      ...CUSTOM_RULE_DEFAULTS,
      strongKingEdgeRule: "available_sides",
    });
    expect(other.strongKingEdgeRule).toBe("available_sides");
    expect(other.id).toBe("custom");
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

  it("keeps every visible preset resolvable", () => {
    for (const id of VISIBLE_VARIANTS) expect(VARIANTS[id]).toBeDefined();
  });

  it("gives every preset an id matching its key", () => {
    for (const [id, v] of Object.entries(VARIANTS)) expect(v.id).toBe(id);
  });
});
