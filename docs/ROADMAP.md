# Brandubh — Engine & Product Roadmap

The remaining work, broken into **sessions** sized so each can be implemented
*correctly* — finished, tested, and shipped — in one focused block. Big,
spec-heavy features have their own design docs (linked below); this file is the
master index and the per-session plan.

Detailed specs:
- Game resumability (shipped): [`docs/design/game-persistence.md`](./design/game-persistence.md)
- Game import/export (PGN-style): [`docs/design/game-import-export.md`](./design/game-import-export.md)
- Lichess-style analysis UI: [`docs/design/lichess-ui.md`](./design/lichess-ui.md)

---

## How to size a session (the rule this plan follows)

A session is **one coherent theme** that ends **green** — tests pass, build
clean, and any strength-affecting change gauntletted — and is **independently
shippable** on its own commit/push. Concretely:

- **~3–6 commits**, one theme; never mix engine internals with UX in the same session.
- **Ends verifiable:** a round-trip test, a gauntlet, or a manual check with evidence.
- **Small enough to fully test**, large enough to deliver one complete improvement.
- Sizes below: **S** ≈ half a session (batchable), **M** ≈ one session, **L** ≈ one
  focused session that should start from its design doc.

Never ship a measured regression. When a change is "neutral", say so and decide
on cost (free ⇒ may keep; costly ⇒ drop) — the discipline used all through the
last session (PVS dropped, recognizers kept, kingRegion shipped).

---

## Sessions (ordered by value ÷ effort)

### Session 1 — Game resumability *(M)* — **shipped**
**Goal:** a page refresh never loses a game in progress.
Match-setup (difficulty/variant/side) already persisted; this extended it to the live game.
Design + Lichess comparison: [`docs/design/game-persistence.md`](./design/game-persistence.md).
- [x] Serialize the game, `cursor`, clock banks and match score to `localStorage` under the versioned key `brandubh.game.v1`. The timeline is stored as its **move list** and replayed on load (as lila does), not as a position per ply — ~550 bytes for a three-move game.
- [x] Restore on load; a saved game is offered as **Resume / New** in the opening overlay, and nothing overwrites it until that choice is made.
- [x] Invalidate on corrupt / old-schema / stale (>14 days) data, on an unknown variant, on a move list that will not replay legally, and on "New match" / "New game".
- [x] Round-trip unit tests (`persist.test.ts`, 23 tests) plus a driven-browser refresh mid-game: board, move log and clock banks identical after Resume.

### Session 2 — Play either side *(S–M)* — **shipped**
**Goal:** choose to play the **raiders (attackers)** or the **king (defenders)** from the overlay.
- [x] Overlay side picker: *Play vs AI* now steps **side → difficulty** before the board appears, and the last side played is pre-selected. Over the board stays a top-level choice, as before.
- [x] Sides all derive from the play mode in one place, [`src/game/sides.ts`](../src/game/sides.ts) — `humanSideOf` / `aiSideOf` / `clockPlacement`. `App.tsx` no longer hardcodes `onChoose("defenders")`; the picked side is what starts the game.
- [x] Board **orientation** needs nothing: the opening is D4-symmetric (two raiders at the head of each arm, king centred), so there is no near/far half to flip. Only `controllable` changes. Recorded in `sides.ts`.
- [x] Clock placement follows the human: they sit at the bottom whichever side they took; over the board the raiders keep the top (they move first).
- [x] Side persists (Session 0) and rides in the resumable game (Session 1) for **both** sides — `sides.test.ts` round-trips each.
- [x] `sides.test.ts` (13 tests): both sides drive the AI to legal moves by pieces it owns, and the computer opens when the human takes the king (the raiders always move first).
- [x] Driven-browser check against the production build (29 assertions, all passing): a game played as the raiders (human opens, the AI answers with a defender) and as the king (the AI opens with a raider unprompted), each refreshed mid-game and resumed to an identical board, move log and side; plus the clock faces — the computer above the board, the human below, either way.

