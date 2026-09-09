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

> **2026-09-09: everything down to "What this report does not claim" is a
> Brandubh record.** The instrument was Brandubh-only until that date; it now
> takes `--game brandubh|tablut|copenhagen`. The per-board validation for all
> three — A/A controls, measured side bias, known-positive calibrations,
> timings, and a recommended depth and pair budget each — is in
> **"The instrument on three boards"** at the foot of this file. Nothing above
> that heading says anything about Tablut or Copenhagen.

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

**2026-09-09 — the same property on the other two boards.** Two cases were
added, because a harness that works on a 7×7 corner-escape board is no evidence
at all about a 9×9 edge-escape one or an 11×11 board with shieldwall, exit fort
and encirclement terminals: `--game tablut calibrate 2 1 8 7 shallow2`
(`WW=4 LL=0`) and `--game copenhagen calibrate 2 1 3 7 shallow2` (`WW=1 LL=0`).
Both assert the same invariant — `LL === 0` and `WW > 0` — and neither asserts
a p-value, for the same power reason. Both were observed failing first, by the
same `categorize()` inversion:

```
 × Tablut: depth 2 never loses a decisive pair to depth 1 over 8 mirrored pairs …
   → expected 4 to be +0
 × Copenhagen: depth 2 never loses a decisive pair to depth 1 over 3 mirrored pairs …
   → expected 1 to be +0
```

The Copenhagen case costs minutes, not the ~30 s the Tablut case does, and that
is the board rather than a tuning choice: 116 root moves, three extra terminal
checks per node, and games of 14 to 151 plies put a single mirrored pair at
45–90 s, so **no pair count above zero fits a 60 s budget on this board**.
Three pairs is the smallest that carries the property at this seed.

**It is therefore gated, not deleted** (branch `wp/1-1b-gate-copenhagen-ci`),
behind `GAUNTLET_DEEP` — the same idiom, for the same reason, that gates the
Copenhagen depth-3 perft pins behind `PERFT_DEEP` in
`src/game/copenhagen/searchInvariants.test.ts`:

```bash
GAUNTLET_DEEP=1 npx vitest run scripts/pairgauntlet.test.ts
```

Gating is not a free lunch and the test body says so: this is the only check
that the instrument still means anything on the largest board, so **a green
suite without `GAUNTLET_DEEP` set says nothing about Copenhagen.** Running it is
mandatory before landing a change to a Copenhagen weight or to
`src/game/copenhagen/{engine,rules,variants,d4}.ts`, and before any change to
the shared search core, the `GameAdapter` interface, or `pairgauntlet.ts`
itself. The Brandubh and Tablut cases stay ungated and run on every suite.

## Numbers

- Suite before this change: 43 files / 981 tests, `npm test` ≈ 94.9s.
- Suite after: 44 files / 993 tests (+12), `npm test` ≈ 115.7s (+~21s) — in
  line with the co-located test's own measured 14-21s.
- `npx tsc -b --noEmit`: clean.

**2026-09-09, after the three-board work** (branch
`wp/1-1-pairgauntlet-all-boards`, off `main` at `b8afc9a`):

- `npx vitest run`: **51 files / 1152 tests, all passing, zero failures**, 323.8s
  wall on `nproc=4` at load 4–8.
- `scripts/pairgauntlet.test.ts` went from 12 tests / 21.5s to **14 tests /
  261.6s**: Brandubh 37.5s (unchanged case), Tablut 53.1s, **Copenhagen
  170.9s**, which made that file the suite's critical path on its own.
- `npx tsc -b --noEmit`: clean.

**Superseded the same day, on `wp/1-1b-gate-copenhagen-ci`:** the Copenhagen
case is gated behind `GAUNTLET_DEEP` (see "The self-check test" above). Measured
on a quiet machine, `nproc=4`, load 1.37 → 4.56:

- default (`npx vitest run scripts/pairgauntlet.test.ts`): **13 passed, 1
  skipped, 40.0s** — Brandubh 13.4s, Tablut 25.6s.
- with the flag (`GAUNTLET_DEEP=1 …`): **14 passed, 0 skipped, 355.9s** —
  Brandubh 20.4s, Tablut 55.2s, Copenhagen 279.2s.
