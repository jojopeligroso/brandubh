# Nine Men's Morris — sources and open questions

Companion to `rules-review.md` (Brandubh), `tablut-rules.md` and
`copenhagen-rules.md`, doing the same job for the fourth board. It records what
the shipped preset asserts, where each assertion came from, and — the part that
matters — **which of them have not been checked against a primary source.**

The honest summary is shorter here than on any tafl board: **one source matters
and it could not be read.** The preset lives in `src/game/morris/variants.ts`;
every flag named below is a field there, and `variants.test.ts` asserts the
preset flag by flag, because a preset is data and a wrong flag in it is silent.

Two different uncertainties run through this file and it is worth separating
them at the top, because only the second one is serious:

1. **What Nine Men's Morris is.** Mostly not in doubt. Twenty-four points, nine
   stones each, place then move, mills take a stone, three stones fly, under
   three loses. This is a living game with millions of players and the shape of
   it is not contested.
2. **What Gasser solved.** Entirely excerpt-level. The app's `Ollamh` level
   cites Gasser's *method* and the README cites his *result*, and both claims
   are only as good as the match between his ruleset and this preset's flags.
   Two flags are attested for him specifically (`doubleMillRemoves`,
   `removeFromMillsWhenAllInMills`); the rest are the standard game, assumed to
   be the game he solved.

## How this was sourced

Ralph Gasser, "Solving Nine Men's Morris", *Computational Intelligence*
12(1):24–41, 1996; also in *Games of No Chance*, MSRI Publications 29, 1996.

**The full text could not be read in this environment. Every host carrying it is
blocked by the egress proxy.** Checked on 2026-09-10, each one by name:

| Host | What it carries | Result |
|---|---|---|
| `onlinelibrary.wiley.com` | the journal of record | `EGRESS_BLOCKED` |
| `library.msri.org` (`books/Book29/files/gasser.pdf`) | the *Games of No Chance* reprint | `EGRESS_BLOCKED` |
| `www.cs.brandeis.edu` (`~storer/JimPuzzles/…/GasserArticle.pdf`) | a mirror of the reprint | `EGRESS_BLOCKED` |
| `docs.preterhuman.net` | a mirror | `EGRESS_BLOCKED` |
| `www.semanticscholar.org` | the abstract | `EGRESS_BLOCKED` |
| `citeseerx.ist.psu.edu`, `www.msri.org` | indexes | proxy `403` on `CONNECT` |

**Both transports fail, which is the check that matters.** The tafl files'
lesson was that "blocked" had been asserted too early: `tafl.cyningstan.com`
served `curl` and not the fetch tool, `aagenielsen.dk` the reverse, and
`tablut-rules.md` and `copenhagen-rules.md` both had to be corrected. So the two
likeliest hosts here — `library.msri.org` and `onlinelibrary.wiley.com` — were
tried **both ways** on 2026-09-10 and refused both ways, by the proxy's own
`CONNECT` rather than by the origin; the rest were refused by whichever
transport reached them. A reader with a working route should not trust this
table over their own attempt.

**So the method was search excerpts.** Web *search* returns result snippets and
the search tool's own summary of them; that is the whole evidentiary basis for
everything attributed to Gasser below, and the summaries are paraphrase rather
than quotation. **Nothing in this file is a quotation from the paper. There are
no page numbers, and no table from the paper is reproduced, because none was
seen.** Every claim about the paper is therefore marked
**⚠ UNVERIFIED (excerpt)**, which in this file means: a secondary restatement of
the paper, at snippet length, not checked against its text.

**The owner will paste the paper text later.** See "When the paper text arrives"
below for the checklist that pass should work through. The code is written so a
rule correction is a flag change, not a rewrite: a corrected reading gets a
`morris-gasser-2` id and the current preset is kept, byte-for-byte, as a hidden
LEGACY preset — the mechanism `tablut-rules.md` and `copenhagen-rules.md`
describe under "Corrections of 2026-09-09", for the same reason (old saves and
`.morris` files keep their meaning).

