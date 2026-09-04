# Copenhagen: the king at the edge — edge cases, and what the code does

Companion to `docs/copenhagen-rules.md`. That file records *what the presets
assert and where it came from*; this one enumerates the **positions** the edge
rules have to answer for, and states what `src/game/copenhagen/rules.ts`
actually does in each. Every row was checked by running the shipped functions,
and every row names the test that pins it, so this file and the code cannot
drift silently.

Written for the change that made three rules the default:

| | before | after |
|---|---|---|
| `strongKingEdgeRule` | `uncapturable` | **`three_attackers`** |
| `edgeCompletesRing` | *(did not exist; behaved as `false`)* | **`true`** |
| `entombedKingLoses` | *(did not exist; behaved as `false`)* | **`true`** |

## ⚠ Sourcing, stated once and plainly

**Two of these three rules are in no published ruleset, and the third is the
project owner's choice between three sources that contradict each other.** Every
site that publishes Copenhagen is `EGRESS_BLOCKED` from this environment —
re-checked while writing this, for `aagenielsen.dk`, `tafl.cyningstan.com` and
`hnefatafl.org` — so the only evidence available is search excerpts of those
pages, which say three different things:

- *"The king cannot be captured on the board edge"* — `uncapturable`, and on the
  best reading available this is describing **Fetlar**.
- *"When the king is on an edge square he is captured by three attackers, and
  next to a corner square by two attackers"* — the first half is what ships; the
  second half is `available_sides` and does **not** ship.
- *"In Copenhagen rules, the king can be captured on the edge of the board and
  can thus be captured by two attackers when on a square next to a corner"*
  (Cyningstan, stated as the Fetlar→Copenhagen difference) — `available_sides`.

Nothing below should be read as "this is Copenhagen". It is what **this
program** now plays, decided deliberately, with both other readings one flag
away in the custom rule editor. `variants.test.ts` asserts which one ships
precisely so that changing it again is a deliberate act.

---

## 1. King capture on the rim (rule 7, `strongKingEdgeRule`)

The king is `kingStrength: "strong"` — four hostile cardinal squares, everywhere.
On the rim one of the four does not exist, and this flag says what to do about
it. `three_attackers` requires **every cardinal square that exists to hold an
actual attacker**: a hostile *square* does not stand in for a man.

| # | Position | Shipped (`three_attackers`) | `uncapturable` (Fetlar) | `available_sides` | Pinned by |
|---|---|---|---|---|---|
| 1.1 | Rim king, three attackers around him | **captured** | not captured | captured | `takes a king on the rim with three attackers`; `leaves the king safe anywhere on the rim under Fetlar` |
| 1.2 | Rim king, two attackers + one of his own defenders | not captured — see §2 | not captured | not captured | `will not take him with two attackers and one of his own men` |
| 1.3 | Rim king, two attackers + one empty square | not captured | not captured | not captured | (implied by 1.1 — the loop demands all three) |
| 1.4 | Rim king **orthogonally beside a corner**, two attackers, corner as the third side | **not captured** | not captured | **captured** | `leaves a king beside a corner alone…`; `takes him beside a corner with one attacker under available_sides` |
| 1.5 | Interior king, four attackers | captured | captured | captured | `needs four attackers in the open field, not two` |
| 1.6 | Interior king beside the empty throne, three attackers | captured | captured | captured | `accepts three attackers plus the empty throne beside it` |
| 1.7 | King **on** the throne, three attackers | not captured (the square under him is his own) | same | same | `does not accept three plus a throne the king is standing on top of` |
| 1.8 | Any of the above, but the closing move does not touch the king | not captured — capture is active only | same | same | `requires the capturing move to touch the king` |
| 1.9 | King caught in a shieldwall with his soldiers | soldiers fall, king stands | same | same | `spares the king but takes the soldiers beside him` |

### 1.4 is the consequence worth understanding

A corner is hostile, and **no soldier may ever stand on one** (`cornersRestricted`).
So under `three_attackers` the third attacker beside a corner-adjacent rim king
has nowhere to be, and that king **cannot be captured at all**. He is also a
single rook move from the corner, and nothing can occupy the square he is aiming
at — so reaching a square orthogonally beside a corner is, in this ruleset, a
win in one.

That is a real strengthening of the defenders, and it is the opposite of what
`available_sides` does with the same square. **The one position where all three
readings give three different answers is a king beside a corner with two
attackers**, which is why that position has its own test.

### Two rules that never interact, and why

- **The corner clause never reaches the interior.** A corner's only neighbours
  are `(0,1)`/`(1,0)` and their three mirrors — all rim squares. So under
  `three_attackers` a corner counts toward a king capture *nowhere on the board*.
