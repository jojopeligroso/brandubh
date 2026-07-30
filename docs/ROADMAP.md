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
- [ ] **Unhide Irish (`ga`) locale** — *held back deliberately.* The table is complete and renders correctly (cló Gaelach face, overdot orthography, `bḟ` eclipsis preserved), and a dozen strings were corrected while reading the whole UI in it — but the Irish **interface** stays out of reach until it has had a proper translation review. Individual Gaelic words in the English UI are names, not translated interface, and stay: the Branduḃ wordmark, the Ollaṁ difficulty. Every table is tested whether offered or not, so it cannot rot while it waits. Revealing it is a one-line change in `i18n.ts`, plus the header fix it needs: a third button overflows the header at 360–390px and squeezes the subtitle onto three lines at 430–520px, because the container is capped at `max-w-md` below the `sm` breakpoint. That fix — a `.seg-compact` switcher and a header that wraps as a whole rather than squeezing — is on record in this branch's history.
- [x] Deleted the dead `.piece.threat` CSS (styled since the first commit, applied by nothing). Not wired up: deciding what counts as "under threat" and whether it can be turned off is a gameplay-assist feature and a difficulty change, not a tidying pass — and the board already marks what is actually about to happen with `.dot.capture`. `docs/screenshot.png` refreshed; it still showed "Copenhagen Brandubh" and "Pass & play".
- [x] Verified in a driven browser against the production build, one pass per item: 14 assertions for the clock in Zen, 14 for the rule-toggle reset and save invalidation, 12 for the header wiring with Irish held back. Tests 250 (was 235).
- [x] Reconciled with the Session 5 that landed on `main` in parallel (`4997f48`). Its App.tsx changes are a subset of these, so they merged to this side; its `scripts/screenshot.mjs` (`npm run screenshot`) is the better tool and is kept, and `docs/screenshot.png` is regenerated with it. The one real disagreement was Irish: that commit revealed it, and this one holds it back.