- `npx tsc -b --noEmit`: clean.

The two runs disagree by 2–3× on the shared cases despite an idle-looking
machine, which is the load-and-seed variance described under "How to read the
timings" showing up in the test suite as well.

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

# 2026-09-09 — the other two boards. Every command in the three per-board
# sections at the foot of this file, plus the two new self-check cases:
npx tsx scripts/pairgauntlet.ts --game tablut     aa 3 24 2101 shallow2
npx tsx scripts/pairgauntlet.ts --game copenhagen aa 2 24 3101 shallow2
npx tsx scripts/pairgauntlet.ts --game tablut     calibrate 3 2 20 2201 shallow2
npx tsx scripts/pairgauntlet.ts --game copenhagen calibrate 2 1 20 3301 shallow2

# Candidate weights per game, named or as JSON merged over that game's
# DEFAULT_WEIGHTS (an unknown key is a hard error, not a silent no-op):
npx tsx scripts/pairgauntlet.ts --game tablut cand liberties 3 40 41 shallow2
npx tsx scripts/pairgauntlet.ts --game tablut cand '{"liberties":12}' 3 40 41 shallow2
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

Added 2026-09-09, for the three-board section below:

- It does not claim any Tablut or Copenhagen **weight** has been measured.
  Nothing in this session touched a weight or an engine file. What was
  measured is the *instrument* on those boards: that its A/A control comes out
  even, that it credits a known one-ply advantage, what each board's side bias
  and decisive rate actually are, and what a run costs. That is the
  precondition for tuning, not tuning.
- It does not claim `FULL_CONFIG.usePVS` — `true` on Tablut and Copenhagen,
  `false` on Brandubh, and unmeasured everywhere — is right. It was used as it
  ships, because the instrument must measure the engine that plays. It is now
  a measurable question rather than an unmeasurable one, and it is still open.
- It does not claim `shallow2` is as good an opening scheme as `book2`, or
  better. On Brandubh, where both can run, `shallow2` measured a *lower* side
  bias and a *higher* decisive rate on the same 24 pairs — but that is one
  comparison at one depth and one seed, and the deep offline book and a
  depth-2 live search are not the same kind of object.
- It does not claim the timing figures are benchmarks. They were taken on a
  machine shared with other agents' test runs, at load averages from 3.06 to
  12.89, and the same configuration varied about 4× across that range and about
  2.4× across two seeds. Pair *results* are unaffected: fixed depth, no
  deadline, seeded PRNG, so every run replays byte-identically.

---

# The instrument on three boards — 2026-09-09

**Everything above this line is a Brandubh record.** Until 2026-09-09
`scripts/pairgauntlet.ts` imported `../src/game/engine` directly, hard-coded
`const rules = VARIANTS.wtf`, and defaulted to an opening scheme that walks a
book only Brandubh has. It could not be pointed at another board, so every
number above — the 87.5% side bias, the depth-4-over-3 calibration, the
`liberties` verdict, the `quadrantCoverage` rejection — is a fact about a 7×7
corner-escape board under WTF and about nothing else. Meanwhile every Tablut
and Copenhagen eval weight carries the comment "reasoned, not tuned; do not
quote as measured", and `FULL_CONFIG.usePVS` ships **true** on both larger
boards and **false** on Brandubh with no measurement behind the difference.

The instrument now takes `--game brandubh|tablut|copenhagen`. This section
records what that cost, what was checked before it was believed, and — per
board, because a board's own validation is the only thing that licenses a
verdict on it — the A/A control, the measured side bias, the known-positive
calibration, the timing, and a recommended working depth and pair budget.

## Regression guard: the Brandubh path did not move

Before any refactoring, four runs covering all three modes and three opening
schemes were captured and then re-run byte-for-byte against the refactored
script:

```bash
npx tsx scripts/pairgauntlet.ts calibrate 2 1 20 7 book2
npx tsx scripts/pairgauntlet.ts aa 3 16 11 book2
npx tsx scripts/pairgauntlet.ts cand liberties 2 12 13 random4
npx tsx scripts/pairgauntlet.ts aa 2 10 3 none
```

