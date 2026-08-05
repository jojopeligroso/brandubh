# Puzzle lines stop at the deciding move, not at the end of the game

A guillotine — the King's escape settled, raiders able only to interpose
soldiers that are captured in turn — is a *proven* win that can take twenty or
more plies to execute. Making a learner play that out would test patience
rather than recognition, and puzzles are capped at four solver moves. So a
`Line` may be **truncated**: it is a prefix of a solver-proven line, stopping
at the move after which the result is settled.

This is why the bank's goals are not simply "win" and "not-win". `regicide`
and `escape` are proofs; `crushing` and `advantage` are evaluations and are
never called proofs. Truncation is orthogonal to all four and is recorded
separately: a guillotine is an `escape` that is `truncated`, not a goal of its
own. The goal records what kind of evidence a puzzle rests on, so the bank
never claims more than it has — the same principle `src/game/solver.ts` states
as "a solver is only worth anything if it never lies."

## Consequences

On completion the app says only "Correct" and a fixed banded line such as
"Raiders have a strong advantage". It does not show the distance to mate, and
does not tell the learner the game is over. A truncated line is therefore
indistinguishable to the learner from a short decisive one, which is the
intent: the exercise is recognising the moment, not counting the plies after
it.

Because truncation relies on the stored prefix genuinely being a prefix of a
proven line, the generator must hold the full proof at generation time even
though only the prefix ships. `dtm` is stored as bank metadata so the claim
can be re-checked, not so it can be displayed.
