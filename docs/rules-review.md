# Rules under review

Open rules questions to settle against authoritative sources. Each has a safe
default shipped now, and (where it affects play) a custom-rule toggle so the
behaviour can be exercised while the question is open.

---

## 1. King capture next to the throne — RESOLVED 2026-09-09, kept as shipped anyway

**Status:** shipped default = four-sided surround (both flags on), unchanged.
Exposed in the custom-rule editor via **"Throne walls the king"**
(`throneHostileToKing`) and **"Strong king beside throne"**
(`strongKingAdjacentToThrone`). Turn either off to fall back to ordinary
custodial capture next to the throne, which is what the sources below actually
describe.

**What we changed and why (2026-08, before this resolution).** The WTF ruleset
shipped with both flags *off*, which (a) never recognised the
three-attackers-plus-throne surround and (b) let a king next to the throne be
taken by an ordinary two-sided custodial pair. In a real game the raiders
walled the king against its own throne (king e4; raiders e5, e3, f4; throne
d4) and the engine left the game "playing" instead of awarding the win.
Setting both flags on fixed that, reading it against Copenhagen's wording as
quoted in search results at the time:

> "The king is captured when the attackers surround him on all four cardinal
> points, except when he is next to the throne. If on a square next to the throne,
> the attackers must occupy the three remaining squares around him and be the one
> to move." — Copenhagen Hnefatafl (aagenielsen.dk)

**The question was resolved on 2026-09-09, against Brandubh's own primary
sources — read in full, not by search excerpt (see
`/tmp/brandubh-rules-sourcing-report.md`, Q7).** The Copenhagen wording above
was never in dispute; what was open was whether it also describes *Brandubh*
on 7×7. It does not:

> "Blacks win if they manage to capture the king before he escapes. The king
> is captured like all other pieces, except when he is on the throne. To
> capture the king on his throne, the attackers must surround the throne by
> standing on the four cardinal points. Everywhere else on the board the king
> is captured as a normal piece." — the WTF Brandubh rules PDF,
> aagenielsen.dk/brandubh2_rules_en.pdf

> "The throne is never hostile to the king, always hostile to the attackers,
> and only hostile to the defenders when the king is not occupying it." —
> same PDF

> "One exception across the family: on the small 7x7 Brandubh board the king
> is young, and falls like an ordinary piece, caught between just two
> attackers. The four-wall law protects the king only on the 9x9 and 11x11
> boards; on 49 squares it would make him nearly uncatchable." —
> worldtafl.com/hnefatafl-rules

Both sources agree, independently and in full text (not a search excerpt):
next to the throne is **not** a special four-sided case on 7×7 — only **on**
the throne is. Correctly sourced, `wtf` should read
`throneHostileToKing: false` and `strongKingAdjacentToThrone: false`.
`throneHostileToSoldiers: true` and `strongKingOnThrone: true` (the on-throne
case) are unaffected and remain correctly sourced.

**The owner decided on 2026-09-09 to ship `wtf` unchanged anyway.** The
opening book (depth 8, 2737 entries), the 158 solver-verified puzzles, the
annotation bands, the recognizer soundness proofs and every gauntlet result
were all computed under the shipped (four-sided) flags. Correcting them would
silently change what every one of those artefacts means, and none of that
work has been regenerated or re-verified against the corrected ruleset. So
this rule is no longer *unverified* — the sources are unambiguous, and they
disagree with what ships — it is **verified and deliberately retained**. See
`src/game/variants.ts`'s note on the `wtf` preset and `CLAUDE.md`'s "Contested
rule" section for the same record. The `fourth-wall` tutorial scenario teaches
the shipped (four-sided) rule and is pinned to `wtf`; it does not need to
change unless the flags do.

**Passive vs. active capture** was already handled correctly and was never
part of this question: a king (or soldier) is never captured by voluntarily
moving between two enemies; capture requires the attacker to make the closing
move (see `kingIsCaptured`'s active-move check).

**Brandubh (7×7) rules and presets are otherwise untouched by the 2026-09-09
sourcing pass.** Only this documentation note and the code comment it mirrors
changed; no flag on any Brandubh preset moved. Tablut and Copenhagen's
corrections are recorded in `docs/tablut-rules.md` and
`docs/copenhagen-rules.md` respectively.
