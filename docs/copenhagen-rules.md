# Copenhagen Hnefatafl — sources and open questions

Companion to `rules-review.md` (Brandubh) and `tablut-rules.md` (Tablut), doing
the same job for the 11×11 board. It records what the shipped presets assert,
where each assertion came from, and — the part that matters — **which of them
have not been checked against a primary source.**

Presets live in `src/game/copenhagen/variants.ts`. Every flag named below is a
field there, and `variants.test.ts` asserts the presets flag by flag, because a
preset is data and a wrong flag in it is silent.

## Corrections of 2026-09-09

A research pass on 2026-09-09 re-fetched every source below **in full**, not
as search excerpts, and found the sites are reachable after all — see "How
this was sourced" below for what changed about *that*. Full text confirmed
ten of the eleven rules exactly as shipped, and corrected rule 8:

> "Perpetual repetitions are forbidden. Any perpetual repetition results in a
> loss for White." — aagenielsen.dk/copenhagen_rules.php

> "Perpetual repetitions are forbidden. Any perpetual repetition results in a
> loss for white." — the De Angelis PDF, section 7.1

> "Perpetual repetitions are forbidden. Any perpetual repetition results in a
> loss for White." — aagenielsen.dk/historical_hnefatafl_rules.php (the
> unified rules page)

> "Perpetual repetition is a loss for the defenders, whichever side keeps
> repeating. The burden of progress is on the king's side; the attackers hold
> the board." — worldtafl.com/hnefatafl-rules

Three independently-worded primary sources say, in as many words, "a loss for
White" — `repetitionResult: "loss_for_defenders"`, not the `"loss_for_repeater"`
this file shipped. That reading traced to a *different* site's paraphrase, not
Copenhagen's own text:

> "Perpetual repetition is illegal. If the board position is repeated three
> times, the player in control of the situation must find another move." —
> tafl.cyningstan.com's Copenhagen page, rule 13 — Damian Walker's own
> paraphrase, which this file had attributed to "Copenhagen's own" wording.

**This is the one flag that changed.** Every other rule in the eleven-rule
list below was reconfirmed as shipped, including `strongKingEdgeRule` — see
its own section further down, which the 2026-09-09 pass also resolved.

**How the fix was shipped, and why the old ids still work.** Both presets got
a `-2` id and the corrected `repetitionResult: "loss_for_defenders"` for
`copenhagen-2`; the two presets exactly as they shipped before this date are
kept, byte-for-byte, under their original ids (`copenhagen`,
`copenhagen-fetlar`) as **LEGACY** presets — still in `VARIANTS`, so
`rulesFor` keeps resolving them and a save (`copenhagen.game.v1`) or an
exported `.tafl` file naming one of them keeps replaying into the exact game
it recorded, but removed from `VISIBLE_VARIANTS` so the picker no longer
offers the pre-correction reading. `DEFAULT_VARIANT` now points at
`copenhagen-2`. The `"loss_for_repeater"` mechanism itself is not removed — it
stays reachable through the custom rule editor, and its own `rules.test.ts`
coverage stays, because it remains a real reading worth being able to play,
just not Copenhagen's own. See `variants.test.ts`'s "legacy presets" block for
the frozen literals, and `searchInvariants.test.ts`'s `LEGACY_PERFT_TABLE` for
the frozen perft pins (repetition does not change the opening perft, so the
`-2` presets' numbers are identical to the legacy ones — confirmed by running,
not assumed).

`copenhagen-fetlar-2` got a second correction, unrelated to rule 8 — see
"`copenhagen-fetlar-2` is UNVERIFIED" below.

## How this was sourced

**Every primary site below is reachable — the table further down that says
otherwise is kept for its historical honesty about how the earlier presets
were sourced, not as current fact.** Re-confirmed on 2026-09-09: `curl`
against `tafl.cyningstan.com` gets `ECONNREFUSED`, so that host needs the
fetch tool specifically; `aagenielsen.dk` WAF-blocks a *burst* of rapid `curl`
requests ("455 Security Incident Detected, do not retry") but serves the
fetch tool without issue. Neither is an egress block, and neither stopped the
2026-09-09 pass from reading every source in full.

