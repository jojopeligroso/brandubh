// ── Tablut rule variants ──────────────────────────────────────────────────────
//
// The baseline rules of Tablut are not in dispute:
//
//   1. Two players. White is the king and his defenders; Black the attackers.
//   2. White moves first, then the players alternate.
//   3. All pieces move horizontally or vertically as far as the path is clear.
//   4. A piece is captured when it is trapped between two enemies horizontally
//      or vertically — but only if the *opponent's* move closed the trap. Moving
//      your own piece between two enemies is safe.
//   5. White wins by moving the king to an edge square.
//   6. Black wins by capturing the king first.
//
// Everything the presets below disagree about is a detail those six rules leave
// open: what the throne does, whether the corners are special, and how strong
// the king is. That is the same shape as `../variants.ts` for Brandubh, and the
// same flat-flag-bag design, so the custom rule editor, the storage format and
// the export format can all be built the same way. It is a *separate* type,
// though: an escape condition and a first mover are not Brandubh flags, and
// nothing has ever been persisted for this game, so there is no back-compatible
// shape to preserve.

import type { Side } from "./types";

export interface TablutRuleSet {
  id: string;
  name: string;
  blurb: string;

  // ── The two rules that make this Tablut and not Brandubh ─────────────────────
  /**
   * Where the king has to get to. `"edges"` is baseline rule 5 — any square on
   * the board's rim. `"corners"` is the modern reconstruction that borrows
   * Brandubh's win condition; it is a genuinely different game, not a tweak.
   */
  escape: "edges" | "corners";
  /** Who moves first. Baseline rule 2 says White — the opposite of Brandubh. */
  firstMove: Side;

  // ── Piece behaviour ──────────────────────────────────────────────────────────
  /** King may take part in captures (act as a flanking piece). */
  armedKing: boolean;

  // ── Throne rules ─────────────────────────────────────────────────────────────
  /** King may return to the throne after leaving it. */
  kingMayReoccupyThrone: boolean;
  /**
   * Who the empty throne stops. Soldiers may never *stand* on it under any
   * preset; this is only about sliding across it.
   *
   * `"none"`      — either side may slide over the empty throne.
   * `"attackers"` — Black may not cross it; White may. This is the first of the
   *                 two July 2025 changes proposed by Gustaf Løvenlund ("gulo")
   *                 and Dmitrij Tsvilenev ("Dimetr"): *the throne cannot be
   *                 crossed by black*.
   * `"soldiers"`  — neither side may cross it.
   */
  throneBlocks: "none" | "attackers" | "soldiers";
  /**
   * Whose captures the *empty* throne backs up as an anvil, when a soldier is
   * pinned against it. (An *occupied* throne backs whoever is standing on it,
   * which is ordinary friendly-piece logic and needs no flag.)
   *
   * `"none"`      — the empty throne is inert.
   * `"both"`      — it is hostile to everyone; either side may pin against it.
   * `"defenders"` — it works for White and never against him. This is the second
   *                 gulo/Dimetr change: *the throne is friendly to white*.
   */
  throneAnvil: "none" | "both" | "defenders";
  /**
   * Empty throne counts as a hostile flank when checking whether the *king* is
   * captured. Kept separate from `throneAnvil` because the two are separate
   * rules in every source that states them, and because the Brandubh version of
   * this flag is under review — see the CONTESTED note below.
   */
  throneHostileToKing: boolean;

  // ── Corner rules ─────────────────────────────────────────────────────────────
  /**
   * Corners are squares only the king may occupy. False under `escape: "edges"`,
   * where a corner is an ordinary square that happens to be on the rim.
   */
  cornersRestricted: boolean;
  /** Corners are hostile anvils for all captures, including the king. */
  cornersHostile: boolean;

  // ── Edge rules ───────────────────────────────────────────────────────────────
  /**
   * The board's outside acts as an anvil, so a soldier on the rim is captured by
   * a single enemy pushing him against it. Not part of any baseline reading —
   * offered because some reconstructions use it, and because under edge escape
   * it is the rule with the largest effect on how the rim plays. Never applies
   * to the king: a king who has reached the rim under `escape: "edges"` has
   * already won, and under `escape: "corners"` the rim is not hostile to him
   * (the same choice `../rules.ts` makes for Brandubh).
   */
  edgeHostileToSoldiers: boolean;

  // ── King-capture strength ─────────────────────────────────────────────────────
  /** King ON the throne must be surrounded on all four sides. */
  strongKingOnThrone: boolean;
  /**
   * King on a square *adjacent* to the throne must be surrounded on all four
   * sides (the empty throne counting as one, if `throneHostileToKing`).
   *
   * ⚠ CONTESTED RULE — the Brandubh twin of this pair carries a standing note in
   * `../variants.ts` and an open item in `docs/rules-review.md`: it is not
   * settled whether an ordinary two-sided custodial capture of the king should
   * *also* remain valid in some throne-adjacent positions. The same doubt
   * applies here for the same reason. Both flags are exposed in the custom rule
   * editor so the question can be played with while it is open.
   */
  strongKingAdjacentToThrone: boolean;

  // ── Shieldwall ────────────────────────────────────────────────────────────────
  /**
   * Copenhagen-style shieldwall capture: a row of two or more enemy men along
   * the board edge falls together when the row is bracketed at both ends and
   * every man in it has an enemy directly in front. Not part of Tablut in any
   * reading — an 11×11 Copenhagen innovation, offered here for custom play, as
   * it is for Brandubh.
   */
  shieldwallCapture: boolean;