### What the excerpts do establish

Listed separately from the rules, because this is the part the app's claims rest
on. All **⚠ UNVERIFIED (excerpt)**, retrieved 2026-09-10:

- **The result: Nine Men's Morris is a draw.** Endgame databases of about 10¹⁰
  states, computed by an improved retrograde analysis; an **18-ply alpha-beta
  search** over the placing phase then proved the value of the initial position
  to be a draw.
- **Twenty-eight databases**, characterised by the stones on the board — 3-3,
  4-3, 4-4, … up to 9-9 — covering the moving phase; the placing phase was
  searched rather than tabulated.
- Positions visited at the **8-ply** level were stored in an intermediate
  database so that games could be played in real time.
- **A 16-fold symmetry reduction**: the reflections and rotations of the board
  plus the inversion that exchanges the inner and outer rings, with one of the
  five symmetry axes described as redundant. The hash function is described as
  perfect and almost minimal, and takes the symmetries into account. (Two short
  phrases — *one of the five symmetry axes is redundant*, *perfect and almost
  minimal* — reached this project as snippet wording rather than as checked
  quotation, which is why they are set in italics here and not in quotation
  marks.)
- **A separate verifier program** checked every position's value against the
  values of its successors.
- On the two points where published Morris rules actually disagree, Gasser's
  choices: closing **two mills at once removes one stone**, and when every
  opponent stone is in a mill, **any stone may be removed**.
- The improved algorithm is what let the solve run **on a personal computer**,
  and the paper is described as the first nontrivial game solved in which almost
  the entire state space had to be considered.

The last two bullets come from a search-engine rendering of the abstract and are
the weakest of the set — they are the sort of sentence a summary reliably
paraphrases and unreliably quotes. **Nothing above may be set as a quotation of
the paper, here or in the app, until the text is in hand** — including the two
italicised phrases, which are snippet wording and may well be a summariser's
words rather than Gasser's.

## The rules, as the preset asserts them

`morris-gasser-1` is the only visible preset (`VISIBLE_VARIANTS`), and it is
the default. Source column:

- **G⚠** — attested for Gasser at excerpt level, and for the rule itself. This
  is the strongest mark available in this file and it is still ⚠.
- **S⚠** — the standard rule of the game, not in dispute as *the game*; the
  paper's own statement of it was **not seen**, so its presence in the solved
  ruleset is an assumption.
- **D** — derived here from the rules, first principles, no source needed.
- **O** — owner decision, 2026-09-10. **Not in the paper.**

| # | Rule | Flag / code | Shipped | Src |
|---|---|---|---|---|
| 1 | 24 points on three concentric squares joined by four midpoint lines; two players, nine stones each | `POINTS`, `ADJ`, `initialState` | — | S⚠ |
| 2 | White places first, then the players alternate | `firstMove` | `"white"` | S⚠ |
| 3 | Placing phase: each player places one stone per turn on any empty point, until all 18 are placed | `phaseOf`, `allMoves` | — | S⚠ |
| 4 | Moving phase: a stone moves along a line to an adjacent empty point | `ADJ`, `allMoves` | — | S⚠ |
| 5 | A player down to three stones may move a stone to *any* empty point | `flying` | `"three"` | S⚠ |
| 6 | Three own stones on one of the 16 lines is a mill; closing one removes an opponent stone of the mover's choice | `MILLS`, `formsMill` | — | S⚠ |
| 6a | The removed stone may not be one that stands in a mill — unless **every** opponent stone does, in which case any may be taken | `removeFromMillsWhenAllInMills` | `true` | **G⚠** |
| 6b | Closing **two** mills with one move still removes exactly **one** stone | `doubleMillRemoves` | `"one"` | **G⚠** |
| 6c | A mill may be opened and closed again on later turns, taking a stone each time | (no flag — nothing forbids it) | — | D |
| 7 | A player reduced to fewer than three stones loses | `computeStatus` | — | S⚠ |
| 8 | A player with no legal move on their turn loses | `hasAnyMove` | — | S⚠ |
| 9 | Threefold repetition is a draw | `repetitionResult` | `"draw"` | **O** |
| 10 | Fifty moves by each side without a stone being removed is a draw | `noMillDrawMoves` | `"50"` | **O** |

