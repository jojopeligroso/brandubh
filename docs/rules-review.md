# Rules under review

Open rules questions to settle against authoritative sources. Each has a safe
default shipped now, and (where it affects play) a custom-rule toggle so the
behaviour can be exercised while the question is open.

---

## 1. King capture next to the throne (CONTESTED)

**Status:** shipped default = four-sided surround (both flags on). Exposed in the
custom-rule editor via **"Throne walls the king"** (`throneHostileToKing`) and
**"Strong king beside throne"** (`strongKingAdjacentToThrone`). Turn either off to
fall back toward ordinary custodial capture next to the throne.

**What we changed and why.** The WTF ruleset shipped with both flags *off*, which
(a) never recognised the three-attackers-plus-throne surround and (b) let a king
next to the throne be taken by an ordinary two-sided custodial pair. In a real
game the raiders walled the king against its own throne (king e4; raiders e5, e3,
f4; throne d4) and the engine left the game "playing" instead of awarding the win.
Setting both flags on fixes that, and matches the aagenielsen.dk / Copenhagen
wording as quoted in search results:

> "The king is captured when the attackers surround him on all four cardinal
> points, except when he is next to the throne. If on a square next to the throne,
> the attackers must occupy the three remaining squares around him and be the one
> to move." — Copenhagen Hnefatafl (aagenielsen.dk)

> "The throne is … only hostile to the defenders when it is empty." … "Restricted
> squares are hostile, which means they can replace one of the two pieces taking
> part in a capture."

**The open question.** It is *not* settled whether the ordinary **two-sided
custodial** capture of the king should *also* remain valid in some throne-adjacent
situations — e.g. when the king has **moved into** a tight space and is then closed
on two opposite sides (as opposed to being walled on three sides plus the throne).
The current implementation makes throne-adjacent the four-sided rule *only*, with
no two-sided path. That may be too strong or too weak depending on the exact
Brandub (7×7) rules, which can differ from 11×11 Copenhagen.

**To verify (do this before treating as settled):**
- Read the authoritative pages directly (were 403/unreachable from the fix
  environment): `aagenielsen.dk` Fetlar, Copenhagen, and **Brandub-specific** rules;
  cross-check `hnefatafl.org/rules.html` and `tafl.cyningstan.com`.
- Confirm specifically: (i) is the empty throne hostile to the king? (ii) next to
  the throne, is it 3-attackers-plus-throne *only*, or can a 2-sided custodial still
  apply? (iii) does Brandub 7×7 follow 11×11 Copenhagen here, or use a weaker king?
- Encode the confirmed answer; keep the custom toggles regardless so non-standard
  play stays possible.

**Passive vs. active capture** is already handled correctly and is *not* the open
question: a king (or soldier) is never captured by voluntarily moving between two
enemies; capture requires the attacker to make the closing move (see
`kingIsCaptured`'s active-move check).