**If you are re-verifying anything else in this file, `strongKingEdgeRule` no
longer needs to be the first thing you check** — it was resolved on
2026-09-09, in the app's favour; see its own section below.

## The eleven rules, as the presets assert them

Corroboration column: **✓✓** = matching wording from more than one
independently retrieved excerpt or full-text source; **✓** = one source;
**⚠** = contested or inferred.

| # | Rule | Flags | Src |
|---|---|---|---|
| 1 | 11×11; king + 12 defenders v 24 attackers | `initialBoard()` | ✓✓ |
| 2 | The attackers move first | `firstMove: "attackers"` | ✓✓ |
| 3 | All pieces move orthogonally, any distance | — | ✓✓ |
| 4 | Custodial capture between two enemies, or an enemy and a restricted square; opponent must close the trap | `throneAnvil`, `cornersHostile` | ✓✓ |
| 4b | Shieldwall: a bracketed, fronted row along the edge falls together; a corner may stand in for one bracket | `shieldwallCapture: true` | ✓✓ |
| 5 | The corners and the throne are restricted, hostile, and may be passed over when empty; the king may re-enter the throne | `cornersRestricted`, `throneBlocks: "none"`, `kingMayReoccupyThrone` | ✓✓ |
| 6 | The king escapes to a corner | `escape: "corners"` | ✓✓ |
| 6b | Exit fort: the king with contact to the edge, a move to make, and an unbreakable fort | `exitFort: true` | ✓✓ |
| 7 | The king is captured by four attackers — three plus the empty throne beside it | `kingStrength: "strong"`, `throneHostileToKing` | ✓✓ |
| 7b | The attackers win by surrounding the king and all remaining defenders | `encirclementWin: true` | ✓✓ |
| 8 | Perpetual repetition is forbidden, and loses for the defending side | `repetitionResult: "loss_for_defenders"` | ✓✓ — corrected 2026-09-09; was shipped as `"loss_for_repeater"` (⚠), see above |

### Where the reading needed a step of interpretation

Three flags are not a straight transcription, and each is worth stating.

**`throneAnvil: "both"`.** The source says the throne *"is always hostile to the
attackers, but only hostile to the defenders when it is empty"*, which reads like
a fourth setting and is not one. Only the king may stand on the throne, so an
occupied throne holds a defender, and an occupied throne backing a defender's
capture is just the ordinary friendly-piece rule — the flag has nothing left to
say about that case. Over the *empty* throne, which is the only case this flag
decides, the source has it hostile to both sides. Hence `"both"`. Reconfirmed
word for word on 2026-09-09.

**`kingStrength: "strong"` rather than the two booleans the other games carry.**
Tablut and Brandubh model king strength as `strongKingOnThrone` +
`strongKingAdjacentToThrone`, with an ordinary two-sided capture everywhere else.
Copenhagen's king needs four sides *everywhere*, which those two flags cannot
express. The enum (`weak` / `near_throne` / `strong`) covers all three games'
attested readings as a ladder, which is what they actually are.