Six flags, and only two of them (6a, 6b) are sourced to the paper even at
excerpt level. That is the honest state of this preset.

### Where the reading needed a step of interpretation

**Rules 7 and 8 are checked in a particular order, and only in a particular
phase.** `computeStatus` tests, in this order: the opponent below three stones,
then the opponent having no legal move, then repetition, then the no-mill limit.
Three details of that are the project's reading rather than anyone's rule:

- The below-three test is deferred until the **opponent's hand is empty**. A
  player with stones still to place has reinforcements coming, and no source
  seen states when the count is taken. (Reaching two stones during the placing
  phase needs seven mills closed against you before all eighteen stones are
  down, so this is a rule about a position almost nobody reaches — which is
  exactly why it needs writing down rather than arguing about.)
- The no-legal-move test is a **moving-phase** test. In the placing phase a
  player can never be blocked: eighteen stones on twenty-four points leaves an
  empty point at every turn, and removals only make that more true. **D** —
  derivable, not assumed.
- The no-legal-move test does not fire while `flying` applies to the side to
  move. A flying player with an empty point anywhere on the board has a move by
  construction, so the check would be dead code; it is skipped rather than
  computed. **D**.

**`flying: "three"` is a flag and not a constant** for the same reason
`firstMove` is one on the tafl boards: the custom rule editor can turn it off,
and a saved or imported game paired with the wrong value fails at the ply it
diverges rather than replaying into a different game. `"none"` is a real,
played variant (it makes the three-stone endgame a loss rather than a fight) and
it is reachable in the editor — but it is **not** the ruleset Gasser's result or
these tables are computed for, which is the whole point of keeping it one flag
away rather than offering it beside the default.

## The two practical draw rules

**Owner decision, 2026-09-10. Neither rule is in the paper.**

Gasser's databases define a draw the way a retrograde analysis has to: *neither
side can force a win*. That is a statement about the game tree and it does not
terminate a game anybody is actually playing. Two stones dancing between the
same four points is a draw in the database and an infinite afternoon at the
board, so the shipped preset adds two terminations:

- **`repetitionResult: "draw"`** — a position reached three times is a draw.
  Position means board, side to move, and both hands (`hashState`), so the
  placing phase cannot repeat at all and this is in practice a moving-phase
  rule.
- **`noMillDrawMoves: "50"`** — fifty moves by *each* side (100 plies) with no
  stone removed is a draw. The counter is `sinceMill`, it resets on every
  removal, and it runs **only** in the moving phase.

Both are exposed in the custom rule editor with `"none"` available, and
`"none"` on both is the setting that plays the game Gasser solved. They are
marked **O** above and nowhere attributed to him.

They are also the two rules most likely to be what a player expects: they are
the Morris equivalents of chess's threefold repetition and fifty-move rule, and
the reason the app needs them is the reason chess needs them. Expectation is
not a source, which is why they are labelled as a decision.

## What the engine actually proves

The ladder's top level is `ollamh`, and its claim is deliberately two-part:
**perfect once play reaches a shipped database; deep-search best-effort before
that.** The second half is the same honesty `docs/solving.md` insists on for
Brandubh's opening book — "as strong as the live search, instant, varied", with
no game-theoretic guarantee — and the word *proven* is reserved for the first
half.

### Gasser's method, scaled down

`scripts/morris-solve.ts` runs the retrograde analysis the paper describes, on
the part of the state space that fits this project:

- **Levels.** A table is a pair `(m, o)`: stones of the side to move, stones of
  the opponent, both hands empty, both counts ≥ 3. `{(m,o), (o,m)}` is solved as
  one level, because a non-capturing move stays inside the level and a capture
  drops to `(o−1, m)`, which is already solved.