### Session 3 — Export / import games (PGN-style) *(L — see design doc)* — **shipped**
**Goal:** save a game to a file and load one back, Lichess-style.
- [x] Serialize a finished/in-progress game to the PGN-style text format (metadata header + move list in the app's existing notation) — `src/game/gameFile.ts`.
- [x] Download/copy export; paste/upload import with a tolerant parser (aagenielsen.dk-compatible) — `src/components/GameFilePanel.tsx`.
- [x] Load an imported game into the existing replay timeline (step/branch already exist).
- [x] Parser/round-trip tests; reject malformed input gracefully — `gameFile.test.ts`, `replay.test.ts` (60 tests), plus a browser pass (29 checks).

`src/game/replay.ts` came out of this session: replay-and-validate, with no
knowledge of any file format. Session 1's `restoreGame` now sits on it too, so
a save and a pasted game are validated by the same code — one trust boundary,
two encodings, neither coupled to the other.

### Session 4 — Attacker endgame recognizer *(M)* — **shipped (as a default-off knob)**
**Goal:** the exact twin of the defender recognizers, for **forced attacker wins** (imminent king capture) — helps the side you're pressure-testing.
- [x] `forcedAttackerWin(state, rules)` returning `+RECOGNIZED_WIN` — attacker on move with a capture in hand, or defender on move but *netted* (every reply losing the king). `src/game/ai.ts`.
- [x] Cross-validated against an independent AND-OR oracle over random self-play in both variants — the exact mirror of `recognizers.test.ts`. `src/game/attackerRecognizer.test.ts` (6 tests): fixtures + a soundness sweep that fires and agrees at depth 4 on every hit.
- [x] **Throughput measured, and it is *not* free** — the finding that shaped the outcome. A capture, unlike an escape, is not pure geometry: the active-capture rule needs the *moving* attacker beside the king, so proving one needs move generation, not a `clearPathToCorner`-style O(1) test. A naïve ≤3-ply version measured ~150× slower per leaf; trimmed hard (O(1) pressure gate, bounded defender loop, capture check limited to king-adjacent landings) it still measured **~7% fewer nodes/s** in an isolated A/B (defender-recognizer baseline vs +attacker) on an endgame-heavy sample. A fixed-depth gauntlet showed **no win-rate change** (strength-neutral, like the defender twin).
- [x] **Decision (per the sizing rule below): neutral + not-free ⇒ shipped behind its own `attackerRecognizer` weight flag, default OFF** — a per-variant / analysis knob, exactly as PVS ships off. The default engine path is byte-for-byte unchanged, so there is **no throughput regression**. Kept rather than dropped because it is a proven, cross-validated tool the analysis UI (Session 7) and pressure-testing can switch on deliberately. The roadmap's original "escape-zone-style gate for zero throughput cost" assumed a symmetry with escapes that does not hold; documented honestly in `ai.ts`.

### Session 5 — Correctness & discoverability polish *(S — batch)* — **shipped**
**Goal:** fix known bugs and make features findable.
- [x] **Clock reachable in Zen:** settled as a rule rather than a special case — if Zen can hide it and it configures the app, the gear ⚙ modal is its guaranteed home. `ClockSettings` and `CustomRuleEditor` became card-less controls (the shape `ZenSettings` already had) so both render inline and as modal sections, and `GameFilePanel` — the same trap, newly arrived with the "gamefile" Zen extra — renders there too. The modal is titled *Settings* now; board design is one section of it.
- [x] **Custom-rule-editor reset:** the editor's `onChange` went straight to `setCustomRules`; both it and `changeVariant` now go through `resetGame`. The second half was the save: the autosave writes the current move list beside the current ruleset, so a rule toggle used to leave `brandubh.game.v1` pairing old moves with new rules — sometimes unreplayable, worse, sometimes replaying into a *different* game, since a rules swap can leave every move legal and only change what it captures. `SavedMove` now carries an optional per-ply capture count, so storage goes through the same `capture_mismatch` check the export format already had (`game/replay.ts`) — one trust boundary, both encodings. Optional, so older saves still restore; a newer save fails closed on an older build.
- [x] `VISIBLE_LANGS` is wired to the header. It was exported and never imported — the header hardcoded its own buttons — which is what made "reveal a locale" a two-place edit. It is now the single source of truth for what is on offer.
- [ ] **Unhide Irish (`ga`) locale** — *held back deliberately.* The table is complete and renders correctly (cló Gaelach face, overdot orthography, `bḟ` eclipsis preserved), and a dozen strings were corrected while reading the whole UI in it — but the Irish **interface** stays out of reach until it has had a proper translation review. Individual Gaelic words in the English UI are names, not translated interface, and stay: the Branduḃ wordmark, the Ollaṁ difficulty. Every table is tested whether offered or not, so it cannot rot while it waits. Revealing it is now a one-line change in `i18n.ts` and nothing else: the header fix it used to need — a third language button overflowed the header at 360–390px, because the container is capped at `max-w-md` below the `sm` breakpoint — no longer applies, since the language toggle moved out of the header and into the hamburger menu, where it has a row to itself.
- [x] Deleted the dead `.piece.threat` CSS (styled since the first commit, applied by nothing). Not wired up: deciding what counts as "under threat" and whether it can be turned off is a gameplay-assist feature and a difficulty change, not a tidying pass — and the board already marks what is actually about to happen with `.dot.capture`. `docs/screenshot.png` refreshed; it still showed "Copenhagen Brandubh" and "Pass & play".
- [x] Verified in a driven browser against the production build, one pass per item: 14 assertions for the clock in Zen, 14 for the rule-toggle reset and save invalidation, 12 for the header wiring with Irish held back. Tests 250 (was 235).
- [x] Reconciled with the Session 5 that landed on `main` in parallel (`4997f48`). Its App.tsx changes are a subset of these, so they merged to this side; its `scripts/screenshot.mjs` (`npm run screenshot`) is the better tool and is kept, and `docs/screenshot.png` is regenerated with it. The one real disagreement was Irish: that commit revealed it, and this one holds it back.

### Session 6 — Opening book (Ollamh) *(M–L)*
**Goal:** Ollamh opens instantly, varied, and strong.
- [ ] Offline generator: deep search over the (D4-folded) opening tree, best-N with light randomization → data file.
- [ ] Load into the existing `OPENING_BOOK` hook (already wired); label honestly as *deep-search*, not *proven*.
- [ ] Book-lookup tests; measure opening speed + move variety.

### Session 7 — Lichess-style analysis UI *(L — see design doc)*
**Goal:** the analysis experience: eval bar, analysis mode, move tree, board flip, etc. Likely spans multiple sessions; start from the design doc and slice.

- [x] **7a — Eval bar + best-move arrow — shipped.** Read-only: an eval bar beside the board and the engine's suggested move drawn on it, for whatever position the cursor is on — stepping back re-evaluates each position as you pass it, which is the point of an eval bar on a timeline.
  - **The score had to be plumbed before anything could show it.** `pickMove` has always returned one and every layer above dropped it: it is now on `MoveInfo`, on the worker's `AiResponse` and so on `AiMove`. `WIN`/`DECISIVE` are exported rather than copied, because a second definition of "decisive" is one that can drift from the engine's.
  - **Analysis runs on its own worker instance** (`useAnalysisWorker`), and that is structural, not incidental. Play cancels a stale search by *terminating its worker* — the only way to abort a synchronous search — so on a shared instance every cursor step could kill the AI's in-flight move and every AI move could kill the analysis. Separate instances also mean separate module state, so analysis's different weights cannot poison the playing engine's transposition table. Measured: 3 workers constructed over a game, **peak 2 alive simultaneously**, and AI reply latency with the bar on vs off was 642 ms vs 1122 ms in one run and 820 ms vs 790 ms in another — i.e. the difference is dominated by which positions the two diverging games reach, not by the analysis. No regression, and none available to measure.
  - **Shallow and debounced:** depth 3 with the full machinery (the `medium` tier's search, ~50 ms), a 1 s safety deadline and no depth floor, so it can return shallow rather than make you wait. A 220 ms debounce means scrubbing the timeline fires one search at the end, not one per position. **Deterministic in the position alone**, which took two things: a pinned tie-break `rng` *and* clearing the transposition table before each analysis. The table feeds move ordering, so without clearing it, stepping back to a position you had already passed through could draw a different (equally best) arrow than it drew the first time — the engine appearing to change its mind about a position that had not changed. Found in the driven-browser pass, not by reasoning; the A → B → A case is now a unit test. Safe to clear only because analysis owns its thread.
  - **Analysis turns `attackerRecognizer` ON** (`ANALYSIS_WEIGHTS`). This is the case Session 4 kept that default-off knob for: one search, on demand, where naming a forced attacker win exactly beats guessing at it. Play is byte-for-byte unchanged.
  - **Orientation: the bar's two ends are the two chairs**, and it turns over with the board exactly as the clocks do (7b's decision, applied). The caller hands it `bottomClockSide`, so a fill above half and a positive number both mean "the near player is ahead" whichever side you took and whichever way up you are looking. The mapping is a logistic curve on the engine's own scale — one piece (40) moves the bar 7%, not to the end — and the last 3% at each end is reserved so a *proven* win looks different from a crushing one. Decisive scores render as "Raiders win" / "King wins" instead of a number.
  - The arrow takes its endpoints from `viewArrow` (`src/orientation.ts`), so it is orientation-aware for free and cannot point at a square other than the one drawn beneath it — the seam 7b left for it, used as intended. It is an absolutely-positioned SVG, so it never becomes a grid item and the board's 7×7 auto-placement is untouched, and it is `aria-hidden`, so the grid's accessible children are still 49 gridcells and nothing else.
  - Zen extra `eval` (off by default in Zen, like every extra), plus a toggle button beside the flip button that persists — the same two-layer arrangement flip has, where the extra decides whether the *control* is on screen and the preference holds the state. Switching it off cancels the search rather than just hiding the result. Labels in `en` + `es`, `ga` drafts marked as such; the Irish interface stays held back.
  - Verified: **406 tests** (was 383; +22 in `evalBar.test.ts` and +1 in `zen.test.ts` covering the sign convention both ways, the decisive and recognizer cases, monotonicity, the reserved ends, the bar-vs-number agreement, the score threading through `chooseMoveDetailed`/`analysePosition`, a finished game evaluating to a verdict the bar can render, and the new Zen extra defaulting to hidden), `npm run build` clean, and **34 driven-browser assertions against the production build over five runs** — the bar and arrow rendering, the arrowhead landing exactly on the destination cell centre, the readout following the cursor back through the timeline and matching on return, flip inverting both the fill and the arrow, the toggle removing both and persisting, the board keeping `role="grid"` and 49 gridcells with the overlay present, the two searches overlapping on separate threads, and every displayed verdict and score fitting its column without breaking mid-word at 360px in all three locales.
  - **Not in 7a, deliberately:** no free-move or position setup (still read-only — analysis *mode* is 7b's, already shipped), no variations, no post-game annotation, and no eval on the move log rows. The bar shows one number for one position; per-move eval swings are 7d's job.
- [x] **7b — Board flip + analysis (free-move) toggle — shipped.** Built without 7a, which turned out not to exist: 7b's own two features do not depend on it, and the ordering in the design doc was a suggestion about size, not a compile-time dependency. What 7b owed 7a — *"the arrow overlay must become orientation-aware"* — is delivered as the seam rather than the consumer: `src/orientation.ts` is the single mapping between board space and view space, and `viewCenter`/`viewArrow` give an arrow its endpoints in view coordinates. An overlay that draws from those is orientation-aware for free and cannot point at a different square than the one on screen. Both are unit-tested (endpoints reflect through the centre, length is preserved, on-screen direction reverses) so the contract is pinned before there is a caller.
  - Flip is view-only: the board iterates in view order and each drawn cell resolves back through `fromView` to the square it stands for, so nothing downstream of the click sees a flipped board. `game/sides.ts` still says orientation never follows the side you play; this is a preference about the picture.
  - **The clocks flip with the board** — decided, not defaulted. The whole view turns over or none of it does: the clocks are the two players' chairs, and leaving them put while the board rotates would seat the away player's clock beside the near player's pieces, which is the one thing Lichess-style placement exists to get right. The swap is in the view; `clockPlacement` is unchanged.
  - Coordinates stay truthful under flip: the labels move to whichever drawn edge is now bottom/left (files read `g…a`, ranks `1→7`) and every cell carries its own square name as an `aria-label`, so what a screen reader reads is the board, not the view.
  - Analysis suppresses the AI, makes both sides pickable, stops the clock through the same gate that stops it while reviewing, and is labelled on screen rather than left to be inferred from an absent reply. It **cannot overwrite the live save**: the autosave is closed for the duration *and* the live timeline (states, cursor and the index-aligned clock line) is snapshotted on enter and handed back on exit. A page-hide mid-line therefore cannot write a scratch position over the real game. New game / import / resume drop the snapshot instead of restoring it, since they are replacing the game it describes.
  - Moving from a rewound position in analysis **truncates**, exactly as "play from here" always has. Variation trees are 7c and nothing here pretends otherwise (`commitBasePly`, `analysis.ts`).
  - Both toggles are opt-in Zen extras (`flip`, `analysis`); labels in `en` + `es`, with `ga` drafts marked as such — the Irish interface stays held back.
  - Verified: 383 tests (was 346; +37 across `orientation.test.ts` and `analysis.test.ts`), `npm run build` clean, and 53 driven-browser assertions against the production build over three runs — flip geometry and labels, clock swap, a flipped click moving the right piece, no AI reply in analysis, both sides pickable, the save untouched during and restored after, the AI resuming afterwards, truncation from a rewound cursor, and Zen hiding both.
- [x] **7c — Move-tree panel (variations, navigation) — shipped.** A second idea from the same position is now a **sibling** rather than a replacement. `src/game/moveTree.ts` is a pure, React-free tree (nodes keyed by never-reused ids, first child = mainline) with `addMove` / `promote` / `remove` / `treeLines`; 26 unit tests cover it, including the two things that decide whether a tree stays usable — replaying a move already tried **navigates to the existing branch instead of duplicating it**, and `promote` walks the whole path to the root rather than only reordering one parent, which would leave the button looking broken.
  - **Trees are analysis-only, and that is the design, not a shortcut.** A game has one history: the save and the export encode one move list, and a takeback is *supposed* to destroy moves. Live play stays a single line, and `rewindTo` / `doTakeback` / `playFromHere` / `resign` are now explicitly closed to analysis so the two can never cross.
  - **Nothing in the UI had to learn about trees.** `App.tsx` derives the board's `states`/`cursor` from the line between the tree's root and the selected node, so the board, move log, captured tray and review controls work inside a variation unchanged — they still see a list of positions and an index. Step-back means "select the parent node", which is exactly why stepping back and playing something else now branches instead of overwriting.
  - **Variations are session-only** and the panel says so out loud. Analysis has never written to storage (7b), so this needed no save-format or `FORMAT_VERSION` bump and carries none of that risk; annotations are re-derivable and variations are cheap to replay by hand.
  - 7c **retired `commitBasePly` and the 7b enter/exit snapshot**: analysis no longer borrows the live timeline, so there is nothing to put back. The autosave guard stays and still matters — what the autosave reads is the *derived* line, which in analysis is a variation.
  - Verified: 405 tests (was 383), clean build, and 24 driven-browser assertions — the sibling actually surviving, no duplicate on replay, click-to-jump, promote, delete, the live save untouched throughout, and live "play from here" still truncating as it always did.
- [x] **7d — Post-game annotations — shipped.** Re-searches the displayed line and marks where the game swung, as `?!` / `?` / `??` in the move log plus a per-side tally. `src/game/annotate.ts` holds the judgement (pure, 26 tests); `App.tsx` holds only the walk, because it drives the worker.
  - **The bands are measured, not borrowed.** Centipawn thresholds do not transfer — this engine is not pawn-scaled, and one capture on a 7×7 board can be a fifth of the material. `scripts/annotate-calibrate.ts` sampled 40 seeded self-play games at depth 3 (850 plies, 327 of them losing ground, a quarter of moves random so there would be real errors to size): p50 30, p75 76, p90 110, p95 180. The bands land on that distribution *and* on the evaluation's own anchors — inaccuracy 40 (≈p60, a piece), mistake 80 (≈p80), blunder 120 (≈p91, `escapeLane`, an open road to a corner). The pass searches at the same depth 3 the bands were measured at, because scores from another depth are not comparable to them.
  - **Two suppressions matter as much as the bands.** A position best play has already decided is never marked — otherwise the tail of every finished game is a wall of `??`, which is how an annotation feature stops being read — and a forced move is never a mistake, because there was no decision to get wrong. The one case that still marks at full severity is walking from a live position *into* a forced loss: that is the move that threw it.
  - **The sign convention is the whole trap** and is handled in exactly one place (`lossFor`). Scores are attacker-positive, so the same drop means opposite things depending on who moved; a classifier that forgets it marks every good defender move as a blunder. Tested symmetrically, both sides.
  - One search per *position*, not two per move — the value after ply k is the value before ply k+1 — so an n-move game costs n+1 searches, about two seconds at this depth. Progress is shown and can be stopped; stopping lets the search in flight finish rather than terminating the worker, whose pending promise would never settle.
  - Offered wherever the AI does not want the single worker: a finished game, analysis, or over-the-board play. Marks are stored against the exact line they were computed for, so stepping into a variation hides them instead of showing another line's verdicts.
  - **Nothing is persisted.** Annotations are derived data and re-derivable in seconds, so no save or `FORMAT_VERSION` bump — and none of that risk. The AI's move selection is untouched: `chooseMoveDetailed` now reports the `score` the search already had, and the search path is otherwise byte-identical, so there is no strength change to gauntlet.
  - Verified: 431 tests (was 405), clean build, and 39 driven-browser assertions over three runs — including that the glyphs drawn beside the moves total exactly what the summary claims.

**Session 7 is now shipped except 7a** (eval bar + best-move arrow), which has never been built and has no brief. The orientation seam it needs is already in place and tested (`src/orientation.ts`).
- [x] **7e — Position setup (FEN-equivalent) — shipped.** Not in the original slicing; added to close out the design doc's last unbuilt target feature. `src/game/position.ts` encodes a board plus the side to move as one FEN-shaped line (27 tests) — the deliberate complement of the *game* file, which can only carry a move list replayed from the opening.
  - **It never becomes the live game.** A pasted position arrives as the root of an analysis tree — `moveTree.ts` already rooted at any `GameState`, so 7c had built this without knowing it — and lives in component state, where the tutorial set-plays keep their hand-built boards. The replay-from-opening invariant holds with no guard of its own, because analysis has never written to storage.
  - **Game export is blocked while one is loaded, with the reason shown.** That is the one place the invariant could genuinely leak: exporting a tree rooted on a pasted board would write a move list that replays from the opening into a completely different game.
  - Validation refuses anything unplayable and quotes the rank back — bad rank count or width, unknown symbol, missing side to move, no king or two kings, and a soldier on a corner or the throne. A board wrong in two ways leads with the missing king: a fact about the whole position outranks a fact about one square.
  - Verified: 479 tests (was 452), clean build, 30 driven-browser assertions over three runs, including that export is blocked for a pasted root and *not* for analysis seeded from the live game.

**Session 7 is complete** — 7a, 7b, 7c, 7d and 7e all shipped, and every target
feature in the design doc with them. It did not run in the order it was written,
and two sessions overlapped: 7b shipped first, because its brief's claimed
dependency on 7a turned out to be fiction and its two features stood alone; 7c,
7d and 7e followed on that branch; and **7a was built independently, in parallel,
on its own branch** (PR #23) while that work was in flight.

The overlap cost less than it might have, and the reason is worth keeping. 7b had
paid its debt to 7a as a *seam* rather than a consumer — `src/orientation.ts`,
unit-tested before it had any caller — and 7a, written by a session that had
never seen the branch it was racing, picked that seam up unchanged and got an
orientation-aware arrow for free. A contract written down and tested is what let
two independent implementations meet without either knowing about the other.

It also cost something real: a second, duplicate 7a was written on this branch
and thrown away at merge time, because main's had already shipped. That is the
price of not checking the remote before starting a slice, and it is the same
lesson the prompts README already records for premises — check the repo, not the
brief.

Session briefs now live in [`docs/prompts/`](prompts/README.md), one per slice, so a
session can be started cold without the anchors and invariants being retyped from
memory.

---

## Deferred / not worth it (with rationale)

- **Material endgame tablebases** — decisive endgames keep too many attackers to tabulate (~10⁸–10¹⁴); the tabulatable ones are foregone. See `docs/solving.md`.
- **Full game solve** — ~6×10¹⁴ states, ~228 yrs at current speed. Not here.
- **Null-move pruning** — tafl zugzwang makes it unsound without heavy guards; uncertain payoff.
- **PVS / aspiration windows** — measured neutral (ordering + TT + LMR already tighten windows). Kept as an off-by-default knob for wider variants.

## Verification standard (every session)
Tests green · build clean · gauntlet any strength-affecting change · commit + push · never ship a measured regression.
