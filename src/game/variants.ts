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
    encirclementWin: false,
    repetitionResult: "draw",
  },
  wtf: {
    id: "wtf",
    name: "Brandubh · World Tafl Federation",
    blurb:
      "Official WTF tournament rules (aagenielsen.dk / branan). The empty throne is hostile to " +
      "soldiers but never to the king. King on the throne needs all four sides surrounded. " +
      "Encirclement wins. Repetition is a loss for the defending side.",
    armedKing: true,
    throneHostileToSoldiers: true,
    throneHostileToKing: false,
    kingMayReoccupyThrone: true,
    soldiersPassThroughThrone: true,
    cornersHostile: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: false,
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
  throneHostileToKing: false,
  kingMayReoccupyThrone: true,
  soldiersPassThroughThrone: true,
  cornersHostile: true,
  strongKingOnThrone: true,
  strongKingAdjacentToThrone: false,
  encirclementWin: true,
  repetitionResult: "loss_for_defenders",
};
