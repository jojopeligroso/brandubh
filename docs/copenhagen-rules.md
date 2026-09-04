# Copenhagen Hnefatafl — sources and open questions

Companion to `rules-review.md` (Brandubh) and `tablut-rules.md` (Tablut), doing
the same job for the 11×11 board. It records what the shipped presets assert,
where each assertion came from, and — the part that matters — **which of them
have not been checked against a primary source.**

Presets live in `src/game/copenhagen/variants.ts`. Every flag named below is a
field there, and `variants.test.ts` asserts the presets flag by flag, because a
preset is data and a wrong flag in it is silent.

## What is different about this one

Brandubh and Tablut are *reconstructions*. Nobody wrote Brandubh down, and Tablut
survives as one 1732 field note in a Latin diary; both documents in this series
are therefore about weighing readings against each other.

Copenhagen is not like that. It is a **deliberately drafted modern ruleset** with
an author and a publication, formulated on aagenielsen.dk and used at the
Hnefatafl World Championship. There is no serious scholarly doubt about what it
says.

So the honest framing here is narrower and sharper: the doubt is not about
Copenhagen, it is about **whether this file copied it correctly** — because every
site that publishes it is unreachable from this environment.

## ⚠ How this was sourced, and the one thing to fix first

**All the primary sites are blocked by the egress proxy.** Confirmed at the time
of writing, by both `curl` and the fetch tool:

| Source | Result |
|---|---|
| `aagenielsen.dk/copenhagen_rules.php` — the canonical text | `EGRESS_BLOCKED` |
| `aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf` (De Angelis, Jan 2025) | `EGRESS_BLOCKED` |
| `tafl.cyningstan.com/page/768/copenhagen-hnefatafl-rules` | `EGRESS_BLOCKED` |
| `hnefatafl.org/rules.html` | `EGRESS_BLOCKED` |
| `en.wikipedia.org/wiki/Tafl_games` | `403` at the proxy |

Everything below therefore came through **web-search excerpts of those pages**,
not their full text — the same method `tablut-rules.md` had to use, and with the
same caveat: an excerpt can be accurate and still be missing the sentence that
qualifies it.

**If you can reach the sources, the first thing to check is
`strongKingEdgeRule`** (below). It is the only assertion where the sources
directly contradict each other, and it decides whole classes of endgame.

**Three of the flags below are now the owner's decision rather than a reading of
any source** — `strongKingEdgeRule: "three_attackers"`, `edgeCompletesRing` and
`entombedKingLoses`. They are marked ★ in the table, each has its own section,
and `docs/reports/copenhagen-king-capture-edge-cases.md` works every position
they decide through the shipped code.

## The rules, as the presets assert them

Eleven of them are Copenhagen's; the three marked ★ are this project's.

Corroboration column: **✓✓** = matching wording from more than one independently
retrieved excerpt; **✓** = one excerpt; **⚠** = contested or inferred.

| # | Rule | Flags | Src |
|---|---|---|---|
| 1 | 11×11; king + 12 defenders v 24 attackers | `initialBoard()` | ✓✓ |
| 2 | The attackers move first | `firstMove: "attackers"` | ✓ |
| 3 | All pieces move orthogonally, any distance | — | ✓✓ |
| 4 | Custodial capture between two enemies, or an enemy and a restricted square; opponent must close the trap | `throneAnvil`, `cornersHostile` | ✓✓ |
| 4b | Shieldwall: a bracketed, fronted row along the edge falls together; a corner may stand in for one bracket | `shieldwallCapture: true` | ✓✓ |
| 5 | The corners and the throne are restricted, hostile, and may be passed over when empty; the king may re-enter the throne | `cornersRestricted`, `throneBlocks: "none"`, `kingMayReoccupyThrone` | ✓✓ |
| 6 | The king escapes to a corner | `escape: "corners"` | ✓✓ |
| 6b | Exit fort: the king with contact to the edge, a move to make, and an unbreakable fort | `exitFort: true` | ✓✓ |
| 7 | The king is captured by four attackers — three plus the empty throne beside it | `kingStrength: "strong"`, `throneHostileToKing` | ✓✓ |
| 7a ★ | On the rim, three **attackers**; a hostile square does not stand in | `strongKingEdgeRule: "three_attackers"` | ⚠ owner's choice |
| 7b | The attackers win by surrounding the king and all remaining defenders | `encirclementWin: true` | ✓✓ |
| 7c ★ | A pocket sealed by attackers **and the rim** counts as the ring | `edgeCompletesRing: true` | ⚠ against the wording |
| 7d ★ | A king entombed at the rim, with no way for his side to free him, loses | `entombedKingLoses: true` | ⚠ no source at all |
| 8 | Perpetual repetition is forbidden, and loses for the player repeating; a player who cannot move loses | `repetitionResult: "loss_for_repeater"` | ⚠ |

