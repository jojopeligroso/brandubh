// ── Rule variants ─────────────────────────────────────────────────────────────
// Two authentic Brandubh reconstructions, sourced directly from aagenielsen.dk:
//   walker — Damian Walker / Cyningstan (2011), based on MacWhite 1946.
//   wtf    — World Tafl Federation official tournament rules.

export interface RuleSet {
  id: string;
  name: string;
  blurb: string;

  // ── Piece behaviour ──────────────────────────────────────────────────────────
  /** King may take part in captures (act as a flanking piece). */
  armedKing: boolean;

  // ── Throne rules ─────────────────────────────────────────────────────────────
  /**
   * Empty throne acts as a hostile anvil when capturing *soldiers*
   * (both attacker and defender soldiers, never the king directly).
   * Walker: false. WTF: true.
   */
  throneHostileToSoldiers: boolean;
  /**
   * Empty throne counts as a hostile flank when checking whether the *king*
   * is captured. WTF explicitly forbids this ("throne is never hostile to
   * the king"). Walker: false. WTF: false.
   */
  throneHostileToKing: boolean;
  /** King may return to the throne after leaving it. Both rulesets: true. */
  kingMayReoccupyThrone: boolean;
  /** Soldiers may slide *through* (never stop on) the empty throne. */
  soldiersPassThroughThrone: boolean;

  // ── Corner rules ─────────────────────────────────────────────────────────────
  /**
   * Corner squares are hostile anvils for all captures, including the king.
   * Both rulesets: true.
   */
  cornersHostile: boolean;

  // ── King-capture strength ─────────────────────────────────────────────────────
  /**
   * King ON the throne requires all four cardinal sides to be hostile before
   * he is captured. Walker: false. WTF: true.
   */
  strongKingOnThrone: boolean;
  /**
   * King on a square *adjacent* to the throne requires all four sides to be
   * hostile (empty throne counts as one hostile side if throneHostileToKing).
   * Neither Walker nor WTF uses this; available for custom play.
   */
  strongKingAdjacentToThrone: boolean;

  // ── Shieldwall ────────────────────────────────────────────────────────────────
  /**
   * Copenhagen-style shieldwall capture: a row of two or more enemy men along
   * the board edge is captured together when the row is bracketed at both ends
   * (a hostile corner may stand in for one bracket) and every man in the row
   * has an enemy man directly in front of him. The trap must be closed by the
   * capturing side's move; a king inside the row survives, soldiers fall.
   * Neither Walker nor WTF Brandubh uses this — it is a Copenhagen (11×11,
   * ~2011) innovation, offered here for custom play.
   */
  shieldwallCapture: boolean;

  // ── Win conditions ────────────────────────────────────────────────────────────
  /**
   * Attackers win if they encircle the king and all remaining defenders with
   * an unbroken ring (not relying on board edges). Walker: false. WTF: true.
   */
  encirclementWin: boolean;

  // ── Repetition ────────────────────────────────────────────────────────────────
  /**
   * What happens when a position is repeated three times.
   * "none"               — ignored.
   * "draw"               — game is a draw (Walker).
   * "loss_for_defenders" — defenders (white) lose (WTF).
   */
  repetitionResult: "none" | "draw" | "loss_for_defenders";
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const VARIANTS: Record<string, RuleSet> = {
  walker: {
    id: "walker",
    name: "Brandubh · Walker",
    blurb:
      "Reconstruction by Damian Walker (Cyningstan, 2011), based on MacWhite's 1946 article. " +
      "The throne is not a hostile square. No strong-king rule — the king is captured by " +
      "two pieces anywhere on the board. Repetition is a draw.",
    armedKing: true,
    throneHostileToSoldiers: false,
    throneHostileToKing: false,
    kingMayReoccupyThrone: true,
    soldiersPassThroughThrone: true,
    cornersHostile: true,
    strongKingOnThrone: false,
    strongKingAdjacentToThrone: false,
    shieldwallCapture: false,
    encirclementWin: false,
    repetitionResult: "draw",
  },
  wtf: {
    id: "wtf",
    name: "Brandubh · World Tafl Federation",
    blurb:
      "Official WTF tournament rules (aagenielsen.dk / branan). The empty throne is hostile to " +
      "soldiers, and to the king as the fourth wall when he stands next to it. King on OR next to " +
      "the throne is captured only by being surrounded on all four sides (the empty throne counting " +
      "as one). Encirclement wins. Repetition is a loss for the defending side.",
    armedKing: true,
    throneHostileToSoldiers: true,
    // ⚠ CONTESTED RULE — RE-EXAMINE against authoritative sources before treating as
    // settled. These two flags together make a king *next to the throne* capturable
    // only by a full four-sided surround, with the empty throne as the fourth wall
    // (throneHostileToKing), and never by an ordinary two-sided custodial pair
    // (strongKingAdjacentToThrone). This matches the aagenielsen.dk / Copenhagen
    // wording ("next to the throne, occupy the three remaining squares"), and fixed a
    // real miss (a king walled against its own throne was not captured).
    // BUT it is open whether the ordinary two-sided custodial capture should *also*
    // remain valid in some throne-adjacent cases — e.g. when the king has moved into a
    // tight space and is then closed on two opposite sides. Aage Nielsen's rules pages
    // were unreachable at fix time; verify directly (fetlar/copenhagen/brandub) before
    // relying on this. Both flags are exposed in the custom-rule editor so the rule can
    // be toggled while it is under review. See docs/rules-review.md.
    throneHostileToKing: true,
    kingMayReoccupyThrone: true,
    soldiersPassThroughThrone: true,
    cornersHostile: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: true, // ⚠ see CONTESTED RULE note above
    shieldwallCapture: false, // Copenhagen innovation — not part of WTF Brandubh
    encirclementWin: true,
    repetitionResult: "loss_for_defenders",
  },
};

export const DEFAULT_VARIANT = "wtf";

/** A ruleset without its identity — what the custom rule editor edits. */
export type CustomRuleSet = Omit<RuleSet, "id" | "name" | "blurb">;

/** Starting point for the custom rule editor — mirrors WTF. */
export const CUSTOM_RULE_DEFAULTS: CustomRuleSet = {
  armedKing: true,
  throneHostileToSoldiers: true,
  throneHostileToKing: true,
  kingMayReoccupyThrone: true,
  soldiersPassThroughThrone: true,
  cornersHostile: true,
  strongKingOnThrone: true,
  strongKingAdjacentToThrone: true,
  shieldwallCapture: false,
  encirclementWin: true,
  repetitionResult: "loss_for_defenders",
};

// ── Resolving a ruleset ───────────────────────────────────────────────────────
// Storage (persist.ts) and the export format (gameFile.ts) both have to turn a
// variant id plus a set of custom flags back into the ruleset a game was played
// under. Keeping that in one place is what stops the two serializations from
// quietly disagreeing about what "custom" means.

/** The ruleset for a variant id; `"custom"` is built from the flags given. */
export function rulesFor(variantId: string, custom: CustomRuleSet): RuleSet {
  return variantId === "custom"
    ? { id: "custom", name: "Custom", blurb: "Your custom ruleset.", ...custom }
    : VARIANTS[variantId];
}

/** The inverse: a ruleset stripped back to the flags the editor holds. */
export function ruleFlags(rules: RuleSet): CustomRuleSet {
  const { id, name, blurb, ...flags } = rules;
  return flags;
}
