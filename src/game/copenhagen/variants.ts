// ── Copenhagen Hnefatafl rule variants ────────────────────────────────────────
//
// Copenhagen is the most standardised tafl game there is — the ruleset the
// Hnefatafl World Championship has been played under since it displaced Fetlar
// — so unlike `../variants.ts` (two reconstructions of a game nobody wrote down)
// and `../tablut/variants.ts` (one 1732 field note and a lot of reading), the
// baseline here is a *published, deliberately-drafted* ruleset with an author.
//
// That changes what this file has to be honest about. There is no serious doubt
// about what Copenhagen says; there is doubt about whether **this** file has
// copied it correctly, because the sites that publish it are unreachable from
// this environment. `docs/copenhagen-rules.md` records, assertion by assertion,
// which flags below are corroborated by matching wording from more than one
// source and which are a single reading — and names the one rule where two
// sources flatly contradict each other (`strongKingEdgeRule`, below).
//
// The eleven rules the presets assert, in the order the sources give them:
//
//   1. 11×11. One player has the king and twelve defenders, the other has
//      twenty-four attackers.
//   2. The attackers move first.
//   3. All pieces move orthogonally any distance, like a rook.
//   4. A soldier is captured when sandwiched between two enemies, or between an
//      enemy and a restricted square, and only when the opponent closes the trap.
//   4b. Shieldwall: a bracketed, fronted row along the edge falls together.
//   5. Restricted squares (the four corners and the throne) may only be occupied
//      by the king, may be passed over when empty, and are hostile.
//   6. The king escapes by reaching any corner square.
//   6b. Exit fort: the defenders also win with an unbreakable fort at the edge
//      that gives the king contact with the rim and a move to make.
//   7. The king is captured by four attackers — three plus the empty throne when
//      he stands beside it.
//   7b. The attackers win by surrounding the king and all remaining defenders.
//   8. Perpetual repetition is forbidden, and loses for the defending side.
//
// Rule 8 was corrected on 2026-09-09 — see "Corrections of 2026-09-09" in
// docs/copenhagen-rules.md. The presets shipped before that date read it as
// "loses for whichever side is repeating"; three independently-worded sources
// (aagenielsen.dk, the De Angelis PDF, and aagenielsen.dk's unified rules
// page) instead say "a loss for White" in as many words, and the
// "loses for the repeater" reading traces to a paraphrase on a secondary
// site, not to Copenhagen's own text. Every *current* preset below asserts
// the corrected rule; the old, incorrect preset is kept byte-for-byte as a
// LEGACY preset for exactly the reason `../tablut/variants.ts` keeps its
// legacy presets — see that file's header. The "whoever repeats loses"
// mechanism (`"loss_for_repeater"`) is not removed: it stays reachable in the
// custom rule editor and its own `rules.test.ts` coverage stays, because it
// remains a real reading worth being able to play, just not Copenhagen's own.
//
// This is a **separate ruleset type** from Tablut's for the same reason Tablut's
// is separate from Brandubh's: it carries fields neither of the others has
// (`exitFort`, `strongKingEdgeRule`, a fourth repetition outcome), nothing has
// ever been persisted under it, and a union type would push a narrowing into
// every call site in three games instead of one. See
// docs/adr/0007-copenhagen-forks-a-third-time-and-defers-the-shared-core.md.

import type { Side } from "./types";

export interface CopenhagenRuleSet {
  id: string;
  name: string;
  blurb: string;

  // ── Board and goal ───────────────────────────────────────────────────────────
  /**
   * Where the king has to get to. Copenhagen is `"corners"` (rule 6) — the same
   * goal as Brandubh, on a board nearly two and a half times the size.
   * `"edges"` is offered in the custom editor only, so the 11×11 board can be
   * played the Tablut way; no shipped preset uses it.
   */
  escape: "corners" | "edges";
  /** Who moves first. Copenhagen is the tafl norm — the attackers (rule 2). */
  firstMove: Side;

  // ── Piece behaviour ──────────────────────────────────────────────────────────
  /**
   * King may take part in captures, as a flanking piece and as a member or
   * bracket of a shieldwall. Copenhagen's king is armed.
   */
  armedKing: boolean;

