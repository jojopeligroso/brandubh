# Session 7d — post-game annotations (blunder / inaccuracy marks)

**Status: open.** The last slice of Session 7 (see
[`docs/design/lichess-ui.md`](../design/lichess-ui.md)).

---

Session 7d of the Brandubh roadmap: analysis UI slice — post-game annotations.

Repo: jojopeligroso/brandubh. Start from latest main. Read
`docs/design/lichess-ui.md` and the Session 7 block of `docs/ROADMAP.md`. Your job is
7d ONLY: re-search a finished game ply by ply and mark the moves where the evaluation
swung. Do NOT build the eval bar or hint arrow (7a) or extend the move tree (7c).

**DEPENDS ON:** export/replay (Session 3) — **merged**. 7b (analysis mode) —
**merged**, commit `b85ee08`. 7c (move tree) is **not** a hard dependency: annotate the
mainline, and if 7c has landed by then, hang the marks off tree nodes instead of a
flat array. 7a is not a dependency and does not exist. Verify all of this yourself
before starting; a previous session's brief asserted a dependency that was fiction.

## WHAT EXISTS

- **The engine can evaluate and search any position.** `evaluate(state, weights,
  rules)` (`src/game/engine.ts:378`) is a static score; `pickMove(state, rules, limits,
  config, rng, weights, now)` (`:890`) returns a `SearchResult` carrying
  `depth` / `nodes` / `score`. Scores are attacker-positive (`WIN = 1_000_000`,
  `DECISIVE = WIN - 1000` marks a forced mate), so a defender-favourable position is
  negative — **sign conventions are the classic way to get this feature backwards.**
- **The search runs off the main thread.** `src/game/ai.worker.ts` plus
  `useAiWorker()` (`src/game/useAiWorker.ts:21`), whose `requestMove(state,
  difficulty, rules)` resolves one move at a time and whose `cancel()` **terminates**
  the worker to kill a stale search. A whole-game pass is N sequential searches, so
  it must be cancellable and must not freeze the UI.
- **The whole timeline is in memory** — `states[]` in `App.tsx`, every position
  already replayed through `applyMove`. You do not need to re-replay anything to
  annotate; `states[k]` is the position after k plies and `states[k].history[k-1]`
  holds the move that got there.
- **Import gives you other people's games.** `parseGame` (`src/game/gameFile.ts:233`)
  → `ParsedGame.states`, replayed through `replayPlies` (`src/game/replay.ts:111`).
  An imported finished game is the ideal thing to annotate.
- **`MoveLog` (`App.tsx:2920`)** renders each ply as a clickable `<li>` — the place a
  mark (`?!`, `?`, `??`) attaches. The board's per-square `aria-label` (added in 7b)
  and `src/orientation.ts` are what any on-board marker must go through.
- **7b's autosave guard** (`autosaveAllowed`, `src/analysis.ts`) is the precedent for
  a mode that must not write over the live game.

## BUILD

1. **A whole-game analysis pass.** For each ply, search the position *before* the move
   at a fixed budget and compare that score to the score after the move actually
   played. Requirements:
   - **Pure scoring logic in its own module** (`src/game/annotate.ts` or similar):
     given a before-score, an after-score and the side that moved, return a
     classification. Unit-test it directly — including both sides, so a sign error
     cannot survive. The suites here are pure-logic only; anything left in the
     component is untested by construction.
   - **Thresholds are a judgement call — pick them, name them, and justify them in a
     comment.** Centipawn-style bands do not transfer from chess: this engine's
     `evaluate` is not pawn-scaled, so calibrate against real games rather than
     importing Lichess's numbers. State the calibration you did.
   - **Never mark near a decisive score.** Once the search reports a forced win
     (`|score| >= DECISIVE`), the difference between "winning" and "winning faster"
     is not a blunder. Suppress marks there or the tail of every finished game turns
     into a wall of `??`.
   - **Handle the unforced-error asymmetry honestly:** a move that merely fails to
     find the best win is not the same as one that throws the game away, and the
     labels should not pretend otherwise.
2. **Run it without freezing anything.** Sequential worker searches with visible
   progress ("analysing move 12 of 34"), cancellable mid-run, and a clear finished
   state. Decide and document what happens if the user navigates or starts a new game
   mid-pass — cancelling is the obvious answer, but make it explicit.
3. **Show the marks.** In the move log at minimum: a `?!` / `?` / `??` glyph plus the
   eval swing, colour-coded, with an accessible name (not colour alone). If it is
   cheap, a one-line summary per side ("2 inaccuracies, 1 blunder"). If 7a has landed,
   reuse its eval readout rather than building a second one.
4. **Decide where the marks live, and document it.** Session-only is a perfectly good
   answer for a first pass and avoids a save-format change. If you do persist them,
   version the save (`SavedGame`, `src/game/persist.ts`) and the file format
   (`FORMAT_VERSION`, `src/game/gameFile.ts`) properly: **a newer save must fail
   closed on an older build** — that rule is load-bearing (Session 5). Annotations
   are *derived* data, so re-deriving them is always an option; say which you chose
   and why in `docs/design/lichess-ui.md`.
5. Zen-hideable extra, mirroring the `flip` / `analysis` extras from 7b
   (`src/zen.ts`); i18n labels in `en` + `es`, `ga` drafts marked as drafts. Do
   **not** unhide the `ga` locale.

## CONSTRAINTS

100% offline — the pass runs on the local engine, no service. Theme-aware
(light/dark). Respect `prefers-reduced-motion`. Marks must never mutate the game:
annotating is read-only over `states[]`, must not touch the timeline, the clock, or
the saved game, and must not trigger the AI to move. The **replay-from-opening
invariant** (`CLAUDE.md`) still holds for anything persisted.

## VERIFY

Tests green, including the classifier directly: symmetric behaviour for both sides,
no marks near decisive scores, and stability of the bands you chose. `npm run build`
clean. Because this is a strength-adjacent change touching the search path, follow the
project's **verification standard** in `docs/ROADMAP.md` — do not ship a measured
regression to normal play. Driven-browser pass against the production build (see
`scripts/screenshot.mjs`): import or play out a finished game, run the pass, confirm
progress and cancellation both work, confirm the marks appear in the move log, and
confirm the live save is untouched by the whole exercise. Commit + push to your
assigned branch; no PR unless asked. Mark 7d shipped in `docs/ROADMAP.md` and
`docs/design/lichess-ui.md`, and update `docs/prompts/README.md`'s status table.

**7d closes Session 7 except for 7a**, which has never been built — say so plainly in
the roadmap rather than letting Session 7 read as complete.
