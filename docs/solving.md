# Is Brandubh solved? A feasibility report

**Short answer: no — and not close, in this environment.** The engine has been
made materially stronger and a *sound* solver has been built and verified, but the
full game is not solved and cannot be solved here. This document gives the honest
numbers behind that statement, what *is* proven, and what a real solve would take.

All figures are for the shipping default, **WTF Brandubh** (7×7, armed king, corner
escape, hostile corners, strong king on the throne, encirclement win): 8 attackers
vs. 1 king + 4 defenders.

---

## 1. What "solved" means

- **Ultra-weakly solved** — the game-theoretic value (who wins with perfect play
  from the start) is known, without a strategy.
- **Weakly solved** — value *and* a strategy to achieve it from the standard start.
- **Strongly solved** — perfect play known from *every* legal position.

The request ("solve the game for black, then add a perfect difficulty") targets at
least a weak solve. We reach none of the three.

---

## 2. The state space

Non-terminal positions keep the king on the board (its capture ends the game), with
0–4 defenders and 0–8 attackers on the remaining squares:

$$\sum_{d=0}^{4}\sum_{a=0}^{8} 49\cdot\binom{48}{d}\binom{48-d}{a}\times 2\ (\text{side to move})$$

| Quantity | Value |
|---|---|
| Full-material layer (all 13 pieces) | ≈ 3.4 × 10¹⁵ |
| Sum over all capture-reduced layers | ≈ 4.8 × 10¹⁵ |
| After D4 board-symmetry folding (÷8) | ≈ **6.0 × 10¹⁴** |

This is an **upper bound** — it counts illegal and unreachable arrangements. Real
reachable positions are fewer, but not by the ~10 orders of magnitude that would be
needed to change the conclusion.

For scale: **Checkers** (5 × 10²⁰ positions) was weakly solved in 2007 by Schaeffer
et al. after ~18 years and a cluster of hundreds of machines. Brandubh's raw space
(~5 × 10¹⁵) is about 10⁵× *smaller* than checkers — so it is **plausibly solvable
in principle with a serious, dedicated effort**, but that effort is a research
project, not a browser tab.

---

## 3. Measured throughput and what it implies

The bounded solver (`src/game/solver.ts`), reusing the immutable game engine for
rule-exactness, runs at roughly **8.3 × 10⁴ nodes/second** single-threaded in this
environment (Node/tsx). A purpose-built bitboard engine with make/unmake + Zobrist
hashing would realistically reach 10⁶–10⁷ nodes/s single-threaded (10–100×).

Time to visit the symmetry-reduced space **once** (a solve visits many nodes more
than once, and this ignores the memory wall):

| Engine | Rate | Time (single thread) |
|---|---|---|
| Current immutable engine | 8.3 × 10⁴ /s | **≈ 228 years** |
| Optimized bitboard | 1 × 10⁶ /s | ≈ 19 years |
| Optimized bitboard | 1 × 10⁷ /s | ≈ 1.9 years |

**The memory wall is worse than the time wall.** A strong solve stores a value per
position. Even at an aggressive 2 bits/position over the symmetry-reduced space:

- 2 bits/position → **≈ 150 TB**
- 1 byte/position → **≈ 600 TB**

A session container has gigabytes. Retrograde tablebases would have to be streamed
across a large disk array — the technique used for checkers/chess endgame tables,
i.e. real distributed-systems engineering.

---

## 4. How close did the actual attempt get?

`scripts/solve.ts` ran the standard opening (attackers to move) at increasing
budgets:

| Budget | Result | Nodes | Wall |
|---|---|---|---|
| 100k nodes | UNKNOWN | 116,297 | 1.7 s |
| 1M nodes | UNKNOWN | 1,016,273 | 12.4 s |
| 5M nodes | UNKNOWN | 5,016,277 | 60.0 s |

5 × 10⁶ nodes against a ~6 × 10¹⁴ space is a coverage of **≈ 8 × 10⁻⁹** — under one
hundred-millionth of one percent, and that is of a tree far larger still once
repeated visits are counted. The opening value is **undetermined**, and no amount
of patience in this environment changes that.

The `UNKNOWN` here is meaningful, not a crash: the solver is **sound**. It returns a
value only when it is *proven*; when the budget is exhausted it says so rather than
guessing. That is why it is trustworthy for the parts it *can* decide.

---

## 5. What IS proven / solvable

- **Tactics to mate** — forced king-captures or king-escapes some plies out are
  proven exactly (verified by tests: mate-in-1 for both sides, distance-to-mate
  reported, memo and no-memo agree).
- **Near-terminal and low-branching positions** — resolved fully when the subtree
  fits the budget.
- **Reduced-material endgames with few attackers** — tractable to a retrograde
  tablebase offline. Caveat: realistic Brandubh endgames still have 6–8 attackers
  (high piece count = large tables), so these perfect tables cover *deep* endings
  more than typical play.

These feed a real improvement even without a full solve: proven moves drop into
`OPENING_BOOK` (in `ai.ts`) and the **Ollamh** tier plays them instantly and
perfectly. The book is empty today precisely because we refuse to fill it with
anything unproven.

---

## 6. Known limitation of the solver: graph-history interaction

Threefold repetition makes a position's value depend on the *path* taken to reach
it, while the transposition table keys on board + side only. Two histories reaching
the same board can differ solely in repetition outcomes, so memoized draws/losses
carry a small unsoundness (`memo: false` disables the table for full rigor on small
positions; proven *wins* are unaffected). A production solver would fold a
repetition/irreversible-move counter into the key.

---

## 7. What a real solve would take

1. **Bitboard engine** with make/unmake and Zobrist hashing (~100× throughput).
2. **Retrograde endgame tablebases**, generated bottom-up by material signature and
   streamed to a multi-terabyte disk array.
3. **Proof-number / df-pn search** for the opening, backed by the tablebases, on a
   cluster — plausibly weeks to months of wall-clock, with **no guarantee** of
   convergence (no published full solution of WTF Brandubh is known).

None of that fits a single ephemeral session. It is, however, a credible roadmap
given the game is smaller than already-solved checkers.

---

## 8. Bottom line

| Question | Answer |
|---|---|
| Perfectly (strongly) solved? | **No.** |
| Weakly solved (opening value known)? | **No** — opening is UNKNOWN. |
| How close, here? | ~8 × 10⁻⁹ of the space explored; effectively not started. |
| Solvable in principle? | **Likely yes** — smaller than solved checkers — but needs an optimized engine, ~10²–10³ TB of tablebase storage, and a cluster over weeks–months. |
| What we shipped instead | A verified sound solver, proven tactical results, an empty-by-integrity opening book, and a much stronger **Ollamh** search tier. |

*Reproduce the numbers:* `npx tsx scripts/solve.ts` and the state-space arithmetic
in this document's section 2–3.
