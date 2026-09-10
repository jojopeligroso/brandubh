// ── Nine Men's Morris rule variants ───────────────────────────────────────────
//
// The same preset machinery the three tafl games carry (`VARIANTS`,
// `VISIBLE_VARIANTS`, `DEFAULT_VARIANT`, `CustomRuleSet`, `CUSTOM_RULE_DEFAULTS`,
// `ENUM_CHOICES`, `rulesFor`, `ruleFlags`), over a much smaller and much less
// contested rule space. Morris is not a reconstruction: the game is played to the
// same rules in every park in Europe, and the only genuinely debated points are
// the two Gasser had to decide to solve it.
//
// So what this file has to be honest about is different from the tafl files'
// problem. There is no doubt about *what the game is*; there is doubt about
// whether **this** file has Gasser's own wording right, because every host
// carrying "Solving Nine Men's Morris" (Computational Intelligence 12(1):24–41,
// 1996; also in Games of No Chance, MSRI 29) is blocked by this environment's
// egress proxy. Everything below came through search-engine excerpts, and every
// flag whose source is the paper is marked ⚠ UNVERIFIED (excerpt) for that reason
// — the excerpts are quite specific, and they are still not the paper.
// `docs/morris-rules.md` records, assertion by assertion, which is which.
//
// The two *practical* draw rules are a different kind of entry again, and are
// marked as such: `repetitionResult` and `noMillDrawMoves` are **not in the
// paper at all**. Gasser's databases define a draw as "neither side can force a
// win", which is a statement about game values and not a termination a human game
// can use — a drawn Morris endgame otherwise shuffles forever. They ship on by
// owner decision, and both are reachable the other way in the custom editor so a
// player can play the paper's game exactly.
//
// The rules the shipped preset asserts, in the order the game is played:
//
//   1. 24 points on three rings; nine stones each; White places first.
//   2. Placing phase: one stone per turn until all eighteen are down.
//   3. Moving phase: a stone moves along a line to an adjacent empty point.
//   4. Flying: a player down to three stones may move to any empty point.
//   5. Closing a mill takes one opponent stone that is not itself in a mill —
//      unless every opponent stone is in a mill, in which case any may be taken.
//      Closing two mills at once still takes exactly one stone.
//   6. A player below three stones loses; a player who cannot move loses.
//   7. Threefold repetition, and fifty moves by each side with no mill closed,
//      are draws. (Practical additions — not Gasser.)

import type { Side } from "./types";

export interface MorrisRuleSet {
  id: string;
  name: string;
  blurb: string;

  // ── Who starts ───────────────────────────────────────────────────────────────
  /**
   * Who places the first stone. White in the shipped preset.
   *
   * ⚠ UNVERIFIED (excerpt). The excerpts establish that Gasser proved the
   * *initial position* a draw with an 18-ply alpha-beta search over the placing
   * phase, but not which colour he had move first; "White first" is the ordinary
   * convention and nothing in the result depends on it (the board is colour-blind
   * until the first stone lands). It is a flag so a correction is a one-line
   * change, exactly as `firstMove` was for Tablut — where precisely this field
   * was wrong for months and needed a preset correction to fix (see CLAUDE.md).
   */
  firstMove: Side;

  // ── Moving phase ─────────────────────────────────────────────────────────────
  /**
   * When a player may move a stone to *any* empty point instead of along a line.
   *
   * `"three"` — once reduced to three stones (hand empty). This is the common
   * tournament rule, and ⚠ UNVERIFIED (excerpt) as Gasser's: the excerpts
   * describe his solution as using the flying rule, but his own statement of it
   * was not seen.
   * `"none"` — no flying ever. A materially different and much harder game for
   * the weaker side; offered in the custom editor because a great many players
   * learn Morris without flying at all.
   */
  flying: "three" | "none";

  // ── Removals ─────────────────────────────────────────────────────────────────
  /**
   * May a stone be taken out of a mill when *every* one of that player's stones is
   * in a mill?
   *
   * `true` is Gasser's choice (one of the two debated points the excerpts state
   * explicitly: "when all opponent stones are in mills, any stone may be
   * removed") — ⚠ UNVERIFIED (excerpt) only in the sense that the sentence came
   * through an excerpt rather than the paper.
   *
   * With it off, a mill closed against a fully-milled opponent takes nothing at
   * all: `removable` returns an empty list and `applyMove` accepts — requires —
   * `remove: null` for that turn. That is the honest reading of the stricter rule,
   * not an error case.
   */
  removeFromMillsWhenAllInMills: boolean;
  /**
   * How many stones a turn that closes **two** mills at once takes.
   *
   * `"one"` is Gasser's choice, and the second of the two debated points the
   * excerpts state explicitly ("closing two mills at once removes one stone") —
   * ⚠ UNVERIFIED (excerpt) in the same narrow sense.
   *
   * `"two"` is the other widespread reading, and it is genuinely a different game
   * (a double mill becomes the strongest formation on the board rather than a
   * mild convenience). Under it a turn carries `remove2` as well, so one turn is
   * still one `Move` and one ply. Which *pair* is legal is decided from the
   * victims legal before either stone is lifted — a reading, since no source says
   * whether lifting the first stone can expose or protect the second.
   */
  doubleMillRemoves: "one" | "two";