58 mirrored pairs, 116 games. **All 58 per-pair result lines and every
`WW`/`LL`/`split`/`net`/`decisive`/`p`/`incomplete` statistic are identical
before and after** — 66 lines, `md5 c704bf3fc16dee710d91ee06b0195351` on both
sides. Three kinds of line differ, all three deliberately:

- the run label now names the board and ruleset (`game=brandubh rules=wtf`),
  because a captured stdout that does not say which of three boards it measured
  is not a record;
- a new `side split` line reports the raw per-side win count (below);
- wall-clock time, which is wall-clock time.

## The side split is now printed, and it is not reassuring

The whole design rests on side bias cancelling within a pair. That was
argued from construction and never printed, so it was being assumed handled
rather than observed. Every summary now ends with the raw games won by each
*side* across all 2N games, with the pairing **not** applied — the quantity
the instrument exists to neutralise. The first four runs back reported
defenders on **90.0%, 90.6%, 54.2% and 35.0%**, and the per-board figures
below range from 56.3% to 91.7%. This is a diagnostic, not a result: a large
side split is exactly the condition the pairing is for, and a pair-level net
near zero in the presence of one is the instrument working. It is on the page
so that nobody has to take that on trust again.

## `book2` is Brandubh-only; `shallow2` is the replacement

`src/game/openingBook.ts` is a file of Brandubh 7×7 positions generated under
the WTF ruleset and keyed by that game's `hashBoard`. Tablut and Copenhagen
ship no book at all, so `book2`/`book4` cannot mean anything there. Asked for
on either board they are now a **hard error before any game is played**, not a
silent fallback to random moves: a scheme that quietly degraded would put a
name in the run label that did not describe the run.

`shallow2` (and `shallow4`) replace it, and are the default on the two larger
boards. N plies are played by a fixed-depth search — every root move within 50
of the best at depth 2, from `scoreRootMoves`, the same multi-PV query the book
generator uses — choosing uniformly among them from the pair's seeded PRNG.
Deterministic: no deadline anywhere, and the transposition table is cleared
before each ply so a table left warm by the previous pair's games cannot make
the openings depend on run order rather than on the seed. At the standard
opening position that is 5 near-best root moves on Brandubh, 4 on Tablut and 15
on Copenhagen — root moves are D4-folded, so those are distinct orbits, not
mirror images of each other — for under 70 ms a ply on the largest board.

It gives what `book2` gives: openings that are sane rather than uniformly
random, identical within a pair, and different across pairs. It is **not** the
book. The book is a deep offline product; this is a shallow live search, and
the two are not interchangeable even on Brandubh, which is why the Brandubh A/A
control below was run under both.

## How to read the timings

Every figure in this section was measured on a 4-core machine (`nproc=4`) that
was shared with other agents' test runs throughout. One-minute load averages
are quoted before and after each run and ranged from **3.06 to 12.89**. Tablut
at depth 3 measured **17.5 s/pair at load 3.26 and 74.3 s/pair at load 11.52**,
and Copenhagen at depth 2 measured **18.0 s/pair and 43.0 s/pair on two pairs
each at similar load, differing only in seed** — so a figure here carries about
a 4× load factor *and* a 2× seed factor, and should be read as an order of
magnitude, not a benchmark. The pair *results* carry none of it: fixed
`maxDepth`, no deadline anywhere, seeded PRNG, so every run below is a
byte-identical replay on any machine at any load. Only the clock moves.

Two contaminations were found and dealt with rather than absorbed:

1. A Brandubh `shallow2` A/A run was started while `categorize()` was
   temporarily inverted (for the observed-failing check on the new tests) and
   picked up the inverted module at process start. It was discarded and re-run.
2. A shell-quoting mistake launched **four** copies of the same Brandubh job at
   once, which is most of why the load averages between 12:22 and 12:47 read 10
   to 14. Three were killed; the timings measured in that window (Tablut's, in
   particular) are inflated and are labelled as such.

Both were caught by `logs/audit-pairlines.py`, which re-derives each printed
pair's category from its own two game letters using the pairing rule restated
from scratch, and so does not depend on the code that produced the file. A run
made with an inverted `categorize()` prints `atk=L def=L -> WW`, which no
correct run can print. Every run reported here, the regression captures
included, was audited: **0 mismatches in 336 pair lines.** The contaminated run
showed 8 mismatches in its 14 lines, which is how it was found.