- **Initialisation.** A side to move with no legal move is a LOSS at depth 0; a
  capture that leaves the opponent on two stones is a WIN at depth 1.
- **Iteration.** WIN at `d+1` if any successor is a LOSS at `≤ d` for the
  opponent; LOSS at `d+1` if every successor is a WIN at `≤ d`. Repeat over the
  shrinking unresolved set until a pass changes nothing; whatever is left is a
  DRAW. That last step is where the draws come from, and it is why a draw in a
  table means "no forced win", never "agreed".
- **Symmetry.** The index is taken over the canonical form under the 16-element
  group in `src/game/morris/symmetry.ts`. A wrong canonicalisation here is a
  wrong *answer*, not a slow one, which is why the group lives in its own
  module rather than inside the engine.
- **Verification.** A separate pass re-checks every entry against its
  successors' entries, as the paper describes its verifier doing.

Two honest notes on that last point. The verifier checks the table against
**itself and the move generator** — it catches a bug in the retrograde pass and
it cannot catch a wrong rule. Under a wrong flag the table is perfectly
consistent and perfectly wrong, which is why the flags above are the single
point of failure for everything in this section. And the index scheme here is
**not** Gasser's: the excerpts describe his hash as perfect and almost minimal,
while this generator uses the plainer canonical-mask rank plus a combinatorial
rank of the opponent's stones among the free points — which wastes space in
exchange for being short enough to verify by eye.

### Which tables ship

<!-- TABLE-STATS -->
Measured, not estimated: `npx tsx scripts/morris-solve.ts --max-stones 9`, one
core, 848 s wall clock for the lot (solve, verify, gzip and write; the eight-stone
set alone takes 149 s). Every table was verified entry by entry against freshly
generated successors before it was written; all ten fit the ~1.5 MB budget, so
all ten ship — every moving-phase position with nine or fewer stones on the
board is played perfectly.

| table | entries | win | loss | draw | max depth | raw | gzip | gzip, no depths |
| ----- | ------- | --- | ---- | ---- | --------- | --- | ---- | --------------- |
| 3-3 | 210,140 | 174,485 | 35,303 | 352 | 26 | 205 KB | 51.2 KB | 12.0 KB |
| 3-4 | 945,630 | 126,377 | 0 | 819,253 | 33 | 924 KB | 73.0 KB | 58.3 KB |
| 4-3 | 862,980 | 84,303 | 3,660 | 775,017 | 32 | 843 KB | 7.0 KB | 5.0 KB |
| 3-5 | 3,215,142 | 7,277 | 12,203 | 3,195,662 | 31 | 3.07 MB | 27.0 KB | 25.0 KB |
| 5-3 | 2,742,270 | 611,683 | 0 | 2,130,587 | 3 | 2.62 MB | 21.0 KB | 17.8 KB |
| 4-4 | 3,667,665 | 212 | 57 | 3,667,396 | 9 | 3.50 MB | 4.1 KB | 1.4 KB |
| 3-6 | 8,573,712 | 0 | 242,104 | 8,331,608 | 6 | 8.18 MB | 212.7 KB | 164.2 KB |
| 6-3 | 7,159,584 | 2,836,676 | 0 | 4,322,908 | 7 | 6.83 MB | 105.9 KB | 62.3 KB |
| 4-5 | 11,736,528 | 76 | 2,451 | 11,734,001 | 28 | 11.2 MB | 15.1 KB | 5.9 KB |
| 5-4 | 10,969,080 | 10,797 | 9 | 10,958,274 | 29 | 10.5 MB | 31.3 KB | 17.6 KB |
| **all ten** | **50,082,731** | | | | | **47.8 MB** | **548.3 KB** | **369.5 KB** |

The nine-stone level (3-6 with 6-3) is the expensive one: 454 s of the 848,
because its 454 million in-level edges no longer fit the edge cache and are
regenerated on every sweep. The ten-stone level (3-7, 7-3, 4-6, 6-4, 5-5, some
122 million entries) was not attempted; it is an offline job of a few hours and
a download of a few megabytes, and `TASKS.md` records it as the next step.

