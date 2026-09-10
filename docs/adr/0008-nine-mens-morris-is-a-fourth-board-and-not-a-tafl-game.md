# Nine Men's Morris is a fourth board, and not a tafl game

## Status

**Accepted, 2026-09-10.** Taken by the owner, knowingly against the closing
recommendation of ADR-0007.

## Context

ADR-0007 ends with an instruction:

> A fourth board should not be added before that refactor. Not because the rules
> would not fork cleanly — they would, that is this ADR's whole finding — but
> because a fourth copy of the *screen* buys nothing and costs the same again.

On 2026-09-10 the owner asked for a fourth board anyway, with that sentence on
the table. This ADR records the decision, what it costs, and the one respect in
which the objection does not apply — so that the next reader inherits a measured
debt rather than a forgotten one, which is the job ADR-0007 did for ADR-0006.

The objection is about the **shell**, and it is right. Morris makes it worse, not
better: `MorrisScreen.tsx` is a fourth copy of the same furniture, and the fourth
game starts life with no analysis, no eval bar, no puzzles, no match sets and no
review — the list ADR-0007 was already keeping for the third.

What is different is the other half of ADR-0006 and ADR-0007: the **rules core**
those two defer. A fourth *tafl* board would have pulled that trigger a fourth
time, with a fourth custodial capture and a fourth shieldwall. Morris pulls it
barely at all, because almost nothing in a tafl rules core would serve it.

## Decision

**Nine Men's Morris lives in `src/game/morris/` with its own types, rules,
variants, symmetry, engine, solver, endgame databases, worker, persistence, file
format and screen.** It copies the *shape* of the Copenhagen files — the module
layout, the preset machinery, the `persist`/`replay`/`gameFile` trio, the worker
and hook pair, a screen with the same props — and copies none of their content.

It is a **Boardgame** in the sense GLOSSARY.md fixes: it owns its own board,
pieces, setup, legal moves, terminal conditions and rulesets. It is not a
ruleset of anything.

### Why this is not a fourth tafl fork

Eight differences, each of which independently breaks something a shared tafl
core would have provided:

- **It is not a grid.** A Morris board is a graph: 24 points, 32 edges, vertex
  degrees 2 (twelve points), 3 (eight) and 4 (four). Every rule — adjacency,
  mills, flying — is stated over that graph. The 7×7 lattice exists only so the
  board can be drawn and a point can be named (`a7`…`g1`), and it lives in a
  coordinate table, not in the state.
- **There is no king**, and so nothing that the entire tafl evaluation and
  teaching apparatus is about: no escape, no corner, no throne, no
  "how close is the king to winning". ADR-0006's central argument is that this
  last question is the thing that cannot be shared between two tafl boards. Here
  it does not exist to be shared.
- **The two sides are symmetric.** Every tafl board in this project is an
  asymmetric hunt with different material, different goals and different
  evaluation terms per side. Morris is White and Black with nine stones each and
  one win condition between them.
- **Three phases, not one.** Placing, moving, and the three-stone flying
  endgame, each with its own move generator and its own branching profile. No
  tafl board has a phase at all.
- **A turn is a move *and* a removal, atomically.** Closing a mill takes a stone
  as part of the same turn, so `Move` carries its capture and the search needs no
  quiescence — the thing that cannot happen is a capture arriving between plies.
  Every tafl engine here has a quiescence search for exactly the opposite reason.
- **The symmetry group has 16 elements and is not D4.** The eight dihedral maps
  of the lattice, composed with the inversion that swaps the inner and outer
  rings. `src/game/symmetry/d4.ts`'s `makeD4(n)` — the one extraction ADR-0007's
  list has actually shipped — cannot express it, and should not be asked to:
  the ring inversion is a fact about this graph.
- **Its own board component.** `Board` takes an optional geometry (size, files,
  marked squares) and that seam was built for 7×7/9×9/11×11 squares. Points on
  three concentric rings joined by spokes is not a bigger value of that
  parameter, so `MorrisBoard.tsx` is an SVG board of its own rather than a
  stretch of the existing one. This is the first thing the tafl boards share
  that Morris does not.