- **The throne clause never reaches the rim.** The throne is `f6` = `(5,5)`; its
  four neighbours are all interior. So rule 7's "three attackers plus the empty
  throne" and this edge rule can never apply to the same square, and changing one
  cannot disturb the other.

---

## 2. Entombment (`entombedKingLoses`) — a rule of this project's own

§1.2 is a hole with a shape: a king held on the rim by two attackers and one of
his own men is captured by nothing, encircled by nothing, in no exit fort, and
plainly cannot move. Under the sourced rules alone that game grinds on to a
threefold repetition, which `loss_for_repeater` hands to whichever side ran out
of waiting moves first — an ending decided by bookkeeping rather than by the
board.

`kingIsEntombed` ends it on the board. Four clauses:

1. the king stands on a **rim** square (and not on an escape square);
2. he has **no legal move**;
3. **no single defender move** leaves him with one — this is the clause that sees
   a *capture* of one of his jailers;
4. **no sequence of defender moves** does either — freeze the attackers, hand the
   defenders the board to themselves, and take the monotone fixpoint of "which
   defenders could ever vacate".

| # | Position | Result | Pinned by |
|---|---|---|---|
| 2.1 | Rim king, no move, two attackers + one own man, every jailer sealed | **attackers win** | `takes a king pinned to the rim by two attackers and one of his own` |
| 2.2 | Same, but a defender can capture a jailer **in one move** | not entombed | `lets him go when a defender can take a jailer in one move` |
| 2.3 | Same, but the man behind the blocking defender can step aside (a **two-move** rescue) | not entombed | `lets him go when the man behind the blocker can step aside` |
| 2.4 | Same as 2.3, but that man is boxed in too | **attackers win** | `... but not when that man is boxed in too` |
| 2.5 | King boxed in **away from the rim** | not entombed — that is the ring's business | `never fires away from the rim` |
| 2.6 | King has a move (i.e. any exit fort) | not entombed | `never fires while the king has a move, which is what an exit fort is` |
| 2.7 | King standing on a corner with nowhere to go | not entombed — he has already won | guard in `kingIsEntombed`, clause 1 |
| 2.8 | Under `copenhagen-fetlar` | rule off; game continues | `ends the game as attackers_win_entombment` (the Fetlar half) |
| 2.9 | Entombed **and** the defending side has no legal move anywhere | `attackers_win_entombment` — entombment is named first | `computeStatus` step 3 vs step 7 |
| 2.10 | Entombed **and** the same move is a three-attacker capture | `attackers_win_capture` — the capture is named | `yields to rule 7 when the same move is also a capture` |
| 2.11 | The **defenders** seal their own king in | attackers win — checked after either side's move, like the exit fort | `computeStatus` step 3 |

### 2.12 ⚠ THE KNOWN GAP — a two-ply *capture* rescue is not seen

**This is the one case where the rule is provably too eager, and it is shipped
that way deliberately.**

```
      a b c d e f g h i j k
  11  . . . a a k d a a . .      k = king, penned at f11
  10  . . . . . a a . . . .      d = his own man at g11, immobile
   9  . . . . . . a . . . .      (f9 deliberately empty)
   …
   3  . . . . . . . . d . .      one free defender at i3
```

The defender on `i3` reaches `f3` in one move and `f9` in a second, and from `f9`
he pins the attacker on `f10` against the king himself — the king is armed, so he
is an anvil like any other. The defenders therefore had a rescue, and the rule
ends the game anyway. Clause 3 looks one ply ahead; clause 4 reasons about
blockers, which are monotone and so admit a fixpoint, and captures are not.

Pinned by `⚠ KNOWN GAP: a two-ply capture rescue is not seen`, so it cannot
change unnoticed.

**Closing it costs something either way.** Two options, neither shipped:

- **Search it.** Correct, and unaffordable: this runs at every node the engine
  visits.
- **Borrow `exitFort`'s pessimism.** Treat any jailing attacker with an empty
  square on one flank and a defender or hostile square on the other as
  capturable, whether or not a defender could ever get there. Cheap, one `if` —
  but it does not *tighten* the rule, it **replaces** it with a much stricter one.
  Worked through on 2.1 above: the attacker on `f10` has the king on one flank
  (an anvil) and `f9` on the other, so the rule would demand `f9` be filled
  before the tomb ever closed — a phalanx, not "surrounded without the means to
  move them".

The honest framing: **entombment is a positional rule, the way stalemate is a
positional rule.** `exitFort` is a *proof* and is one-sided so that it can never
end a game nobody won; entombment is not, and can. That distinction is stated in
the code at `kingIsEntombed` and is the single thing to revisit if the rule ever
misfires in real play.

