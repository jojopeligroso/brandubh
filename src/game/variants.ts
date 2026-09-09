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
    // ── CONTESTED RULE, VERIFIED AND DELIBERATELY RETAINED (2026-09-09) ──────
    // These two flags together make a king *next to the throne* capturable
    // only by a full four-sided surround, with the empty throne as the fourth
    // wall (throneHostileToKing), and never by an ordinary two-sided
    // custodial pair (strongKingAdjacentToThrone). That matches Copenhagen
    // and Linnaeus's Tablut — but it does NOT match Brandubh's own primary
    // sources, read in full on 2026-09-09 (see docs/rules-review.md and
    // /tmp/brandubh-rules-sourcing-report.md):
    //
    //   "Blacks win if they manage to capture the king before he escapes.
    //   The king is captured like all other pieces, except when he is on
    //   the throne. To capture the king on his throne, the attackers must
    //   surround the throne by standing on the four cardinal points.
    //   Everywhere else on the board the king is captured as a normal
    //   piece." — the WTF Brandubh rules PDF, aagenielsen.dk/brandubh2_rules_en.pdf
    //
    //   "The throne is never hostile to the king, always hostile to the
    //   attackers, and only hostile to the defenders when the king is not
    //   occupying it." — same PDF
    //
    //   "One exception across the family: on the small 7x7 Brandubh board
    //   the king is young, and falls like an ordinary piece, caught between
    //   just two attackers. The four-wall law protects the king only on the
    //   9x9 and 11x11 boards; on 49 squares it would make him nearly
    //   uncatchable." — worldtafl.com/hnefatafl-rules
    //
    // Both sources agree: next to the throne is NOT a special four-sided
    // case on 7×7 — only ON the throne is. The correct flags per the sources
    // would be `throneHostileToKing: false` and
    // `strongKingAdjacentToThrone: false`.
    //
    // The owner decided on 2026-09-09 to ship `wtf` unchanged anyway: the
    // opening book (depth 8, 2737 entries), the 158 solver-verified puzzles,
    // the annotation bands, the recognizer soundness proofs and every
    // gauntlet result were all computed under these exact flags. Correcting
    // them would silently change the meaning of every one of those
    // artefacts, not just this preset, and none of that work has been
    // regenerated or re-verified against a corrected ruleset. So: this rule
    // is verified — the sources are unambiguous, and they disagree with what
    // ships — and it is retained anyway, not because it is unsettled.
    // `throneHostileToSoldiers: true` and `strongKingOnThrone: true` (the
    // on-throne case) are unaffected and remain correct as sourced. Both
    // flags stay exposed in the custom-rule editor, where a player who wants
    // the sourced reading can already have it.
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