### Provenance: what survives, and what does not

The raw stdout of every run, the audit script, and an independent re-derivation
of each summary from its own pair lines (which reproduced every `WW`/`LL`/
`split`/`p` figure the script printed) were kept untracked in the working
branch's `logs/` directory and were **not committed**. That directory was
deleted with the worktree when the branch merged, so it is gone. Being explicit
about the consequence, rather than leaving the reader to discover it:

**Re-derivable from what is committed** — every *result* in this section. Each
run is a fixed depth with no deadline and a seeded PRNG, and every command line
and seed is printed below, so re-running any of them reproduces its pair
letters, `WW`/`LL`/`split`/`net`/`decisive`, p-value and side split exactly, on
any machine. That is what recording the seeds was for. It costs machine time
(the Copenhagen rows, hours) but nothing is lost.

**Not re-derivable**, and to be read as claims with a stated source rather than
as reproducible facts:

- **Every ms/pair figure and every load average.** Properties of one shared
  4-core machine at one moment; re-running gives different numbers. They were
  never reproducible and the timing section already says so.
- **The regression guard's `md5 c704bf3fc16dee710d91ee06b0195351`.** The
  captured pre-refactor output is gone. It can be *rebuilt* — the pre-refactor
  `scripts/pairgauntlet.ts` is in git history at `b8afc9a` — by running the four
  commands under both versions and hashing the same line selection, which was
  `grep -E '^  pair |^pairs=|^decisive '` over the concatenated stdout of the
  four runs in the order listed. That filter is recorded here precisely so the
  hash is not orphaned. Until someone does that, the hash is a claim.
- **"336 pair lines, 0 mismatches."** Needs both the logs and the audit script,
  and has neither. The check itself is a dozen lines and is fully described
  above (re-derive each pair's category from its own two letters and compare
  with the printed one); rebuilding it is easy, re-running everything under it
  is not.
- **The two contaminations** — the run that picked up the inverted
  `categorize()`, and the four duplicated jobs. Both narratives rest on logs
  that no longer exist. They are recorded because a reader deserves to know the
  timings between 12:22 and 12:47 were taken on an over-subscribed machine, not
  because anyone can now check it.
- **The abandoned Copenhagen `calibrate 3 2` run** (4 of 20 pairs in 34
  minutes). Already reported as not-reported; its log is gone too.

None of the above touches a result. What is unverifiable is the timing, the
hygiene checks and the incident narrative — not a single `WW`, `LL` or
p-value.

---

## Instrument validation: Brandubh (7×7, `wtf`) — 2026-09-09

### A/A control — DEFAULT_WEIGHTS against itself, depth 4, 24 pairs

```bash
npx tsx scripts/pairgauntlet.ts --game brandubh aa 4 24 1101 book2
npx tsx scripts/pairgauntlet.ts --game brandubh aa 4 24 1101 shallow2
```

| opening | WW | LL | split | net | decisive | p | side split (raw games) |
|---|---|---|---|---|---|---|---|
| `book2`    | 3 | 1 | 20 | +2 | 4 (16.7%)  | 0.6250 | attackers 4, defenders 44 — **defenders 91.7%** |
| `shallow2` | 3 | 7 | 14 | −4 | 10 (41.7%) | 0.3438 | attackers 14, defenders 34 — **defenders 70.8%** |

Both consistent with zero, as an A/A control must be. Two findings sit
underneath that:

- **The side bias on this board is enormous and is still there.** Under
  `book2` at depth 4, defenders won 44 of 48 games with byte-identical code on
  both sides. That is *worse* than the 87.5% that motivated building this
  instrument in 2026-09-01. It is not a regression in the instrument — it is
  the board, and the pairing is what makes it survivable. `shallow2` openings
  cut it to 70.8%.
