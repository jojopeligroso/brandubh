# Tablut forks the rules rather than parameterising them

Brandubh is 7×7 and the King escapes to a corner. Tablut is 9×9 and the King
escapes to any edge square. The obvious move is to make board geometry a
parameter so one implementation serves both — and a future reader will find
two implementations of custodial capture instead, and want to merge them.
That duplication is deliberate.

A **Boardgame** owns its own board, setup, legal moves, terminal conditions and
**Rulesets**. Tablut is a boardgame, not a Brandubh **Ruleset**: a ruleset is
the exact rules of one boardgame's variants, and board size is not a variant of
anything. So the question was only ever where the code boundary falls, and it
falls between the boardgames.

## Why not parameterise

The decisive fact is not `BOARD_SIZE`. It is that corner-escape is baked into
the *evaluation function and the teaching layer*, not just move generation.
`isCorner`/`CORNERS` is read eleven times in the search — king-escape scoring,
anchor detection, and hardcoded move-ordering bonuses — and again in
`motifs.ts` (`isCornerFight`, a named **Motif**), `completionNote.ts`,
`position.ts` and `Board.tsx`. Tablut wins on any edge square, which makes
"distance to the nearest corner" not miscalibrated but meaningless. A
parameterised core therefore has to reach into the search as well, and the
search is the file the opening book and 158 solver-verified puzzles were
generated against. Sharing would buy roughly 120 lines — rook movement and
custodial soldier capture — at the price of editing the highest-risk files in
the project.

The risk is also one-directional. A fork cannot regress Brandubh, because
nothing existing changes and every verified artefact stays valid against the
code that produced it. Parameterising re-proves all of them against a code path
that has a new degree of freedom in it, and the failure mode is a silently
wrong verified artefact rather than a crash. No cheap test tells "the book is
still correct" apart from "the book is subtly wrong".

Performance was measured rather than assumed, because it looked like it might
decide this. It does not. Turning `BOARD_SIZE` into runtime data costs **0.4%**
on `FULL_CONFIG` across four interleaved rounds — a null result, with the
runtime build faster in two of the four. The bench-only `LEGACY_CONFIG` shows
+13.5%, cleanly separated, which proves the harness can see a real regression
and that the geometry code genuinely is sensitive; the shipping config is
simply not sensitive to it, because `hashBoard`'s per-node string building and
the transposition-table probe swamp the geometry work entirely. Performance is
neutral here, and anyone re-opening this on speed grounds should know that
`scripts/aibench.ts` cannot resolve single-digit differences — its budget rows
vary by a full ply between runs of the same binary.

## What is shared, and where

The reusable thing is the contract the shell consumes — `initialState`,
`legalMoves`, `applyMove`, `status`, notation, and a move from the engine —
plus what is already boardgame-agnostic: `clock.ts`, `records.ts`,
`matchSet.ts`, `puzzleProgress.ts`. That is a registry at the shell boundary,
not a shared rules core. Nine Men's Morris settles it: a graph with placement,
movement and flying phases, no custodial capture, and no D4 symmetry at all
(`d4.ts` assumes a square grid). A core general enough to hold all three would
say nothing about any of them.

## When to revisit

When a third tafl boardgame arrives. Custodial capture is subtle — throne
hostility, corner anvils, and the contested `strongKingAdjacentToThrone` rule
— so a fork means every fix to it lands twice or silently diverges, and by the
third implementation a shared core would have paid for itself. The right moment
to extract one is then: from two working implementations, rather than guessed
from one.

## Addendum: what the fork actually looked like

Written after doing it, so the next reader gets the outcome and not only the
prediction. The decision held; three details are worth recording.

**The boundary fell in a different place than "a registry".** The plan above
names one — `initialState`, `legalMoves`, `applyMove`, `status`, notation, a move
from the engine — consumed by a shell that does not care which game it is showing.
That shell does not exist: `App.tsx` is built around a `RuleSet`, and Tablut's is
a *different type* (it carries an escape condition and a first mover, which are not
Brandubh flags). Threading both through one shell means `RuleSet | TablutRuleSet`
and a narrowing at every site that touches it, which makes the shell worse for
both games. So Tablut got its own screen (`components/TablutScreen.tsx`), and what
is actually shared is smaller and lower down:

- `Board` takes an optional geometry (size, files, which squares are marked) plus
  an optional legal-move closure, defaulting to Brandubh. The geometry
  deliberately holds **no ruleset** — that is what lets one component serve two
  games whose ruleset types are unrelated.
- `orientation.ts` takes an optional size and file alphabet. Flip mapping is
  geometry, not rules.
- `gameOverText` moved out of `App.tsx`. `GameStatus` is the one part of the
  domain both games share verbatim.
- `clock.ts`, `clockLine.ts`, `matchSet.ts`, `records.ts`, `puzzleProgress.ts`,
  `trainer.ts`, `grade.ts`, `sides.ts` were reused untouched, as predicted.

Making `App` generic in its ruleset is still the right move, and is what the
shell-level features (clock, analysis, review, match sets, import/export, the
learn screens) are waiting on. It is a large mechanical refactor, not a design
question.

**The one-directional-risk claim paid off exactly as argued.** Nothing under
`src/game/*.ts` changed. The shared edits were all additive with Brandubh
defaults, so no existing call site changed either, and Brandubh's ~800 tests
were the witness that the fork cost it nothing.

**One thing that looked portable was unsound.** Brandubh proves a forced win from
a *single* open lane when the king touches the corner, because no soldier may ever
stand on a corner. Under edge escape the rim is ordinary ground and an attacker
can occupy the escape square, so the shortcut is false there — the Tablut
recognizer requires two lanes. This is the sharpest argument in the file for
forking: a shared "how close is the king to winning" would have had to carry that
distinction *inside* it, in the most safety-critical code in the project, where
the failure mode is a search handed a false terminal it cannot detect.

The "revisit at a third tafl boardgame" trigger stands, with an addition: revisit
sooner if the second game starts wanting the shell features, because the answer
then is a generic shell rather than a shared rules core.

## Superseded in part by ADR-0007

The "revisit at a third tafl boardgame" trigger fired when Copenhagen Hnefatafl
(11×11) arrived, and was **deliberately not acted on**. See
`0007-copenhagen-forks-a-third-time-and-defers-the-shared-core.md` for the
reasoning, the evidence that this ADR's prediction was right, and the order the
extraction should be taken in when it happens.

The central argument of this ADR — that the *evaluation and teaching* layers
should stay forked because corner-escape and edge-escape geometry are different
questions — was strengthened rather than weakened by the third game, which
resolves that question a third way: the single-lane shortcut called unsound above
is sound again under Copenhagen, because Copenhagen restricts its corners.