  // ── Practical terminations (NOT in the paper) ────────────────────────────────
  /**
   * What a threefold repetition does.
   *
   * `"draw"` ships. **Not Gasser's rule** — the paper has no repetition rule,
   * because a retrograde database does not need one: it labels a position by
   * whether either side can *force* a win, and an unforced shuffle is already a
   * draw in that sense. A played game needs the termination or it never ends, so
   * the owner added it.
   *
   * `"none"` plays the paper's game, and is the setting to use when comparing this
   * engine's values against a database.
   */
  repetitionResult: "draw" | "none";
  /**
   * Fifty moves by each side (100 plies) in the moving phase with no mill closed.
   *
   * `"50"` ships; again an owner addition and **not Gasser's**, and the same
   * reasoning as `repetitionResult`. The counter is `GameState.sinceMill`, it
   * resets whenever a mill is closed, and it does not run during the placing
   * phase, which is eighteen plies long and cannot stall.
   *
   * `"none"` plays the paper's game.
   */
  noMillDrawMoves: "none" | "50";
}

// ── Presets ───────────────────────────────────────────────────────────────────

/**
 * Gasser's readings, plus the two practical draw rules. Stated as a constant so
 * `CUSTOM_RULE_DEFAULTS` and the preset below cannot drift apart.
 *
 * The `-1` suffix is deliberate and is a lesson from the other three games: both
 * Tablut and Copenhagen had to correct a shipped flag and keep the old preset
 * under its old id so saved games kept their meaning (CLAUDE.md, "Corrections of
 * 2026-09-09"). Morris starts numbered, so a correction to a rule the owner has
 * not been able to read in full yet is a new id rather than a rename.
 */
const GASSER: Omit<MorrisRuleSet, "id" | "name" | "blurb"> = {
  firstMove: "white",
  flying: "three",
  removeFromMillsWhenAllInMills: true,
  doubleMillRemoves: "one",
  repetitionResult: "draw",
  noMillDrawMoves: "50",
};

export const VARIANTS: Record<string, MorrisRuleSet> = {
  "morris-gasser-1": {
    id: "morris-gasser-1",
    name: "Nine Men's Morris",
    blurb:
      "The standard game, with the rule readings Ralph Gasser used when he " +
      "solved Nine Men's Morris in 1996: closing two mills at once still takes " +
      "one stone, and when every enemy stone is in a mill, any of them may be " +
      "taken. Nine stones each, placed one per turn, then moved along the lines " +
      "— and a player down to three stones may fly to any empty point. A player " +
      "below three stones, or with no move to make, loses. Gasser's result is " +
      "that the game is a draw; the repetition and fifty-move draws here are " +
      "practical additions, not his.",
    ...GASSER,
  },
};

/** Which presets the picker offers, in order — the `VISIBLE_LANGS` idiom from
 *  `src/i18n.ts`, as used by all three tafl games. One preset today; a hidden
 *  entry would stay in `VARIANTS` so `rulesFor` kept resolving it. */
export const VISIBLE_VARIANTS: string[] = ["morris-gasser-1"];

export const DEFAULT_VARIANT = "morris-gasser-1";

/** A ruleset without its identity — what the custom rule editor edits. */
export type CustomRuleSet = Omit<MorrisRuleSet, "id" | "name" | "blurb">;

/** Starting point for the custom rule editor: the shipped game, so the first
 *  thing a player does is change one rule about Morris rather than rebuild it. */
export const CUSTOM_RULE_DEFAULTS: CustomRuleSet = { ...GASSER };

// ── Enum choices ──────────────────────────────────────────────────────────────
// One place that decides which values each string-valued flag offers, for the
// same reason `../copenhagen/variants.ts` has one: before that table existed, the
// rule editor and the game-file writer each kept a copy, and the editor's was a
// stale copy of another game's — which threw on `undefined.map` when opened. A
// flag added to `MorrisRuleSet` and left out here is a compile error on the
// object literal below, not a runtime crash.

/** The keys of `CustomRuleSet` whose value is an enum rather than a boolean. */
export type EnumRuleKey = {
  [K in keyof CustomRuleSet]: CustomRuleSet[K] extends string ? K : never;
}[keyof CustomRuleSet];

/** The values each enum rule offers, in the order they read as a spectrum —
 *  weakest/least-permissive first, so the editor's segmented control reads left
 *  to right like a dial. */
export const ENUM_CHOICES: Record<EnumRuleKey, readonly string[]> = {
  firstMove: ["white", "black"],
  flying: ["none", "three"],
  doubleMillRemoves: ["one", "two"],
  repetitionResult: ["none", "draw"],
  noMillDrawMoves: ["none", "50"],
};

// ── Resolving a ruleset ───────────────────────────────────────────────────────

/** The ruleset for a variant id; `"custom"` is built from the flags given. */
export function rulesFor(variantId: string, custom: CustomRuleSet): MorrisRuleSet {
  return variantId === "custom"
    ? { id: "custom", name: "Custom", blurb: "Your custom ruleset.", ...custom }
    : VARIANTS[variantId];
}

/** The inverse: a ruleset stripped back to the flags the editor holds. */
export function ruleFlags(rules: MorrisRuleSet): CustomRuleSet {
  const { id, name, blurb, ...flags } = rules;
  return flags;
}
