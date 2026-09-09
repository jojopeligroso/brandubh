# `usePVS` on Tablut and Copenhagen — settled by measurement (WP-2.0)

**Date: 2026-09-09.** Machine: 4 cores (`nproc`), shared with other agents'
work throughout (`uptime` load averages quoted per run).

## Background

Brandubh's `usePVS` (`src/game/engine.ts`) ships **off**, on a measured
verdict recorded in commit `4f76471`: "±1% nodes, identical scores at depths
5-7" — smart ordering + the TT + LMR already tighten the search windows, so
null-window scouting has nothing left to save. The comment kept the flag as "a
knob for wider-branching variants (Tablut)".

Tablut and Copenhagen shipped `usePVS: true` anyway, and both `FULL_CONFIG`
comments say so explicitly: "a considered default rather than a measured
one. A gauntlet should settle it." The premise (wider branching means PVS has
more to save) was itself never fully checked either — Tablut's own comment
notes the branching-factor claim it was reasoning from ("roughly three times")
was corrected by counting to "half again to twice" once someone counted.

This report is that gauntlet: the same shape of measurement Brandubh's verdict
was built on, reproduced on both larger boards.

## Method

1. **Equal-depth node counts** (`scripts/pvsbench.ts`, modelled on
   `scripts/aibench.ts`): for a set of ≥12 positions per board — the opening,
   hand-built tactical fixtures lifted verbatim from each game's own
   `engine.test.ts`/`searchInvariants.test.ts`, and positions sampled from a
   deterministic seeded self-play walk (`mulberry32(20260909)`, `FULL_CONFIG`
   at depth 2, TT cleared every ply, sampled every 5 plies to ply 40) — run
   `pickMove` with `usePVS: true` and `usePVS: false`, all else
   (`FULL_CONFIG`, `DEFAULT_WEIGHTS`, fixed depth, no deadline, `rng = () =>
   0.5`) held equal. PVS is a pure search optimisation: the SCORE at equal
   depth must be identical between the two configs — any difference is a bug,
   not a result — and every run below reports zero mismatches. Node ratio
   (PVS-on nodes / PVS-off nodes) is the actual measurement.
2. **Wall-clock at the shipping ladder limits** (`medium`: `maxDepth 3,
   deadlineMs 2500`; `hard`: `maxDepth 6, deadlineMs 3000, minDepth 3`;
   `ollamh`: `maxDepth 12, deadlineMs 8000, minDepth 4` — identical on both
   boards, copied from the `DIFFICULTY` tables in
   `src/game/tablut/engine.ts`/`src/game/copenhagen/engine.ts`, which are
   module-local and not exported): same positions, PVS on vs off, depth
   reached and elapsed ms. Since (1) rules out a score effect at equal depth,
   this is the only channel through which PVS could still buy strength —
   reaching deeper before the clock runs out.
   **New constraint from the owner (decided after the measurement brief):**
   on Copenhagen, `hard` and `ollamh` will stay disabled in the UI until the
   app has a backend. All three tiers are reported below for both boards, but
   on Copenhagen `medium`'s 2500ms deadline is the only one a player can
   currently reach — see the per-board "which tiers are reachable" note.
3. **Paired gauntlet** (`scripts/pairgauntlet.ts`'s new `pvs` mode — added
   this session, see "Harness change" below), run only because (1) showed a
   node-count difference above the ~3% either-way threshold on both boards:
   candidate = PVS off, baseline = PVS on, `DEFAULT_WEIGHTS` both sides, same
   depth both sides. Tablut at depth 3, 40 pairs, `shallow2`; Copenhagen at
   depth 2, 70 pairs, `shallow2` — the exact depth/pair recommendations from
   `docs/reports/paired-gauntlet-instrument.md`'s per-board validation.

## Harness change: `pairgauntlet.ts` gained a `pvs` mode

`scripts/pairgauntlet.ts`'s existing `cand` mode varies `Weights` only — every
adapter's `search` hard-coded `FULL_CONFIG`, so there was no way to gauntlet a
`SearchConfig` flag like `usePVS` through the existing instrument. Minimal,
adapter-boundary-respecting extension (`scripts/gauntlet/adapter.ts`):

- A `Config` type, opaque outside its own adapter — same pattern as the
  existing opaque `Weights` type, for the same reason (the gauntlet must never
  read a field, or the three forked config shapes would leak into it, except
  they don't fork: `SearchConfig` happens to be identical across all three
  boards today).
