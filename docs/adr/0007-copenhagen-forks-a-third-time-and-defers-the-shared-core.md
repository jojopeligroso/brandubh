# Copenhagen forks a third time, and defers the shared core

ADR-0006 ends with a trigger:

> **When to revisit.** When a third tafl boardgame arrives. Custodial capture is
> subtle — throne hostility, corner anvils, and the contested
> `strongKingAdjacentToThrone` rule — so a fork means every fix to it lands twice
> or silently diverges, and by the third implementation a shared core would have
> paid for itself. The right moment to extract one is then: from two working
> implementations, rather than guessed from one.

The third boardgame has arrived. **The core was not extracted.** This ADR records
that decision, the evidence for and against it, and what it costs — so that the
next reader inherits a measured debt rather than a forgotten one.

## The decision

Copenhagen Hnefatafl (11×11, corner escape, 24 v 12+1) lives in
`src/game/copenhagen/` on exactly the pattern Tablut set: its own types, rules,
variants, engine, solver, worker, persistence, `.tafl` dialect (`copenhagen-1`),
save key (`copenhagen.game.v1`) and screen.

## Why the trigger fired and we did not act on it

The trigger's own reasoning is sound and is now *more* true, not less. What
changed is the situation it was written for.

**ADR-0006 imagined a third game as the last thing that happens before an
extraction. It is not — it is the thing that happens *at the same time*.**
Copenhagen is not a re-parameterisation of an existing game; it introduces two
rules neither other game has, and one of them is the most delicate code in the
project:

- **The exit fort** (rule 6b) is the first win condition decided by a structural
  property of the whole board rather than by the move just played, and its
  correctness argument is a greatest-fixpoint over attacker moves.
- **Loss-for-the-repeater** adds a fourth repetition outcome and two new
  `GameStatus` members, and is the only rule in the project whose result depends
  on *which side* triggered it.
- **A king strong everywhere** replaces the two throne-scoped booleans the other
  games carry with a three-value ladder.

Extracting a shared core is a large refactor of the highest-risk files in the
project. Adding new rules of this kind is a design problem. Doing both in one
change means that when something is wrong, there is no way to tell which half did
it — and ADR-0006's own argument about the failure mode applies with full force:
the hazard is not a crash, it is a silently wrong verified artefact.

The one-directional-risk argument also still holds, and paid off a third time.
Nothing under `src/game/*.ts` or `src/game/tablut/*.ts` changed. The 993 existing
tests were the witness that this fork cost the other two games nothing.

**So: fork now, extract next, from three working implementations rather than two.**
The trigger was right about the direction and one game early about the timing.

## The evidence the trigger was right

Recorded plainly, because the case for extracting is now strong and the next
reader should not have to re-derive it.

**Shieldwall capture now exists three times, near-verbatim.** ADR-0006 predicted
this shape: "a fork means every fix to it lands twice or silently diverges". It is
sixty lines of subtle logic (bracket, front rank, active-capture, corner
substitution, king survives) and it is now in `rules.ts` three times over. In two
of those three it is a curiosity nobody plays; in Copenhagen it is the game.

**`d4.ts` is three copies of nine lines of arithmetic differing in one constant.**
There is no argument for this at all beyond "a constant is baked in at module
scope". It is the cheapest possible extraction and should be first.

**The search machinery is genuinely board-agnostic and is now triplicated.**
Iterative deepening, the transposition table, killers, LMR, quiescence, PVS, D4
root folding: carried over twice unchanged, because it *is* unchanged. This is the
largest block of duplicated code in the project.

**Copenhagen takes one half from each of the other two, which is new information.**
It is 11×11 like nothing else here, but its *goal geometry* is Brandubh's:
`clearPathToCorner` and `kingCornerMoves` came from the Brandubh side while the
search came from the Tablut side. That is the first concrete demonstration that
board size and goal geometry are independent axes — which is the thing a
parameterised core would have to model, and the thing one working implementation
could not have shown.

**The persistence and file-format layers are near-identical.** `persist.ts`,
`replay.ts` and `gameFile.ts` differ by a storage key, a format tag, a table of
enum values and a variant-name resolver. The two real bugs this fork surfaced were
both *constants that were correct in the file they were copied from* — a `< 9`
bound in `replay.ts` that rendered every rank-10 and rank-11 square as `?`, and a
`[a-i][1-9]` move regex in `gameFile.ts` that silently truncated every
double-digit rank. Neither would exist in a size-parameterised module. This is the
duplication actively costing correctness rather than merely costing lines.

## The evidence the trigger was, in one respect, wrong

**The i18n duplication had a cheaper answer than a core.** Forty UI strings across
three locales looked like a third copy waiting to happen. It was not: a king is a
king and "Take back" is "Take back" on any board, so those keys became `tafl*` and
this game cost two new strings plus its own rule copy. That is a five-minute
change with no risk, and it dissolved a whole category of duplication that a
"shared core" framing would have bundled into a much larger job. Look for more of
these before reaching for the core — they are the cheap half.

## What this defers, and in what order to take it

Smallest and safest first. Each is independently shippable.

1. **`d4.ts`** — one module taking `N`. Pure arithmetic, no rules, three call
   sites. An afternoon.
2. **`persist.ts` / `replay.ts` / `gameFile.ts`** — parameterise on board size,
   notation alphabet, storage key, format tag and a ruleset codec. This is where
   the bugs actually were, so it is the one with a correctness payoff rather than
   only a tidiness one.
3. **The search machinery** — extract iterative deepening, the TT, killers, LMR,
   quiescence and PVS behind an interface taking `{ evaluate, allMoves, applyMove,
   status }`. Board-agnostic already; the work is the interface, not the logic.
   Re-verify Brandubh's opening book and 158 solver-verified puzzles against it,
   because that is the risk ADR-0006 names.
4. **Custodial capture and the shieldwall** — the subtle part, and the reason the
   trigger exists. Last, deliberately, and only with all three games' rule suites
   green as the witness.

**The evaluation and teaching layers should stay forked.** ADR-0006's central
argument is untouched by this fork and was strengthened by it: corner-escape and
edge-escape geometry are not the same question, and a shared "how close is the
king to winning" would have to carry that distinction inside the most
safety-critical code in the project. Copenhagen proved this concretely — the
single-lane shortcut ADR-0006 flags as *unsound* under edge escape is **sound**
here, for Brandubh's exact reason (no soldier may stand on a corner), and
`forcedDefenderWin` uses it. Three games, two different answers to the same
geometric question. That is a fork, not a parameter.

## The other deferral, which is now the larger one

ADR-0006's addendum says making `App` generic in its ruleset "is still the right
move, and is what the shell-level features (clock, analysis, review, match sets,
import/export, the learn screens) are waiting on. It is a large mechanical
refactor, not a design question."

That is now the **biggest** thing this project has deferred, and unlike the rules
core it gets worse with every board rather than staying flat. Copenhagen's screen
is a third 1100-line copy of the same furniture, and the third game still has no
analysis, no eval bar, no puzzles and no match sets — features Brandubh has had
all along.

A fourth board should not be added before that refactor. Not because the rules
would not fork cleanly — they would, that is this ADR's whole finding — but
because a fourth copy of the *screen* buys nothing and costs the same again.