**`repetitionResult: "loss_for_defenders"` — corrected 2026-09-09, see above.**
Three independently-worded primary sources say "a loss for White" in as many
words; the `"loss_for_repeater"` this preset shipped with traced to a
secondary paraphrase (Cyningstan's rule 13) that this file had mistakenly
attributed to Copenhagen's own text. `"loss_for_repeater"` is implemented as:
**the side that moved into the position for the third time loses** — a real
mechanism, kept reachable through the custom rule editor, just not the
Copenhagen default any more. It is now the *only* way any game in this
project ends in `defenders_win_repetition`; the shipped `copenhagen-2` preset
ends a repeated position in `attackers_win_repetition`, the same as Brandubh
and Tablut's `"loss_for_defenders"`.

## `strongKingEdgeRule` — resolved 2026-09-09, "uncapturable" confirmed

**This used to be the one place two sources appeared to say opposite things —
it no longer is.**

A "strong" king needs all four cardinal squares hostile. On the board's rim one of
those four does not exist. What follows?

**Reading A — `"uncapturable"` (shipped, confirmed).** The missing square can
never be satisfied, so a king with his back to the edge cannot be taken at
all. Supported by matching wording from three sources, read in full on
2026-09-09:

> "The king cannot be captured on the board edge." —
> aagenielsen.dk/copenhagen_rules.php

> "The king cannot be captured on the board edge." — the De Angelis PDF,
> section 6

> "The attackers win by surrounding the king on all four orthogonal sides
> with attackers. Beside the throne, the throne itself counts as the fourth
> wall, so three attackers suffice there. The board edge never helps capture
> the king." — worldtafl.com/hnefatafl-rules

**Reading B — `"available_sides"` (the excerpt that raised the question, now
traced and set aside).** Only the cardinal squares that *exist* must be
hostile. A king beside a corner then falls to the hostile corner plus a
single attacker. This file previously attributed a version of this reading to
Cyningstan's Copenhagen page — but read in full on 2026-09-09, that page's
actual rule 8 says only *"surrounding him on all four sides"*, with **no**
edge clause either way, and a reader comment on the same page asks the exact
question this file was trying to answer, unanswered. The "Cyningstan says the
opposite" excerpt this file quoted appears to have been a search-engine
misattribution — it does not appear on the page it was credited to.

**Reading A ships, confirmed rather than merely favoured.** `"available_sides"`
stays one flag away in the custom rule editor — it is a real, playable
reading, just not Copenhagen's — and `rules.test.ts` still pins both
behaviours, including the corner-plus-one-attacker case under B.
`variants.test.ts` asserts which one ships.

## `copenhagen-fetlar-2` is UNVERIFIED

The second preset is Copenhagen minus the three rules Copenhagen added —
shieldwall, exit fort, encirclement. Read in full on 2026-09-09 against
Fetlar's own numbered rules (tafl.cyningstan.com/page/88/fetlar-hnefatafl,
rules 1–11), rather than the secondary description this file previously
relied on:

> "The king can only be captured by surrounding him on all four sides." —
> Fetlar rule 9, with no throne-substitution clause
>
> "To win, the defenders must get the king to one of the four marked corner
> squares." — Fetlar rule 10
>
> "As far as I can see, rule 9 does not apply in the Fetlar rules (thank
> god)." — a reader comment on Cyningstan's Copenhagen page, echoing the same
> observation independently

Fetlar's eleven rules contain **no repetition rule, no shieldwall, no exit
fort, and no encirclement**, and confirm `kingStrength: "strong"` and
`escape: "corners"` as shipped. But rule 9's plain "surrounded on all four
sides", with no throne clause, means the empty throne beside the king is
**not** one of the four hostile walls in Fetlar the way it is in Copenhagen —
so `throneHostileToKing` should be `false`, not the `true` this preset
inherited unchanged from Copenhagen. `copenhagen-fetlar-2` sets it explicitly.

**Repetition is left as `"none"`, not `"loss_for_defenders"`.** Fetlar's rules
are silent on repetition entirely — there is no rule 12 or equivalent to read
either way — so asserting any specific consequence would be inventing a rule
the source does not contain. `"none"` is the reading that adds nothing beyond
what is attested; the legacy `copenhagen-fetlar` preset's `"loss_for_defenders"`
was itself never sourced to Fetlar's own text (it was inherited from the
Fetlar/Copenhagen contrast this file used before finding the actual rules),
so it is not a value being walked back from a citation, only a guess this
correction replaces with an honest absence.

**Still marked UNVERIFIED.** The two flags above are now sourced to Fetlar's
own numbered rules directly, which is stronger footing than this preset had
before — but the preset as a whole was built by starting from Copenhagen and
subtracting, not by transcribing Fetlar's eleven rules from scratch, so
smaller details (exact move and capture mechanics, corner behaviour beyond
the escape square) have not been individually re-verified against the primary
text. Its blurb still says UNVERIFIED in the app, and `variants.test.ts`
asserts that the blurb says so. **If you verify it fully, delete that test in
the same commit** — the test exists to make the warning hard to remove by
accident, not to be permanent. The same contract `tablut-rules.md` has for
`tablut-aage-2`.

## The exit fort, and what the code actually proves