  // ── Throne rules ─────────────────────────────────────────────────────────────
  /** King may return to the throne after leaving it. Copenhagen: yes. */
  kingMayReoccupyThrone: boolean;
  /**
   * Who the *empty* throne stops. Soldiers may never *stand* on it under any
   * preset — that is rule 5, and no source disputes it — so this is only about
   * sliding across.
   *
   * `"none"` is Copenhagen: *all pieces may pass through the throne when it is
   * empty*. The other two settings exist because the Tablut fork needs them (the
   * gulo/Dimetr proposal blocks Black), and are carried here so the custom
   * editor can express the same games on a bigger board.
   */
  throneBlocks: "none" | "attackers" | "soldiers";
  /**
   * Whose captures the *empty* throne backs up as an anvil, when a soldier is
   * pinned against it.
   *
   * Copenhagen is `"both"`, and getting there takes one step of reading. The
   * source says the throne *"is always hostile to the attackers, but only
   * hostile to the defenders when it is empty"* — which sounds like a fourth
   * setting, and is not one. Only the king may stand on the throne, so an
   * occupied throne holds a defender, and an occupied throne backing a
   * defender's capture is just the ordinary friendly-piece rule; the flag has
   * nothing left to say about it. Over the *empty* throne — the only case this
   * flag decides — the source has it hostile to both sides. Hence `"both"`.
   */
  throneAnvil: "none" | "both" | "defenders";
  /**
   * Empty throne counts as a hostile flank when checking whether the *king* is
   * captured — this is what makes rule 7's "three attackers plus the throne"
   * work beside the throne. Copenhagen: true.
   *
   * ⚠ Kept as a separate flag from `throneAnvil`, rather than folded into it,
   * because the pair `throneHostileToKing` + a strong king carries a standing
   * CONTESTED note in `../variants.ts` and an open item in
   * `docs/rules-review.md`. The doubt there is Brandubh's, not Copenhagen's —
   * here the source states it plainly — but the flag stays separable so the
   * question can be played with in the editor.
   */
  throneHostileToKing: boolean;

  // ── Corner rules ─────────────────────────────────────────────────────────────
  /** Corners are squares only the king may occupy (rule 5). Copenhagen: true. */
  cornersRestricted: boolean;
  /** Corners are hostile anvils for all captures (rule 5). Copenhagen: true. */
  cornersHostile: boolean;

  // ── Edge rules ───────────────────────────────────────────────────────────────
  /**
   * The board's outside acts as an anvil, so a soldier on the rim is captured by
   * a single enemy pushing him against it. **Not** a Copenhagen rule — the
   * sources are explicit that the board edge is not hostile, and the shieldwall
   * (rule 4b) is precisely the mechanism Copenhagen uses *instead* of a hostile
   * rim. Offered for custom play only.
   */
  edgeHostileToSoldiers: boolean;

  // ── King-capture strength ─────────────────────────────────────────────────────
  /**
   * How hard the king is to take. One enum rather than the pair of booleans the
   * other two games carry, because the space of attested readings is a ladder
   * and not a set of independent switches:
   *
   * `"weak"`   — an ordinary two-sided custodial capture anywhere, king included.
   * `"near_throne"` — four sides on the throne and beside it (the empty throne
   *                counting as one, if `throneHostileToKing`), two elsewhere.
   *                This is the Linnaeus/Tablut reading, offered for custom play.
   * `"strong"` — four sides *everywhere*. This is Copenhagen rule 7, and it is
   *                what makes the king safe on the rim, where a fourth side does
   *                not exist. See `strongKingEdgeRule` for the one case where
   *                the sources disagree about that.
   */
  kingStrength: "weak" | "near_throne" | "strong";
  /**
   * What a `"strong"` king's four-sided requirement means on the board's rim,
   * where one of the four cardinal squares is off the board.
   *
   * ⚠ **CONTESTED — the sources contradict each other, and this is the one flag
   * in the file where they do.** Excerpts sourced from aagenielsen.dk say the
   * board edge is not hostile and *"the king cannot be captured on the board
   * edge"*, which is `"uncapturable"`. Cyningstan's comparison of Fetlar with
   * Copenhagen says the opposite in as many words: that in Copenhagen *"the king
   * can be captured on the edge of the board and can thus be captured by two
   * attackers when on a square next to a corner"* — the corner being a hostile
   * restricted square standing in as one of the two — which is
   * `"available_sides"`.
   *
   * `"uncapturable"`    — the rim square is not hostile and cannot be filled, so
   *                       a strong king on the rim can never be taken. Shipped,
   *                       because two independently-worded excerpts agree on it
   *                       against one that does not.
   * `"available_sides"` — every cardinal square that *exists* must be hostile;
   *                       the missing one is not required. A king beside a corner
   *                       then falls to the corner plus one attacker.
   *
   * This is deliberately a setting and not a silent decision: it changes who
   * wins whole classes of endgame, and `docs/copenhagen-rules.md` carries it as
   * the first thing to check against the source. It has no effect unless
   * `kingStrength` is `"strong"`.
   */
  strongKingEdgeRule: "uncapturable" | "available_sides";

