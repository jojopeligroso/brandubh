import { describe, expect, it } from "vitest";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  ENUM_RULE_VALUES,
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

  it("asserts every rule, sourced and unsourced alike, flag by flag", () => {
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
      strongKingEdgeRule: "three_attackers", // ⚠ contested; see below
      shieldwallCapture: true, // rule 4b
      exitFort: true, // rule 6b
      encirclementWin: true, // rule 7b
      edgeCompletesRing: true, // owner's decision, not rule 7b's wording
      entombedKingLoses: true, // owner's decision, in no published ruleset
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

  it("carries neither of the two rules that are nobody's but this project's", () => {
    // Both belong to the Copenhagen preset by the owner's decision, and this
    // preset is meant to be a *contrast* — so it gets the sourced reading of
    // rule 7b (the rim is not part of the ring) and no entombment rule at all.
    expect(v.edgeCompletesRing).toBe(false);
    expect(v.entombedKingLoses).toBe(false);
  });

  it("keeps the board, the goal and the strong king", () => {
    expect(v.escape).toBe("corners");
    expect(v.firstMove).toBe("attackers");
    expect(v.kingStrength).toBe("strong");
  });

  it("is where the edge-safe king now lives", () => {
    // Every excerpt saying "the king cannot be captured on the board edge" is,
    // on the best reading available, describing *Fetlar* — which is exactly what
    // Cyningstan says the difference between the two rulesets is. Asserting it
    // here rather than on Copenhagen makes the contested rule a contrast someone
    // can sit down and play.
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
  it("ships the three-attacker reading, and says so on purpose", () => {
    // Three readings, three sources, no primary text reachable from here: the
    // aagenielsen-sourced excerpts say the king cannot be captured on the board
    // edge, Cyningstan says he falls to two attackers beside a corner, and a
    // third says three attackers on an edge square. The shipped value is the
    // owner's decision between them, recorded in docs/copenhagen-rules.md — and
    // this assertion is what makes changing it a deliberate act rather than a
    // drive-by edit.
    expect(VARIANTS.copenhagen.strongKingEdgeRule).toBe("three_attackers");
  });

  it("keeps both other readings reachable through the custom editor", () => {
    for (const reading of ["uncapturable", "available_sides"] as const) {
      const other = rulesFor("custom", {
        ...CUSTOM_RULE_DEFAULTS,
        strongKingEdgeRule: reading,
      });
      expect(other.strongKingEdgeRule).toBe(reading);
      expect(other.id).toBe("custom");
    }
  });
});

describe("the enum value table", () => {
  // Two callers read it at runtime, where the type has gone: the file parser
  // refusing a bad value out of an imported file, and the custom rule editor
  // drawing a button per value. A missing entry is not a wrong label, it is
  // `undefined.map(...)` — which is what taking the setup screen down looks
  // like, and what it did until `kingStrength` and `strongKingEdgeRule` were
  // added to it.
  it("covers every enum rule, and nothing else", () => {
    const enumKeys = (Object.keys(CUSTOM_RULE_DEFAULTS) as Array<keyof CustomRuleSet>).filter(
      (k) => typeof CUSTOM_RULE_DEFAULTS[k] === "string",
    );
    expect(Object.keys(ENUM_RULE_VALUES).sort()).toEqual([...enumKeys].sort());
  });

  it("offers at least two values for each, and includes every shipped one", () => {
    for (const [key, values] of Object.entries(ENUM_RULE_VALUES)) {
      expect(values.length, key).toBeGreaterThan(1);
      expect(new Set(values).size, key).toBe(values.length);
      for (const v of Object.values(VARIANTS))
        expect(values, `${v.id}.${key}`).toContain(v[key as keyof CustomRuleSet]);
    }
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
