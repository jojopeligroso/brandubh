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
// The eleven rules the presets assert, in the order the sources give them —
// followed by the three this project added, which are marked ★ and are *not*
// Copenhagen. See docs/copenhagen-rules.md, and
// docs/reports/copenhagen-king-capture-edge-cases.md for every position they
// decide, worked through the shipped code:
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
//   8. Perpetual repetition is forbidden, and loses for the player repeating.
//
//   7a ★ On the rim the king falls to three *attackers*, and to nothing else: a
//      hostile square does not stand in for a man, so a king beside a corner
//      cannot be taken at all. One of three readings the sources give, chosen.
//   7c ★ A pocket sealed by attackers *and the rim together* counts as rule 7b's
//      ring, which the sourced wording explicitly denies.
//   7d ★ A king entombed at the rim — no move, and no way for his own side to
//      open a square beside him — loses. In no published ruleset.
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
   * edge"*. Cyningstan's comparison of Fetlar with Copenhagen says the opposite
   * in as many words: that in Copenhagen *"the king can be captured on the edge
   * of the board and can thus be captured by two attackers when on a square next
   * to a corner"*. A third excerpt splits the difference — *"when the king is on
   * an edge square he is captured by three attackers"* — which is the wording the
   * shipped setting follows. All three were retrieved as search excerpts; every
   * site that publishes the rule is `EGRESS_BLOCKED` from this environment.
   *
   * `"three_attackers"`  — **shipped.** Every cardinal square that *exists* must
   *                       hold an actual **attacker**; the off-board one is not
   *                       required, and a hostile *square* does not stand in. On
   *                       the rim that means three attackers, and it means a king
   *                       orthogonally beside a corner cannot be captured at all
   *                       (no soldier may stand on a corner, so the third
   *                       attacker has nowhere to be) — he is one step from
   *                       winning instead. This is the owner's decision, not a
   *                       transcription; see docs/copenhagen-rules.md.
   * `"uncapturable"`    — the rim square is not hostile and cannot be filled, so
   *                       a strong king on the rim can never be taken. This is
   *                       the well-corroborated *Fetlar* reading, and it is what
   *                       the `copenhagen-fetlar` preset now carries.
   * `"available_sides"` — every cardinal square that *exists* must be hostile,
   *                       with hostile meaning what it means everywhere else, so
   *                       a corner or the empty throne stands in. A king beside a
   *                       corner then falls to the corner plus one attacker. This
   *                       is Cyningstan's reading, kept for the editor.
   *
   * The three form a ladder — `"uncapturable"` never, `"three_attackers"` only to
   * men, `"available_sides"` to men and squares alike — and it changes who wins
   * whole classes of endgame, which is why it is a setting rather than a silent
   * decision. It has no effect unless `kingStrength` is `"strong"`.
   */
  strongKingEdgeRule: "uncapturable" | "available_sides" | "three_attackers";

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
   * defenders with an unbroken ring. One of the three rules Copenhagen adds to
   * Fetlar. What counts as "unbroken" at the rim is `edgeCompletesRing`.
   */
  encirclementWin: boolean;
  /**
   * Whether the board edge may form part of the encirclement ring (rule 7b).
   *
   * The sourced wording is *"board edges do not count as part of the ring"*,
   * which is `false`: the ring must be attackers all the way round, so a king
   * pressed against the rim is by definition not encircled — and `isEncircled`
   * used to say exactly that, returning false the instant the king stood on a
   * rim square.
   *
   * `true` is **shipped, and is the owner's decision rather than a reading of
   * the source.** It says a pocket sealed by attackers *and the rim together* is
   * a ring: the king and every remaining defender are shut in a region from
   * which no escape square can be reached. The "no escape square" clause is what
   * keeps it from swallowing the board — a wall across the middle leaves both
   * halves holding corners, so only a genuine pocket against one edge qualifies.
   *
   * Meaningless unless `encirclementWin` is on.
   */
  edgeCompletesRing: boolean;
  /**
   * The attackers win when the king is entombed: standing on a rim square with
   * no legal move, walled in by pieces of **either** colour, and with no way for
   * his own side to open a square beside him.
   *
   * **Not a published rule.** It is the owner's decision, and it exists because
   * `strongKingEdgeRule: "three_attackers"` leaves a hole: a king held on the rim
   * by two attackers and one of his own men is not captured under rule 7 (one of
   * the three squares holds the wrong colour) and is not encircled under rule 7b
   * (his side is not shut in), yet he plainly cannot get out. Under the sourced
   * rules that game grinds on to a threefold repetition, which `loss_for_repeater`
   * would hand to whichever side ran out of waiting moves first — an ending
   * decided by bookkeeping rather than by the board.
   *
   * `kingIsEntombed` in `rules.ts` sets out exactly what it tests and — as
   * important — what it does *not* prove. Unlike `exitFort`, this one is a
   * positional rule and not a proof of inevitability.
   */
  entombedKingLoses: boolean;

  // ── Repetition ────────────────────────────────────────────────────────────────
  /**
   * What happens when a position is repeated three times.
   *
   * `"none"` — ignored.
   * `"draw"` — the game is drawn.
   * `"loss_for_defenders"` — White loses regardless of who caused it. This is
   *   the Fetlar-style rule, and it is what Brandubh and Tablut offer.
   * `"loss_for_repeater"` — **Copenhagen.** *Perpetual repetitions are
   *   forbidden: the player who maintains the situation must find another move
   *   to break the repetition, or else he loses the game.* The side that moved
   *   into the position for the third time is the one that loses, which is why
   *   this game can end in `defenders_win_repetition` — a status the other two
   *   games can never produce.
   */
  repetitionResult: "none" | "draw" | "loss_for_defenders" | "loss_for_repeater";
}