### Session 6 — Opening book (Ollamh) *(M–L)* — **shipped**
**Goal:** Ollamh opens instantly, varied, and strong.
- [x] Offline generator `scripts/genbook.ts` (`npx tsx scripts/genbook.ts --depth 8 --plies 4 --parallel 4`): fixed-depth deep search over the D4-folded opening tree — two interleaved "cones" (plies 0+2 for ollamh-as-attackers, 1+3 for ollamh-as-defenders: the booking side's own plies book its best-N moves; the opponent's plies expand *every* legal reply, since a human can play anything). Positions canonicalised under D4 as discovered, so each orbit is searched once. Every position searched at **exactly depth 8** — the depth ollamh's live opening search measures inside its 8 s budget — and per position the best ≤3 moves within an eval margin of best are kept, via a new multi-PV root scorer (`scoreRootMoves` in `ai.ts`: near-best moves get exact scores, clearly-worse moves fail low almost free). **The shipped margin is 0 (exact ties only) and the shipped depth is 8 uniform (never deeper)** — both are measured decisions, not guesses: see the gauntlet below. Generation: 343 folded entries (292 with one kept move, 40 with two, 11 with three) in 18 min on 4 cores, fully deterministic.
- [x] Loaded into the existing `OPENING_BOOK` hook via the bundled `src/game/openingBook.data.ts` (compact: one line per canonical position) + loader `src/game/openingBook.ts` (unfolds all 8 D4 images at import to 2,737 runtime positions / 3,240 moves — symmetric positions merge every orientation of their booked moves, which is free extra variety at identical strength). 100% offline, bundled into `dist`. Bundle cost (data file 20.0 KB raw): main 507.5 → 510.8 kB gzip (+3.3), worker 5.8 → 8.4 kB gzip (+2.6) — ~6 kB total, far under the ~150 kB budget the session set.
- [x] **Honest relabeling:** the old `OPENING_BOOK` comments and test names claimed a *proven*, solver-fed book. A deep-search book is neither proven nor optimal, so the label is now *deep-search best-effort* everywhere (`ai.ts`, `docs/solving.md`, tests). What stays hard: a book move is served only when the live ruleset fingerprint-matches the generation ruleset (WTF; walker/custom fall through to search), and is re-validated against the live legal moves — a corrupt book can cause a silent fallthrough, never an illegal move. Only `ollamh` consults it; `hard` and below are untouched.
- [x] Book-lookup tests (`ai.test.ts`, "opening book" block, 6 tests): booked move played instantly and only by ollamh; illegal entry falls through to search; wrong ruleset falls through; whole first two plies covered; every expanded entry legal + deduplicated (via an independent decoder); seeded randomization varies the opening and stays deterministic.
- [x] **Measured** (`npx tsx scripts/bookbench.ts`):
  - *Speed:* booked opening reply in 0.1–0.5 ms vs 3.2–4.5 s live ollamh search (8 s budget, reaches depth 8) — effectively instant for the first ~2 moves of each side.
  - *Variety:* 20 distinct 4-ply openings / 18 distinct first moves over 24 seeded games with the shipped book, vs 6 distinct openings / 3 first moves over 8 seeds without. Depth 8 has real exact root ties, and the D4 unfold multiplies them by orientation — so the samey opening is gone without booking a single deliberately-inferior move.
  - *Strength gauntlet* (`bookbench.ts`: seeded head-to-head of the identical fixed-depth engine with vs without the book, colours alternating; the depth-8 runs are **paired** — same seeds with book on and off) — this is where the session's real work happened. Three candidate books, two genuine generator defects found and fixed, and one measurement-methodology lesson:
    - **Candidate 1 — margin 13, plies 0–1 at depth 9** (the original sketch: "best ≤3 within ~⅓ material unit for variety"). Depths 3/5 saturate (12–12; every game a defender win either way — no signal available). Depth 6: won 27–21 of 48. Depth 4: **lost 7–17 of 24** (plain baseline: defenders win 18/24; the book cost *both* colours) — a real regression: a move booked "within ⅓ pawn of best" is deliberately not-best, and the spec's other promise ("a book move is never weaker than what ollamh would have found") only holds at margin 0. Depth 8 paired: 2 flips against, 0 for. Rejected.
    - **Candidate 2 — margin 0, plies 0–1 still at depth 9**: depth 8 paired got *worse* (6 flips against, 0 for; 8–8 → 2–14). Investigating the surviving "exact ties" exposed **two real generator defects**, both fixed: (a) the multi-PV margin pass compared against its integer-widened *window* instead of the margin, so fractionally-worse moves (evals are fractional) could pass as "ties"; (b) generation searched with a transposition table warmed by *other positions* — ordinary alpha–beta search instability under foreign TT bounds let a move the live engine rates **6 points worse** ship inside an "exact ties" entry (`d5-d6` vs `e4-e6` after `d6-b6`). Fix: margin-strict accepts, no second pass at margin 0, and a **cold TT per scored position** — the book must be computed exactly the way the live engine would compute it.
    - **Shipped — margin 0, depth 8 uniform, cold generation**: every entry is the equal-best set a fresh depth-8 search finds, i.e. *ollamh's own opening search, precomputed*. Depth 6 head-to-head: **book 28 — no-book 20 of 48** (by colour: as defenders 21–3, as attackers 7–17 — depth 6 favours defenders throughout). Depth 8 paired: still 6 flips against of 16 — and this number is the methodology lesson, because it is **byte-identical across all three candidates**, which no strength difference can produce. Tracing the flipped games: they diverge at ply 1 where the book's seeded pick lands on a *different member of the same exact depth-8 tie class* than the baseline's seeded pick (`d5-b5` vs `d5-g5` after `d7-c7` — cold-verified equal at 9.5; depths 10–11 actually *prefer* the book's member; and fresh-seed depth-8 self-play from d5-b5 wins for the defenders in 22 plies). The live engine draws from the same tie class with the same randomization — the paired design just compares two tickets from one lottery, so once the first divergence is within a value-tie, "flips" measure trajectory chaos, not strength. The discriminating measurement is the depth-6 head-to-head, and the book is ahead there.

    Two generalisations recorded for future sessions: *a book must be generated by the exact computation that will consume it* (cold TT, same depth — "deeper is better" fails when a shallower engine must play the follow-up), and *paired gauntlets stop measuring strength at the first value-equal divergence*.
- Coverage is plies 0–3 (first two moves per side), not the "6–8 plies" a bigger book might target: ply 4+ multiplies the frontier by ~(keep × replies) per two plies — thousands of positions for moves live search already answers at mid-game speed. Shrinking coverage beat shipping a bloated book; recorded here deliberately.

### Session 7 — Lichess-style analysis UI *(L — see design doc)*
**Goal:** the analysis experience: eval bar, analysis mode, move tree, board flip, etc. Likely spans multiple sessions; start from the design doc and slice.

---

## Deferred / not worth it (with rationale)

- **Material endgame tablebases** — decisive endgames keep too many attackers to tabulate (~10⁸–10¹⁴); the tabulatable ones are foregone. See `docs/solving.md`.
- **Full game solve** — ~6×10¹⁴ states, ~228 yrs at current speed. Not here.
- **Null-move pruning** — tafl zugzwang makes it unsound without heavy guards; uncertain payoff.
- **PVS / aspiration windows** — measured neutral (ordering + TT + LMR already tighten windows). Kept as an off-by-default knob for wider variants.

## Verification standard (every session)
Tests green · build clean · gauntlet any strength-affecting change · commit + push · never ship a measured regression.
