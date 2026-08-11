import { describe, expect, it } from "vitest";
import {
  CUSTOM_RULE_DEFAULTS,
  DEFAULT_VARIANT,
  VARIANTS,
  VISIBLE_VARIANTS,
  ruleFlags,
  rulesFor,
  type CustomRuleSet,
  type TablutRuleSet,
} from "./variants";

// The Brandubh side of the app has no variants suite — its presets are covered
// only indirectly, through persistence and export round-trips. That is a gap
// worth not repeating: a preset is *data*, a wrong flag in it is silent, and no
// other test in the project would notice. So the presets are asserted here
// flag by flag, and the two gulo/Dimetr changes are asserted by name.

describe("the shipped presets", () => {
  it("agree with their own ids, and the default is one of them", () => {
    for (const [key, v] of Object.entries(VARIANTS)) expect(v.id).toBe(key);
    expect(VARIANTS[DEFAULT_VARIANT]).toBeDefined();
  });

  it("all give White the first move — baseline rule 2", () => {
    for (const v of Object.values(VARIANTS)) expect(v.firstMove).toBe("defenders");
  });

  it("all name and describe themselves", () => {
    for (const v of Object.values(VARIANTS)) {
      expect(v.name.length).toBeGreaterThan(0);
      expect(v.blurb.length).toBeGreaterThan(0);
    }
  });

  it("holds the baseline to the six undisputed rules and asserts nothing else", () => {
    expect(VARIANTS.tablut).toMatchObject<Partial<TablutRuleSet>>({
      escape: "edges",
      firstMove: "defenders",
      armedKing: true,
      kingMayReoccupyThrone: true,
      throneBlocks: "none",
      throneAnvil: "none",
      throneHostileToKing: false,
      cornersRestricted: false,
      cornersHostile: false,
      edgeHostileToSoldiers: false,
      strongKingOnThrone: false,
      strongKingAdjacentToThrone: false,
      shieldwallCapture: false,
      encirclementWin: false,
      repetitionResult: "draw",
    });
  });

  it("makes the gulo/Dimetr preset the baseline plus exactly two changes", () => {
    const changed = diff(ruleFlags(VARIANTS.tablut), ruleFlags(VARIANTS["tablut-gulo"]));
    expect(changed.sort()).toEqual(["throneAnvil", "throneBlocks"]);
    // The throne cannot be crossed by black …
    expect(VARIANTS["tablut-gulo"].throneBlocks).toBe("attackers");
    // … and the throne is friendly to white.
    expect(VARIANTS["tablut-gulo"].throneAnvil).toBe("defenders");
  });

  it("makes the Linnaeus reading the default, with the strong king it describes", () => {
    // The rules bug this guards against shipped once: a king captured by two
    // soldiers on his own throne. Linnaeus's account — corroborated by every
    // secondary source docs/tablut-rules.md cites — needs four attackers on the
    // throne and three plus the throne beside it, so the flags that implement
    // that reading must all be on in the preset the picker starts from.
    expect(DEFAULT_VARIANT).toBe("tablut-linnaeus");
    expect(VARIANTS["tablut-linnaeus"]).toMatchObject<Partial<TablutRuleSet>>({
      escape: "edges",
      firstMove: "defenders",
      armedKing: true,
      throneAnvil: "both",
      throneHostileToKing: true,
      strongKingOnThrone: true,
      strongKingAdjacentToThrone: true,
      cornersRestricted: false,
      cornersHostile: false,
      shieldwallCapture: false,
      encirclementWin: true,
      repetitionResult: "loss_for_defenders",
    });
  });

  it("marks the unverified tournament preset as unverified in its own blurb", () => {
    // The source could not be reached to check the wording (see
    // docs/tablut-rules.md). If someone verifies it and drops the warning, this
    // test should be deleted in the same commit — deliberately, not by accident.
    expect(VARIANTS["tablut-aage"].blurb).toContain("UNVERIFIED");
  });

  it("keeps corner escape a different game rather than a detail", () => {
    const v = VARIANTS["tablut-corners"];
    expect(v.escape).toBe("corners");
    expect(v.cornersRestricted).toBe(true);
    expect(v.cornersHostile).toBe(true);
  });

  it("keeps encirclement out of the minimal presets, and in the tournament reading", () => {
    // The baseline asserts only the six undisputed rules, and gulo/Dimetr is the
    // baseline plus exactly two changes — neither may grow an encirclement win.
    // The Linnaeus/WTF preset *does* carry one, because the federation's rules
    // do: an unbroken ring of attackers around every defender ends the game.
    expect(VARIANTS.tablut.encirclementWin).toBe(false);
    expect(VARIANTS["tablut-gulo"].encirclementWin).toBe(false);
    expect(VARIANTS["tablut-linnaeus"].encirclementWin).toBe(true);
  });

  it("never ships the Copenhagen shieldwall, which is not a Tablut rule", () => {
    for (const v of Object.values(VARIANTS)) expect(v.shieldwallCapture).toBe(false);
  });
});

describe("hiding a variant", () => {
  it("offers only presets that exist", () => {
    for (const id of VISIBLE_VARIANTS) expect(VARIANTS[id]).toBeDefined();
  });

  it("offers the default", () => {
    expect(VISIBLE_VARIANTS).toContain(DEFAULT_VARIANT);
  });

  it("still resolves a hidden preset, so old saves and files keep replaying", () => {
    // This is the whole point of the visible/present split: hiding a variant is
    // a decision about the picker, not about whether games played under it can
    // still be read back.
    const hidden = Object.keys(VARIANTS).filter((id) => !VISIBLE_VARIANTS.includes(id));
    for (const id of hidden) expect(rulesFor(id, CUSTOM_RULE_DEFAULTS).id).toBe(id);
  });
});

describe("rulesFor / ruleFlags", () => {
  it("resolves a named preset to the preset itself", () => {
    expect(rulesFor("tablut", CUSTOM_RULE_DEFAULTS)).toBe(VARIANTS.tablut);
  });

  it("builds a custom ruleset from the flags given", () => {
    const flags: CustomRuleSet = { ...CUSTOM_RULE_DEFAULTS, throneBlocks: "soldiers" };
    const rules = rulesFor("custom", flags);
    expect(rules.id).toBe("custom");
    expect(rules.throneBlocks).toBe("soldiers");
  });

  it("round-trips every preset through the editor's flag shape", () => {
    for (const v of Object.values(VARIANTS))
      expect(rulesFor("custom", ruleFlags(v))).toMatchObject(ruleFlags(v));
  });

  it("starts the custom editor from the undisputed baseline", () => {
    expect(CUSTOM_RULE_DEFAULTS).toEqual(ruleFlags(VARIANTS.tablut));
  });

  it("strips identity and keeps every rule, so a new flag is carried for free", () => {
    const flags = ruleFlags(VARIANTS.tablut) as Record<string, unknown>;
    expect(flags.id).toBeUndefined();
    expect(flags.name).toBeUndefined();
    expect(flags.blurb).toBeUndefined();
    const ruleKeys = Object.keys(VARIANTS.tablut).filter(
      (k) => k !== "id" && k !== "name" && k !== "blurb",
    );
    expect(Object.keys(flags).sort()).toEqual(ruleKeys.sort());
  });
});

/** The flag names on which two rulesets disagree. */
function diff(a: CustomRuleSet, b: CustomRuleSet): string[] {
  return (Object.keys(a) as Array<keyof CustomRuleSet>)
    .filter((k) => a[k] !== b[k])
    .map(String);
}