- **`book2`'s decisive rate has collapsed to 16.7%**, from the 37.5% recorded
  in the power analysis above. That matches what `ROADMAP.md` already noted
  when `liberties` shipped at 12: the depth-2-vs-1 self-check dropped from 6
  decisive pairs to 4 under the new weights. `shallow2` recovers it to 41.7%.
  Decisive rate is what the sign test has power over, so this directly sets the
  pair budget — see below.

Timing: 22.8 s/pair (`book2`, load 3.70 → 9.73) and 22.5 s/pair (`shallow2`,
load 12.89 → 3.99).

### Known-positive calibration — depth 4 (candidate) vs depth 3 (baseline)

```bash
npx tsx scripts/pairgauntlet.ts --game brandubh calibrate 4 3 20 1201 shallow2
npx tsx scripts/pairgauntlet.ts --game brandubh calibrate 4 3 40 1202 shallow2
```

| batch | pairs | WW | LL | split | net | decisive | p |
|---|---|---|---|---|---|---|---|
| seed 1201 | 20 | 5 | 0 | 15 | +5 | 5 (25.0%) | 0.0625 |
| seed 1202 | 40 | 13 | 2 | 25 | +11 | 15 (37.5%) | **0.0074** |
| **pooled** | **60** | **18** | **2** | **40** | **+16** | **20 (33.3%)** | **0.000402** |

Side split, pooled: attackers 22, defenders 98 of 120 games — defenders 81.7%.
Timing: 10.3 s/pair (load 3.99) and 13.5 s/pair (load 3.71).

The instrument credits the real, structural one-ply advantage. Note that the
first batch, at the 20 pairs this task called for, returned **5–0 and
`p=0.0625` — the right answer and not a significant one**, because 5 decisive
pairs cannot cross `p<0.05` at any split (the power table needs 6, and only at
a clean sweep). That is the power analysis biting on a known-true effect, and
it is the reason the budget below is what it is.

### Recommendation for the tuning phase

- **Working depth: 4**, as before; ~10–23 s/pair.
- **Opening scheme: `shallow2`, not `book2`.** It measured a lower side bias
  (70.8% vs 91.7%) and more than twice the decisive rate (41.7% vs 16.7%) on
  the same 24 pairs at the same depth and seed. `book2` is not wrong, it is
  just much less informative per pair now that `liberties` ships at 12.
- **Minimum pair budget: 60 on `shallow2`.** At the measured 33–42% decisive
  rate that yields ~20–25 decisive pairs, which the power table says can reach
  `p<0.05` at a 15–5 split or better. On `book2`, the same 20 decisive pairs
  would need **~120 total pairs**; budget accordingly or switch scheme.

---

## Instrument validation: Tablut (9×9, `tablut-linnaeus`) — 2026-09-09

### A/A control — depth 3, 24 pairs

```bash
npx tsx scripts/pairgauntlet.ts --game tablut aa 3 24 2101 shallow2
```

`WW=9 LL=4 split=11 net=+5`, decisive 13 of 24 (**54.2%**), sign-test
`p=0.2668`. Side split: attackers 21, defenders 27 of 48 — **defenders 56.3%**.
Timing 83.0 s/pair, but inside the four-way-oversubscription window described
above (load 3.70 → 11.03); a 2-pair probe at the same depth and scheme (seed
101) measured **17.5 s/pair** at load 3.26.

Consistent with zero. Two findings:

- **Tablut's side bias is small.** 56.3% defenders, against Brandubh's 91.7%
  under `book2` and 70.8% under `shallow2`, and Copenhagen's 77.1%. This is the
  one place the three boards differ in kind rather than in degree. The obvious
  reading — that a king escaping to any edge square is a different problem for
  the raiders than one escaping to four corners — is a guess, not something
  this measurement establishes; what it establishes is the number.
- **Its decisive rate is the highest of the three, at 54.2%**, so it is the
  *cheapest* board to get a verdict out of per pair played — the opposite of
  what board size would suggest.

### Known-positive calibration — depth 3 (candidate) vs depth 2 (baseline)

```bash
npx tsx scripts/pairgauntlet.ts --game tablut calibrate 3 2 20 2201 shallow2
```

`WW=12 LL=2 split=6 net=+10`, decisive 14 of 20 (70.0%), sign-test
**`p=0.0129`**. Side split: attackers 14, defenders 26 of 40 — defenders 65.0%.
Timing 35.4 s/pair (load 11.03 → 11.66, oversubscribed).

