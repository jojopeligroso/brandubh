import { describe, expect, it } from "vitest";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  VISIBLE_VARIANTS,
  ruleFlags,
  rulesFor,
  type CopenhagenRuleSet,
  type CustomRuleSet,
} from "./variants";

// A preset is *data*, and a wrong flag in data is silent — it does not fail to
// compile, it just plays a different game. So every shipped preset is asserted
// flag by flag here, exactly as `../tablut/variants.test.ts` does, and the
// assertions are written out longhand rather than derived from the object under
// test. A test that says `expect(v.escape).toBe(v.escape)` passes forever.
//
// 2026-09-09: `repetitionResult` was corrected from `"loss_for_repeater"` to
// `"loss_for_defenders"` (rule 8 — see docs/copenhagen-rules.md, "Corrections
// of 2026-09-09"), and both presets got a `-2` id. The pre-correction presets
// are kept under their original ids as LEGACY, asserted separately below.

describe("the copenhagen preset", () => {
  const v = VARIANTS["copenhagen-2"];

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
      // rule 8, corrected 2026-09-09: aagenielsen.dk, the De Angelis PDF and
      // aagenielsen.dk's unified rules page all say "a loss for White" in as
      // many words. "loss_for_repeater" traced to a secondary paraphrase, not
      // Copenhagen's own text — see docs/copenhagen-rules.md.
      repetitionResult: "loss_for_defenders",
    } satisfies CustomRuleSet);
  });

  it("is the default, and the first thing the picker offers", () => {
    expect(DEFAULT_VARIANT).toBe("copenhagen-2");
    expect(VISIBLE_VARIANTS[0]).toBe("copenhagen-2");
  });

  it("is what the custom rule editor starts from", () => {
    // Unlike the other two games, whose editors start from a minimal baseline.
    // Copenhagen's default is a published ruleset, so the useful starting point
    // is "Copenhagen, but…" rather than "assert nothing, then build it up".
    expect(CUSTOM_RULE_DEFAULTS).toEqual(ruleFlags(v));
  });
});

describe("the fetlar preset", () => {
  const v = VARIANTS["copenhagen-fetlar-2"];

  it("is Copenhagen minus the three rules Copenhagen added", () => {
    expect(v.shieldwallCapture).toBe(false);
    expect(v.exitFort).toBe(false);
    expect(v.encirclementWin).toBe(false);
    // Corrected 2026-09-09: Fetlar's own eleven rules are silent on
    // repetition, so asserting a specific consequence would be inventing a
    // rule the source does not contain — see docs/copenhagen-rules.md.
    expect(v.repetitionResult).toBe("none");
  });

  it("keeps the board and the strong king, but not the throne beside it", () => {
    expect(v.escape).toBe("corners");
    expect(v.firstMove).toBe("attackers");
    expect(v.kingStrength).toBe("strong");
    expect(v.strongKingEdgeRule).toBe("uncapturable");
    // Corrected 2026-09-09: Fetlar's rule 9 is "surrounded on all four sides"
    // with no throne-substitution clause, so the empty throne beside the king
    // does not count as a hostile wall — unlike Copenhagen's own rule 7. The
    // legacy preset inherited `true` from Copenhagen unchanged; see
    // docs/copenhagen-rules.md.
    expect(v.throneHostileToKing).toBe(false);
  });

  it("still says UNVERIFIED in the app", () => {
    // This test exists to make the warning hard to remove by accident, not to be
    // permanent. It is reconstructed from secondary descriptions of how Fetlar
    // and Copenhagen differ, not from the Fetlar rules themselves. **If you
    // verify it against a primary source, delete this test in the same commit**
    // — the same contract `../tablut/variants.test.ts` has for `tablut-aage-2`.
    expect(v.blurb).toContain("UNVERIFIED");
  });
});

describe("the contested edge rule", () => {
  it("ships the reading the aagenielsen-sourced excerpts agree on", () => {
    // Two independently-worded excerpts say the king cannot be captured on the
    // board edge; Cyningstan says he can. The disagreement is recorded in
    // docs/copenhagen-rules.md and reachable in the custom editor, and this
    // assertion is what makes flipping the shipped default a deliberate act.
    expect(VARIANTS["copenhagen-2"].strongKingEdgeRule).toBe("uncapturable");
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

describe("hiding a variant", () => {
  it("keeps every legacy id out of VISIBLE_VARIANTS, and every visible id off the legacy list", () => {
    const legacyIds = ["copenhagen", "copenhagen-fetlar"];
    for (const id of legacyIds) expect(VISIBLE_VARIANTS).not.toContain(id);
    for (const id of VISIBLE_VARIANTS) expect(legacyIds).not.toContain(id);
  });
});

// ── Legacy presets ────────────────────────────────────────────────────────────
//
// The two presets that shipped before the 2026-09-09 correction, kept under
// their original ids at their original flag values — `copenhagen` with
// `repetitionResult: "loss_for_repeater"`, `copenhagen-fetlar` with
// `throneHostileToKing: true` inherited unattested from Copenhagen — so a
// game saved (`copenhagen.game.v1`) or exported (a `.tafl` file) under one of
// them keeps replaying into the exact game it recorded. Each frozen object
// below is a literal copy, not derived from `VARIANTS`, so a future edit to
// the source preset would fail this test rather than silently moving the
// goalposts.
describe("legacy presets — frozen, unchanged, hidden", () => {
  const frozen: Record<string, CopenhagenRuleSet> = {
    copenhagen: {
      id: "copenhagen",
      name: VARIANTS.copenhagen.name,
      blurb: VARIANTS.copenhagen.blurb,
      escape: "corners",
      firstMove: "attackers",
      armedKing: true,
      kingMayReoccupyThrone: true,
      throneBlocks: "none",
      throneAnvil: "both",
      throneHostileToKing: true,
      cornersRestricted: true,
      cornersHostile: true,
      edgeHostileToSoldiers: false,
      kingStrength: "strong",
      strongKingEdgeRule: "uncapturable",
      shieldwallCapture: true,
      exitFort: true,
      encirclementWin: true,
      repetitionResult: "loss_for_repeater",
    },
    "copenhagen-fetlar": {
      id: "copenhagen-fetlar",
      name: VARIANTS["copenhagen-fetlar"].name,
      blurb: VARIANTS["copenhagen-fetlar"].blurb,
      escape: "corners",
      firstMove: "attackers",
      armedKing: true,
      kingMayReoccupyThrone: true,
      throneBlocks: "none",
      throneAnvil: "both",
      throneHostileToKing: true,
      cornersRestricted: true,
      cornersHostile: true,
      edgeHostileToSoldiers: false,
      kingStrength: "strong",
      strongKingEdgeRule: "uncapturable",
      shieldwallCapture: false,
      exitFort: false,
      encirclementWin: false,
      repetitionResult: "loss_for_defenders",
    },
  };

  for (const [id, expected] of Object.entries(frozen)) {
    it(`${id} still resolves to its pre-correction flags`, () => {
      expect(rulesFor(id, CUSTOM_RULE_DEFAULTS)).toEqual(expected);
    });
  }

  it("names every legacy preset as legacy in its own blurb", () => {
    for (const id of Object.keys(frozen)) expect(VARIANTS[id].blurb).toContain("LEGACY");
  });
});
