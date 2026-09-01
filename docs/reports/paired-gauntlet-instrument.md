# The paired gauntlet — a measurement instrument for strength-affecting changes

**Outcome: shipped.** `scripts/pairgauntlet.ts` and its co-located self-check
(`scripts/pairgauntlet.test.ts`, 12 tests) join `scripts/evaltune.ts` as a
gauntlet instrument. It does not replace evaltune.ts's candidate list or
retire any prior verdict recorded in `docs/ROADMAP.md` — it exists because the
existing gauntlet protocol has a measured blind spot that a candidate re-run
alone cannot see.

This report records why the instrument exists, what was validated before it
was trusted, and — deliberately, in proportion to what was actually checked —
what has and has not been shown.

---

## Why: the existing gauntlet cannot see its own side bias

`evaltune.ts` and its relatives (`scripts/aibench.ts`'s self-play series, and
an earlier ad-hoc harness on a sibling worktree) score a candidate by playing
it against `DEFAULT_WEIGHTS`, N games as attacker plus N as defender, and
summing wins across all 2N games. That protocol assumes the two colours are
roughly symmetric in strength. They are not, and the size of the asymmetry
was measured directly: **an A/A control — `DEFAULT_WEIGHTS` against itself,
identical config on both sides, depth 4, 24 games with a short random-ply
opening — came back 11–13 overall but 1–11 as attacker and 10–2 as defender.
Defenders won 21 of 24 games (87.5%) with both sides running byte-identical
code.**

(That number was measured on a sibling worktree during this mission's W4a
task, not re-run in this session — it predates `pairgauntlet.ts` and is the
finding that motivated building it. It is reported here as provenance, not as
a number this session re-measured.)

An 87.5% side-bias floor makes an unpaired gauntlet nearly useless for
detecting a real but moderate eval-weight effect: a genuine improvement has to
overcome the bias *and* still show up in a simple win tally that never
separates "won because of the change" from "won because of the side." Every
"measured neutral" verdict `evaltune.ts` has produced (`docs/ROADMAP.md`,
Part V of `docs/reports/engine-and-optimality-report.md`) was produced under
this uncorrected bias. This report does not retract any of those verdicts —
they may well be correct — it records that the instrument that produced them
could not have told the difference between "neutral" and "swamped by side
bias," and that a sharper instrument is now available for future changes.

## The fix: mirrored pairs

Generate one opening, play it **twice** from that exact position: once with
the candidate as attackers and the baseline as defenders, once with the roles
swapped. Score the **pair**, not the two games separately:

| Both games | Category | Score |
|---|---|---|
| candidate wins both | `WW` | +1 |
| candidate loses both | `LL` | −1 |
| anything else (split, either game drawn/incomplete) | `split` | 0 |

Side bias affects both games in a pair identically — same opening, same
depth, only the attacker/defender assignment of the two configs is swapped —
so it cancels by construction. A real advantage has to win the pair outright;
a config that only benefits from defender-side bias splits its pairs (wins as
defender, loses as attacker) and nets to zero, same as pure noise would.

Openings are 2 plies sampled from the project's own opening book
(`src/game/openingBook.ts`, the `book2` scheme) rather than uniformly random
plies — measured cleanest for A/A bias; `random4` and `book4` (more
randomisation) measurably re-introduced a lingering bias in small samples
rather than averaging it out. See the file header of `pairgauntlet.ts` for the
full scheme comparison and the reasoning.

## What was validated, and by whom

Three pieces of evidence back this instrument. The provenance of each is kept
explicit, because the difference between "measured this session" and "measured
by a prior session and reported here" matters:

1. **A/A validation at depth 4 (prior session, W4a, not re-run here):**
   `DEFAULT_WEIGHTS` vs itself through the paired harness, book2 opening,
   depth 4, 16 pairs, seed 11 — `WW=3 LL=3 split=10 net=+0`. Exactly even,
   where the same configuration through the unpaired harness showed 87.5%
   defender bias. Full command and raw output in the prior session's handoff;
   not reproduced in this session's time budget.
2. **Known-positive calibration at depth 4 vs depth 3 (prior session, W4a, not
   re-run here):** the deeper search as candidate, 40 pairs total (two
   batches) — `WW=10 LL=0 split=30 net=+10`, two-sided exact binomial
   sign-test `p=0.00195` on the 10 decisive pairs. The instrument correctly
   credits a real, structural one-ply advantage and does not manufacture
   significance out of side bias alone (0 of 40 pairs went the other way).
3. **A/A spot-check at depth 2 (this session, `pairgauntlet.ts`, ported and
   re-run directly):** `npx tsx scripts/pairgauntlet.ts aa 2 20 7 book2` —
   `WW=2 LL=0 split=18 net=+2`, decisive pairs `2`, sign-test `p=0.5000`. Not
   the strong depth-4 validation above (a smaller, faster spot-check at a
   shallower depth, run to confirm the ported code path behaves as the source
   did), and not proof of zero bias on its own — 2 decisive pairs out of 20
   is too few to prove anything (see the power analysis below) — but it shows
   no lopsided split at a size where 87.5%-style bias would very plausibly
   still show through, and it exercises the exact code now shipped in this
   repository rather than a scratch copy of it.
4. **One real negative detected on live data (prior session, not re-run
   here):** the `quadrantCoverage` eval-weight term at weight 10, 40 pairs —
   `0W/13L/27split`, `p=0.000244`. The instrument is not purely a validation
   exercise; it has already changed a real go/no-go call.