  // ── Shieldwall ────────────────────────────────────────────────────────────────
  /**
   * Rule 4b, and Copenhagen's signature: *a row of two or more taflmen along the
   * board edge may be captured together, by bracketing the whole group at both
   * ends, as long as every member of the row has an enemy taflman directly in
   * front of him. A corner square may stand in for one of the bracketing pieces
   * at one end of the row.*
   *
   * The king may take part — as a member of the bracketed row, or as a bracket —
   * but a shieldwall that catches the king along with his soldiers takes the
   * soldiers and leaves the king standing. He is only ever taken by rule 7.
   *
   * Off in Brandubh and Tablut, where it is a borrowed curiosity; **on** here,
   * where it is the game.
   */
  shieldwallCapture: boolean;

  // ── Win conditions ────────────────────────────────────────────────────────────
  /**
   * Rule 6b, the exit fort: the defenders win if the king has contact with the
   * board edge, has a move to make, and the attackers cannot break the fort
   * around him.
   *
   * This is the most expensive flag in the file — see `exitFort` in `rules.ts`
   * for how the "cannot break it" half is decided, and why the detector is
   * deliberately one-sided: it declares the win only when the fort is provably
   * unbreakable, so a fort it fails to recognise is merely played on, while a
   * fort it wrongly recognised would end a game nobody had won.
   */
  exitFort: boolean;
  /**
   * Rule 7b: the attackers win by surrounding the king and all remaining
   * defenders with an unbroken ring. Board edges do not count as part of the
   * ring. One of the three rules Copenhagen adds to Fetlar.
   */
  encirclementWin: boolean;

  // ── Repetition ────────────────────────────────────────────────────────────────
  /**
   * What happens when a position is repeated three times.
   *
   * `"none"` — ignored.
   * `"draw"` — the game is drawn.
   * `"loss_for_defenders"` — White loses regardless of who caused it. This is
   *   Copenhagen's own rule (corrected 2026-09-09 — see below), and it is what
   *   Brandubh and Tablut offer too.
   * `"loss_for_repeater"` — the side that moved into the position for the
   *   third time is the one that loses, which is why a game played with this
   *   setting can end in `defenders_win_repetition` — a status no shipped
   *   preset can produce any more, now that rule 8 is read as
   *   `"loss_for_defenders"`. Kept for custom play: it traced to a secondary
   *   paraphrase rather than to Copenhagen's own text (see
   *   docs/copenhagen-rules.md, "Corrections of 2026-09-09"), but it remains a
   *   real reading some players want to try, and the legacy `copenhagen`
   *   preset shipped under it — see below.
   */
  repetitionResult: "none" | "draw" | "loss_for_defenders" | "loss_for_repeater";
}

// ── Presets ───────────────────────────────────────────────────────────────────

/**
 * Copenhagen itself, as the eleven rules at the top of this file give it —
 * corrected 2026-09-09 (`repetitionResult: "loss_for_defenders"`, rule 8).
 * Every current preset is stated as a diff against this one, because
 * Copenhagen is the thing being reconstructed here — the reverse of the other
 * two games, where a minimal undisputed baseline is the anchor and the
 * readings pile on top. `LEGACY_COPENHAGEN` below is the pre-correction
 * version, kept frozen for the legacy presets.
 */