Significant at 20 pairs, on this board, in one batch — the only one of the
three that managed it.

### Recommendation for the tuning phase

- **Working depth: 3.** Depth 4 is reachable but costs about 12× as much
  (206.5 s/pair against 17.5 s/pair, timing table below), and depth 3 already
  carries the one-ply calibration cleanly at 20 pairs.
- **Minimum pair budget: 40.** At the measured 54–70% decisive rate that is
  ~22–28 decisive pairs, comfortably past the 20 the power table wants. Tablut
  is the board where the standard 50–60 recommendation is *more* than needed.
- Nothing here licenses moving a Tablut weight yet. It licenses *measuring* one:
  `liberties`, `shield` and `mobility` are all parked at 0 on this board and
  none has ever been gauntleted here.

---

## Instrument validation: Copenhagen (11×11, `copenhagen`) — 2026-09-09

### A/A control — depth 2, 24 pairs

```bash
npx tsx scripts/pairgauntlet.ts --game copenhagen aa 2 24 3101 shallow2
```

`WW=4 LL=4 split=16 net=+0`, decisive 8 of 24 (33.3%), sign-test `p=1.0000`.
Side split: attackers 10, defenders 37, 1 incomplete of 48 — **defenders
77.1%**. Timing 124.2 s/pair (load 3.70 → 7.17, oversubscribed); an
uncontended 2-pair probe measured **43.0 s/pair** at load 3.26–4.61, and a
second at a different seed measured 18.0 s/pair.

Dead even — net exactly zero — against a 77.1% raw side split. That is the
clearest single demonstration in this document of what the pairing does.

### Known-positive calibration — depth 2 (candidate) vs depth 1 (baseline)

```bash
npx tsx scripts/pairgauntlet.ts --game copenhagen calibrate 2 1 20 3301 shallow2
npx tsx scripts/pairgauntlet.ts --game copenhagen calibrate 2 1 20 3302 shallow2
```

| batch | pairs | WW | LL | split | net | decisive | p |
|---|---|---|---|---|---|---|---|
| seed 3301 | 20 | 5 | 0 | 15 | +5 | 5 (25.0%) | 0.0625 |
| seed 3302 | 20 | 6 | 0 | 14 | +6 | 6 (30.0%) | **0.0313** |
| **pooled** | **40** | **11** | **0** | **29** | **+11** | **11 (27.5%)** | **0.000977** |

Side split, pooled: attackers 12, defenders 64, 4 incomplete of 80 — defenders
80.0%. Timing 83.8 s/pair (load 8.58) and 70.1 s/pair (load 3.06).

**Eleven decisive pairs, all eleven to the deeper search, none the other way.**
As on Brandubh, the first 20-pair batch had the right sign and missed
significance for want of decisive pairs; two batches clear it comfortably.

A `calibrate 3 2 20 3201 shallow2` run was also started, and is a genuinely
different proposition on this board: the timing table below puts **one**
depth-3 mirrored pair at 17 minutes, so a 20-pair run is close to six hours. It
was stopped after 34 minutes with 4 of its 20 pairs written to its log (stdout
to a file is block-buffered, so it may have finished a few more). It is **not
reported**: a partial run at a pair count nobody chose in advance is a number
with a stopping rule attached to it, and the depth-2-vs-1 calibration above
already establishes the property on this board at 40 pairs and p=0.000977.

### Recommendation for the tuning phase

- **Working depth: 2.** This is not a preference, it is the only depth that is
  usable. **One** depth-3 mirrored pair measured 1,017 s — seventeen minutes —
  on a quiet machine, which puts a 60-pair depth-3 run at about seventeen
  hours.
- **Minimum pair budget: 70.** At the measured 27–33% decisive rate that gives
  ~19–23 decisive pairs. At 18–124 s/pair, budget **half an hour to two and a
  half hours of wall clock per candidate** and run it detached, not in a
  session.
