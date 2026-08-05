# Bank puzzles require a unique solving move, unlike review mistakes

`src/game/puzzle.ts` deliberately accepts *any* member of the engine's
equal-best set, and argues at length that refusing an equally-good move "would
be learning something false about the position." That reasoning is sound and
stays, but it cannot govern the puzzle bank: a bank puzzle plays the
opponent's replies from a stored line, so a learner who answers with a
different equally-best move walks into a scripted reply that no longer fits
the board — possibly not even legal. The generator therefore rejects any
candidate whose solving move at any step has an equal-best rival, which is why
lichess's generator does the same thing.

## Consequences

The two acceptance rules coexist and are not in conflict, because they answer
different questions. The generator filters for uniqueness so the script stays
coherent; `isSolution` keeps accepting the equal-best set at runtime as a
safety net, and for a bank puzzle that set is a single move by construction. A
review mistake is unfiltered by definition — it is whatever position the
player reached — so it keeps the lenient rule and stays one step long.

The cost is candidate yield: positions with two equally winning answers are
discarded rather than trimmed, and in an open position with many raider moves
that will reject a lot of otherwise good material. Accepted deliberately —
the alternative is storing a defence tree per puzzle instead of a line.