The last column is the same tables with the *depths thrown away* — two bits per
position instead of eight. Shipping depths costs 179 KB of the 548 KB, and buys
the thing that makes a won endgame actually get won: the engine picks the child
with the smallest distance, rather than shuffling inside a position it knows it
has won. The owner asked to see that number rather than be argued at; it is 33%
of the download.

Four of these rows look odd at a glance, and each one is the flying rule talking:

- **3-3 is where the game is decided** — 83% of its entries are wins for the
  side to move. A three-stone side flies, so any two of its stones on one line
  with the third point empty is a mill *this move*, and a mill takes the
  opponent's third stone, which ends the game. Nothing about that is deep: the
  wins that are not immediate run out to 26 plies, but most are one.
- **3-4 and 5-3 contain no losses at all.** A three-stone side can never be
  blocked (it flies to any empty point, and there are always empties), so for it
  to be *lost* every one of its ~50 moves would have to lose. That never happens
  in either table.
- **5-3 wins are never deeper than 3 plies.** The five-stone side forces a mill
  at once or not at all; a flying three-stone side cannot be herded, so anything
  that is not an immediate or one-threat win is a draw.
- **4-4 is a draw table** — 3,667,396 of 3,667,665 entries. A capture there
  leads to 3-4 with the three-stone side to move, and 3-4 has no losses, so
  capturing cannot win. What is left is blocking, and in the whole table exactly
  **6** positions are a four-stone side with no move at all. Two of them are a
  ring's four corners held against that ring's four midpoints — the outer ring's
  version and the inner ring's are *one* position under the ring inversion, which
  is why there are two of these and not three — and the other four are four stones
  packed along one edge behind four blockers (`a7 d7 g7 g4` against
  `d6 a4 f4 g1`, and three more of that shape). The 212 wins are those six
  positions and the short forcing lines into them, out to 9 plies. Gzip tells the
  same story in one number: 3.5 MB of table, 4.1 KB compressed, because it is
  nearly all the same byte.
- **3-6 has no wins and 6-3 no losses**: three flying stones against six never
  force anything, and the six can force a mill (or block nothing — they cannot
  block a flier) within 7 plies in 2.8 million positions or not at all. The
  nine-stone tables are where the flying rule stops dominating: 4-5 and 5-4 are
  99.98% draws with wins running out to 29 plies.

The 3-3 statistics in that table are pinned in
`src/game/morris/db/retrograde.test.ts`, which re-solves the level from scratch
and re-runs the verifier over all 210,140 entries on every test run. If one of
those numbers moves, every shipped table has to be regenerated.

The manifest in `public/morris/db/manifest.json` is the authority on what is
actually shipped (`{key, entries, bytes, sha256}` per table); the loader reads
only the tables the current stone counts can reach, and the stats strip on the
screen names them, so a player can see which part of the game is being played
perfectly.

### And what does not ship

The full set is out of reach, and it is worth being exact about by how much.
With mover and opponent counts in 3..9 and the canonical index described above,
the ordered tables hold

> **9,193,626,407 entries**

— a first-principles derivation, not a number from the paper. It is the sum
over `m, o ∈ 3..9` of `(canonical white masks of weight m) × C(24−m, o)`, with
the canonical counts 3→158, 4→757, 5→2830, 6→8774,
7→22188, 8→46879, 9→82880 — each of those obtained by folding `C(24, w)` over
the 16 permutations. Reproduce it against `PERMS` in
`src/game/morris/symmetry.ts`; that group is closed under composition and
preserves adjacency, which is what makes the fold legitimate.

Two things to read off it:

- It agrees with the excerpts' **about 10¹⁰** at the order of magnitude, which is
  mild corroboration that this index counts roughly what his did — no more than
  that. Whether his figure counts the same thing (ordered pairs, side to move,
  illegal-but-indexable masks) cannot be checked without the paper, and is on
  the checklist below.