const COPENHAGEN: Omit<CopenhagenRuleSet, "id" | "name" | "blurb"> = {
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
  repetitionResult: "loss_for_defenders",
};

/**
 * The pre-2026-09-09 reading of Copenhagen, frozen byte-for-byte
 * (`repetitionResult: "loss_for_repeater"`) so the legacy `copenhagen` and
 * `copenhagen-fetlar` presets below keep resolving to exactly what a game
 * saved or exported under those ids was actually played under. Do not edit
 * this constant — that is what `COPENHAGEN` above is for.
 */
const LEGACY_COPENHAGEN: Omit<CopenhagenRuleSet, "id" | "name" | "blurb"> = {
  ...COPENHAGEN,
  repetitionResult: "loss_for_repeater",
};

export const VARIANTS: Record<string, CopenhagenRuleSet> = {
  // ── Current presets — corrected 2026-09-09, repetitionResult: "loss_for_defenders" ──

  "copenhagen-2": {
    id: "copenhagen-2",
    name: "Copenhagen Hnefatafl",
    blurb:
      "The modern tournament standard, played at the Hnefatafl World " +
      "Championship. Twenty-four attackers against a king and twelve defenders " +
      "on 11×11. The king is armed, escapes to a corner, and takes four " +
      "attackers to capture — three when the empty throne stands beside him. A " +
      "bracketed row along the edge falls together as a shieldwall; an " +
      "unbreakable fort at the rim wins for the king; an unbroken ring around " +
      "the defenders wins for the attackers; and repeating a position three " +
      "times loses for the defending side, whoever caused it.",
    ...COPENHAGEN,
  },

  "copenhagen-fetlar-2": {
    id: "copenhagen-fetlar-2",
    name: "Fetlar Hnefatafl",
    blurb:
      "⚠ UNVERIFIED. The older championship rules Copenhagen was written to " +
      "extend, on the same board and setup: no shieldwall, no exit fort, and no " +
      "encirclement win. The throne is not hostile to the king even beside it " +
      "(Fetlar's own eleven rules give the king no throne-adjacent protection — " +
      "see docs/copenhagen-rules.md), and repetition is left unscored, because " +
      "Fetlar's rules are silent on it and asserting a specific consequence " +
      "would be inventing a rule the source does not contain. Reconstructed " +
      "from secondary descriptions of how the two differ rather than from the " +
      "Fetlar rules themselves, so treat it as a contrast to play against, not " +
      "a citation.",
    ...COPENHAGEN,
    throneHostileToKing: false,
    shieldwallCapture: false,
    exitFort: false,
    encirclementWin: false,
    repetitionResult: "none",
  },

  // ── Legacy presets — kept byte-for-byte, hidden from the picker ────────────
  //
  // These are the exact two presets as they shipped before the 2026-09-09
  // correction (`repetitionResult: "loss_for_repeater"` for `copenhagen`;
  // `throneHostileToKing: true` inherited, unattested, for
  // `copenhagen-fetlar`), kept under their original ids so a saved game
  // (`copenhagen.game.v1`) or an exported .tafl file naming one of them keeps
  // replaying into the game it actually recorded. `VARIANTS` keeps resolving
  // them; `VISIBLE_VARIANTS` below no longer offers them. Do not "fix" a flag
  // in this section — that is what the corrected preset with the `-2` suffix
  // above is for.

  copenhagen: {
    id: "copenhagen",
    name: "Copenhagen Hnefatafl (legacy)",
    blurb:
      "LEGACY — kept only so games saved or exported under this id keep their " +
      "meaning. This preset shipped scoring perpetual repetition as a loss for " +
      "whichever side repeats, which the 2026-09-09 sourcing pass found " +
      "traced to a secondary paraphrase rather than Copenhagen's own text " +
      "(see docs/copenhagen-rules.md). New games use “Copenhagen " +
      "Hnefatafl” (copenhagen-2), which corrects it and is otherwise " +
      "identical.",
    ...LEGACY_COPENHAGEN,
  },

  "copenhagen-fetlar": {
    id: "copenhagen-fetlar",
    name: "Fetlar Hnefatafl (legacy)",
    blurb:
      "⚠ UNVERIFIED, and LEGACY — kept only so games saved or exported under " +
      "this id keep their meaning. This preset shipped with the throne " +
      "hostile to the king even beside it, inherited unchanged from " +
      "Copenhagen; the 2026-09-09 sourcing pass found Fetlar's own eleven " +
      "rules give the king no such throne-adjacent protection (see " +
      "docs/copenhagen-rules.md). New games use “Fetlar Hnefatafl” " +
      "(copenhagen-fetlar-2), which corrects it and is otherwise identical — " +
      "and is itself still unverified.",
    ...LEGACY_COPENHAGEN,
    shieldwallCapture: false,
    exitFort: false,
    encirclementWin: false,
    repetitionResult: "loss_for_defenders",
  },
};