- `GameAdapter.defaultConfig` (each board's `FULL_CONFIG`) and
  `GameAdapter.pvsConfig(on: boolean)` (that config with `usePVS` forced),
  implemented identically in `brandubh.ts`/`tablut.ts`/`copenhagen.ts`.
- `search(...)` takes an optional trailing `config` param, defaulting to
  `defaultConfig` — every existing call site (all of `cand`/`aa`/`calibrate`,
  and the co-located test) is unaffected because the param is optional and
  trailing.
- `playFrom`/`playPair`/`runGauntlet` gained optional trailing
  `candConfig`/`baseConfig` params, threaded through the same way weights are
  (following the candidate/baseline role, not the attacker/defender side, so
  mirroring still cancels side bias).
- CLI: `npx tsx scripts/pairgauntlet.ts [--game <id>] pvs <depth> <pairs>
  <seed> [opening]` — candidate = PVS off, baseline = PVS on.

No existing call signature changed shape; `scripts/pairgauntlet.test.ts`'s
pinned self-checks are unaffected (verified: `npx vitest run` below).

## Results

Full raw output for every run below is in `docs/reports/pvs-raw/` (copied out
of the worktree's `logs/` so it survives worktree removal):
`pvsbench-tablut.txt`, `pvsbench-copenhagen.txt`, `pairgauntlet-tablut-pvs.txt`,
`pairgauntlet-copenhagen-pvs.txt`.

### Tablut (9×9)

**13 positions**: opening; the `searchInvariants.test.ts` 12-ply midgame
fixture; 4 hand-built tactics from `engine.test.ts` (king capture in one move,
escape one move away, two-lane fork, king must dodge a capture); 8 self-play
samples (`mulberry32(20260909)`, `FULL_CONFIG` at depth 2, sampled every 5
plies to ply 40).

```
npx tsx scripts/pvsbench.ts --game tablut --depths 3,4,5 --ladder-positions 6
```

Run at `nproc=4`, load 4.2 → 4.9 (`uptime` before/after). **Zero score
mismatches at any depth on any position** — the correctness invariant PVS is
required to hold.

Node ratio (PVS-on nodes / PVS-off nodes):

| depth | min | median | mean | max | positions past ±3% | mismatches |
|---|---|---|---|---|---|---|
| 3 | 0.983 | 1.031 | 1.041 | 1.143 | 7/13 | 0 |
| 4 | 0.983 | 1.037 | 1.034 | 1.080 | 7/13 | 0 |
| 5 | 0.938 | 1.000 | 1.051 | 1.453 | 6/13 | 0 |

PVS costs MORE nodes than plain alpha-beta at equal depth on most of these
positions — the opposite of "wider board, PVS has more to save". This crossed
the ~3% either-way threshold in the WP-2.0 brief, so the paired gauntlet ran
(below).

Ladder wall-clock (same 13 positions; `medium`/`hard` use all 13, `ollamh`
uses the 6 curated non-self-play positions to bound run time):

| tier | limit | depth reached: on vs off | wall time |
|---|---|---|---|
| `medium` | 2500ms, cap 3 | **tied on all 13** | 69ms-1062ms range |
| `hard` | 3000ms, cap 6, floor 3 | off ≥ on on all 13; off strictly deeper on 2/13 (midgame fixture: 3 vs 5; self-play ply 5: 3 vs 4) | up to 3.0s |
| `ollamh` | 8000ms, cap 12, floor 4 | tied on all 6 | up to 5.2s |

PVS never reached a deeper depth than PVS-off on any position at any tier;
where they differ, PVS-off was ahead.

**Paired gauntlet** (candidate = PVS off, baseline = PVS on, `DEFAULT_WEIGHTS`
both sides — this board's own recommended depth/pairs from
`docs/reports/paired-gauntlet-instrument.md`):

```
npx tsx scripts/pairgauntlet.ts --game tablut pvs 3 40 21010 shallow2
```

`WW=6 LL=10 split=24 net=-4`, decisive 16/40 (40.0%), sign-test **p=0.4545**
— not significant. Side split: attackers 26, defenders 54 of 80 (defenders
67.5%). Wall time 705.5s (17.6s/pair), load 7.5 → 1.9 across the run. 40 pairs
is this board's own recommended floor (not a run cut short).

### Copenhagen (11×11)

**14 positions**: opening; the `searchInvariants.test.ts` 12-ply midgame
fixture; 5 hand-built tactics from `engine.test.ts` (king capture in one move
against a strong king, escape in hand, exit fort one move away, shieldwall
one move away — the two fixtures unique to this board); 8 self-play samples
(same recipe as Tablut, to ply 40).

```
npx tsx scripts/pvsbench.ts --game copenhagen --depths 2,3,4 --ladder-positions 6
```

Run at `nproc=4`, load 4.2 → 4.9. **Zero score mismatches at any depth on any
position.**

Node ratio (PVS-on nodes / PVS-off nodes):

| depth | min | median | mean | max | positions past ±3% | mismatches |
|---|---|---|---|---|---|---|
| 2 | 0.798 | 1.014 | 1.008 | 1.082 | 6/14 | 0 |
| 3 | 1.000 | 1.009 | 1.022 | 1.148 | 4/14 | 0 |
| 4 | 0.996 | 1.008 | 1.026 | 1.094 | 4/14 | 0 |

Smaller overhead than Tablut's, but the same sign: 4-6 of 14 positions at
each depth cross the ±3% bar, and all but one of the crossings cost MORE
nodes with PVS on (the depth-2 min of 0.798 is the single exception).

Ladder wall-clock (same 14 positions for `medium`/`hard`; `ollamh` on the 6
curated non-self-play positions):

| tier | limit | depth reached: on vs off | wall time | UI-reachable today? |
|---|---|---|---|---|
| `medium` | 2500ms, cap 3 | **tied on all 14** | 134ms-1486ms | **yes** |
| `hard` | 3000ms, cap 6, floor 3 | tied on 13/14; off strictly deeper on 1/14 (self-play ply 15: 3 vs 4) | up to 3.05s | no (parked pending backend) |
| `ollamh` | 8000ms, cap 12, floor 4 | tied on all 6 | up to 5.7s | no (parked pending backend) |

**On the one tier a Copenhagen player can actually reach today (`medium`), PVS
made zero difference to depth reached across every one of the 14 positions
tested**, while still costing extra nodes on most of them at equal depth.

**Paired gauntlet** (candidate = PVS off, baseline = PVS on, `DEFAULT_WEIGHTS`
both sides — this board's own recommended depth/pairs):

```
npx tsx scripts/pairgauntlet.ts --game copenhagen pvs 2 70 31010 shallow2
```

`WW=17 LL=9 split=44 net=+8`, decisive 26/70 (37.1%), sign-test **p=0.1686**
— not significant, but the same direction as Tablut's run (numerically
favouring PVS OFF, the candidate, not PVS on). Side split: attackers 39,
defenders 98, 3 incomplete of 140 (defenders 70.0%). Wall time 4223.6s
(60.3s/pair), load 4.7 → 1.7 across the run (with a mid-run spike to 12.2 from
other agents' work). 70 pairs is this board's own recommended floor.

## Verdict

Same conclusion on both boards, by the house rule (`docs/ROADMAP.md`
"Verification standard": never ship a measured regression; a neutral change
ships only if free):

- **Correctness holds everywhere measured.** PVS never changed a score at
  equal depth, on either board, at any tested depth or position (0 mismatches
  across 13×3 + 14×3 = 81 on/off comparisons). This was the required
  invariant, not the question being settled.
- **PVS is not free.** On both boards it costs more nodes than plain
  alpha-beta at equal depth in most tested positions (Tablut: median
  +3.1-3.7%, up to +45%; Copenhagen: median +0.9-1.4%, up to +14.8%) — the
  opposite of the "wider board has more to save" premise both `FULL_CONFIG`
  comments used to ship on.
- **PVS never bought depth under a real deadline, and twice cost it.** At
  every ladder tier on both boards, PVS-off reached a depth at least as deep
  as PVS-on; where they diverged (Tablut `hard` ×2, Copenhagen `hard` ×1), off
  was ahead. On the tier that matters most today — Copenhagen's `medium`, the
  only one reachable in the shipped UI until the app has a backend — PVS
  produced no depth difference on any of the 14 positions tested.
- **Neither gauntlet found a significant benefit.** Tablut: p=0.4545 at 40
  pairs (this board's own recommended floor). Copenhagen: p=0.1686 at 70
  pairs (ditto). Both numerically lean toward PVS OFF outperforming PVS ON,
  not the reverse, though neither crosses significance.

No measurement here supports keeping `usePVS: true` on either board, and the
node-count and ladder evidence is a real (if small), consistently-signed cost
rather than noise. **`usePVS` now ships `false` on Tablut and Copenhagen**,
matching Brandubh — see the rewritten `FULL_CONFIG` comment in each engine
file for the citation trail. `searchInvariants.test.ts`'s pinned node counts
were updated on both boards for the two fixtures where PVS made a difference
(opening, midgame); every score, depth, move and `bestMoves` value —
including Copenhagen's 13-way tied `bestMoves` order at the opening — was
unaffected and needed no change (verified by running the affected suites
before and after re-pinning).