**What this adds up to, stated carefully:** the instrument is validated
against one known-positive calibration (a real, structural search-depth
advantage) and has produced one statistically clear negative verdict on a
real candidate term. That is direct evidence it can detect both a true
positive and a true negative signal through the same side bias that defeated
the previous instrument. It is not evidence that every future verdict it
produces will be correct, and a run below the recommended pair count (below)
should not be read as a verdict at all.

## The power analysis — read before choosing a pair count

Most pairs split; only a minority are decisive (`WW` or `LL`), and the sign
test only has power over those. At the validated setting (book2, depth 4) the
A/A control's own decisive rate was 6 of 16 pairs (37.5%). Minimum `WW`-vs-`LL`
split among *decisive* pairs needed to cross `p<0.05` (exact two-sided
binomial, not a normal approximation):

| n decisive | min split for p<0.05 | p at that split |
|---|---|---|
| 6  | 6-0   | 0.0313 |
| 10 | 9-1   | 0.0215 |
| 16 | 13-3  | 0.0213 |
| 20 | 15-5  | 0.0414 |
| 24 | 18-6  | 0.0227 |
| 40 | 27-13 | 0.0385 |

At the observed 37.5% decisive rate, **16 total pairs give only about 6
decisive pairs — too few to ever reach significance short of a 6-0 sweep**, a
near-unanimous and very large effect. The depth-4-vs-3 calibration above
needed 40 pairs (~10 decisive) to cross significance for a large, unambiguous
one-ply effect. **Budget roughly 50-60 total pairs** (about 19-22 decisive at
the observed rate) as the working minimum for a real go/no-go call on a
moderate effect. A run of 10 or 16 pairs that comes back "even" has not shown
the candidate is neutral — it has not looked hard enough to tell either way.

This table, and the warning, are also in the `pairgauntlet.ts` file header —
deliberately duplicated, because a script argument list is what someone
actually reads before typing a command, and a docs page is what they read
before that. Someone will eventually run this with 10 pairs and be tempted to
believe the answer; both copies exist to stop that.

## The self-check test

`scripts/pairgauntlet.test.ts` (co-located, per the project's convention —
see `scripts/handadds.test.ts`) asserts three things, cheapest first:

1. `binomTwoSidedP` against hand-computable binomial pmf values (n≤4, plus the
   exact 6-0-at-n=6 threshold from the power table above) — independent of
   this file's own implementation, so a drift in the log-space sum would be
   caught even if the harness "looks right" by eye.
2. `categorize` — the pairing/scoring logic itself — against every letter
   combination (`WW`, `LL`, both mixed-split orders, and every combination
   involving a draw/incomplete `D`), which is the actual correctness property
   the whole instrument depends on: side bias cancels only if a pair scores
   ±1 exclusively when the *same* outcome held in both roles.
3. The calibration property itself, run for real (not mocked): depth 2
   (candidate) vs depth 1 (baseline), 20 pairs, book2 opening, seed 7 — a
   smaller, cheaper stand-in for the depth-4-vs-3/40-pair validation above,
   chosen because it is fully deterministic (fixed `maxDepth`, no deadline,
   seeded PRNG) and lands the same significant result (`WW=6 LL=0`,
   `p=0.03125`) in about 15-20s instead of several minutes. Exact counts are
   asserted, not just direction, because the run is reproducible byte-for-byte
   on any machine — only wall-clock time varies.

Verified to bite: inverting the `WW`/`LL` sign in `categorize` (a one-line
edit) failed all three of the `categorize` unit tests and the calibration
test's exact-count assertions, as expected. Reverted; the diff was byte-
identical to the pre-edit file.

## Numbers

- Suite before this change: 43 files / 981 tests, `npm test` ≈ 94.9s.
- Suite after: 44 files / 993 tests (+12), `npm test` ≈ 115.7s (+~21s) — in
  line with the co-located test's own measured 14-21s.
- `npx tsc -b --noEmit`: clean.

## Reproduce

```bash
# The two prior-session validation numbers cited above (not re-run this
# session; commands as recorded in the W4a handoff):
#   npx tsx paired_gauntlet.ts aa 4 16 11 book2
#   npx tsx paired_gauntlet.ts calibrate 4 3 16 21 book2   (+ a second 24-pair batch, seed 22)

# This session's spot-check, against the shipped script:
npx tsx scripts/pairgauntlet.ts aa 2 20 7 book2

# The self-check test's exact calibration run:
npx tsx scripts/pairgauntlet.ts calibrate 2 1 20 7 book2

# A real candidate-term evaluation (recommended size — several minutes):
npx tsx scripts/pairgauntlet.ts cand quadrantCoverage 4 60 31 book2
```

## What this report does not claim

- It does not claim `evaltune.ts`'s existing candidate verdicts were wrong —
  only that they were produced by an instrument now known to have a large,
  uncorrected side bias, and that re-checking them is future work, not done
  here.
- It does not claim the paired instrument is bias-free in general — only that
  it measured as unbiased under the one configuration (book2, depth 4) it was
  screened and validated at, and that other schemes (`random4`, `book4`)
  measured worse in the same screen.
- It does not claim 20-pair runs (this session's spot-check, and the
  self-check test) are adequate sample sizes for a real strength verdict —
  the power analysis above says plainly that they are not, and both are
  documented as calibration/spot-check runs, not go/no-go evidence.