- Copenhagen is the board where the power analysis hurts most: under
  `shallow2` it has the worst decisive rate of the three (33.3% against
  Tablut's 54.2%) *and* the worst cost per pair, so a run of equivalent
  statistical power costs roughly **4× the machine time of the same question on
  Tablut** (70 pairs × ~43 s against 40 × ~17.5 s). Screen candidates on Tablut
  and Brandubh first and bring only survivors here.

---

## Timing

`aa` runs at fixed depth with `shallow2` openings, seed 909, on `nproc=4` with
other agents' work in flight; one-minute load average quoted per row. See "How
to read the timings" above. Rows for the same board and depth differ by up to
4× from load and seed alone, and the two single-pair Copenhagen rows differ
from each other in the wrong direction entirely, so read these as orders of
magnitude and not as a benchmark.

| board | depth | ms/pair | load (1-min) | source |
|---|---|---|---|---|
| Brandubh | 3 | 3,826 | 3.08 | timing pass |
| Brandubh | 4 | 10,296 – 45,495 | 3.99 – 11.52 | calibration run / timing pass |
| Tablut | 2 | 3,461 | 3.26 | uncontended probe |
| Tablut | 3 | 17,542 | 3.26 | uncontended probe |
| Tablut | 3 | 74,277 – 83,008 | 8.88 – 11.03 | timing pass / A/A run |
| Tablut | 4 | 206,515 | 8.88 | timing pass (2 pairs) |
| Copenhagen | 2 | 18,004 | 6.95 | timing pass (2 pairs, seed 909) |
| Copenhagen | 2 | 42,968 | 3.26 → 4.61 | probe (2 pairs, seed 101) |
| Copenhagen | 2 | 70,118 – 124,178 | 3.06 – 7.17 | calibration / A/A runs (20–24 pairs) |
| Copenhagen | 3 | **1,017,328** | 5.11 → 2.59 | timing pass (1 pair) — **17 minutes for one mirrored pair** |
| Copenhagen | 4 | 360,179 | 2.59 → 1.46 | timing pass (1 pair) — see the note below |

Two things in that table are worth not glossing over.

**Copenhagen depth 4 measured FASTER than depth 3** — 360 s/pair against
1,017 s/pair, on the same seed, on a quieter machine. That is not a
mis-transcription. Cost here is dominated by how many plies the games run, not
by nodes per ply: a deeper search converts a won position sooner, and
`pickMove`'s iterative deepening stops at the first depth where a root move is
decisive. Both of those rows are **one mirrored pair**, which is an anecdote,
and the inversion is the clearest possible demonstration that one pair is not a
measurement. Neither figure should be used to budget anything; they are here to
say "depth 3 and 4 on this board are in the tens-of-minutes-per-pair range",
which is all one pair can support.

The same effect at a smaller scale in the Copenhagen depth-2 rows: 18.0 s/pair
at seed 909 against 43.0 s/pair at seed 101, both two pairs at similar load. So
**ms/pair varies with the seed about as much as with the machine**. Budget from
the 20-pair and 24-pair runs, not from a probe.

The shape to take away, from the multi-pair rows only: **one ply of depth costs
roughly 3–12× on the two smaller boards** (Brandubh 3→4, 3.8s → 10–45s; Tablut
2→3→4, 3.5s → 17.5s → 206s), **and each step up in board size costs roughly
5–10× at equal depth** (depth 3: Brandubh 3.8s, Tablut 17.5s). Copenhagen sits
an order of magnitude beyond that again even at depth 2, and its depth-3 and
depth-4 costs are known only to within "tens of minutes per pair". That is why
the working depth recommended for that board is 2.

## Summary: recommended settings for the tuning phase

| board | depth | opening | min pairs | measured decisive rate | measured side bias (defenders) | est. wall clock per run |
|---|---|---|---|---|---|---|
| Brandubh | 4 | `shallow2` | 60 | 33–42% | 70.8% (`shallow2`) / 91.7% (`book2`) | 10–25 min |
| Tablut | 3 | `shallow2` | 40 | 54–70% | 56.3% | 12–55 min |
| Copenhagen | 2 | `shallow2` | 70 | 27–33% | 77.1% | 20–145 min |

Every row of that table is measured in this section. None of it is a claim
about any weight on any board: it is the size of run needed before a weight
verdict on that board would mean anything.