### Where the reading needed a step of interpretation

Three flags are not a straight transcription, and each is worth stating.

**`throneAnvil: "both"`.** The source says the throne *"is always hostile to the
attackers, but only hostile to the defenders when it is empty"*, which reads like
a fourth setting and is not one. Only the king may stand on the throne, so an
occupied throne holds a defender, and an occupied throne backing a defender's
capture is just the ordinary friendly-piece rule — the flag has nothing left to
say about that case. Over the *empty* throne, which is the only case this flag
decides, the source has it hostile to both sides. Hence `"both"`.

**`kingStrength: "strong"` rather than the two booleans the other games carry.**
Tablut and Brandubh model king strength as `strongKingOnThrone` +
`strongKingAdjacentToThrone`, with an ordinary two-sided capture everywhere else.
Copenhagen's king needs four sides *everywhere*, which those two flags cannot
express. The enum (`weak` / `near_throne` / `strong`) covers all three games'
attested readings as a ladder, which is what they actually are.

**`repetitionResult: "loss_for_repeater"` — ⚠ and the second thing to check.**
Excerpts gave two different rules in the same breath:

- *"Any perpetual repetition results in a loss for White"* — which is the Fetlar
  rule, and is `loss_for_defenders`.
- *"If the overall board position is repeated three times, the player who
  maintains the situation must find another move to break the repetitions, or
  else he loses the game"* — which is `loss_for_repeater`.

The second is the one that reads as Copenhagen's own (it is stated with its
rationale — preventing perpetual check from forcing a draw — and it is
side-neutral, which the first is not), so it ships. It is implemented as: **the
side that moved into the position for the third time loses.** That is a reading
of "the player who maintains the situation", not a transcription of one — the
phrase describes an intent that a move list cannot fully identify. It is why this
is the only game in the project that can end in `defenders_win_repetition`.

## ⚠ `strongKingEdgeRule` — three readings, three sources, no primary text

**This is the one place the sources say opposite things, and it is not a detail.**

A "strong" king needs all four cardinal squares hostile. On the board's rim one of
those four does not exist. What follows?

**Reading A — `"uncapturable"`.** The missing square can never be satisfied, so a
king with his back to the edge cannot be taken at all. Supported by two
independently-worded excerpts attributed to aagenielsen.dk:

> "The Copenhagen rules feature an armed king that is captured from 4 sides. The
> board edge is NOT hostile."

> "The king cannot be captured on the board edge."

**Reading B — `"available_sides"`.** Only the cardinal squares that *exist* must
be hostile, and hostile means what it means everywhere else, so a corner counts.
A king beside a corner then falls to the hostile corner plus a single attacker.
Supported by Cyningstan's comparison of Fetlar with Copenhagen:

> "In Copenhagen rules, the king can be captured on the edge of the board and can
> thus be captured by two attackers when on a square next to a corner, whereas in
> Fetlar Hnefatafl, the king cannot be captured on the board edge."

**Reading C — `"three_attackers"` (shipped).** Every cardinal square that exists
must hold an actual **attacker**; a hostile *square* does not stand in for a man.
On the rim that is three attackers, and beside a corner it is unsatisfiable — no
soldier may stand on a corner, so the third man has nowhere to be. Supported by a
third excerpt, whose first half it follows and whose second half it does not:

> "When the king is on an edge square he is captured by three attackers, and next
> to a corner square by two attackers."

**C ships, and it is the owner's decision, not a transcription.** The evidence
does not settle the question: reading A's excerpts are, on the best reading
available, describing *Fetlar* — which is exactly what Cyningstan says the
difference between the two rulesets is — and B and C disagree only about the
corner-adjacent square. So the honest description of the shipped state is: the
project plays C, `copenhagen-fetlar` plays A (where the evidence for it actually
points), and B is one click away in the custom rule editor.

`rules.test.ts` pins all three behaviours — including the corner-plus-one-attacker
position, which is the single square where the three readings give three
different answers — and `variants.test.ts` asserts which one ships, so changing
the default is a deliberate act rather than a drive-by edit.

If you can read the source: the question is whether rule 7's wording says "all
four cardinal points" (A), "surrounded on all sides" (B), or "three attackers on
an edge square" (C).

