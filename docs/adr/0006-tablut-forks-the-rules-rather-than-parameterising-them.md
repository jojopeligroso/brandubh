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
search is the file the opening book and 161 solver-verified puzzles were
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
