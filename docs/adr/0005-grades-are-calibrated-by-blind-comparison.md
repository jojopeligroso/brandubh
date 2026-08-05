# Grades are calibrated by blind comparison, not by asking anyone how hard a puzzle is

Nobody ever assigns a puzzle a difficulty. The proving ground shows a position
cold, times an attempt, reveals the answer, and only then asks three questions
of the form "harder than #00023?" against anchors the person has already
solved. The **Ranking** those comparisons imply is what the **Grade** formula
is fitted to; the four bands fall out of the fitted formula afterwards.

A future reader will find a grading tool that never asks for a grade, and a
binary search where a four-button scale would be simpler. Both are deliberate,
and they answer two different failures.

## The order fixes a bias; the comparison fixes noise

Showing the answer before asking for a difficulty produces the curse of
knowledge: once the solution is known it cannot be unknown, and every puzzle
reads as findable. That is a *bias* — a displaced centre, not variance around
the truth — so collecting more labels does not dilute it. Hence the blinding,
and hence the strict order.

Absolute categorical judgement is separately the noisiest instrument
available: people are markedly more consistent at "is A harder than B" than at
"is A hard", because the second requires a remembered standard that drifts
between sittings. Hence comparisons rather than bands.

Neither substitutes for the other. Perfectly consistent comparisons made with
the answers visible would be precisely-measured wrongness.

## Why this needs no shared state

All-pairs over eighty puzzles is 3,160 comparisons and really would want a
database to apportion. But the bands only need enough resolution to cut four
groups, and eight **Anchors** place any puzzle in three comparisons by binary
search: roughly 240 comparisons total, about sixty per grader across four or
five people. The anchor set ships in the bundle, each grader's schedule comes
from a seed, and a grader's blob is around 600 characters — inside the
`mailto:` ceiling of ADR-0004. Bradley-Terry fitting pools the blobs offline in
the calibration script, which is where multiple graders were always going to be
combined.

## Consequences

Four measurement instruments ride along, and each answers a question the fit
cannot answer about itself. About a tenth of puzzles recur silently, so a
grader's disagreement with their own earlier judgement gives the noise floor —
without it, "the formula matches the labels 70% of the time" is uninterpretable.
Presentation order is shuffled per session, so contrast effects spread across
puzzles instead of attaching to particular ones. Graders work independently and
their comparisons are pooled, aggregation being the strongest noise reducer
available. And the weights are fitted on part of the data and scored on a
holdout, because a formula with several free parameters over eighty puzzles
will otherwise fit the noise and report itself a success.

The deeper reason this is worth the trouble: the formula, once fitted, has no
occasion noise at all. `depthToFind` returns the same number every time. A
simple model of a judge routinely outperforms the judge for exactly that
reason, so the labels do not need to be individually good — they need to be
unbiased and numerous. That is the whole argument for spending the effort on
blinding rather than on a finer scale.
