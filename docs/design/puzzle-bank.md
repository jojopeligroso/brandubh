# Puzzle bank - implementation plan

The bank of ~80 verified Brandubh puzzles: a stored position plus a solution
line of at most four solver moves, mined from self-play and hand-added from
observed games, surfaced on the Learn screen as named sets and a graded pool,
with an unlisted proving ground to calibrate the grades.

This file is the **plan**, not the design. The design is already written and is
not re-argued here:

- [`GLOSSARY.md`](../../GLOSSARY.md) - the vocabulary. Sections **Playing**
  (Guillotine), **Named tactics**, **Teaching**, **Flagged ambiguities**.
- [`adr/0001`](../adr/0001-bank-puzzles-require-a-unique-solving-move.md) -
  bank puzzles need a *unique* solving move; review mistakes keep the lenient
  equal-best rule.
- [`adr/0002`](../adr/0002-puzzle-lines-are-truncated-at-the-deciding-move.md) -
  lines truncate at the deciding move; four goal values, `guillotine` not
  among them.
- [`adr/0003`](../adr/0003-puzzle-sets-emerge-from-attested-tactics.md) - sets
  emerge from attested tactics; most puzzles are only tagged.
- [`adr/0004`](../adr/0004-the-proving-ground-collects-nothing.md) - no
  backend; the lock is a sign.
- [`adr/0005`](../adr/0005-grades-are-calibrated-by-blind-comparison.md) -
  grades are fitted to blind comparisons, never asked for.