---

## 3. Encirclement with the rim as a wall (`edgeCompletesRing`)

The sourced rule 7b says *board edges do not count as part of the ring*, and
`isEncircled` used to say exactly that — returning `false` the instant the king
stood on a rim square. `edgeCompletesRing: true` makes the rim a wall like any
other, and moves the test from "can the flood reach the rim" to **"can the flood
reach an escape square"**.

| # | Position | Shipped | Sourced (`false`) | Pinned by |
|---|---|---|---|---|
| 3.1 | Pocket sealed against the rim, king one rank in, no corner reachable | **attackers win** | not encircled | `counts a pocket sealed against the rim` |
| 3.2 | King standing **on** the rim, sealed, still has a move | **attackers win** | not encircled | `counts a king standing on the rim itself` |
| 3.3 | Pocket from which a corner **can** be reached | not encircled | not encircled | `does not count a pocket a corner can be reached from` |
| 3.4 | Attacker wall straight across the board | not encircled | not encircled | `does not count a wall straight across the board` |
| 3.5 | Sealed pocket, but one defender left outside it | not encircled | not encircled | `still wants every defender inside the pocket` |
| 3.6 | King ringed in the centre, region never touches the rim | encircled | encircled | `is true for a king ringed in the centre with no defenders left` |
| 3.7 | Under `escape: "edges"` | collapses onto the sourced reading | same | `collapses back onto the sourced reading when the rim is the goal` |
| 3.8 | Under `copenhagen-fetlar` | rule off entirely | — | `ends the game as attackers_win_encirclement` (the Fetlar half) |

### Why 3.4 is the load-bearing case

"No escape square inside the region" is what stops this reading from swallowing
the board. A wall from one rim to the opposite rim leaves **corners on both sides
of itself**, so neither half is a pocket. Only a wall that returns to the *same*
edge without enclosing a corner qualifies — which is a genuine encirclement by
any reading except the literal one. Under `escape: "edges"` every rim square is
an escape square, so the whole reading folds back into the original, which is the
right answer for a game where reaching the rim wins.

### 3.9 A shieldwall can now lose the king the game

Rule 4b never takes the king — it takes the soldiers beside him and leaves him
standing. If those soldiers were what connected him to the board, the shieldwall
leaves him in a three-square pocket against the rim with attackers on every other
side, which under `edgeCompletesRing` is an encirclement. Two rules, one move.
Pinned by `can still lose the king the game, to the ring rather than the wall`.

---

## 4. Interactions, ordering, and the invariants that survive

- **Entombment and the exit fort are mutually exclusive.** One requires the king
  to have no move; the other requires him to have one. They can never both hold.
- **Entombment and encirclement can both hold.** `computeStatus` names
  entombment first — cosmetic, and it reads better on the game-over line.
- **The order in `computeStatus` is:** escape → king capture → **entombment** →
  encirclement → exit fort → repetition → no-legal-move. Capture therefore beats
  entombment on a move that is both (2.10), and entombment beats the
  no-legal-move clause when the whole side is frozen (2.9).
- **The engine's forced-win recognizer is still sound, for a different reason.**
  `forkWinAttackerToMove` in `engine.ts` skips building most attacker replies on
  the argument that they cannot produce a terminal. Its encirclement clause used
  to read *"a king with a corner lane stands on the rim, and the rim stops the
  flood"* — which `edgeCompletesRing` retired. The durable argument is the lane
  itself: a surviving lane ends on a corner, so the flood finds an escape square
  and the check returns false either way. Entombment is ruled out by the same
  fact, since the first square of a lane is a legal king move. The comment in
  `engine.ts` has been rewritten to say so, and `recognizers.test.ts` still
  cross-validates every recognizer firing against the exhaustive solver.
- **What did not change:** the soldier capture rules, the shieldwall, the exit
  fort, the throne, repetition, and the bare board edge — which is still never
  hostile to a soldier (`edgeHostileToSoldiers: false`). The shieldwall is what
  Copenhagen has *instead* of a hostile rim, and that is untouched.

---

## 5. Cost

Measured on a depth-4 search from a fixed six-ply opening (108,280 nodes,
best of three interleaved passes), against the same build with both new rules
turned off:

| Configuration | Time | vs. before |
|---|---|---|
| both off (the previous behaviour) | 3990 ms | — |
| entombment only | 4164 ms | +4.4% |
| edge-completed ring only | 4500 ms | +12.8% |
| **both on (shipped)** | **4606 ms** | **+15.4%** |

Entombment is nearly free: it is guarded on the king being rim-bound *and*
immobile, which is rare, and the expensive clauses run only then.

