# Tablut rules — sources and open questions

Companion to `rules-review.md`, which does the same job for Brandubh. It records
what the shipped Tablut presets assert, where each assertion comes from, and — the
part that matters — which of them have **not** been checked against a source.

Presets live in `src/game/tablut/variants.ts`. Every flag named below is a field
there, and `variants.test.ts` asserts the presets flag by flag, because a preset
is data and a wrong flag in it is silent.

## Corrections of 2026-09-09

A research pass on 2026-09-09 found that, contrary to the "EGRESS_BLOCKED"
framing below (kept for its historical honesty about *how* the earlier
presets were sourced), every primary source in this file **is** reachable:
`tafl.cyningstan.com` needed `curl` rather than the fetch tool (which got
`ECONNREFUSED` on that host only); `aagenielsen.dk` WAF-blocks a *burst* of
rapid `curl` requests ("455 Security Incident Detected, do not retry") but
served the fetch tool fine. Full-text reads on that date found one wrong flag,
shared by every preset:

> "The attacking side takes the first move." — Cyningstan's Tablut page
> (tafl.cyningstan.com/page/170/tablut), rule 3, labelled "a modern invention"
> since "Linnaeus does not state who moves first"

> "The attackers always move first." — worldtafl.com/tablut and
> worldtafl.com/hnefatafl-rules

Every preset shipped before this date asserted `firstMove: "defenders"` —
White moves first. That is backwards: three independent sources agree the
attackers move first, and Linnaeus's own account is silent (the "Muscovites
begin" translation, mentioned below, in fact reads as attackers-first, since
the Muscovites are the attacking side in Linnaeus's Tablut). **This is the
one flag that changed** — nothing else in this file's sourcing was
contradicted; see "`tablut-linnaeus-2` — the default" and "`tablut-aage-2` —
UNVERIFIED" below for the two presets with a second flag corrected too.

**How the fix was shipped, and why the old ids still work.** Every preset got
a `-2` id and the corrected `firstMove: "attackers"`; the five presets exactly
as they shipped before this date are kept, byte-for-byte, under their
original ids (`tablut`, `tablut-linnaeus`, `tablut-gulo`, `tablut-aage`,
`tablut-corners`) as **LEGACY** presets — still in `VARIANTS`, so `rulesFor`
keeps resolving them and a save (`tablut.game.v1`) or an exported `.tafl` file
naming one of them keeps replaying into the exact game it recorded, but
removed from `VISIBLE_VARIANTS` so the picker no longer offers the
pre-correction reading. `DEFAULT_VARIANT` now points at `tablut-linnaeus-2`.
See `variants.test.ts`'s "legacy presets" block for the frozen literals, and
`searchInvariants.test.ts`'s `LEGACY_PERFT_TABLE` for the frozen perft pins.

## The baseline is not in dispute

Six rules, as given, and the `tablut-2` preset asserts nothing beyond them:

1. Two players. White is the king and his defenders; Black the attackers.
2. **Black moves first**, then the players alternate. Corrected 2026-09-09 —
   see above; the pre-correction reading had White moving first.
3. All pieces move horizontally or vertically as far as the path is clear.
4. A piece is captured when trapped between two enemies horizontally or
   vertically — but only if the **opponent's move** closed the trap. Moving your
   own piece between two enemies is safe.
5. White wins by moving the king to an **edge square**.
6. Black wins by capturing the king first.

One of these is still worth flagging, now the first-mover correction has
brought Tablut into line with the rest of the tafl family:

- **The rim, not the corners.** There are 32 winning squares, not four, and they
  are not a special *kind* of square. A baseline Tablut corner is ordinary ground
  a soldier may stand on, which is why `cornersRestricted` and `cornersHostile`
  are both off and why the board draws no corner emblem. Getting this wrong is
  not a cosmetic matter: see "the unsound shortcut" below.

`firstMove` is still a ruleset field rather than a hardcoded assumption —
`initialState` takes the ruleset — because the custom rule editor can turn it
round either way, and because a save or a game file paired with the wrong
first mover fails at ply 0 rather than replaying into a different game.