- The **28** databases in the excerpt is exactly the number of *unordered*
  pairs `{m, o}` with `3 ≤ m ≤ o ≤ 9`. That is a real consistency check and the
  best one available here: it is evidence that "3..9, characterised by stones on
  the board" is the right reading of that excerpt. This project's own tables are
  indexed by the **ordered** pair (the mover's count first), which makes 49 of
  them rather than 28.

At the one-byte-per-entry encoding used here (value in bits 0–1, depth in plies
capped at 63 in bits 2–7), the full set is ≈ 9.2 GB raw before compression. A
browser bundle it is not. Hence: small tables, shipped; everything above them,
searched.

### What the tables do not know

The tables are computed under the paper's rules, which is to say **without** the
two practical draw rules. Three consequences, all derived rather than sourced:

- A table **WIN** is still a win in the live game if the no-mill limit cannot
  intervene first. `sinceMill + depth < 100` is sufficient — and conservative,
  since every removal along the winning line resets the counter. With the encoded
  depth capped at 63 plies against a limit of 100, this can only bite in
  positions reached with the counter already well advanced. It is a real edge and
  the engine does not currently reason about it.
- A table **DRAW** and a live draw agree: either practical rule ends the game
  the same way the table values it.
- A table **LOSS** is the interesting one. Under the shipped preset the losing
  side can in principle aim at a repetition or the no-mill limit — but only with
  the winning side's cooperation, since the winner chooses from a decreasing
  distance-to-win and need never repeat. So this is not a hole in what the
  winning side can claim; it does mean the app's "loss" is a loss *against
  correct play*, which is what a database value always was.

### The placing phase is not solved here

Gasser's draw for the initial position came from an 18-ply search **backed by
the full database set**. Neither half of that exists here, so the app never
presents the game's value as its own finding: the README cites Gasser for "the
game is a draw" and this file marks that citation ⚠. Before the first shipped
table is reached, `ollamh` is a deep alpha-beta search with a hand-set ladder
and nothing more.

## Not calibrated

The engine's eval weights for Morris are **hand-set, not tuned**, and the
difficulty ladder's depths with them. Brandubh's weights came off an A/B
gauntlet over hundreds of games (`scripts/evaltune.ts`); nothing of the sort has
been run here, and there is less to transfer than between any two boards in the
project — material, mills, open twos, mobility and flying threats have no
counterpart in a tafl evaluation at all. `DEFAULT_WEIGHTS` in
`src/game/morris/engine.ts` says so. **Do not quote any of those numbers as
measured.**

Nor is the branching factor measured, the way Tablut's and Copenhagen's are in
their `engine.test.ts` files. What *is* known is arithmetic, and it is the
reason the ladder's depths sit higher here than on the 11×11 board:

- The opening has exactly **24** legal moves — and only **4** distinct ones up
  to the 16-fold symmetry (an outer-or-inner corner, an outer-or-inner midpoint,
  a middle-ring corner, a middle-ring midpoint: the four orbits of a single
  point under `PERMS`). Copenhagen's opening has 116 attacker moves.
- The graph has 32 edges and degrees 2 (12 points), 3 (8 points) and 4 (4
  points) — average 8/3. So the moving phase offers at most 4 destinations per
  stone and about 2.7 on average, multiplied by the removal choices on any move
  that closes a mill.

Those two facts are why the search goes deeper here for the same money, and why
no tier cap was needed (Copenhagen's `hard`/`ollamh` are disabled; Morris offers
all four). They are not a substitute for the measurement, which is open in
`TASKS.md`.

## When the paper text arrives

A checklist for the pass that reads the real thing, in rough order of what would
cost most to have wrong. Every item currently marked **G⚠** or **S⚠** above is
in scope; these are the ones where a different answer changes code, data or a
claim the app makes.

1. **The two rule choices this file credits him with** — two mills remove one
   stone; any stone may be taken when all are in mills. If either is the other
   way round, `doubleMillRemoves` / `removeFromMillsWhenAllInMills` flip, the
   preset becomes `morris-gasser-2`, and **every shipped table must be
   regenerated** — these flags are inside the retrograde analysis.
2. **Flying.** Whether the paper's ruleset has it, and at three stones. This
   changes the value of every endgame table. Same regeneration.
3. **First mover.** Whether the paper says who begins. Cheap to fix
   (`firstMove`), but it changes which side a cited result belongs to.
4. **Blocked player loses.** Confirm it is a loss and not a draw in his rules.
   Inside the tables again (it is the retrograde initialisation).
5. **Whether the paper has any draw-by-rule at all.** This file asserts it does
   not, and that the two practical rules are additions. Confirm, and check
   whether his search used a repetition rule the databases do not encode.
6. **The result, and the ruleset it belongs to.** "The game is a draw" is a
   claim the README makes in Gasser's name; confirm the wording and the rules
   it is stated under.
7. **The ≈10¹⁰ figure's definition**, against the 9,193,626,407 derived here:
   ordered or unordered pairs, side to move counted or not, illegal masks
   included or not. If his count is differently defined, say so here rather
   than quietly adjusting the derivation.
8. **The 28 databases**, against the 28 unordered pairs in 3..9 this file reads
   them as. Confirm the characterisation, and whether 2-stone levels appear.
9. **The 16-fold symmetry**, and the *one of five axes is redundant* phrasing —
   against `symmetry.ts`'s own derivation, which reaches 16 independently (8
   dihedral maps × the ring inversion). If the paper's group is the same group,
   say so; if it differs, the database index is affected.
