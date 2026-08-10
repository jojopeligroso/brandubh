# Session 15 — the evaluator's second opinion

**Status: open.** Size **M** — one session, engine internals only. **"Dropped,
measured" is a successful outcome.** This session exists to test a specific
external disagreement, not to make the engine stronger by assumption.

---

Session 15 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/15-evaluation-second-opinion`. Start from latest `main`.

Do NOT touch the rules, the notation, or any UI. If a `.tsx` file is open, you
have left the fence.

## READ FIRST

1. `src/game/engine.ts` — `evaluate()`, `EvalWeights`, and the search around them
2. `scripts/evaltune.ts` — the existing A/B gauntlet, and `scripts/evaltime.ts`
   for why it is the wrong instrument for some questions
3. `docs/reports/engine-and-optimality-report.md` — how strength claims are made here
4. `docs/ROADMAP.md` — Session 4 and the "never ship a measured regression" rule
5. `TASKS.md` § "AI engine — next levers" — the record of what was already tried

**DEPENDS ON:** nothing. Independent of 11–14; can run in any order.

## WHAT EXISTS

- **`EvalWeights` has 11 terms.** Shipping values: `material: 40`,
  `kingCorner: 25`, `escapeLane: 120`, `hug: 30`, `kingRegion: 6`, plus
  `liberties: 0`, `shield: 0`, `mobility: 0`, and the booleans
  `blockerAwareKingDist: false`, `endgameRecognizers: true`,
  `attackerRecognizer: false`.
- **The zeroes are a measured result, not an oversight.** `TASKS.md` records the
  outcome of `scripts/evaltune.ts`: mobility helped only at depth 2 and was even
  by depth 3 while costing ~2× per node; shield and liberties were worse;
  blocker-aware king distance was neutral. The conclusion was that the search
  rewrite already captures what those heuristics proxied for.
- **`kingRegion` shipped at weight 6** after winning 31–9, which is the standard
  of evidence this session must meet.
- **There is no piece-square table anywhere in the engine.**
- **`ANALYSIS_WEIGHTS`** differs from play weights (`attackerRecognizer` is on for
  analysis, off for play). Any new term must be considered for both.

## THE DISAGREEMENT WORTH TESTING

OpenTafl's `FishyEvaluator.java` (in <https://github.com/jslater89/OpenTafl>) has
five weighted terms and an explicit branch for this board size, commented
*"Brandub calls for different weights"*:

| Term | 11×11 | **7×7** |
|---|---|---|
| `KING_FREEDOM_VALUE` | 500 | **750** |
| `KING_RISK_VALUE` | 500 | **750** |
| `RANK_AND_FILE_VALUE` | 1100 | **750** |
| `MATERIAL_VALUE` | 1650 | **1500** |
| `PIECE_SQUARE_VALUE` | 1100 | **750** |

Normalised, that engine spends **a third of its 7×7 evaluation on rank-and-file
control and a piece-square table** — the two things this repo has at zero and
absent respectively. Two of its other terms converge with this repo's independent
result (king freedom counts clear paths to the edge and treats two open paths as
won, which is `escapeLane` plus `forcedDefenderWin` arrived at from a different
direction), which is what makes the divergence interesting rather than noise.

**The licence is a bespoke non-OSI "Stout Free-As-In-Beer License".** Read the
Java to understand the *features*; implement your own. Do not copy code, and do
not copy those constants — they are on a different scale and meaningless here.

## BUILD

1. **`rankAndFile` as a new `EvalWeights` term, default `0`.** Feature: control of
   ranks and files — attackers scoring for lines they command, defenders for lines
   they solely occupy, plus the corner-diagonal points. Write the feature
   extractor to be cheap; the last time a mobility-flavoured term was tried it
   died on cost, not on signal, so **instrument the per-node cost from the start**.
2. **`pieceSquare` as a new term, default `0`**, with a small table and the king
   weighted materially above a defender. Keep the table as data with a comment
   explaining each region, not as magic numbers.
3. **Gauntlet both**, separately and together, at the depths the game actually
   plays — `medium` (3) and `hard` (6) at minimum, `ollamh` if time allows. Use
   `scripts/evaltune.ts`. Paired, seeded, enough games to mean something; state
   the sample size. Read `scripts/evaltime.ts` first and decide whether the
   gauntlet is even the right instrument for the cost question, or whether you
   need a timing harness alongside it.
4. **Decide, and write the decision down.** Three legitimate outcomes:
   - **wins** → ship at the fitted weight, update the report;
   - **neutral and free** → may keep as a knob at 0, per the PVS precedent;
   - **neutral-but-costly or worse** → **drop it, keep the code as an off-by-default
     knob if it is cheap to carry, and record the measurement.**
   The measurement goes in `docs/ROADMAP.md` and
   `docs/reports/engine-and-optimality-report.md`, with the numbers, not a verdict.
5. **Say explicitly in the write-up whether this confirms or overturns the earlier
   mobility result.** That is the actual question. An external engine tuned for
   this exact board disagrees with a measurement made here; the deliverable is
   knowing which is right for *this* search, at *these* depths.

## CONSTRAINTS

Engine internals only — no UI, no rules changes, no notation. **Never ship a
measured regression.** A term that only helps at depth 2 does not ship: the game
plays at 3, 6 and 12. Any new term must be considered for `ANALYSIS_WEIGHTS` as
well as play weights, and the opening book's fingerprint gating
(`BOOK_RULES_FINGERPRINT`) must be re-checked — **the book is generated under an
exact ruleset, and a changed evaluator does not invalidate it, but a changed
`RuleSet` would.** You are not changing `RuleSet`; confirm that and move on.
Keep the terms board-size-agnostic in expression, as the existing ones are.

## VERIFY

`npm test` green — including a test that the shipped weights produce the shipped
behaviour, so a future accidental retune fails loudly. `npm run build` clean.
**Gauntlet output pasted into the commit message**, with sample size, depths and
seeds. If the answer is "dropped", the commit message and the roadmap entry must
say so in the same words used for PVS — the record of what did *not* work is
worth as much as the record of what did. No driven-browser pass; nothing renders
differently unless a term shipped, in which case confirm the eval bar still fills
from the bottom (`npm run check:evalbar`). Commit + push; no PR unless asked.
Update `docs/prompts/README.md`. Do not start another session.

## PROGRESS

- [ ] 1. `rankAndFile` term implemented, per-node cost instrumented
- [ ] 2. `pieceSquare` term implemented, table documented
- [ ] 3. Gauntletted at depths 3 and 6, sample size recorded
- [ ] 4. Decision made and written into roadmap + engine report with numbers
- [ ] 5. Verdict on the earlier mobility result stated explicitly
- [ ] Tests green, `check:evalbar` green if anything shipped, pushed