- **Its own status vocabulary and its own i18n block.** `MorrisStatus` has no
  member in common with `GameStatus`, and the `tafl*` keys — the cheap answer
  ADR-0007 found for the third game's strings, because "a king is a king and
  'Take back' is 'Take back'" — say nothing here. The shell strings are still
  shared; the game's own strings are a new block.

So: it copies the shell pattern and shares almost none of the rules machinery.
That is the whole shape of this decision, and it is why ADR-0007's
core-extraction trigger is not pulled much further by it — see the accounting
below.

### The engine is entirely separate

No imports from `src/game/engine.ts` or either of the other two engines.
Negamax alpha-beta with iterative deepening, a transposition table in **module
state** (as the other three have), killer/history ordering with mill-closing
moves first, no quiescence, and root moves folded by the stabiliser of the
position under the 16 permutations so a varied choice does not mean sixteen
copies of one idea.

The evaluation shares nothing and could not: material counted over board *and*
hand, mills, open twos, potential double mills, mobility in the moving phase,
blocked opponent stones, flying threats. There is no tafl term to reuse and no
Morris term a tafl board would want.

The one-directional-risk argument that carried ADR-0006 and ADR-0007 applies a
fourth time and is the strongest reason to keep it separate: nothing under
`src/game/*.ts`, `src/game/tablut/*.ts` or `src/game/copenhagen/*.ts` changes, so
the existing suites are the witness that the fourth board cost the other three
nothing. A shared search interface introduced *while* adding a game with no
quiescence, a graph board and a removal inside its move would make any failure
impossible to attribute — the same argument ADR-0007 made for not extracting
while adding the exit fort.

### The endgame databases: shipped, not computed in the browser

`ollamh` is a deep search plus **small endgame databases computed offline by
Gasser's retrograde analysis, shipped as files**. Three options were on the
table:

1. **Search only.** Cheapest, and wrong in the one place it is most visible: a
   won three-versus-five endgame gets cycled rather than won, because a depth
   limit cannot see a win fifty plies out. This is the failure a player notices
   and remembers.
2. **Compute the tables in the browser on first use.** No files to ship and no
   manifest to keep honest — but a minutes-long computation on the main thread or
   a worker before the top level can play, repeated per device, with a memory
   ceiling nobody controls. Rejected on the user-facing cost, not on the
   engineering.
3. **Ship tables generated offline.** Chosen. `scripts/morris-solve.ts` runs the
   retrograde analysis; a separate verifier pass re-checks every entry against its
   successors, as the excerpts describe the paper's own verifier doing (every
   claim about the paper in this ADR is excerpt-level and ⚠ UNVERIFIED — the
   sourcing is in `docs/morris-rules.md`); and the smallest tables ship gzipped
   under `public/morris/db/` with a manifest (`{key, entries, bytes, sha256}`).
   The loader reads only the tables the current stone counts can reach.

Sizes and per-table statistics:

<!-- TABLE-STATS -->
<!-- Per-table numbers (key, entries, win/loss/draw, max depth, raw and gzipped
     bytes, shipped total) go here and in docs/morris-rules.md, from
     `npx tsx scripts/morris-solve.ts`. Not filled in yet — leave the block
     until the numbers are measured rather than estimated. -->

**What this buys and what it does not** is the part that has to stay honest, and
`docs/morris-rules.md` states it at length: **perfect once play reaches a shipped
table, deep-search best-effort before that** — the same bar `docs/solving.md` set
for Brandubh's opening book, where the word *proven* was explicitly retired
rather than quietly diluted. The full set is out of reach by something close to
four orders of magnitude in bytes: the ordered tables for 3..9 stones hold
**9,193,626,407** entries (a first-principles derivation, reproducible from the
canonical-mask counts in `symmetry.ts`), which agrees with the excerpts' *about
10¹⁰* and is ≈ 9.2 GB at one byte each, against a shipped budget of ~1.5 MB
compressed. If `DecompressionStream` is unavailable the engine runs without
tables and says so once; `ollamh` is then the search alone.

