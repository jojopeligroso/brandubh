# Tablut rules — sources and open questions

Companion to `rules-review.md`, which does the same job for Brandubh. It records
what the shipped Tablut presets assert, where each assertion comes from, and — the
part that matters — which of them have **not** been checked against a source.

Presets live in `src/game/tablut/variants.ts`. Every flag named below is a field
there, and `variants.test.ts` asserts the presets flag by flag, because a preset
is data and a wrong flag in it is silent.

## The baseline is not in dispute

Six rules, as given, and the `tablut` preset asserts nothing beyond them:

1. Two players. White is the king and his defenders; Black the attackers.
2. **White moves first**, then the players alternate.
3. All pieces move horizontally or vertically as far as the path is clear.
4. A piece is captured when trapped between two enemies horizontally or
   vertically — but only if the **opponent's move** closed the trap. Moving your
   own piece between two enemies is safe.
5. White wins by moving the king to an **edge square**.
6. Black wins by capturing the king first.

Two of these are worth flagging because they invert a tafl habit:

- **White leads.** Most tafl games, Brandubh included, give the attackers the
  first move. `firstMove` is therefore a ruleset field rather than an assumption,
  and `initialState` takes the ruleset — a save or a game file paired with the
  wrong first mover fails at ply 0 rather than replaying into a different game.
- **The rim, not the corners.** There are 32 winning squares, not four, and they
  are not a special *kind* of square. A baseline Tablut corner is ordinary ground
  a soldier may stand on, which is why `cornersRestricted` and `cornersHostile`
  are both off and why the board draws no corner emblem. Getting this wrong is
  not a cosmetic matter: see "the unsound shortcut" below.

## What the baseline leaves open

Everything the other presets disagree about. The throne is the main one — the six
rules do not say what the centre square does once the king has left it — followed
by how strong the king is, and what a repetition means.

| Flag | Baseline | Why |
|---|---|---|
| `throneBlocks` | `none` | Rule 3 says "as far as the path is clear" and an empty square is clear. Soldiers still may not *stop* there, which no source disputes. |
| `throneAnvil` | `none` | Rule 4 names two enemies, not a square. |
| `throneHostileToKing` | `false` | Same. |
| `strongKingOnThrone` / `…AdjacentToThrone` | `false` | Rule 4 applies to the king as written; a four-sided requirement is an addition. |
| `encirclementWin` | `false` | Not in the six rules — and under edge escape "the king cannot reach the rim" is nearly the same statement as "the king is encircled", so enabling it ends games in a way the rules do not ask for. |
| `edgeHostileToSoldiers` | `false` | Not in the six rules. Offered in the custom editor because some reconstructions use it and it changes how the rim plays more than any other single flag. |
| `repetitionResult` | `draw` | Not in the six rules; a draw is the least opinionated reading. |

## `tablut-gulo` — attested, and credited

July 2025, on aagenielsen.dk: **Gustaf Løvenlund ("gulo")** and **Dmitrij
Tsvilenev ("Dimetr")** proposed two small changes of detail to Tablut:

- *The throne cannot be crossed by black* → `throneBlocks: "attackers"`
- *The throne is friendly to white* → `throneAnvil: "defenders"`

"Friendly to white" is read as: White may pin a soldier against the empty throne,
and Black may **not** use it against White. Both changes are reachable flag for
flag in the custom rule editor, which is the point of the editor.

This preset came from the request that prompted the work, quoting the proposal.
It is not independently verified against the site (see below), but the wording
was supplied directly and the attribution is specific, so it is recorded as
attested rather than guessed.

## ⚠ `tablut-aage` is UNVERIFIED

**aagenielsen.dk could not be reached.** The egress proxy returns 403 for it —
already documented in `README.md`, and re-confirmed while writing this. So the
tournament preset is a **plausible reading, not a citation**:

```
throneAnvil: "both"          strongKingOnThrone: true
throneHostileToKing: true    strongKingAdjacentToThrone: true
repetitionResult: "loss_for_defenders"
```

Its blurb says UNVERIFIED in the app, and `variants.test.ts` asserts that the
blurb says so. **If you verify it, delete that test in the same commit** — the
test exists to make the warning hard to remove by accident, not to be permanent.

To check, when the site is reachable: the Tablut page on aagenielsen.dk, plus
hnefatafl.org and tafl.cyningstan.com for cross-reference. The specific questions
are whether the empty throne is hostile to soldiers of both sides, whether the
four-sided king rule applies beside the throne as well as on it, and what a
threefold repetition scores.

Anyone who would rather not rely on it can hide it in one line — see below.

## `tablut-corners` is a different game, deliberately

Corner escape (`escape: "corners"`, corners restricted and hostile) is a common
modern reconstruction, and it is included as a contrast rather than as a variant
of the baseline: the whole rim stops being a goal, so the game it produces is
Brandubh's shape on a bigger board. The engine's recognizers decline to reason
about it rather than guessing (`forcedDefenderWin` returns false for any ruleset
that is not edge-escape), so it is played by search alone.

## The contested rule carries over

`throneHostileToKing` + `strongKingAdjacentToThrone` are the pair `rules-review.md`
has open for Brandubh: it is **not settled** whether an ordinary two-sided
custodial capture of the king should also remain valid in some throne-adjacent
positions. The same doubt applies here for the same reason, and both flags are
exposed in the custom editor while it stands. Only `tablut-aage` turns them on,
and that preset is unverified anyway.

## The unsound shortcut worth knowing about

Brandubh's engine proves a forced win from a **single** open lane when the king
already touches the corner: no soldier may ever stand on a corner, so that lane
cannot be blocked at all. Ported to Tablut this would be **wrong** — under edge
escape the rim is ordinary ground and an attacker can simply occupy the square the
king was aiming for. The Tablut recognizer therefore requires **two** lanes, and
`recognizers.test.ts` pins the exact position that shows why. The two-lane
argument itself is cleaner here than there: the king's four rays are pairwise
disjoint, so one blocker can never sit in two of them.

## Hiding a preset

`VISIBLE_VARIANTS` in `src/game/tablut/variants.ts` lists what the picker offers,
mirroring the `VISIBLE_LANGS` idiom in `src/i18n.ts`. Removing an entry hides it
in one line; the preset stays in `VARIANTS`, so `rulesFor` keeps resolving it and
games already saved or exported under it still replay. Deleting it from `VARIANTS`
would orphan those — don't.

## Not calibrated

The engine's eval weights for Tablut are **reasoned, not tuned**. Brandubh's came
off an A/B gauntlet over hundreds of games (`scripts/evaltune.ts`); nothing of the
sort has been run here, and the balance differs enough (16 v 8, four possible
lanes instead of two, 81 squares) that Brandubh's numbers cannot be assumed to
transfer. `DEFAULT_WEIGHTS` in `src/game/tablut/engine.ts` says so. Likewise
`usePVS` ships on as a considered default rather than a measured one.

What *has* been measured is recorded in that file: the opening's branching factor
(80 attacker / 56 defender moves against Brandubh's 40 — half again to twice, not
the "three times" an earlier draft claimed), the per-depth search cost, and the
effective-branching-factor cap that bought two extra plies at both timed tiers.
