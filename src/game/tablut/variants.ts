// ── Tablut rule variants ──────────────────────────────────────────────────────
//
// The baseline rules of Tablut are not in dispute:
//
//   1. Two players. White is the king and his defenders; Black the attackers.
//   2. The attacking side moves first, then the players alternate.
//   3. All pieces move horizontally or vertically as far as the path is clear.
//   4. A piece is captured when it is trapped between two enemies horizontally
//      or vertically — but only if the *opponent's* move closed the trap. Moving
//      your own piece between two enemies is safe.
//   5. White wins by moving the king to an edge square.
//   6. Black wins by capturing the king first.
//
// Rule 2 was corrected on 2026-09-09 — see "Corrections of 2026-09-09" in
// docs/tablut-rules.md. The presets shipped before that date had White (the
// defenders) moving first; three independent sources (aagenielsen.dk,
// worldtafl.com, and Linnaeus's own silence read against the "Muscovites
// begin" translation, where the Muscovites are the attackers) agree the
// attacking side takes the first move. Every *current* preset below asserts
// the corrected rule. The old, incorrect presets are kept byte-for-byte as
// LEGACY presets — hidden from the picker, but still resolvable — because a
// saved game or an exported .tafl file that named one of them was played
// under `firstMove: "defenders"`, and changing that retroactively would
// silently turn ply 0 of a real game into an illegal move.
//
// Everything the presets below disagree about, beyond that one correction, is
// a detail those six rules leave open: what the throne does, whether the
// corners are special, and how strong the king is. That is the same shape as
// `../variants.ts` for Brandubh, and the same flat-flag-bag design, so the
// custom rule editor, the storage format and the export format can all be
// built the same way. It is a *separate* type, though: an escape condition
// and a first mover are not Brandubh flags, and nothing has ever been
// persisted for this game under a shape other than this one, so there is no
// back-compatible shape to preserve beyond the ids themselves.

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
  /**
   * Who moves first. Baseline rule 2 — the attackers, the same as Brandubh.
   * Corrected 2026-09-09; the legacy presets kept the old `"defenders"` value
   * for exactly the presets that shipped with it. See docs/tablut-rules.md.
   */
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
   * Off in the minimal presets (`tablut-2`, `tablut-gulo-2`), because under edge
   * escape "the king cannot reach the rim" is very nearly the same statement as
   * "the king is encircled", and the six baseline rules do not ask for it. On in
   * the Linnaeus/WTF default — the federation's rules include it — where it
   * mostly ends games a search would call lost anyway, a little sooner. Under
   * `escape: "corners"` it is the ordinary tafl rule.
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

/**
 * The six baseline rules and nothing else asserted, as they were understood
 * before the 2026-09-09 correction — `firstMove: "defenders"`. Frozen: this is
 * spread only into the LEGACY presets below, byte-for-byte, so a saved game or
 * an exported .tafl file naming one of the old ids keeps replaying into the
 * exact game it was played under. Do not edit this constant to "fix" it —
 * that is what `BASELINE` below is for.
 */