## ★ `edgeCompletesRing` — knowingly against the sourced wording

Rule 7b as sourced says *board edges do not count as part of the ring*, and
`isEncircled` used to implement exactly that: it returned false the instant the
king stood on a rim square, because the ring would have had to use the rim.

The shipped preset says the opposite. A pocket sealed by attackers **and the rim
together** is a ring, and what breaks it is reaching an *escape square* rather
than reaching the rim. The clause that keeps this from swallowing the board is
"no escape square inside": a wall straight across the board leaves corners on
both sides of itself, so neither half qualifies, and only a wall returning to the
same edge without enclosing a corner does. Under `escape: "edges"` every rim
square is an escape square, which folds the reading back into the sourced one.

This is a deliberate departure. `copenhagen-fetlar` carries the sourced reading,
and the flag is in the editor.

## ★ `entombedKingLoses` — in no published ruleset

Reading C above leaves a hole: a king held on the rim by two attackers and one of
his own men is captured by nothing, encircled by nothing, in no exit fort, and
cannot move. Under the sourced rules that game runs to a threefold repetition,
which `loss_for_repeater` decides by whoever runs out of waiting moves — an
ending from bookkeeping rather than from the board.

`kingIsEntombed` in `rules.ts` ends it on the board, and its own comment sets out
the four clauses and — as important — what it does **not** prove. Unlike
`exitFort`, which is one-sided so that it can never end a game nobody had won,
this is a positional rule in the way stalemate is a positional rule. It has one
known false positive, a two-ply capture rescue, which is pinned by a test and
worked through in the report.

## ⚠ `copenhagen-fetlar` is UNVERIFIED

The second preset is Copenhagen minus the three rules Copenhagen added —
shieldwall, exit fort, encirclement — plus neither of this project's two
additions, and with `strongKingEdgeRule: "uncapturable"` stated positively rather
than by removal: every excerpt saying "the king cannot be captured on the board
edge" is, on the best reading available, describing *this* ruleset. That makes
the contested rule a contrast someone can sit down and play. Repetition falls on
White. It is
reconstructed from **secondary descriptions of how the two rulesets differ**, not
from the Fetlar rules themselves:

> "The Copenhagen rules were formulated to address some of the shortcomings of
> the Fetlar rules… Copenhagen rules feature a shieldwall capture… a rule
> declaring the king's cause lost when all of his forces are surrounded…
> [and address] that in Fetlar it is possible for the defenders to build a center
> draw fort."

Its blurb says UNVERIFIED in the app, and `variants.test.ts` asserts that the
blurb says so. **If you verify it, delete that test in the same commit** — the
test exists to make the warning hard to remove by accident, not to be permanent.
The same contract `tablut-rules.md` has for `tablut-aage`.

Note the tension already visible in that quotation: it lists the edge king-capture
difference among Fetlar-to-Copenhagen changes, which is reading B above. Whatever
resolves `strongKingEdgeRule` probably resolves this preset's king rule too — and
if it resolves to A, this preset and the shipped one stop differing about the rim
and the contrast disappears.

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
this rule shows the king on the edge itself. Worth confirming against the source
wording if you get the chance.

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
here than on either smaller board.

## Hiding a preset

`VISIBLE_VARIANTS` in `src/game/copenhagen/variants.ts` lists what the picker
offers, mirroring the `VISIBLE_LANGS` idiom in `src/i18n.ts`. Removing an entry
hides it in one line; the preset stays in `VARIANTS`, so `rulesFor` keeps
resolving it and games already saved or exported under it still replay. Deleting
it from `VARIANTS` would orphan those — don't.

## Sources

All retrieved as search excerpts rather than full text; see the ⚠ section above.

- [The Viking board game Hnefatafl, Copenhagen rules](https://aagenielsen.dk/copenhagen_rules.php) — the canonical text
- [Rules of Copenhagen Hnefatafl 11x11, Edoardo De Angelis, January 2025](https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf)
- [Summary on the Copenhagen Hnefatafl](https://aagenielsen.dk/copenhagen_summary.php)
- [Copenhagen Hnefatafl Rules — Cyningstan](http://tafl.cyningstan.com/page/768/copenhagen-hnefatafl-rules)
- [Fetlar Hnefatafl — Cyningstan](http://tafl.cyningstan.com/page/88/fetlar-hnefatafl)
- [Rules — Copenhagen Hnefatafl, hnefatafl.org](https://hnefatafl.org/rules.html)
- [Hnefatafl Rules — WORLDTAFL](https://worldtafl.com/hnefatafl-rules)
