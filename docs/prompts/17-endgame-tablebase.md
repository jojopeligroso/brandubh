# Session 17 — a Brandubh endgame tablebase

**Status: open.** Size **L** — one focused session that starts from
`docs/solving.md`. **This session is allowed to fail**, and a well-measured
failure is a real deliverable. Do it last, or not at all.

---

Session 17 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/17-endgame-tablebase`. Start from latest `main`.

## READ FIRST

1. `docs/solving.md` — in full. It already did the arithmetic; do not redo it.
2. `src/game/solver.ts` (241 lines) — the sound bounded solver, and its
   graph-history-interaction caveat
3. `src/game/engine.ts` — `forcedDefenderWin` / `forcedAttackerWin`, the exact
   recognizers a tablebase would supersede, and `stabilizer` / `foldRootMoves`
   for the D4 machinery
4. `scripts/genbook.ts` — the house pattern for an offline generator producing a
   committed, fingerprint-gated artefact
5. `docs/ROADMAP.md` § "Deferred / not worth it" — the entry that defers this,
   and why this session is narrower than that entry assumed

**DEPENDS ON:** Session 12, meaningfully. Perft is the only cheap evidence that
move generation is exactly right, and a tablebase built on subtly wrong movegen
is worse than no tablebase. Verify `docs/perft.md` exists before starting.

## WHAT EXISTS, AND WHAT THE ROADMAP ALREADY DECIDED

`docs/ROADMAP.md` defers material endgame tablebases with a good reason:
*decisive Brandubh endgames keep too many attackers to tabulate (~10⁸–10¹⁴); the
tabulatable ones are foregone.* `docs/solving.md` §5 says the same — realistic
endings still have 6–8 attackers.

**That reasoning answers "will this make the engine stronger?" — and the answer
is still probably no.** This session asks a different question: *can this project
publish the first endgame tablebase in the history of tafl?* Nothing of the kind
exists publicly, for any variant, in any repository — that was checked directly
across 64 tafl repositories, and confirmed absent. The claim is cheap in a way
that "solved the game" never will be.

So the scope is deliberately narrow: **the smallest material signatures, done
completely and honestly**, not a table that helps `ollamh` play better.

Existing assets you must reuse rather than rebuild:

- **`solver.ts` is sound** — three-valued with an explicit `UNKNOWN`, D4-canonical
  memoisation, node budget, `memo: false` for full rigour. It is the oracle that
  validates the table.
- **The recognizers are already cross-validated** against that solver and an
  independent AND-OR oracle. A tablebase must agree with them everywhere they
  both have an opinion — that is your strongest correctness test, and it is free.
- **The D4 folding is written and tested** (`stabilizer`, `foldRootMoves`). A
  tablebase must fold or it wastes 8× the space.
- **`BOOK_RULES_FINGERPRINT` and its gating** (`src/game/openingBook.ts:62`) are
  the precedent for how a generated artefact is pinned to the exact ruleset that
  produced it. A tablebase served under the wrong rules is not a weaker tablebase,
  it is a wrong one.

## BUILD

1. **Pick the material signatures by counting first.** For each `(defenders,
   attackers)` pair, compute the D4-folded position count *before* generating
   anything, and write the table of counts into the doc. Start at the small end
   (king alone vs 1–3 attackers; king + 1 defender vs 1–3). **Publish where the
   wall is** — the first signature you decline, and its size. That boundary is
   itself a publishable result.
2. **Retrograde generation** for each affordable signature: enumerate terminal
   positions, walk backwards to fill distance-to-win, iterate to fixpoint. Reuse
   the immutable engine for rule-exactness at first — correctness before speed —
   and only optimise if a signature is close to affordable.
3. **Handle repetition honestly.** `solver.ts` §6 already documents the
   graph-history-interaction problem: threefold repetition makes a position's
   value path-dependent while the table keys on board + side. **Either fold a
   repetition/irreversible-move counter into the key, or state precisely which
   entries are unsound and why.** `docs/solving.md` predicts this exact issue —
   do not rediscover it silently.
4. **Validate against the two existing oracles.** Every table entry must agree
   with `solver.ts` run with `memo: false` on a sampled subset, and with
   `forcedDefenderWin` / `forcedAttackerWin` wherever those return a verdict. A
   disagreement is a bug in one of three places and must be chased to ground
   before anything ships.
5. **Ship it as a committed, fingerprint-gated artefact** if it fits the bundle,
   or as a generated file under `data/` with a script and a checksum if it does
   not. **Do not bloat the SPA** — the app is a static offline bundle and that is
   a product property, not an accident. If the table is too big to ship, say so
   and publish it as data beside the repo rather than inside it.
6. **Write `docs/tablebase.md`** in the register of `docs/solving.md`: what was
   generated, the counts, the wall, the repetition treatment, the validation
   method and its sample size, and — plainly — whether it measurably helps play.
   `docs/solving.md`'s honesty about the opening book ("deep-search best-effort,
   never proven") is the standard. **If the answer is "the first tablebase in
   tafl, and it does not help the engine", write that sentence.**

## CONSTRAINTS

Never claim more than is proven — the word "solved" does not appear anywhere in
this session's output, and `docs/solving.md` explains exactly why. Do not degrade
the bundle size or startup. Do not weaken or delete the recognizers: they are
cheap and they run at every node, where a table lookup may not. Pure-logic tests
only. If the session runs out of room, **the counts table and the wall are the
deliverable** — commit them and stop; a documented boundary is worth more than a
half-generated table nobody can trust.

## VERIFY

`npm test` green including tablebase-vs-solver agreement on a sampled subset and
tablebase-vs-recognizer agreement where both have an opinion. `npm run build`
clean and **bundle size compared before and after, reported in the commit
message**. If anything is wired into play, gauntlet it and report; if it is
neutral, say so and decide on cost, per the project rule. Commit + push; no PR
unless asked. Update `docs/ROADMAP.md` — including the "Deferred / not worth it"
entry, which this session partially answers and must not be left contradicting
the result.

## PROGRESS

If this session compacts, the counts table is the thing to preserve. Commit it early.

- [ ] 1. Position counts per material signature computed and committed
- [ ] 2. The wall identified and published
- [ ] 3. Retrograde generation for the affordable signatures
- [ ] 4. Repetition treatment decided and documented
- [ ] 5. Validated against `solver.ts` and both recognizers
- [ ] 6. `docs/tablebase.md` written, no overclaiming
- [ ] Bundle size reported, roadmap deferral entry reconciled, pushed