Rule 6b is the only win condition in the project decided by a structural property
of the whole board rather than by the move just played, and its third clause —
"the attackers cannot break the fort" — is a claim about the future. So it is
worth being precise about what `exitFort` in `rules.ts` proves and what it
assumes.

It floods the fort's inside out from the king through empty squares, requires
every square bordering that inside to be a defender or off the board, and then
requires that no wall defender can ever be captured. A wall man is treated as
capturable if either capture axis has both opposite squares hostile, where
hostile means: an attacker stands there, a hostile square (a corner or the empty
throne) sits there, **or it is an empty square outside the fort** — whether or not
an attacker could actually reach it.

That last clause is the deliberate pessimism. Every place the check could guess,
it guesses against the fort. So:

- a fort it **accepts** is one the attackers provably cannot open;
- a fort it **rejects** may still be unbreakable in fact, and that game is simply
  played on, which costs nothing.

Ending a game nobody had won is the failure that would matter, and this shape
cannot produce it. The soundness argument for ignoring squares *inside* the fort
is a greatest fixpoint, not a circular one: attackers can only get inside by
capturing a wall man, no wall man can be captured while the inside is sealed, so
the sealed state sustains itself under any sequence of attacker moves.

"Contact with the board edge" is implemented as **the king standing on a rim
square**. The looser reading — the fort's inside merely touching the rim — would
admit forts the king cannot actually leave from, and every published diagram of
this rule shows the king on the edge itself. Not re-examined on 2026-09-09;
still worth confirming against the source wording if you get the chance.

## Not calibrated

The engine's eval weights for Copenhagen are **reasoned, not tuned**. Brandubh's
came off an A/B gauntlet over hundreds of games (`scripts/evaltune.ts`); nothing
of the sort has been run here, and the balance differs from both other games
enough (24 v 13, 121 squares, corner escape on a board where the corners are very
far away) that neither set of numbers can be assumed to transfer.
`DEFAULT_WEIGHTS` in `src/game/copenhagen/engine.ts` says so.

What *has* been measured is the opening branching factor — **116 attacker moves
and 60 defender moves**, against Tablut's 80/56 and Brandubh's ~40, asserted in
`engine.test.ts` — which is why the difficulty ladder's depth floors are lower
here than on either smaller board. The 2026-09-09 repetition correction does not
touch this: repetition is not reachable from the opening within the few plies
these figures and the perft table cover, confirmed by running rather than
assumed (see `searchInvariants.test.ts`).

## Hiding a preset

`VISIBLE_VARIANTS` in `src/game/copenhagen/variants.ts` lists what the picker
offers, mirroring the `VISIBLE_LANGS` idiom in `src/i18n.ts`. Removing an entry
hides it in one line; the preset stays in `VARIANTS`, so `rulesFor` keeps
resolving it and games already saved or exported under it still replay. Deleting
it from `VARIANTS` would orphan those — don't. This is exactly the mechanism the
2026-09-09 correction uses to retire the two pre-correction ids (`copenhagen`,
`copenhagen-fetlar`) without breaking old saves — see "Corrections of
2026-09-09" above.

## Sources

Re-fetched in full on 2026-09-09 (see "How this was sourced" above); prior
revisions of this file relied on search excerpts of the same pages.

- [The Viking board game Hnefatafl, Copenhagen rules](https://aagenielsen.dk/copenhagen_rules.php) — the canonical text
- [Rules of Copenhagen Hnefatafl 11x11, Edoardo De Angelis, January 2025](https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf)
- [Historical Hnefatafl rules (unified page)](https://aagenielsen.dk/historical_hnefatafl_rules.php)
- [Summary on the Copenhagen Hnefatafl](https://aagenielsen.dk/copenhagen_summary.php)
- [Copenhagen Hnefatafl Rules — Cyningstan](http://tafl.cyningstan.com/page/768/copenhagen-hnefatafl-rules)
- [Fetlar Hnefatafl — Cyningstan](http://tafl.cyningstan.com/page/88/fetlar-hnefatafl)
- [Rules — Copenhagen Hnefatafl, hnefatafl.org](https://hnefatafl.org/rules.html)
- [Hnefatafl Rules — WORLDTAFL](https://worldtafl.com/hnefatafl-rules)