Where this plan proposes something the ADRs and glossary do not settle, it says
so in [Decisions this plan proposes](#decisions-this-plan-proposes) and the
slice that depends on it names the dependency. Nothing in that list should be
built before it is answered.

---

## Sequencing

Five code slices and one operational one. Each ends green and is independently
shippable, per the roadmap's sizing rule.

| Slice | Theme | Size | Depends on | Contract it leaves behind |
| --- | --- | --- | --- | --- |
| **8a** | Attempt state machine: rename, step cursor, source | S | - | `src/game/attempt.ts`, tested before it has a bank caller |
| **8b** | Stored format, offline generator, data module, grade formula | L | 8a (format only, not runtime) | `src/game/puzzleBank.ts` + a real, verified bank |
| **8c** | Tagger and the guillotine recogniser | M | 8b | `src/game/motifs.ts`; bank regenerated with motifs and tags |
| **8d** | Learn screen: bands, pool, named sets, playing a bank puzzle | L | 8a, 8b, 8c | `BankPuzzlePlayer`, `src/game/puzzleProgress.ts` |
| **8e** | Proving ground and the calibration script | M-L | 8d | `src/game/proving.ts`, `scripts/calibrate-grades.ts` |
| **8f** | Fit the weights from collected data | operational | 8e | a fitted `GRADE_WEIGHTS`, and a comment that stops saying "guess" |

**8a is deliberately first and deliberately alone.** It is the seam. Session 7
paid for the lesson twice over: 7b's contract in `src/orientation.ts` was
written and unit-tested before it had any caller, and a parallel 7a picked it
up unchanged; the duplicate 7a that got thrown away at merge was the cost of
*not* having one. `attempt.ts` is the same shape of bet. It ships against the
existing review path only, with the bank fields present and unused.

**8b and 8c could merge, and should not.** The generator can emit a correct,
verified, untagged bank; the recognisers are pure logic testable against
hand-built boards with no generator in sight. Split, each half is provable on
its own; merged, a recogniser bug and a mining bug look identical.

**8d and 8e are not parallelisable**, because 8e reuses 8d's player. If they
must overlap, the seam is `BankPuzzlePlayer`'s props plus `attempt.ts`; agree
those first and check `main` before starting either.

---

## 8a - the Attempt state machine *(S)*

**Goal:** `src/game/puzzle.ts` becomes the Attempt, gains a step cursor and a
source discriminator, and keeps every existing review behaviour identical.

### What exists

- `src/game/puzzle.ts` - `PuzzleState` (`ply`, `mover`, `stage`, `attempts`),
  `sameMove`, `isSolution`, `hidesEngine`, `acceptsGuess`, `judge`,
  `isFinished`. 14 tests in `puzzle.test.ts`.
- `src/components/PuzzlePanel.tsx` - renders a `PuzzleState` from props. Skip is
  offered only in the `guessing` stage (`PuzzlePanel.tsx:100-110`).
- `src/App.tsx` - `startPuzzle` / `tryAgain` / `revealSolution` /
  `advanceLesson` (`~1041-1131`), judging inside `commitMove` (`~670`), the
  panel rendered behind `analysis &&` (`~1963`).

### Build

1. **Rename the module** to `src/game/attempt.ts` (and `attempt.test.ts`),
   freeing the word "puzzle" for the stored artefact, per the glossary's first
   flagged ambiguity. `PuzzleState` becomes `Attempt`, `PuzzleStage` becomes
   `AttemptStage`.

2. **The shape:**

   ```ts
   export type AttemptStage = "guessing" | "wrong" | "solved" | "revealed";

   export type AttemptSource =
     | { kind: "review"; ply: number }   // answer from the worker
     | { kind: "bank"; puzzleId: string }; // answer stored

   export interface Attempt {
     source: AttemptSource;
     /** Whose move it is: the player who erred, or the bank puzzle's solver. */
     mover: Side;
     stage: AttemptStage;
     /** Cursor into the Line. A Review Mistake is one step, so always 0. */
     step: number;
     /** Wrong guesses across all steps. Counted, never scored. */
     attempts: number;
   }
   ```

   `mover` stays top-level rather than living inside the `review` variant (see
   [proposal 1](#1-mover-stays-top-level-on-attempt)), which is what keeps
   `PuzzlePanel.tsx` unchanged bar the skip fix.

3. **Step-aware judging.** One function, two callers, no branch on `source`:

   ```ts
   export interface LineStep {
     /** Accepted solving move(s). Bank: exactly one, by ADR-0001. Review: the
      *  equal-best set from the worker, or null while it has not arrived. */
     accepted: Move[] | null;
     /** Scripted reply, played after a correct non-final step. */
     reply: Move | null;
   }

   export function judge(
     a: Attempt, move: Move, step: LineStep, isLast: boolean,
   ): { attempt: Attempt; play: Move[] };
   ```

   `play` is what the caller applies to the board, in order: `[move]` on a
   wrong guess or a correct last step, `[move, reply]` on a correct non-final
   step. Correct and not last leaves the stage at `guessing` with `step + 1`.

   `isSolution` is untouched. The bank path passes `accepted: [step.move]`, a
   singleton by construction, so ADR-0001's two acceptance rules coexist in one
   function rather than two.

4. **`retryStep(a)`** returns to `guessing` at the *same* step. The board
   rewind is the caller's job: review already does it by removing the tree
   branch (`tryAgain`), and 8d does it by restoring the position at the start
   of the step, keeping the earlier correct steps on the board.

5. **Skip in the `wrong` stage** as well as `guessing`
   (`PuzzlePanel.tsx:100-110`). Someone who has guessed wrong is *more* likely
   to want out than someone who has not guessed at all, and today that is the
   one place the offer disappears.

6. **Call sites** in `App.tsx`: construct `{ kind: "review", ply }`, pass
   `{ accepted: bestMoves, reply: null }` and `isLast: true`. Behaviour
   identical.

### Verify

`npm test` green (the 14 existing tests rewritten against the new names, plus
new ones for the cursor: a three-step line advances, a wrong guess at step 2
keeps `step` at 1, `retryStep` does not reset it, `attempts` accumulates across
steps, a one-step line behaves exactly as today). Build clean. A driven-browser
pass over the existing review loop only, showing nothing changed except that
Skip now survives a wrong guess.

---

## 8b - stored format, generator, data module, grade formula *(L)*

**Goal:** a real bank of verified puzzles in a generated data module, plus the
offline script that produces it. No motifs, no UI.

`--target` is a **floor, not a ceiling**: it says when a one-shot run has mined
enough to stop, and everything the shards found ships. There is no reason to
discard a verified puzzle that cost an hour to find, the payload is a few bytes
per record, and a larger pool is what gives the **Bands** something to be cut
from. The 80 in the roadmap is the number worth stopping at, not a cap.

### What exists

- `scripts/genbook.ts` + `src/game/openingBook.data.ts` - the generated-data
  pattern to copy: header comment carrying the regeneration command, a
  fingerprint const, a compact string payload, a printed summary.
- `src/game/openingBook.ts` - `rulesFingerprint(rules)`, already generic over a
  `RuleSet` and already imported by `genbook.ts`. Reuse it; do not write a
  second one.
- `src/game/solver.ts` - `solve()` returns `{value, dtm, bestMove, budgetHit}`
  and never guesses. `canonicalKey()` folds a position over D4.
- `src/game/ai.ts` - `scoreRootMoves(state, rules, depth, margin)` returns the
  exact-tie set at a fixed depth, deterministic, no deadline. `DIFFICULTIES`
  (`ai.ts:22`), `DEFAULT_WEIGHTS` (`ai.ts:112`), `easy`'s 0.35 blunder rate
  (`ai.ts:1141`).
- `scripts/annotate-calibrate.ts` - the seeded self-play harness with a
  quarter of moves played at random so there are real errors to measure.
- `src/game/position.ts` - `encodePosition` / `parsePosition` / `validateBoard`,
  the hand-add input format.
- `src/game/annotate.ts:62-96` - the worked example of *calibrating* bands
  rather than borrowing them, and of shipping the calibration in the comment.

### Build

1. **`src/game/puzzleBank.ts`** - types, decoder, loader. One line per puzzle
   in the payload, pipe-separated:

   ```
   id|pos|leadIn|line|goal|flags|dtm|depthToFind|salience|motif|tags
   ```

   - `id` - the five-digit **Puzzle number**, permanent, never reused.
   - `pos` - `encodePosition` of the position *before* the opponent's last
     move (so the side to move is the opponent).
   - `leadIn` - that move, `frfctrtc`. Opening the puzzle plays it, then hands
     over. Storing it is what makes the puzzle arrive as a position someone
     just moved into rather than a diagram.
   - `line` - concatenated `frfctrtc` moves, alternating solver/reply, always
     ending on a solver move (odd count).
   - `goal` - `regicide` | `escape` | `crushing` | `advantage`. Four values;
     `guillotine` is a motif, not a goal (ADR-0002).
   - `flags` - `t` when the line is **Truncated**.
   - `dtm` - stored so the truncation claim can be re-checked, never displayed
     (ADR-0002).
   - `depthToFind`, `salience` - the grade measurements (below).
   - `motif`, `tags` - empty until 8c.

   Module-level consts beside the payload, mirroring `openingBook.data.ts`:
   `BANK_RULES_FINGERPRINT`, `BANK_BOARD_SIZE` (7 today; the field exists so a
   future 9x9 fork inherits the format, and the engine is **not** generalised -
   `BOARD_SIZE` stays a const), `BANK_VERIFY_DEPTH`, `BANK_DATA`.

   `loadBank(rules)` returns the bank only on an exact fingerprint match, and
   an empty bank otherwise, exactly as `bookRulesMatch` gates the opening book.
   The shipping default (`wtf`) is generated first; the payload is keyed by
   fingerprint so a second ruleset appends rather than forks the format.

2. **`src/game/grade.ts`** - pure, and separate from the data:

   ```ts
   /** EXPLICITLY A GUESS until 8f fits it. Shape agreed, weights not measured.
    *  See annotate.ts:62-96 for how this comment should read once it is. */
   export const GRADE_WEIGHTS = { ... } as const;
   export const BAND_CUTS = { ... } as const;   // three cuts, four bands
   export function gradeOf(m: GradeMeasurements): number;
   export function bandOf(grade: number): Difficulty;
   ```

   The data module stores the **measurements**; the grade is computed at import
   (see [proposal 2](#2-grade-is-computed-at-import-not-baked-into-the-data)).
   Refitting the weights in 8f then costs one edit and no regeneration.

   Measurements: `depthToFind` (the smallest depth at which `scoreRootMoves`
   returns the step-1 solving move), `lineLength` (derivable from `line`), and
   a `salience` correction (see
   [proposal 6](#6-the-salience-features-are-not-written-down-anywhere)).

3. **`scripts/genpuzzles.ts`** - the offline generator. Deterministic, seeded,
   no deadline, in the style of `genbook.ts`:

   1. **Source.** Seeded self-play using `easy`'s 0.35 blunder rate to
      manufacture real errors (the `annotate-calibrate.ts` precedent), plus
      hand-added positions read from `data/puzzle-handadds.txt` in
      `position.ts` format. Both paths go through everything below; nothing
      unverified ships, and **Provenance** never changes how a puzzle is
      verified.
   2. **Uniqueness filter (ADR-0001).** Reject any candidate whose solving
      move at *any* step has an equal-best rival. Proven goals: exactly one
      root move achieves the proven value. Evaluation goals: `scoreRootMoves`
      at the deep generation depth returns exactly one move. Expect this to
      reject a lot of otherwise good open-position material; that cost was
      accepted deliberately, and the script should print the yield so it is
      visible rather than merely accepted.
   3. **Line construction.** Solver's unique best move, then the opponent's
      best reply at the same depth (ties broken by lowest encoded move, so
      regeneration is stable), repeat to the goal or four solver moves.
   4. **Truncation (ADR-0002).** Hold the full proof at generation time; ship
      the prefix. See
      [proposal 3](#3-the-truncation-rule-needs-an-operational-definition).
   5. **Goal.** `regicide` / `escape` from `solve()`; `crushing` / `advantage`
      from the evaluation at the end of the line, against cuts that need
      calibrating rather than guessing (see
      [proposal 8](#8-the-crushingadvantage-cuts-need-their-own-calibration)).
      Proofs are never called evaluations and evaluations are never called
      proofs.
   6. **Ledger.** Read and write `data/puzzle-ledger.json`: position key to
      puzzle number, plus hand-written **Notes**. Numbers assigned in order of
      first appearance, never reused, keyed on the position alone so a ruleset
      change that alters the answer keeps the number. A Note outranks anything
      computed and the generator does not argue. Checked in, never bundled.
      Key shape: [proposal 4](#4-the-ledger-key-is-the-d4-canonical-position-after-the-lead-in).
   7. **Re-proof.** Full `solve()` re-verification of every shipped line lives
      here and only here. The suite must stay fast.
   8. **Emit and report.** Data module plus a printed summary: counts by goal,
      by band, by side, candidate yield and rejection reasons, and (from 8c) per
      motif including zeros. No band may be empty; if one is, the cuts are
      wrong and that is a finding, not a shrug.

4. **Mining and emitting are separate jobs.** Not in the original plan; added
   after the first full run was interrupted by a power cut at roughly 95% and
   delivered nothing, because the script held everything in memory and wrote
   once at the end.

   The cost is not evenly spread, which is what dictates the shape. A candidate
   rejected as `not_decisive` is one shallow search; a candidate the solver can
   *prove* runs `winningMoves` - a full `solve()` for every root move - at up to
   four steps and then walks the whole proof in `provenGoal`. One such candidate
   was measured at ten minutes. So the checkpoint is per **candidate**, not per
   game: a per-game checkpoint would cheerfully discard twenty minutes.

   Three properties, one flag each:

   | Mode | What it does |
   | --- | --- |
   | *(neither)* | mine `[--from, --to)` and emit - the one-shot run |
   | `--shard` | mine a range into `data/puzzle-shards/`, no emit |
   | `--merge` | emit from every shard on disk, no mining |

   Ranges are independent, so they run in parallel and a merge combines them.
   Two things had to change to make a game mean the same thing inside a shard as
   in a whole run, and both were latent coupling worth naming:

   - **The rng reseeds per game.** One stream through all games meant `chooseMove`
     drew a data-dependent number of times, so game 100's position in the stream
     depended on the 99 before it. No range could start anywhere but 0.
   - **Assessment moved out of the self-play loop.** It ran *between* the plies
     of the game it was mining and writes to the shared transposition table that
     `chooseMove` reads for move *ordering* - so whether a position got assessed,
     which depended on the global duplicate set and on the target being reached,
     changed which moves the game went on to play. The observer was perturbing
     what it observed. A game is now played to completion and its candidates
     assessed after. `analysePosition` (`ai.ts:1295-1315`) records the same
     hazard, found the same way.

   A shard holds **assessed** puzzles and no ids: numbering is order of first
   appearance over the whole bank, which only the merge can see, so a shard that
   assigned numbers would be asserting something it cannot know. The ledger is
   written by the merge and by nothing else, for the same reason.

   Shards are **checked in**. They are the mined evidence and the data module is
   the shipped subset of it. That also makes `--merge` a re-grade: since
   `BAND_CUTS` is explicitly a guess until 8f fits it, this is the difference
   between a cut-tuning iteration costing a second and costing an afternoon.

5. **Fast invariants** in `src/game/puzzleBank.test.ts`, all pure, all cheap:

   - every line is legal from its position (apply the lead-in, then each move,
     each checked for membership in `allMoves`);
   - every line ends on a solver move (parity from the post-lead-in turn);
   - every solver move is uniquely best at `BANK_VERIFY_DEPTH`
     (see [proposal 5](#5-the-fast-suite-needs-a-cheaper-verification-depth-than-the-generator));
   - `BANK_RULES_FINGERPRINT` matches the ruleset the app ships;
   - every id is five digits, unique, and present in the ledger;
   - `BANK_BOARD_SIZE === BOARD_SIZE`;
   - `dtm` is finite exactly when the goal is a proof;
   - the truncated flag is set exactly when `dtm` exceeds the shipped line.

### Verify

`npm test` green and still fast (time it, and record the number in the commit -
the whole point of the verification split is that this suite does not creep).
Reproducible in the sense that now matters: `--merge` over the same shards is
byte-identical, and a shard re-mined over the same game range with the same
params reproduces itself. Build clean. No UI, so no browser pass.

---

## 8c - tagger and the guillotine recogniser *(M)*

**Goal:** puzzles carry a primary motif where one is recognised, computed tags
always, and the bank is regenerated with both.

### What exists

- `src/game/ai.ts` holds the geometry the tagger needs, currently unexported:
  `kingRegionSize` (`132`), `clearPathToCorner` (`152`), `kingCornerMoves`
  (`194`).
- `src/game/tutorials.ts` exports `sq`, `mv`, `parseRows`: the hand-built-board
  vocabulary the recogniser tests should be written in.
- `src/game/recognizers.test.ts` and `attackerRecognizer.test.ts` are the
  precedent for validating a recogniser against the sound solver.

### Build

1. **Export the three geometry helpers** from `ai.ts` with a one-line comment
   saying why (they are now shared vocabulary, not private detail). No
   behaviour change, no new file for them.

2. **`src/game/motifs.ts`** - pure. The `Motif` union is exactly the attested
   list from the glossary's **Named tactics**: `guillotine`, `snapTrap`,
   `clamp`, `spring`, `balling`, `cordon`, `cornerFight`, `twinTowers`.
   `shuttle` and `svikmolle` are aliases in the glossary and are **never**
   values here.

3. **Recogniser order, and it is not negotiable.** Guillotine first, because it
   is the only motif no human can hand-label: it lives in the proof past the
   end of the shipped line, so it is recognised from the solver's working
   rather than from the board. Its input is therefore the full proven
   continuation held at generation time, not the shipped prefix:

   ```ts
   export function isGuillotine(proof: GameState[], rules: RuleSet): boolean;
   ```

   Detection: over the tail of the proof, one King's-side piece alternates
   between squares on a single rank or file; each of its moves captures a
   raider that had just been interposed on the escape lane; at least two cycles.

   **Corner fight** alongside it, sharing the corner geometry: the line's
   captures and the king's target sit within one corner's quadrant, and at
   least one capture uses the corner as its anvil.

   Every static shape (Clamp, Snap trap, Cordon, Spring, Balling) waits for
   hand-labels and earns a recogniser only once a label repeats. Twin towers
   wants more board than Brandubh has and is expected to find nothing; that is
   a result about Brandubh, and the generator prints `twinTowers: 0` rather
   than omitting the row (ADR-0003).

4. **Tags** - computed, cheap, board-only: side to move, line length, whether a
   soldier is given up (a solver move the scripted reply captures), and any
   motif that is not the primary one.

5. **Primary motif** by fixed priority order, so the choice is reproducible.
   Optional: a puzzle with no recognised motif has none and lives in the
   **Pool**, which is where the majority are expected to stay.

6. **Set threshold** as data, not code: four puzzles for a recogniser-found
   motif to earn a set row; a motif assigned by a hand-written Note bypasses
   the threshold entirely, because a person deciding it matters is better
   evidence than a count.

7. **Regenerate** the bank. Numbers do not move; the ledger is what guarantees
   that, and the test that says so.

### Verify

`motifs.test.ts` against hand-built boards and hand-built proof sequences, in
the `tutorials.ts` idiom. Determinism: tag the bank twice, byte-identical.
Cross-check the guillotine recogniser against `solve()` on a handful of known
positions, the way the endgame recognisers were validated. The per-motif
counts, zeros included, go in the data module header and in the commit message.

---

## 8d - Learn screen: bands, pool, named sets, playing a puzzle *(L)*

**Goal:** the bank is reachable, playable and progressed through, from the
Learn screen.

### What exists

- `src/components/LearnModal.tsx` - three doors (objectives, rules, tutorials),
  its own back navigation, and `loadTutorialProgress` at `:35`: the
  `Set<string>` completion ledger and the pattern to extend.
- `src/game/tutorials.ts:451-479` - `brandubh.tutorials.v1`, a tolerant parser
  that drops ids it does not recognise, and silent failure on a dead
  `localStorage`.
- `src/components/TutorialPlayer.tsx` - the precedent for a board inside the
  modal: hand-built state held locally, scripted replies played on a timer,
  `usePrefersReducedMotion` respected, never persisted or exported.
- `src/App.tsx:~1963` - the review panel is gated behind `analysis &&`. That
  gate stays; the bank renders its own panel inside the Learn screen.

### Build

1. **`src/game/puzzleProgress.ts`** - pure, in the `tutorials.ts` idiom, under
   `brandubh.puzzles.v1`: the solved-id set, and the derived unlock state.
   Unlock is a **proportion** of a band (bands differ in size, so a fixed count
   would mean different things in different bands), permanent, never revoked,
   blind to how many attempts a solve took. The proportion is
   [proposal 7](#7-the-unlock-proportion-is-a-bare-number-nobody-has-picked).
   Locked bands are visible but greyed.

2. **`BankPuzzlePlayer`** - the component 8e reuses, so its props are a
   contract, not an implementation detail. Thin by design, because the project
   tests no components: it holds `GameState[]` and an `Attempt`, plays the
   lead-in move on open (animated, reduced-motion respected), applies whatever
   `judge()` returns in `play`, and renders `Board` + `PuzzlePanel`. Every
   decision worth testing is already in `attempt.ts`.

   Wrong step: the guess is played so it can be seen, then *try again* restores
   the position at the start of that step with the earlier steps intact. Offers
   on a wrong guess are try again / see it / skip. `puzzleSolvedLate` copy
   already exists for a late solve and is not replaced by a score.

3. **`src/game/completionNote.ts`** - pure, layered, fixed templates only,
   never generated prose: motif if one is known, else the dominant evaluation
   term that moved, else a plain banded line. Plain copy is "Correct" plus e.g.
   "Raiders have a strong advantage". **No dtm, and never "the game is over"** -
   a truncated line must read exactly like a short decisive one, which is the
   whole intent of ADR-0002. Returns a template id plus parameters; the
   component does the lookup, the test checks the choice.

4. **The screen.** A fourth door on the Learn menu. Inside: four band rows on
   the existing `DIFFICULTIES` ladder (`ai.ts:22`) with locks and a progress
   readout; named set rows above the pool; the pool as one list ordered by
   grade and filterable by tag. Named sets are shortcuts into the pool, not
   separate collections.

5. **i18n.** Every new key in `en`, `es` **and** `ga`, or `npm run build`
   fails. `ga` entries are unreviewed drafts and marked as such; `ga` does
   **not** go back into `VISIBLE_LANGS`, and `i18n.test.ts`'s
   "holds Irish back" assertion stays exactly where it is.

### Verify

Pure-logic tests for `puzzleProgress` (unlock proportions at band boundaries,
an unknown id dropped, a dead `localStorage` tolerated, unlock never revoked)
and `completionNote` (each layer chosen in the right circumstance; no template
mentions dtm or the end of the game). `npm test` green, build clean.

A **manual driven-browser pass** (`npm run screenshot`), per project
convention, at 390x844: a multi-step puzzle solved end to end, a wrong guess at
step 2 retried without losing step 1, skip offered in the `wrong` stage, a
locked band greyed and unlockable, and the completion note for each of the
three layers.

An **accessibility pass** before it ships: the screen gains set rows, band
locks and a progress ledger, and a lock that is a visual state only is a lock a
screen reader cannot report.

**The replay-from-opening invariant.** Bank puzzle states live in component
state and nowhere else: not in `persist.ts`, not in `gameFile.ts`, exactly as
tutorial set plays do. The only thing that persists is the solved-id set. This
is worth an explicit check in the browser pass, because it is the invariant a
new screen with a board on it is most likely to break.

---

## 8e - the proving ground and the calibration script *(M-L)*

**Goal:** an unlisted page that produces the comparison data, and an offline
script that fits the weights to it.

### What exists

- `vercel.json` - `rewrites` sends `/(.*)` to `index.html`, so an unlisted page
  needs **no router**. `App.tsx` reads `window.location.pathname` once.
- `package.json` - two runtime dependencies. Adding a form service or a
  serverless mailer would add a publicly reachable send capability; ADR-0004
  explains why `mailto:` is the answer instead.
- `src/game/replay.ts` - the `capture_mismatch` guard: the instinct a blob's
  self-reported entry count is copying.

### Build

1. **The page**, behind an unguessable path. The arrival screen **explains what
   the page is rather than pretending to guard it**, and the code says
   "unlisted, not secured" so nobody later mistakes it for access control. Any
   password checked in client-side JavaScript can be read out of the bundle,
   and there is nothing here to decrypt: the bank ships in the bundle for the
   normal app.

2. **One protocol, in this order** (ADR-0005): the position cold and timed, an
   attempt or a surrender, *then* the answer, *then* three **Comparisons**
   against **Anchors** the person has already solved. The order is the whole
   point and must not be made configurable. **Nobody is ever asked to assign a
   difficulty or a band.** A person only ever compares one puzzle against
   another; the fitted formula assigns the band. The human input exists to keep
   the four band labels honest, so that a puzzle filed under Hard broadly feels
   hard to whoever meets it, and not to produce the labels directly.

3. **Eight anchors**, shipped in the bundle, spanning the guessed grade range;
   three comparisons place any puzzle by binary search. Roughly 240 comparisons
   total across four or five graders.

4. **Four measurement instruments**, each answering something the fit cannot
   answer about itself, and none of them optional:
   - ~10% of puzzles recur silently, giving the **re-test noise floor**;
   - presentation order shuffled per session, so contrast effects spread;
   - graders work independently and their blobs are pooled;
   - weights fitted on part of the data and scored on a **holdout** of 15-20.

5. **Export: two buttons**, `mailto:` and copy-to-clipboard. **Measure the blob
   and steer to the clipboard rather than emit a truncated link.** A truncated
   JSON array still parses, so the failure would be silent and would corrupt
   the fit. Ceiling ~1800 characters; a full 80-puzzle run is ~985. The blob
   carries its own entry count.

6. **`scripts/calibrate-grades.ts`** - ingest the pasted blobs, **check the
   entry count against the array length** and refuse a mismatch, pool across
   graders, Bradley-Terry fit, holdout score, and emit a `GRADE_WEIGHTS` table
   to paste into `grade.ts`.

   It **must print the re-test noise floor beside the fit accuracy**. ~240
   comparisons over 80 puzzles is thin and the holdout is 15-20 puzzles: a 70%
   fit against a 30% self-disagreement rate is at ceiling, not mediocre, and a
   number printed without its floor will be read as the second thing.

7. **`src/game/proving.ts`** - everything worth testing, pure: blob encode and
   decode, the entry-count guard, the seeded schedule, binary-search anchor
   placement, the Bradley-Terry fit, the deterministic holdout split. The page
   is a shell over it.

### Verify

Pure-logic tests including a Bradley-Terry fit against synthetic comparisons
with a known ranking, and a blob round-trip. A driven-browser pass covering the
protocol order (the answer cannot be reached before the timer stops), the
blob-too-large path steering to the clipboard, and the arrival screen. `npm
test` green, build clean.

**Deferred here, explicitly:** any backend endpoint. The blob is already shaped
to become a request body if manual collection ever proves too lossy.

---

## 8f - fit the weights *(operational)*

Not a code session. Run the sessions, collect the blobs, run
`scripts/calibrate-grades.ts`, paste the fitted table into `grade.ts`, re-band,
confirm no band is empty, and rewrite the weights comment so it stops saying
"guess" and starts saying what was measured, over how many comparisons, with
what holdout accuracy against what noise floor. `annotate.ts:62-96` is the
model for how that comment should read.

---

## Constraints

Project-wide rules a new feature of this size is most likely to break. Each
slice above inherits all of them.

- **Pure-logic tests only.** No jsdom, no component tests. Anything worth
  testing goes in `src/game/`. A state machine inside a component is a state
  machine nobody tests, which is why `puzzle.ts` exists at all.
- **Replay-from-opening invariant.** `persist.ts` and `gameFile.ts` replay from
  `initialState()` only. Puzzle positions live in component state, never
  persisted, never exported, exactly as tutorial set plays do.
- **`ga` stays out of `VISIBLE_LANGS`.** New keys flow into the `ga` table
  because TypeScript requires it, marked as drafts. Do not re-expose.
- **Every new i18n key needs `en`, `es` and `ga`**, or `npm run build` fails.
- **Contested rule.** `throneHostileToKing` + `strongKingAdjacentToThrone` in
  `variants.ts` carry a warning note. Read it and `docs/rules-review.md` before
  touching king-capture logic; the guillotine recogniser and the `regicide`
  goal both sit close to it.
- **UI changes get a manual driven-browser pass** (`npm run screenshot`).
- **The fast suite stays fast.** Full `solve()` re-proofs live in the generator
  script only. Time `npm test` before and after 8b and record it.
- **Never ship a measured regression**, and when a change is neutral, say so
  and decide on cost.

---

## Decisions this plan proposes

Each of these is unsettled in the ADRs and the glossary. They are cheap, and
each is a yes/no, but the slice that depends on one should not start without it.

### 1. `mover` stays top-level on `Attempt`

The handoff writes the source as `{kind:"review", ply, mover}`. `PuzzlePanel`
reads `puzzle.mover` for its headline and needs it for a bank puzzle too, so
folding `mover` into the review variant would mean either duplicating it in the
bank variant or changing the panel. Proposal: `source` carries only what
differs (`ply` / `puzzleId`) and `mover` sits beside `stage`. Blocks **8a**.

### 2. Grade is computed at import, not baked into the data

The data module stores the measurements; `grade.ts` turns them into a grade and
a band at import. Refitting the weights in 8f is then a one-line edit with no
regeneration and no re-solve, and the Learn screen re-bands for free. The cost
is a few microseconds at startup over ~80 records. Blocks **8b**.

### 3. The truncation rule needs an operational definition

ADR-0002 says the line stops "at the move after which the result is settled",
which is a principle rather than a predicate. Proposal: truncate at the first
solver move after which the win is proven **and** no further *uniquely-best*
solver move remains, because once there is no single right answer there is
nothing left to test. That reading is what makes ADR-0001 and ADR-0002 the same
rule seen twice. Blocks **8b**.

### 4. The ledger key is the D4-canonical position after the lead-in

The glossary says the ledger keys on the position alone, never on the line.
Proposal: the key is `canonicalKey` (`solver.ts:94`) of the position the
learner actually sees, so a mirrored duplicate is recognised as the same puzzle
and keeps its number. The alternative, keying on the raw encoding, hands eight
numbers to one position. Blocks **8b**.

### 5. The fast suite needs a cheaper verification depth than the generator

"Each solver move uniquely best at the stored depth" is listed as a fast
invariant, but re-running `scoreRootMoves` at generation depth over ~120 solver
moves will not stay fast. Proposal: `BANK_VERIFY_DEPTH` is low (4 is the
starting guess) and is what the suite re-checks; the generator holds the strong
claim at depth 8. The cheap check still catches every kind of data corruption.
**Measure it before fixing the number.** Blocks **8b**.

Baseline, measured on `823d930`: **535 tests, 33.9s**, already dominated by
`ai.test.ts` (31s) and the recogniser cross-validation (15.8s). So "fast" here
means "does not add another `ai.test.ts`", not "instant"; a bank check that
costs a couple of seconds is affordable and one that costs thirty is not.

### 6. The salience features are not written down anywhere

The grade formula's shape is agreed as depth-to-find, corrected for salience,
plus line length. What "salience" is made of is not recorded. Proposal, as a
starting vector to be fitted rather than a claim: whether the solving move is a
capture, whether it moves the king, whether it moves toward a corner, and
whether it is the only legal move by that piece. These are the things a human
eye lands on first, and they are the reason depth-to-find alone under-rates an
obvious move found deep. Blocks **8b**.

### 7. The unlock proportion is a bare number nobody has picked

Unlock is a proportion of the band, permanent and attempt-blind. The proportion
itself has no value yet. Proposal: one third, revisited once band sizes are
known (they float, because the cuts are fixed). Blocks **8d**.

### 8. The `crushing` / `advantage` cuts need their own calibration

These are evaluations, not proofs, so they need thresholds, and `annotate.ts`
is the standing lesson that thresholds here are calibrated rather than
borrowed: this engine is not pawn-scaled and a 7x7 board swings hard. Proposal:
extend `scripts/annotate-calibrate.ts` to print the end-of-line evaluation
distribution as well as the per-move loss distribution, and pick the two cuts
off it with the same "lands on a natural anchor in the weights" reasoning.
Blocks **8b**.

### 9. Whether a hand-written Note's prose is ever displayed

The glossary defines a **Note** as text written against a puzzle number that
may also assign a motif, and says it outranks anything computed. That makes it
generator input. Whether the prose itself reaches the learner is not recorded.
This plan assumes generator input only, and the completion note stays
template-only either way. Blocks **8c** (it decides whether the note text needs
to ship in the data module at all).

---

## One documentation inconsistency, found and fixed

ADR-0004's opening paragraph used to describe the proving ground as having "a
grading mode (a person assigns a **Band**, producing the labels to fit to)".
That is the framing from before ADR-0005, which opens "Nobody ever assigns a
puzzle a difficulty" and makes the band an *output* of the fitted formula
rather than an input to it. Read in order, the two would have sent an
implementer to build the mode ADR-0005 exists to prevent.

ADR-0004 has been amended to match: a person only ever compares one puzzle
against another, and the fitted formula assigns the band. The human input
exists to keep the four band labels honest, not to produce them. Nothing else
in ADR-0004 changed, because nothing else in it depended on the old framing.

---

## Deferred - do not build

- **Gamification beyond band unlocking.** No three-lives, no streaks, no
  scoring. Attempts are counted and never scored.
- **Any backend endpoint.** ADR-0004.
- **Board-size generalisation.** The format carries the field; the engine does
  not. `BOARD_SIZE` stays a const.
- **A recogniser for a static shape nobody has hand-labelled twice.** ADR-0003.