const LEGACY_BASELINE: Omit<TablutRuleSet, "id" | "name" | "blurb"> = {
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

/**
 * The six baseline rules, corrected: `firstMove: "attackers"` — see
 * "Corrections of 2026-09-09" in docs/tablut-rules.md. Every current (visible
 * or hideable-but-not-legacy) preset below spreads this, not
 * `LEGACY_BASELINE`.
 */
const BASELINE: Omit<TablutRuleSet, "id" | "name" | "blurb"> = {
  ...LEGACY_BASELINE,
  firstMove: "attackers",
};

export const VARIANTS: Record<string, TablutRuleSet> = {
  // ── Current presets — corrected 2026-09-09, firstMove: "attackers" ─────────

  "tablut-linnaeus-2": {
    id: "tablut-linnaeus-2",
    name: "Tablut · Linnaeus 1732",
    blurb:
      "The rules Linnaeus recorded in Lapland in 1732, as the World Tafl " +
      "Federation reads them. Black moves first. The king falls to four " +
      "attackers on his throne, to three when the empty throne stands in as " +
      "the fourth wall beside it, and to the ordinary two anywhere else. The " +
      "empty throne is hostile, the king escapes to any edge square, an " +
      "unbroken ring of attackers wins for Black, and a repeated position is " +
      "on White to break.",
    ...BASELINE,
    throneAnvil: "both",
    throneHostileToKing: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: true,
    encirclementWin: true,
    repetitionResult: "loss_for_defenders",
  },

  "tablut-2": {
    id: "tablut-2",
    name: "Tablut · baseline",
    blurb:
      "The six undisputed rules and nothing more. Black moves first; White " +
      "wins by reaching any edge square, Black by capturing the king. A trap " +
      "only captures when the opponent closes it. The throne is inert — " +
      "soldiers may not stand on it, but either side may cross it — and the " +
      "corners are ordinary squares. Repetition is a draw.",
    ...BASELINE,
  },

  "tablut-gulo-2": {
    id: "tablut-gulo-2",
    name: "Tablut · gulo/Dimetr 2025",
    blurb:
      "The baseline with the two small changes of detail proposed in July 2025 " +
      "on aagenielsen.dk by Gustaf Løvenlund (\"gulo\") and Dmitrij Tsvilenev " +
      "(\"Dimetr\"): the throne cannot be crossed by Black, and the throne is " +
      "friendly to White — White may pin a soldier against the empty throne, " +
      "and Black may not. Both are reachable in the custom rule editor.",
    ...BASELINE,
    throneBlocks: "attackers",
    throneAnvil: "defenders",
  },

  "tablut-aage-2": {
    id: "tablut-aage-2",
    name: "Tablut · tournament",
    blurb:
      "⚠ UNVERIFIED. Intended as the tournament ruleset played on aagenielsen.dk: " +
      "Black moves first, edge escape, a hostile empty throne, a king who must " +
      "be surrounded on all four sides on or beside it, and encirclement wins " +
      "for Black. The 2026-09-09 sourcing pass corrected the first mover and " +
      "the encirclement flag against aagenielsen.dk's unified rules page, but a " +
      "human still needs to eyeball that page's raw HTML for a Tablut-specific " +
      "section before this stops being a plausible reading rather than a " +
      "citation — see docs/tablut-rules.md. Prefer the baseline if that matters " +
      "to you.",
    ...BASELINE,
    throneAnvil: "both",
    throneHostileToKing: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: true,
    encirclementWin: true,
    repetitionResult: "loss_for_defenders",
  },

  "tablut-corners-2": {
    id: "tablut-corners-2",
    name: "Tablut · corner escape",
    blurb:
      "A modern reconstruction in which the king must reach a corner rather than " +
      "any edge square. Black moves first, the corners become hostile squares " +
      "only the king may occupy, and encirclement wins for Black. This is a " +
      "materially different game from the baseline, not a detail — the whole " +
      "rim stops being a goal.",
    ...BASELINE,
    escape: "corners",
    cornersRestricted: true,
    cornersHostile: true,
    encirclementWin: true,
    repetitionResult: "loss_for_defenders",
  },

  // ── Legacy presets — kept byte-for-byte, hidden from the picker ────────────
  //
  // These are the exact five presets as they shipped before the 2026-09-09
  // correction (`firstMove: "defenders"`), kept under their original ids so a
  // saved game (`tablut.game.v1`) or an exported .tafl file naming one of them
  // keeps replaying into the game it actually recorded. `VARIANTS` keeps
  // resolving them; `VISIBLE_VARIANTS` below no longer offers them. Do not
  // "fix" a flag in this section — that is what the corrected preset with the
  // `-2` suffix above is for.

  "tablut-linnaeus": {
    id: "tablut-linnaeus",
    name: "Tablut · Linnaeus 1732 (legacy)",
    blurb:
      "LEGACY — kept only so games saved or exported under this id keep their " +
      "meaning. This preset shipped with White moving first, which the " +
      "2026-09-09 sourcing pass found to be backwards (see " +
      "docs/tablut-rules.md): three independent sources agree the attackers " +
      "move first. New games use “Tablut · Linnaeus 1732” " +
      "(tablut-linnaeus-2), which corrects it and is otherwise identical.",
    ...LEGACY_BASELINE,
    throneAnvil: "both",
    throneHostileToKing: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: true,
    encirclementWin: true,
    repetitionResult: "loss_for_defenders",
  },

  tablut: {
    id: "tablut",
    name: "Tablut · baseline (legacy)",
    blurb:
      "LEGACY — kept only so games saved or exported under this id keep their " +
      "meaning. This preset shipped with White moving first, which the " +
      "2026-09-09 sourcing pass found to be backwards (see " +
      "docs/tablut-rules.md). New games use “Tablut · baseline” " +
      "(tablut-2), which corrects it and is otherwise identical.",
    ...LEGACY_BASELINE,
  },

  "tablut-gulo": {
    id: "tablut-gulo",
    name: "Tablut · gulo/Dimetr 2025 (legacy)",
    blurb:
      "LEGACY — kept only so games saved or exported under this id keep their " +
      "meaning. This preset shipped with White moving first, which the " +
      "2026-09-09 sourcing pass found to be backwards (see " +
      "docs/tablut-rules.md). New games use “Tablut · gulo/Dimetr " +
      "2025” (tablut-gulo-2), which corrects it and is otherwise " +
      "identical.",
    ...LEGACY_BASELINE,
    throneBlocks: "attackers",
    throneAnvil: "defenders",
  },

  "tablut-aage": {
    id: "tablut-aage",
    name: "Tablut · tournament (legacy)",
    blurb:
      "⚠ UNVERIFIED, and LEGACY — kept only so games saved or exported under " +
      "this id keep their meaning. This preset shipped with White moving " +
      "first and no encirclement win; the 2026-09-09 sourcing pass found both " +
      "backwards (see docs/tablut-rules.md). New games use “Tablut · " +
      "tournament” (tablut-aage-2), which corrects them and is otherwise " +
      "identical — and is itself still hidden and unverified.",
    ...LEGACY_BASELINE,
    throneAnvil: "both",
    throneHostileToKing: true,
    strongKingOnThrone: true,
    strongKingAdjacentToThrone: true,
    repetitionResult: "loss_for_defenders",
  },

  "tablut-corners": {
    id: "tablut-corners",
    name: "Tablut · corner escape (legacy)",
    blurb:
      "LEGACY — kept only so games saved or exported under this id keep their " +
      "meaning. This preset shipped with White moving first, which the " +
      "2026-09-09 sourcing pass found to be backwards (see " +
      "docs/tablut-rules.md). New games use “Tablut · corner " +
      "escape” (tablut-corners-2), which corrects it and is otherwise " +
      "identical.",
    ...LEGACY_BASELINE,
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
 *
 * Only the corrected (`-2`) presets are visible. The five legacy ids above are
 * deliberately absent — see the LEGACY section's header comment.
 * `tablut-aage-2` is also absent: unlike the other four, it stays hidden even
 * corrected, pending a human eyeball of aagenielsen.dk's raw page (see its
 * blurb and docs/tablut-rules.md).
 */
export const VISIBLE_VARIANTS: string[] = [
  "tablut-linnaeus-2",
  "tablut-2",
  "tablut-gulo-2",
  "tablut-corners-2",
];

/**
 * The Linnaeus/WTF reading leads, because it is the game as the sources describe
 * it: a king captured by two soldiers *on or beside his own throne* is not
 * Tablut, and shipping that as the default was reported as a rules bug the day
 * it went out. `tablut-aage-2` is hidden rather than removed — it asserts almost
 * the same flags while its throne-specific wording is UNVERIFIED — and saves
 * and files under any legacy id still resolve.
 */
export const DEFAULT_VARIANT = "tablut-linnaeus-2";

/** A ruleset without its identity — what the custom rule editor edits. */
export type CustomRuleSet = Omit<TablutRuleSet, "id" | "name" | "blurb">;

/**
 * Starting point for the custom rule editor — the undisputed baseline,
 * corrected: `firstMove: "attackers"`. See docs/tablut-rules.md.
 */
export const CUSTOM_RULE_DEFAULTS: CustomRuleSet = { ...BASELINE };

// ── Enum choices ──────────────────────────────────────────────────────────────
// Every string-valued flag in `CustomRuleSet` needs its offered values decided
// in exactly one place: this table, read by both the custom rule editor
// (`TablutScreen.tsx`) and the game file's `Rules` tag (`gameFile.ts`). Kept
// structurally identical to Copenhagen's twin in `../copenhagen/variants.ts`,
// which is where a stale, hand-copied version of this exact table went stale
// (see the comment there) — this export is what stops the same drift here.

/** The keys of `CustomRuleSet` whose value is an enum (a string), rather than a
 *  boolean toggle. */
export type EnumRuleKey = {
  [K in keyof CustomRuleSet]: CustomRuleSet[K] extends string ? K : never;
}[keyof CustomRuleSet];

/** The values each enum rule offers, in the order they read as a spectrum. */
export const ENUM_CHOICES: Record<EnumRuleKey, readonly string[]> = {
  escape: ["edges", "corners"],
  firstMove: ["defenders", "attackers"],
  throneBlocks: ["none", "attackers", "soldiers"],
  throneAnvil: ["none", "defenders", "both"],
  repetitionResult: ["none", "draw", "loss_for_defenders"],
};

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