The verifier is worth one line of caution in this ADR too, because it is easy to
over-read: it checks the table against itself and the move generator. A wrong
*rule* produces a perfectly consistent, perfectly wrong table, which is why the
preset's flags — two of which are sourced only to a search excerpt — are the
single point of failure for everything the databases claim.

### Two practical draw rules the paper does not have

The shipped preset adds `repetitionResult: "draw"` (threefold) and
`noMillDrawMoves: "50"` (fifty moves each with no stone removed). **Owner
decision, 2026-09-10, not in Gasser.** A retrograde draw means "neither side can
force a win", which is a statement about the game tree and not a way to end an
afternoon; two stones shuffling between four points need a rule.

The consequence is recorded rather than hidden: **the shipped preset is not
exactly the ruleset the cited result belongs to.** Both flags have a `"none"`
setting in the custom rule editor, and `"none"` on both is the game Gasser
solved. The databases themselves are computed without the two rules, so they
cannot see a draw claimed by either — the three cases that follow from that are
worked through in `docs/morris-rules.md`, "What the tables do not know".

### Ballinderry is allowed on Morris

This is the **inverse** of the rule the tafl surfaces follow, and it is
deliberate.

`resolveTheme` falls the Ballinderry theme back to Gokstad on the Tablut and
Copenhagen surfaces, because the theme draws a 7×7 board of 49 drilled holes and
that is a lie about a 9×9 or an 11×11 board. Morris does not raise that flag:
`applyTheme` is passed `showTablut || showCopenhagen`, **not** `showMorris`, and
`[data-theme="ballinderry"] .morris-board` gets its own treatment — the 24 points
drawn as drilled holes with the two radial gradients `.board::before` uses, no
incised lines, stones as pegs. The `--n`-tiled 49-hole tile and the ornament
panels are not reused.

The argument is narrow on purpose. A peg board with holes where the points are
is a *truthful* Morris board: the 24 points sit on the 7×7 lattice by
construction (see the indexing in `docs/morris-rules.md`), so the hole treatment
is geometrically available without inventing anything. Boards for merels cut or
drilled into wood and stone are commonly reported, but that general claim was
**not re-sourced here** and nothing in this decision rests on it beyond the look.

**It is not a claim about the artefact.** NMI 1932:6583 is a 7×7 board of 49
holes, which is not a Morris board and is not presented as one: a Morris board
has 24 points on three rings. The theme is named for the object and takes its
materials and ornament vocabulary from it; what it draws on the Morris surface is
a peg board, not that peg board. `docs/ballinderry-board.md` — which records that
the ornament is reconstructed from descriptions and never traced — is required
reading before touching any of it.

One cost falls out of this, and it is a trap: `index.html`'s pre-paint script
carries a hand-written list of surface keys so a reload onto a surface does not
flash Ballinderry before React runs. **`morris.surface.v1` is deliberately not
added to it.** That list is therefore no longer "the surfaces" but "the surfaces
that fall Ballinderry back", and nothing at the call site says so. It needs a
comment, and `npm run check:morris` asserts the positive case (Ballinderry
*kept* on the Morris surface, the stored value untouched) precisely because
`check:copenhagen` exists for the negative one — that list is the single place
where adding a board goes wrong silently.

### `.morris`, not `.tafl`

`FORMAT_VERSION = "morris-1"`, `FILE_EXTENSION = "morris"`. The three tafl
boards share the `.tafl` extension and separate themselves by the `[Format]`
tag; Morris does not join them. A `.tafl` file asserts a tafl game, its move
tokens are a tafl grammar (`d2-d4`), and Morris tokens are not (`d7`, `a7-a4`,
`d7xd2`, `a7-a4xb2`). Sharing the extension would produce files that look
importable into four screens and are importable into one — a worse error message
in exchange for a tidier file dialog.