/**
 * Which presets the picker offers, in order — the `VISIBLE_LANGS` idiom from
 * `src/i18n.ts`, as used by both other games. A hidden preset stays in
 * `VARIANTS` so `rulesFor` keeps resolving it and saved or exported games under
 * it still replay; deleting it from `VARIANTS` would orphan those.
 *
 * Only the corrected (`-2`) presets are visible. The two legacy ids above are
 * deliberately absent — see the LEGACY section's header comment.
 */
export const VISIBLE_VARIANTS: string[] = ["copenhagen-2", "copenhagen-fetlar-2"];

/** Copenhagen leads, because Copenhagen is the point of this board. */
export const DEFAULT_VARIANT = "copenhagen-2";

/** A ruleset without its identity — what the custom rule editor edits. */
export type CustomRuleSet = Omit<CopenhagenRuleSet, "id" | "name" | "blurb">;

/**
 * Starting point for the custom rule editor.
 *
 * Copenhagen itself, not a stripped-down baseline. The other two games start
 * their editors from "the undisputed minimum" because their defaults are
 * readings; here the default *is* the published ruleset, and someone opening
 * the editor wants to change one thing about Copenhagen rather than rebuild it.
 */
export const CUSTOM_RULE_DEFAULTS: CustomRuleSet = { ...COPENHAGEN };

// ── Enum choices ──────────────────────────────────────────────────────────────
// Every string-valued flag in `CustomRuleSet` needs its offered values decided
// in exactly one place. Before this table existed, the custom rule editor
// (`CopenhagenScreen.tsx`) and the game file's `Rules` tag (`gameFile.ts`) each
// kept their own copy, and the editor's was a stale, unedited copy of Tablut's:
// it had no entries for `kingStrength` or `strongKingEdgeRule` at all — so
// opening the Custom editor threw on `undefined.map` — and its
// `repetitionResult` list omitted `loss_for_repeater`, Copenhagen's own shipped
// default. Both consumers now read this table, so a flag added to
// `CopenhagenRuleSet` and left out here is a compile error (a missing or
// excess key on the object literal below), not a runtime crash or a silently
// unreachable value.

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
  kingStrength: ["weak", "near_throne", "strong"],
  strongKingEdgeRule: ["uncapturable", "available_sides"],
  repetitionResult: ["none", "draw", "loss_for_defenders", "loss_for_repeater"],
};

// ── Resolving a ruleset ───────────────────────────────────────────────────────
// Storage and the export format both have to turn a variant id plus a set of
// custom flags back into the ruleset a game was played under. Keeping that in
// one place is what stops the two serializations from quietly disagreeing about
// what "custom" means.

/** The ruleset for a variant id; `"custom"` is built from the flags given. */
export function rulesFor(variantId: string, custom: CustomRuleSet): CopenhagenRuleSet {
  return variantId === "custom"
    ? { id: "custom", name: "Custom", blurb: "Your custom ruleset.", ...custom }
    : VARIANTS[variantId];
}

/** The inverse: a ruleset stripped back to the flags the editor holds. */
export function ruleFlags(rules: CopenhagenRuleSet): CustomRuleSet {
  const { id, name, blurb, ...flags } = rules;
  return flags;
}