## `tablut-linnaeus-2` — the default, and why it moved (twice)

The first release shipped with the bare baseline as the default, and the owner
reported it as a rules bug within a day: the app took the king with two soldiers
on and beside his own throne. That capture is not Tablut. Linnaeus's account —
and every secondary source below that reads it — gives the king three tiers of
protection:

- **On the throne (konakis): four attackers**, one on each side.
- **Beside the throne: three attackers**, the empty throne itself standing in as
  the fourth hostile wall.
- **Anywhere else: the ordinary two**, as for a soldier.

The `tablut-linnaeus-2` preset asserts that reading, plus the rest of the
federation's game, and `DEFAULT_VARIANT` now points at it:

```
firstMove: "attackers"       throneAnvil: "both"
strongKingOnThrone: true     throneHostileToKing: true
strongKingAdjacentToThrone: true
encirclementWin: true        repetitionResult: "loss_for_defenders"
```

Sourcing: aagenielsen.dk, worldtafl.com and tafl.cyningstan.com were all read
in full on 2026-09-09 (see "Corrections of 2026-09-09" above); heroicage.net
(Ashton, *Linnaeus's Game of Tablut*) was not re-checked on that date. The
three-tier king capture is attested independently in matching words across
sources ("a king is captured by quadruple custodianship only when it is still
at the central square … and by triple custodianship … where the fourth vacant
side is the konakis"), which is why it ships as the default; the surrounding
details (hostile throne, encirclement, repetition falling on White) follow the
same tournament reading as `tablut-aage-2` below.

One flag stays at the baseline value despite a murkier source:
`kingMayReoccupyThrone` remains true (one translation forbids the return; the
custom editor exposes both). `firstMove` is **not** in that category any more
— see "Corrections of 2026-09-09".

With encirclement now shipping in an edge-escape preset, the earlier note that
it is "off in every shipped preset" no longer holds: the federation's rules do
include it, and the search's `isEncircled` term was already computed either way.
The minimal presets (`tablut-2`, `tablut-gulo-2`) still leave it off.

`tablut-aage-2` asserted nearly the same flags while marked UNVERIFIED, so it is
kept hidden from the picker rather than offered beside a near-duplicate — still
resolvable, per the hiding rules at the bottom of this file.

## What the baseline leaves open

Everything the other presets disagree about. The throne is the main one — the six
rules do not say what the centre square does once the king has left it — followed
by how strong the king is, and what a repetition means.

| Flag | Baseline | Why |
|---|---|---|
| `firstMove` | `attackers` | Rule 2, corrected 2026-09-09 — see above. |
| `throneBlocks` | `none` | Rule 3 says "as far as the path is clear" and an empty square is clear. Soldiers still may not *stop* there, which no source disputes. |
| `throneAnvil` | `none` | Rule 4 names two enemies, not a square. |
| `throneHostileToKing` | `false` | Same. |
| `strongKingOnThrone` / `…AdjacentToThrone` | `false` | Rule 4 applies to the king as written; a four-sided requirement is an addition. |
| `encirclementWin` | `false` | Not in the six rules — and under edge escape "the king cannot reach the rim" is nearly the same statement as "the king is encircled", so enabling it ends games in a way the rules do not ask for. |
| `edgeHostileToSoldiers` | `false` | Not in the six rules. Offered in the custom editor because some reconstructions use it and it changes how the rim plays more than any other single flag. |
| `repetitionResult` | `draw` | Not in the six rules; a draw is the least opinionated reading. |

## `tablut-gulo-2` — attested, and credited

July 2025, on aagenielsen.dk: **Gustaf Løvenlund ("gulo")** and **Dmitrij
Tsvilenev ("Dimetr")** proposed two small changes of detail to Tablut:

- *The throne cannot be crossed by black* → `throneBlocks: "attackers"`
- *The throne is friendly to white* → `throneAnvil: "defenders"`

"Friendly to white" is read as: White may pin a soldier against the empty throne,
and Black may **not** use it against White. Both changes are reachable flag for
flag in the custom rule editor, which is the point of the editor.

This preset came from the request that prompted the work, quoting the proposal.
It is not independently verified against the site beyond that quote, but the
wording was supplied directly and the attribution is specific, so it is
recorded as attested rather than guessed. `firstMove` is the same 2026-09-09
correction as every other preset.

## ⚠ `tablut-aage-2` is UNVERIFIED

**aagenielsen.dk's unified rules page was read in full on 2026-09-09**, and it
corrected two of this preset's flags — `firstMove` (as above) and
`encirclementWin`, which the page states "with no board-size restrictions",
so it applies to Tablut too and should be `true`, not `false`. With those two
fixes the preset is:

```
firstMove: "attackers"       throneAnvil: "both"
strongKingOnThrone: true     throneHostileToKing: true
strongKingAdjacentToThrone: true
encirclementWin: true        repetitionResult: "loss_for_defenders"
```

**It is still marked UNVERIFIED, and still hidden, on purpose.** The page read
on 2026-09-09 presents one *unified* Hnefatafl ruleset rather than a
Tablut-specific section, and the agent doing the reading did not get a
byte-for-byte copy of wording specific to the 9×9 game — the corrections above
are corroborated (the first-mover wording is Tablut-specific and matches two
other sources; the encirclement wording explicitly claims no board-size
restriction), but a human still needs to eyeball the page's raw HTML before
this preset's remaining, un-recorroborated flags — the throne and king-capture
tiers it shares with `tablut-linnaeus-2` — stop being a plausible reading and
become a citation.

Its blurb says UNVERIFIED in the app, and `variants.test.ts` asserts that the
blurb says so. **If you verify it, delete that test in the same commit** — the
test exists to make the warning hard to remove by accident, not to be permanent.

To check: aagenielsen.dk's unified rules page, read for a Tablut-specific
section rather than skimmed as one ruleset; cross-reference hnefatafl.org and
tafl.cyningstan.com. The specific remaining questions are whether the empty
throne is hostile to soldiers of both sides on this specific board size, and
whether the four-sided king rule applies beside the throne as well as on it —
the same tiers `tablut-linnaeus-2` already asserts from independently
corroborated wording, but not yet reconfirmed for this preset's own citation.

Anyone who would rather not rely on it can leave it hidden — see below; that
is the shipped default already.

## `tablut-corners-2` is a different game, deliberately

Corner escape (`escape: "corners"`, corners restricted and hostile) is a common
modern reconstruction, and it is included as a contrast rather than as a variant
of the baseline: the whole rim stops being a goal, so the game it produces is
Brandubh's shape on a bigger board. The engine's recognizers decline to reason
about it rather than guessing (`forcedDefenderWin` returns false for any ruleset
that is not edge-escape), so it is played by search alone. `firstMove` is the
same 2026-09-09 correction as every other preset.

## The contested rule carries over

`throneHostileToKing` + `strongKingAdjacentToThrone` are the pair
`rules-review.md` records for Brandubh's `wtf` preset: sourced in full on
2026-09-09 (Brandubh's own primary sources, read directly, say a king next to
the throne on 7×7 falls to an ordinary two-sided capture, not a four-sided
surround), but shipped as four-sided anyway because Brandubh's opening book,
puzzles and gauntlet results were all computed under the four-sided reading.
The same doubt does **not** apply here in the same way: Tablut's own sources
(Linnaeus's account and the tournament reading) independently attest the
three-tier king capture on a 9×9 board, so `tablut-linnaeus-2`'s
`strongKingAdjacentToThrone: true` is sourced for Tablut specifically, not
carried over unexamined from Brandubh. Both flags stay exposed in the custom
editor regardless. Only `tablut-linnaeus-2` and `tablut-aage-2` turn them on;
the latter is still unverified for the reason above.

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
would orphan those — don't. This is exactly the mechanism the 2026-09-09
correction uses to retire the five pre-correction ids without breaking old
saves: see "Corrections of 2026-09-09" above.

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
Those figures were measured with Black to move first in the corrected sense
already (attackers have the wider opening branching factor, 80 vs. 56, which is
what the perft table in `searchInvariants.test.ts` now shows at the root for
every current preset).