The ring rule is the cost, and the reason is geometric — the flood used to stop
at the first rim square and must now run to a corner, so it covers most of the
board. Two things were fixed while measuring it, and both help the sourced
reading as well:

- `isEncircled` used `Array.prototype.shift()` as a queue, which is **O(n)**. A
  short flood hid it; a long one makes it quadratic. Replaced with a `Int16Array`
  ring and a read cursor.
- The "is this square a way out" test is now a precomputed `Uint8Array` mask
  (four combinations exist, none board-dependent) and the neighbour loop is
  unrolled off `DIRS`.

Together those took the ring rule from **+18.2%** to **+12.8%**.

**Not done, deliberately:** capping the flood at a fixed region size. A sealed
pocket is bounded by the attackers available to wall it, so a cap of ~80 squares
would be safe *in the only direction that matters* — it would under-declare, and
under-declaring merely plays the game on. It is not shipped because it puts an
unproven constant inside a win condition, which is the one place this project
does not put them. It is the lever to reach for if 12.8% ever matters.

---

## 6. Games saved or exported before this change

Copenhagen shipped in the commit immediately before this one, so the population
here is close to zero — but the behaviour is worth stating exactly, because it is
not "nothing happens".

| What you have | What happens now | Verified |
|---|---|---|
| A `.tafl` with `[Variant "copenhagen"]` | Replays under the **new** Copenhagen — named variants resolve from `VARIANTS`, which changed. | parsed: `edge=three_attackers ring=true tomb=true` |
| A `.tafl` with `[Variant "custom"]` exported before this change | Keeps the flags it wrote (`strongKingEdgeRule=uncapturable`), and **silently acquires** `edgeCompletesRing=true` and `entombedKingLoses=true`, because absent keys fall back to `CUSTOM_RULE_DEFAULTS`. It replays under a hybrid. | parsed: `uncapturable` + `true` + `true` |
| Either of those, where the move list passes through a position that is terminal under the new rules | **Refused**, loudly, with `moves_after_end` — never truncated and never silently altered. `replayPlies` treats a game that ends before its list does as an error. | `replay.ts:123`; `replay.test.ts:116`; `gameFile.test.ts:270` |
| An autosave under `copenhagen.game.v1` | Same as the named-variant row; if the replay now fails, `loadResumableGame` returns `null` and the save is dropped rather than restored wrong. | `persist.ts` validation path |

The direction is the right one — a game that no longer replays is refused rather
than imported as a different game — but it *is* a breaking change to the format's
meaning, and a pre-change custom export is the one case that changes quietly.

---

## 7. Open questions, in the order worth resolving them

1. **Read the primary source.** `aagenielsen.dk/copenhagen_rules.php` and the De
   Angelis PDF settle §1 outright. The question to answer is whether rule 7 says
   "all four cardinal points", "three attackers on an edge square", or
   "surrounded on all sides".
2. **Should entombment be edge-restricted at all?** It is, because that is how
   the rule was specified. But a king entombed *away* from the rim is equally
   stuck and equally not covered by the ring rule (the flood passes through
   defenders, so a king boxed by his own men is not encircled). Dropping clause 1
   is a one-line change and would make the rule about immobility rather than
   geography.
3. **The `shield` eval term.** `engine.ts` subtracts per defender orthogonally
   adjacent to the king, on the reasoning that a friend blocks a custodial
   capture. On the rim that friend is now a potential *jailer* — the third wall
   the attackers cannot supply themselves. The search still sees the terminal; the
   heuristic simply does not lean away from it. Nothing in that file is tuned
   (`DEFAULT_WEIGHTS` says so), so this is one more entry on that list rather than
   a bug — but it is the first entry with a rule behind it rather than a guess.
4. **Close 2.12, or decide not to.** The two options and their costs are in §2.

## Sources

All retrieved as search excerpts rather than full text; every primary site is
`EGRESS_BLOCKED` from this environment, re-confirmed while writing this.

- [The Viking board game Hnefatafl, Copenhagen rules](https://aagenielsen.dk/copenhagen_rules.php) — the canonical text, unreachable
- [Rules of Copenhagen Hnefatafl 11x11, Edoardo De Angelis, January 2025](https://aagenielsen.dk/Copenhagen_Hnefatafl_11x11.pdf) — unreachable
- [Copenhagen Hnefatafl Rules — Cyningstan](http://tafl.cyningstan.com/page/768/copenhagen-hnefatafl-rules) — unreachable
- [Fetlar Hnefatafl — Cyningstan](http://tafl.cyningstan.com/page/88/fetlar-hnefatafl) — unreachable
- [Rules — Copenhagen Hnefatafl, hnefatafl.org](https://hnefatafl.org/rules.html) — unreachable