  // ── Win conditions ────────────────────────────────────────────────────────────
  /**
   * Attackers win by encircling the king and all remaining defenders with an
   * unbroken ring (board edges do not count as part of the ring).
   *
   * False in every shipped Tablut preset, and deliberately so: under edge escape
   * "the king cannot reach the rim" is very nearly the same statement as "the
   * king is encircled", so turning this on ends games early and often, in a way
   * the six baseline rules do not ask for. Under `escape: "corners"` it is the
   * ordinary tafl rule and reasonable to enable.
   */
  encirclementWin: boolean;

  // ── Repetition ────────────────────────────────────────────────────────────────
  /**
   * What happens when a position is repeated three times.
   * `"none"` — ignored. `"draw"` — the game is drawn.
   * `"loss_for_defenders"` — White loses, on the grounds that he is the side
   * obliged to make progress.
   */
  repetitionResult: "none" | "draw" | "loss_for_defenders";
}

// ── Presets ───────────────────────────────────────────────────────────────────

/** The six baseline rules and nothing else asserted — the shared foundation. */
const BASELINE: Omit<TablutRuleSet, "id" | "name" | "blurb"> = {
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
};

export const VARIANTS: Record<string, TablutRuleSet> = {
  tablut: {
    id: "tablut",
    name: "Tablut · baseline",
    blurb:
      "The six undisputed rules and nothing more. White moves first and wins by " +
      "reaching any edge square; Black wins by capturing the king. A trap only " +
      "captures when the opponent closes it. The throne is inert — soldiers may " +
      "not stand on it, but either side may cross it — and the corners are " +
      "ordinary squares. Repetition is a draw.",
    ...BASELINE,
  },

  "tablut-gulo": {
    id: "tablut-gulo",
    name: "Tablut · gulo/Dimetr 2025",
    blurb:
      "The baseline with the two small changes of detail proposed in July 2025 on " +
      "aagenielsen.dk by Gustaf Løvenlund (\"gulo\") and Dmitrij Tsvilenev " +
      "(\"Dimetr\"): the throne cannot be crossed by Black, and the throne is " +
      "friendly to White — White may pin a soldier against the empty throne, and " +
      "Black may not. Both are reachable in the custom rule editor.",
    ...BASELINE,
    throneBlocks: "attackers",
    throneAnvil: "defenders",
  },

  "tablut-aage": {
    id: "tablut-aage",
    name: "Tablut · tournament",
    blurb:
      "⚠ UNVERIFIED. Intended as the tournament ruleset played on aagenielsen.dk: " +
      "edge escape, a hostile empty throne, and a king who must be surrounded on " +
      "all four sides on or beside it. The site could not be reached to check the " +
      "wording (see docs/tablut-rules.md), so treat this preset as a plausible " +
      "reading rather than a citation, and prefer the baseline if that matters " +
      "to you.",
    ...BASELINE,
    throneAnvil: "both",
    throneHostileToKing: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: true,
    repetitionResult: "loss_for_defenders",
  },

  "tablut-corners": {
    id: "tablut-corners",
    name: "Tablut · corner escape",
    blurb:
      "A modern reconstruction in which the king must reach a corner rather than " +
      "any edge square. The corners become hostile squares only the king may " +
      "occupy, and encirclement wins for Black. This is a materially different " +
      "game from the baseline, not a detail — the whole rim stops being a goal.",
    ...BASELINE,
    escape: "corners",
    cornersRestricted: true,
    cornersHostile: true,
    encirclementWin: true,
    repetitionResult: "loss_for_defenders",
  },
};

/**
 * Which presets the picker offers, in order.
 *
 * Hiding one is a one-line edit here — exactly the `VISIBLE_LANGS` idiom in
 * `src/i18n.ts`, and for the same reason: the decision belongs next to the data,
 * not hand-wired into the component. A hidden preset stays in `VARIANTS`, so
 * `rulesFor` keeps resolving it and games already saved or exported under it
 * still replay. Removing an entry from `VARIANTS` would orphan those; removing
 * it from this list only stops it being offered.
 */
export const VISIBLE_VARIANTS: string[] = [
  "tablut",
  "tablut-gulo",
  "tablut-aage",
  "tablut-corners",
];

export const DEFAULT_VARIANT = "tablut";

/** A ruleset without its identity — what the custom rule editor edits. */
export type CustomRuleSet = Omit<TablutRuleSet, "id" | "name" | "blurb">;

/** Starting point for the custom rule editor — the undisputed baseline. */
export const CUSTOM_RULE_DEFAULTS: CustomRuleSet = { ...BASELINE };

// ── Resolving a ruleset ───────────────────────────────────────────────────────
// Storage and the export format both have to turn a variant id plus a set of
// custom flags back into the ruleset a game was played under. Keeping that in
// one place is what stops the two serializations from quietly disagreeing about
// what "custom" means.

/** The ruleset for a variant id; `"custom"` is built from the flags given. */
export function rulesFor(variantId: string, custom: CustomRuleSet): TablutRuleSet {
  return variantId === "custom"
    ? { id: "custom", name: "Custom", blurb: "Your custom ruleset.", ...custom }
    : VARIANTS[variantId];
}

/** The inverse: a ruleset stripped back to the flags the editor holds. */
export function ruleFlags(rules: TablutRuleSet): CustomRuleSet {
  const { id, name, blurb, ...flags } = rules;
  return flags;
}