// ── Presets ───────────────────────────────────────────────────────────────────

/**
 * Copenhagen itself, as the rules at the top of this file give it — the eleven
 * sourced ones, and the three marked ★ that are this project's own. Every
 * other preset is stated as a diff against this one, because Copenhagen is the
 * thing being reconstructed here — the reverse of the other two games, where a
 * minimal undisputed baseline is the anchor and the readings pile on top.
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
  strongKingEdgeRule: "three_attackers",
  shieldwallCapture: true,
  exitFort: true,
  encirclementWin: true,
  edgeCompletesRing: true,
  entombedKingLoses: true,
  repetitionResult: "loss_for_repeater",
};

export const VARIANTS: Record<string, CopenhagenRuleSet> = {
  copenhagen: {
    id: "copenhagen",
    name: "Copenhagen Hnefatafl",
    blurb:
      "The modern tournament standard, played at the Hnefatafl World " +
      "Championship. Twenty-four attackers against a king and twelve defenders " +
      "on 11×11. The king is armed, escapes to a corner, and takes four " +
      "attackers to capture — three when the empty throne stands beside him, " +
      "and three when his back is to the board edge. A bracketed row along the " +
      "edge falls together as a shieldwall; an unbreakable fort at the rim wins " +
      "for the king; an unbroken ring around the defenders wins for the " +
      "attackers, and the rim itself can close it; a king walled in at the edge " +
      "with no way to be freed is lost; and repeating a position three times " +
      "loses for the player doing it.",
    ...COPENHAGEN,
  },

  "copenhagen-fetlar": {
    id: "copenhagen-fetlar",
    name: "Fetlar Hnefatafl",
    blurb:
      "⚠ UNVERIFIED. The older championship rules Copenhagen was written to " +
      "extend, on the same board and setup: no shieldwall, no exit fort, and no " +
      "encirclement win. Reconstructed from secondary descriptions of how the " +
      "two differ rather than from the Fetlar rules themselves (see " +
      "docs/copenhagen-rules.md), so treat it as a contrast to play against, " +
      "not a citation.",
    ...COPENHAGEN,
    shieldwallCapture: false,
    exitFort: false,
    encirclementWin: false,
    edgeCompletesRing: false,
    entombedKingLoses: false,
    // The one rule this preset now states *positively* rather than by removal.
    // Every excerpt that says "the king cannot be captured on the board edge"
    // is, on the best available reading, describing Fetlar — which is exactly
    // what Cyningstan says the difference between the two rulesets is. Putting
    // it here makes the contested rule a contrast the player can sit down and
    // play, instead of a comment nobody reads.
    strongKingEdgeRule: "uncapturable",
    repetitionResult: "loss_for_defenders",
  },
};

/**
 * Which presets the picker offers, in order — the `VISIBLE_LANGS` idiom from
 * `src/i18n.ts`, as used by both other games. A hidden preset stays in
 * `VARIANTS` so `rulesFor` keeps resolving it and saved or exported games under
 * it still replay; deleting it from `VARIANTS` would orphan those.
 */
export const VISIBLE_VARIANTS: string[] = ["copenhagen", "copenhagen-fetlar"];

/** Copenhagen leads, because Copenhagen is the point of this board. */
export const DEFAULT_VARIANT = "copenhagen";

/** A ruleset without its identity — what the custom rule editor edits. */
export type CustomRuleSet = Omit<CopenhagenRuleSet, "id" | "name" | "blurb">;

/** The flags that are plain booleans, and the ones that are enums. Derived from
 *  the type, so they cannot drift from it. */
type BoolRuleKey = {
  [K in keyof CustomRuleSet]: CustomRuleSet[K] extends boolean ? K : never;
}[keyof CustomRuleSet];
export type EnumRuleKey = Exclude<keyof CustomRuleSet, BoolRuleKey>;

/**
 * The values each enum rule may hold, written out longhand.
 *
 * Written out rather than derived because two callers need it at *runtime*,
 * where the type has gone: `gameFile.ts` has to refuse `escape=sideways` from an
 * imported file, and the custom rule editor has to draw a button per value. Both
 * used to keep their own copy, and the editor's was two enums and one value
 * behind — which is not a wrong label but a crash, since it renders
 * `ENUM_RULE_VALUES[k].map(...)` over an entry that is not there. One table, one
 * chance to forget, and `variants.test.ts` asserts it covers every enum.
 *
 * Order matters: it is the order the editor draws the buttons in, so each row
 * reads as a spectrum from the least to the most permissive.
 */
export const ENUM_RULE_VALUES: Record<EnumRuleKey, readonly string[]> = {
  escape: ["edges", "corners"],
  firstMove: ["defenders", "attackers"],
  throneBlocks: ["none", "attackers", "soldiers"],
  throneAnvil: ["none", "defenders", "both"],
  kingStrength: ["weak", "near_throne", "strong"],
  strongKingEdgeRule: ["uncapturable", "three_attackers", "available_sides"],
  repetitionResult: ["none", "draw", "loss_for_defenders", "loss_for_repeater"],
};

/**
 * Starting point for the custom rule editor.
 *
 * Copenhagen itself, not a stripped-down baseline. The other two games start
 * their editors from "the undisputed minimum" because their defaults are
 * readings; here the default *is* the published ruleset, and someone opening
 * the editor wants to change one thing about Copenhagen rather than rebuild it.
 */
export const CUSTOM_RULE_DEFAULTS: CustomRuleSet = { ...COPENHAGEN };

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