## Accounting: what this does to ADR-0007's deferred list

ADR-0007 defers four extractions, smallest first. A fourth board changes the
case for two of them and leaves two untouched:

1. **`d4.ts`** — **unchanged.** Already done (`42ec306`); Morris needs a
   16-element group that `makeD4(n)` cannot express, so it adds a *fourth*
   symmetry module but not a fourth copy of the same one. `symmetry/d4.ts` stays
   a three-game extraction.
2. **`persist.ts` / `replay.ts` / `gameFile.ts`** — **worse, and differently
   worse.** This is now a fourth near-copy, but the first one that differs by
   more than a constant: `SavedMove` is a triple rather than a pair, and the move
   grammar has a removal suffix. ADR-0007 notes the two real bugs this fork
   family produced were both constants that were correct in the file they were
   copied from; Morris adds a variant where the *shape* differs, which is
   exactly the case a size-parameterised module would not have covered either.
   Still the item with a correctness payoff, and still next.
3. **The search machinery** — **worse, with a caveat that is itself useful.**
   Iterative deepening, the TT, killers and move ordering are now carried four
   times. But Morris needs no quiescence and folds roots by a different group, so
   it is the first witness that the "board-agnostic machinery" is machinery
   *minus parts* rather than one block. That is information the extraction wants
   and could not have had from three tafl boards.
4. **Custodial capture and the shieldwall** — **unchanged.** Morris has neither.
   Still three copies, still last, still only with all rule suites green.

And the fifth item, the one ADR-0007 calls "the larger one":

5. **Making the shell generic** — **now the only item that is urgent.** See
   below.

## Consequences

**The N-way surface exclusion in `App.tsx` is the concrete cost.** Three boolean
flags (`showTablut`, `showCopenhagen`, `showMorris`) must be mutually exclusive,
which means every mount gate names the others (`showMorris && !showTablut &&
!showCopenhagen`), every drawer handler closes the others, and the
`applyTheme(theme, showTablut || showCopenhagen)` chain grows a term that is
deliberately *not* there. The conditions grow quadratically in the flags: two
overlay flags were one pair to keep exclusive, three are three, and
`App.mutualExclusion.test.ts` grows with them. The
right shape is one `surface` value with four states, and it is a rename away in
principle and a shell refactor away in practice.

**A fourth screen, as ADR-0007 predicted, buys nothing.** `MorrisScreen.tsx` is
the same furniture again: setup sheet, two player bars, board, stats strip,
toolbar, menu sheet, review bar, move log, result line, victory overlay,
confirms, file panel, autosave, engine-turn effect. The shell components are
reused; the assembly is copied. This cost was incurred with the ADR open, not
in ignorance of it.

**A fourth driven-browser smoke script.** `scripts/morris-smoke.mjs` copies
`copenhagen-smoke.mjs`'s harness — server, browser discovery, init-script
seeding — for the fourth time, and `package.json` now has four `check:*` entries
plus `check:evalbar` and `check:ai-reveal`. They exist because the suites are
pure logic and cannot see a board: 24 point targets, a removal step that
highlights the right stones, the engine's stone landing on its point, and a
surface surviving a reload are all things only a rendered board can get wrong.

**The fourth game starts with the third game's gaps.** No analysis surface, no
import/export UI beyond its own panel, no records beyond the local results line,
no match sets, no puzzles, no opening book, no measured eval weights, no gauntlet
instrument. `TASKS.md`'s "Nine Men's Morris parity" section is the list.

**So the recommendation ADR-0007 made stands, with one sentence added.** The
shell refactor — `App` generic in its surface and its ruleset — is now the
biggest thing this project has deferred, it got worse rather than staying flat,
and it is what every shell-level feature on three of the four boards is waiting
on. **A fifth board should not be added before it**, and if one is added anyway,
the first thing to write is the surface registry, not the rules.