10. **The 18-ply and 8-ply figures**, and the intermediate database's purpose.
11. **The verifier's method**, against the one in `scripts/morris-solve.ts`.
12. **Per-database statistics, if the paper prints any.** These would be the
    first external cross-check on this generator: compare win/loss/draw counts
    and maximum depths for any table shipped here. Nothing else available can
    falsify the tables from outside.
13. **Quotations and page numbers.** Replace every paraphrase above with the
    paper's own words and a page, and then — and only then — remove the ⚠ marks
    the text actually settles, one by one, recording the date the way
    `tablut-rules.md` and `copenhagen-rules.md` do under "Corrections of
    2026-09-09".

If the text contradicts a shipped flag, follow the correction procedure those
two files established: new `-2` id, old preset kept byte-for-byte and hidden,
`DEFAULT_VARIANT` moved, frozen literals in `variants.test.ts`. Old saves
(`morris.game.v1`) and exported `.morris` files must keep replaying into the
game they recorded.

## Hiding a preset

`VISIBLE_VARIANTS` in `src/game/morris/variants.ts` lists what the picker
offers, mirroring the `VISIBLE_LANGS` idiom in `src/i18n.ts` and both tafl
boards' `variants.ts`. Removing an entry hides it in one line; the preset stays
in `VARIANTS`, so `rulesFor` keeps resolving it and games already saved or
exported under it still replay. Deleting it from `VARIANTS` would orphan those
— don't.

## Sources

- Ralph Gasser, "Solving Nine Men's Morris", *Computational Intelligence*
  12(1):24–41, 1996. **Not read** — see "How this was sourced". DOI
  `10.1111/j.1467-8640.1996.tb00251.x`.
- Ralph Gasser, "Solving Nine Men's Morris", in *Games of No Chance*, MSRI
  Publications 29, 1996 (the reprint of the same work; this is the version the
  mirrors carry). **Not read.**
- Search-engine snippets and summaries of both, retrieved 2026-09-10. This is
  the actual source of every Gasser claim in this file, and it is a secondary
  one.
- `docs/adr/0008-nine-mens-morris-is-a-fourth-board-and-not-a-tafl-game.md` —
  why this is a fourth board rather than a fourth tafl fork, and the database
  decision.
- `docs/solving.md` — the standard this project holds the word "proven" to, set
  for Brandubh and applied to `ollamh` here.
