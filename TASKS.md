# Brandubh — Open Tasks

## ▶ Roadmap (start here)

The remaining work is planned as sized, shippable **sessions** in
[`docs/ROADMAP.md`](docs/ROADMAP.md), with design docs for the two big features.
Ordered by value ÷ effort:

1. ~~**Game resumability** *(M)* — a refresh never loses a game in progress.~~ **Shipped** → [`docs/design/game-persistence.md`](docs/design/game-persistence.md).
2. ~~**Play either side** *(S–M)* — choose raiders or king from the overlay.~~ **Shipped** → `src/game/sides.ts`.
3. ~~**Export / import games** *(L)* — PGN-style save/load.~~ **Shipped** → [`docs/design/game-import-export.md`](docs/design/game-import-export.md), `src/game/gameFile.ts` + `src/game/replay.ts` + `src/components/GameFilePanel.tsx`.
4. ~~**Attacker endgame recognizer** *(M)* — exact forced-attacker-win twin of the defender recognizers.~~ **Shipped** as a cross-validated, default-off knob (`attackerRecognizer`): a capture needs move-gen where an escape is O(1) geometry, so it is neutral-but-not-free — off by default, no throughput regression. See `docs/ROADMAP.md` Session 4.
5. ~~**Correctness & discoverability polish** *(S)* — clock reachable in Zen, custom-rule reset bug, unhide Irish locale, dead CSS/screenshot.~~ **Shipped**.
6. ~~**Opening book (Ollamh)** *(M–L)* — deep-search book for instant, varied openings.~~ **Shipped**: `scripts/genbook.ts` generates a D4-folded book of exact-best moves (plies 0–3, searched at depth 8, margin 0 — a margin-13 "variety" candidate measured a paired-gauntlet regression and was rejected) into the bundled `src/game/openingBook.data.ts`; ollamh plays it instantly, varied via ties + D4 orientations. Honestly labelled *deep-search best-effort* — not proven (see `docs/solving.md`). See `docs/ROADMAP.md` Session 6 for all measurements.
7. ~~**Lichess-style analysis UI** *(L)* — eval bar, analysis, move tree.~~ **Shipped**, all six slices: 7a eval bar + best-move arrow, 7b board flip + analysis free-move mode, 7c move-tree panel, 7d post-game annotations, 7e position setup (paste a position in), 7f learn from your mistakes (review, eval graph, guess-the-move). The session grew two slices past its own plan; this line said "all four" until long after both had shipped. Per-slice briefs in [`docs/prompts/`](docs/prompts/README.md); design notes in [`docs/design/lichess-ui.md`](docs/design/lichess-ui.md).

8. **Puzzle bank** *(L)* — ~80 verified puzzles on the Learn screen, as named sets and a graded pool. **8a–8e shipped**: the Attempt seam, 161 puzzles mined into checked-in shards, the tagger, the Learn screen that lists them, and the unlisted proving ground that will calibrate the grades. **8f blocked** on human blind-comparison data that does not exist yet (ADR-0005), which is a fact about a schedule rather than a task left in the code. Plan in [`docs/design/puzzle-bank.md`](docs/design/puzzle-bank.md), sliced 8a–8f in the roadmap, with five ADRs in [`docs/adr/`](docs/adr/) and the vocabulary in [`GLOSSARY.md`](GLOSSARY.md).

9. **An app that can be played from the keyboard** *(M–L)* — the board cannot be operated without a pointer. `src/components/Board.tsx` renders 49 `role="gridcell"` divs, none of them focusable and none of them inside a `role="row"`, so the grid is unreachable *and* its structure is invalid; every mode that draws a board is affected, it predates Session 8, and it is live now. Found by the Learn-screen accessibility pass (`ddfd5f8`) and reported there rather than fixed. Three slices in the roadmap: **9a** authors a focus ring first (six authored focus rules exist today and five of them remove the browser's, so the ring everything currently relies on is the user agent's), **9b** adds the rows, a roving `tabIndex` and an Enter/Escape move protocol routed through `src/orientation.ts` so arrows track the *view* under flip, **9c** settles focus at both surface boundaries (`inert` behind the Learn dialog; the focus move without the Tab trap in the proving ground, which is not modal and would become a keyboard trap if it reused the dialog hook). See `docs/ROADMAP.md` Session 9.

10. ~~**Setting up a game over the board** *(S)* — the over-the-board path asks for a time control, and Zen is the default board.~~ **Shipped**: a time step on the over-the-board path (the counterpart of the AI path's strength step) rendering the same `ClockControls` the settings panel does, with the choice travelling with the game choice like the AI strength rather than applying as it is edited; the custom bank stepped and rounded to whole minutes; no bullet presets over the board; Zen on out of the box, with a second switch at the foot of the page for when the header's has scrolled away. See `docs/ROADMAP.md` Session 10.

Session-sizing rule and per-session tasks live in the roadmap. The items below are
the raw backlog those sessions draw from.

## ⚠ Rules under review

Rules questions with a shipped default + custom toggle — see
[`docs/rules-review.md`](docs/rules-review.md). **King capture next to the
throne** (Brandubh's `wtf` preset, four-sided surround with the empty throne as
the fourth wall) was **resolved 2026-09-09**: the WTF Brandubh PDF and
worldtafl.com, both read in full, agree that 7×7 does *not* get the
four-sided rule next to the throne — only *on* it. The owner decided to ship
`wtf` unchanged anyway, because the opening book, puzzles, annotation bands
and every gauntlet result were computed under the four-sided flags; see
`docs/rules-review.md` and `CLAUDE.md`'s "Contested rule" section. It is a
verified-and-deliberately-retained default now, not an open question — the
custom-rule editor is where the sourced reading is reachable. No Brandubh
preset flag changed.

## Half-built

- [ ] **Irish (ga) locale** — **Re-hidden** (decision reversed): the `ga` strings are unreviewed machine drafts and stay out of `VISIBLE_LANGS` until a human Irish speaker signs the copy off — see `CLAUDE.md`. The translations remain in `src/i18n.ts` (TypeScript keeps them complete); the remaining work is the human review, not code.
- [ ] **Compact header for a third language button** — written and then lost. Revealing `ga`
  needs it: a third button overflows the header at 360–390px and squeezes the subtitle onto
  three lines at 430–520px. A `.seg-compact` switcher plus a header that wraps as a whole
  was written on the Session 5 branch (`768f12a`, `aa99dca`) and is **not in `src/` today** —
  `git log --all -S "seg-compact" -- src/` is where to find it. Blocked behind the Irish
  translation review above, not worth re-landing before it.
- [x] **`.piece.threat` CSS** — Removed as dead code; it was styled in `index.css` but never applied in any component. (`.piece.captured` is still used by the "Show me how" demo, now in `ObjectivesContent.tsx`.)

## AI engine — next levers

The search core (iterative deepening + transposition table + quiescence + move
ordering) landed in `engine.ts`. It is board-size-agnostic and variant-driven, so
the *machinery* carried over to Tablut unchanged — but "without change" was too
strong, and the Tablut work is what showed it: everything answering "how close is
the king to winning" had to be rewritten, because corner-escape geometry is
meaningless when the whole rim wins. See `docs/adr/0006-…` (and its addendum) and
`src/game/tablut/engine.ts`. Remaining:

- [x] **Move search to a Web Worker** — done. `src/game/ai.worker.ts` runs the
  search off the main thread (bundled into `dist/`, so still 100% offline);
  `src/game/useAiWorker.ts` manages its lifecycle, cancels a stale search by
  terminating the worker, and falls back to synchronous play if Workers are
  unavailable. With the UI freed, `hard` could afford a real time budget —
  `DIFFICULTY.hard.limits.deadlineMs` in `src/game/engine.ts` is `3000` (3 s),
  not the "~1.5 s" this line used to say; `git log -p` on that block shows the
  value has been `3000` since it was introduced, so the smaller number was
  never true rather than since revised — and pickMove gained predictive
  iteration stopping so slower devices wait less (they simply search shallower)
  instead of burning the whole budget on an unfinishable ply.
- [x] **Evaluation tuning** — investigated via `scripts/evaltune.ts` (weighted
  `evaluate()` + self-play gauntlet). Original outcome (now partly corrected,
  see below): **keep the default weights** for `kingRegion` (beat the
  baseline 31–9 at weight 6, still stands) and park `liberties`, `shield`,
  `mobility` and `blockerAwareKingDist` at weight zero as "neutral or worse".

  **That parking verdict is now known to have been mismeasured, not merely
  superseded.** An A/A control on `evaltune.ts`'s own protocol (identical
  weights on both sides, depth 4, 24 games) came back 21/24 (87.5%) to
  whichever side moved second, with byte-identical code on both sides. A
  signal as small as one eval term is invisible under that much bias, so every
  "neutral or worse" verdict the unpaired harness produced for these four
  terms was measuring the harness, not the terms.

  Re-measured on a mirrored-pair gauntlet built to remove that bias
  (`scripts/pairgauntlet.ts` — validated: A/A control net 0, known-positive
  depth-4-vs-3 calibration p=0.00195), 60 mirrored pairs per term, depth 4,
  book2 openings:
  - **`liberties` — overturned, ships at 12.** Pooled over 120 mirrored pairs
    (an initial 60 plus a fresh-seed replication): 33W/5L, p=4.3e-6.
    `src/game/engine.ts` `DEFAULT_WEIGHTS`.
  - **`mobility` — still parked.** Significant once, p=0.0118, but only 0.047
    after Bonferroni correction across the four terms tested, and
    unreplicated. A combined run with `liberties` showed no measurable lift
    over `liberties` alone (Fisher's exact on the win:loss ratio, p=1.0), so
    there is no evidence it adds anything. Needs its own replication before
    reconsideration.
  - **`shield` — VINDICATED.** 9W/8L, p=1.0000. The original parking decision
    was correct and now rests on evidence far stronger than the biased
    harness ever produced.
  - **`blockerAwareKingDist` — VINDICATED.** 5W/9L, p=0.4240. Same.

  The search rewrite still captures what these heuristics proxied for, for
  the three that remain parked as opt-in knobs for per-variant retuning (see
  below). Full record, including the instrument's own validation, in
  `docs/ROADMAP.md` Session 11.
- [x] **Opening book** — done (roadmap Session 6): deep-search book covering the
  first two moves of each side, played instantly by ollamh with seeded variety.
  Not the aagenielsen.dk game-import flavour of book once envisioned below —
  that remains future work.
- [ ] **Tune the Tablut eval weights** — `src/game/tablut/engine.ts`'s
  `DEFAULT_WEIGHTS` are reasoned, not measured, and say so. Brandubh's came off an
  A/B gauntlet over hundreds of games (`scripts/evaltune.ts`); Tablut needs its own
  arm, because 16 v 8 pieces, four possible escape lanes and 81 squares are not a
  rescaling of 8 v 4 / two / 49. `usePVS` ships on there as a considered default
  and wants the same treatment. The timed tiers already self-adjust, and the depth
  floors and the effective-branching-factor cap *were* measured — see the notes in
  that file.
- [x] **Board-symmetry (D4) root-move folding** — done (`engine.ts`: `stabilizer` /
  `foldRootMoves`). The opening's 40 first moves fold to 5 at symmetric positions,
  buying ~1 ply and cutting opening nodes ~2×. Applied per-turn at the root only;
  TT-key canonicalisation deliberately skipped (per-node hashing cost for little
  midgame gain). Generalises to any square board (carries to Tablut).

## Tablut and Copenhagen parity

The search core carried over to both larger boards; the rigor that produced
Brandubh's numbers did not. Recorded here as one list because it is one gap,
not scattered wherever each item happens to live — see `docs/ROADMAP.md`
Session 12 for the plan that addresses it.

- [x] **Copenhagen `hard`/`ollamh` disabled until backend** `[engine]`/`[ui]` — owner
  decision 2026-09-09 (WP-4.2): playtesting found both tiers too slow to be
  playable in the browser at this board's opening branching factor. The setup
  sheet renders them disabled with an explanation (`game/copenhagen/difficultyCap.ts`,
  `COPENHAGEN_MAX_DIFFICULTY`); `DIFFICULTIES`/`DIFFICULTY` in `engine.ts` are
  unchanged, since scripts and tests still drive the full ladder. Re-enable
  after Phase 3.4 (Zobrist hashing / make-unmake) and a measured deadline-depth
  check.
- [ ] **Copenhagen eval weights are unmeasured** `[engine]` — `DEFAULT_WEIGHTS` in
  `src/game/copenhagen/engine.ts` are reasoned, not gauntletted, same situation
  as Tablut's line above but with no entry of its own until now.
- [x] **`usePVS` measured on both larger boards** `[engine]` — WP-2.0
  (2026-09-09, `docs/reports/pvs-tablut-copenhagen.md`): equal-depth node
  counts (PVS costs MORE nodes than plain alpha-beta on both boards, not
  fewer — the "wider board has more to save" premise both `FULL_CONFIG`
  comments used to ship on), ladder wall-clock (PVS never reached a deeper
  depth under a real deadline on either board), and the mirrored-pair
  gauntlet at each board's own recommended depth/pairs (Tablut p=0.4545 at 40
  pairs, Copenhagen p=0.1686 at 70 pairs — neither significant, both leaning
  toward PVS off). `usePVS` now ships `false` on both, matching Brandubh.
- [ ] **No gauntlet instrument for either board** `[tests]` — `scripts/pairgauntlet.ts`
  hard-codes `VARIANTS.wtf` and depends on the Brandubh opening book; it cannot
  run against Tablut or Copenhagen without parameterising both.
- [ ] **No opening book on either board** `[engine]` — `scripts/genbook.ts` and
  `OPENING_BOOK` are Brandubh-only; `hard`/`ollamh` on Tablut and Copenhagen
  always search from the opening.
- [ ] **No analysis surface on either board** `[ui]` — `ANALYSIS_LIMITS` is
  exported by both boards' `engine.ts` and consumed internally by
  `analysePosition`, but `TablutScreen.tsx` and `CopenhagenScreen.tsx` both pass
  `analysisShown={false}` to `GameToolbar`, so the toggle Brandubh has is wired
  off on both.
- [ ] **Shieldwall and exit fort have no evaluation term or quiescence
  representation** `[engine]`/`[rules]` — both are terminal-only in `evaluate()`;
  neither board's search has any sense of *approaching* a shieldwall capture or
  an exit fort, only of having already reached one.
- [ ] **Dead `solver.ts` on both boards** `[engine]`/`[tests]` — neither
  `src/game/tablut/solver.ts` nor `src/game/copenhagen/solver.ts` is imported by
  anything (verified by grep, see the header note added to each this session).
  Wiring one in as the independent oracle for recognizer cross-validation, the
  way `src/game/recognizers.test.ts` uses Brandubh's, is open on both.
- [ ] **No perft or move-count invariants on any board** `[tests]` — not even
  Brandubh has a pinned perft table; the only fixed-branching assertion
  anywhere is Copenhagen's own `engine.test.ts` ("the size of the problem")
  block, which pins the opening only.
- [ ] **No performance guard on the two larger boards** `[tests]` — Brandubh has
  no dedicated performance-regression test either, but the gap widens on 81 and
  121 squares, where a per-node cost regression is more expensive to run into.
- [ ] **Copenhagen engine suite is thin** `[tests]` — 11 tests in
  `src/game/copenhagen/engine.test.ts` (Tablut's equivalent file has 20,
  Brandubh's 21 — counted by running each file, 2026-09-09); no D4-folding
  coverage and no legacy-vs-full self-play comparison, both of which Brandubh's
  suite carries.
- [ ] **No import/export UI on either board** `[ui]` — `src/game/tablut/gameFile.ts`
  and `src/game/copenhagen/gameFile.ts` both exist and are both covered by 22
  tests (Brandubh's own `gameFile.test.ts` has 48, so the parity is between the
  two forks, not with Brandubh), but neither board's screen offers the panel
  Brandubh's `GameFilePanel.tsx` provides.
- [ ] **No board flip, records, match sets, puzzles, or review/annotation on
  either board** `[ui]` — the whole review/teaching stack (`records.ts`,
  `matchSet.ts`, the puzzle bank, annotation) is wired for Brandubh only.
- [x] **i18n gaps** `[ui]` — done (WP-2.R, 2026-09-09). `src/i18n.ts`'s
  `variantNames`/`variantBlurbs` now carry entries for every current id
  (`tablut-linnaeus-2`, `tablut-2`, `tablut-gulo-2`, `tablut-aage-2`,
  `tablut-corners-2`, `copenhagen-2`, `copenhagen-fetlar-2`) in `en`, `es` and
  `ga` (the last as unreviewed drafts, per the existing convention — `ga`
  stays out of `VISIBLE_LANGS`). The legacy (pre-2026-09-09) ids were left out
  of the i18n tables on purpose: they fall back to the English `name`/`blurb`
  baked into the legacy preset itself, which is the one place that still says
  "(legacy)" — an i18n entry for a legacy id would otherwise shadow that
  marker. See `docs/tablut-rules.md` and `docs/copenhagen-rules.md`,
  "Corrections of 2026-09-09".
- [x] **`strongKingEdgeRule` is contested and unverified against a primary
  source** `[rules]` — resolved 2026-09-09: all three sources were read in
  full, and the excerpt behind reading B turned out to be a
  search-engine misattribution (it does not appear on the Cyningstan page it
  was credited to). `"uncapturable"` (reading A) is now confirmed, not merely
  favoured; `"available_sides"` stays reachable in the custom rule editor as a
  real, playable, but non-default reading. See `docs/copenhagen-rules.md`.
- [ ] **`copenhagen-fetlar-2` and `tablut-aage-2` are UNVERIFIED presets** `[rules]` —
  both `variants.ts` files mark them ⚠ UNVERIFIED (ids corrected 2026-09-09;
  see `docs/tablut-rules.md` and `docs/copenhagen-rules.md`, "Corrections of
  2026-09-09"). Not the same exposure, though: `tablut-aage-2` is left out of
  `VISIBLE_VARIANTS` (hidden, but still in `VARIANTS` so old saves keep
  resolving), while `copenhagen-fetlar-2` *is* in `VISIBLE_VARIANTS` — an
  unverified preset offered in the picker, not held back. See
  `docs/copenhagen-rules.md` and `docs/tablut-rules.md`.

## Nine Men's Morris parity

The fourth board (`src/game/morris/`) ships with its own rules, engine, endgame
databases, screen and `.morris` format, and with the same gaps the third board
has — plus two of its own, because its one source could not be read and its top
level makes a claim about perfection. See
`docs/adr/0008-nine-mens-morris-is-a-fourth-board-and-not-a-tafl-game.md` for
what this fork cost and `docs/morris-rules.md` for what is and is not sourced.

- [ ] **Gasser's paper has not been read** `[rules]` — **the biggest open item on
  this board.** Every rule the shipped `morris-gasser-1` preset credits to
  "Solving Nine Men's Morris" came through search-engine excerpts; the full text
  is blocked at every host carrying it (checked host by host, 2026-09-10 — see
  `docs/morris-rules.md`, "How this was sourced"). The owner will paste the text;
  the thirteen-item re-verification checklist is in that file under "When the
  paper text arrives". Two of those items (`doubleMillRemoves`,
  `removeFromMillsWhenAllInMills`) and two more (`flying`, blocked-player-loses)
  are **inside** the retrograde analysis, so a correction there means
  regenerating every shipped table, not just flipping a flag.
- [ ] **Morris eval weights are unmeasured** `[engine]` — `DEFAULT_WEIGHTS` in
  `src/game/morris/engine.ts` are hand-set: material over board and hand, mills,
  open twos, potential double mills, mobility, blocked stones, flying threats.
  Same situation as Tablut's and Copenhagen's lines above, with less to transfer
  than between any two boards here — not one of those terms has a tafl
  counterpart. Do not quote them as measured. The ladder's depths (2 / 4 / 8 / 24
  plies) are hand-set with them.
- [ ] **Branching factor not measured** `[tests]` — Copenhagen's `engine.test.ts`
  pins its opening (116/60); Morris has no equivalent. What is known is
  arithmetic, not measurement: exactly 24 opening placements, 4 of them distinct
  up to the 16-fold symmetry; 32 edges with degrees 2/3/4 (average 8/3), so the
  moving phase offers ≤ 4 destinations per stone before removal choices multiply
  it. Pin the real per-phase numbers, including the removal multiplier, which is
  the term nothing else here has.
- [ ] **No opening book, and the obvious future work is Gasser's own** `[engine]`
  — `hard`/`ollamh` search from the opening like the other two larger boards.
  The difference is that here the shape of the answer is published: Gasser's
  **18-ply alpha-beta search over the placing phase**, backed by the full
  database set, is what proved the initial position a draw. An 18-ply book over
  the placing phase is therefore the single highest-value engine item on this
  board — and it is also the one that cannot be honestly labelled "proven"
  without the tables underneath it, so a best-effort book comes first and is
  labelled the way `docs/solving.md` requires.
- [ ] **Only the tables up to nine stones ship** `[engine]` — ten tables (3-3 …
  5-4, 50,082,731 entries, 548 KB gzipped, 848 s to generate) ship under
  `public/morris/db/`, so `ollamh` is perfect in the moving phase from nine
  stones on the board down and search above that. The full ordered set for 3..9
  stones is 9,193,626,407 entries (≈ 9.2 GB at one byte each). The ten-stone
  level (3-7, 7-3, 4-6, 6-4, 5-5, ≈ 122 million entries) is the next step: a few
  hours offline with the edge cache off, and a download of a few megabytes,
  which needs a size policy before it is run
  (`npx tsx scripts/morris-solve.ts --max-stones 10`).
- [x] **`<!-- TABLE-STATS -->` is filled** `[docs]` — both `docs/morris-rules.md`
  and ADR-0008 carry the measured per-table numbers from the generator's own
  output (2026-09-10, max-stones 9). Regenerate and re-fill together.
- [ ] **The tables do not model the two practical draw rules** `[engine]` — they
  are computed under the paper's rules, so a table WIN is a live win only while
  `sinceMill + depth < 100`. Encoded depth is capped at 63 plies and the limit is
  100, so the gap only bites in positions reached with the counter well advanced;
  the engine does not currently reason about it. Derived, not measured — see
  `docs/morris-rules.md`, "What the tables do not know".
- [ ] **No analysis surface** `[ui]` — same wiring gap as the other two larger
  boards: `MorrisScreen.tsx` passes `analysisShown={false}` to `GameToolbar`, so
  the eval bar, best-move arrow and analysis mode Brandubh has are off.
  `analysePosition` and `ANALYSIS_LIMITS` exist in the engine and are consumed
  only internally.
- [ ] **No records, match sets, puzzles, review or annotation** `[ui]` — the whole
  review/teaching stack is still Brandubh-only. The local human-vs-computer
  results line (`aiResults`, `store: "morris"`) is the one piece that is wired.
- [ ] **No gauntlet instrument, no perft pins, no performance guard** `[tests]` —
  the three items the Tablut/Copenhagen list carries, now true on a fourth board.
  `scripts/pairgauntlet.ts` is still hard-coded to `VARIANTS.wtf` and the
  Brandubh opening book.
- [ ] **`solver.ts` exists to cross-check the databases and nothing else**
  `[tests]` — unlike the two dead tafl solvers, this one is used: a bounded AND-OR
  search sampled against every shipped table. It is not wired into play or into
  any recognizer, and there are no Morris recognizers to cross-validate.
- [ ] **The `ga` strings are unreviewed machine drafts** `[ui]` — the new
  `morris*` keys follow the existing convention: complete in the `ga` table
  because TypeScript requires it, marked as drafts, and `ga` stays out of
  `VISIBLE_LANGS` until a human Irish speaker signs the copy off (see
  `CLAUDE.md`). `morrisStatuses` and `morrisRuleValues` are the two keyed records
  where a missing entry is a silent English fallback rather than a type error —
  `i18n.test.ts` covers the rule keys; the status map is worth a check of its own.
- [ ] **A fourth surface flag, not a surface value** `[ui]` — `showMorris` joins
  `showTablut` and `showCopenhagen`, so mutual exclusion is now three pairs of
  hand-written conditions instead of one, and `App.mutualExclusion.test.ts` grows
  with them (quadratically in the flags, so a fifth board makes six). One
  `surface` value with four states is the shape; it is part of ADR-0007's
  deferred shell refactor, which ADR-0008 records as the only urgent item left on
  that list.

## Not implemented (documented as future)

- [x] **Shieldwall capture** — done (`72a7e19`), and this line claimed "no code, no
  RuleSet flags" for every commit since. It is a `RuleSet` flag
  (`shieldwallCapture`, `src/game/variants.ts`), resolved in `src/game/rules.ts`
  (`resolveShieldwallCaptures`), offered in the custom-rule editor with copy in all
  three locales, and covered by an `engine.test.ts` block. **Off in both shipped
  presets** (a Copenhagen innovation, not part of WTF Brandubh), which is why it
  is easy to keep believing it does not exist.
- [x] **Exit-fort win** — done (`33db8e1`), and this line claimed "no code, no
  RuleSet flags" for every commit since — the same failure the shieldwall line
  above just recorded, made twice in one section. It is a `RuleSet` flag
  (`exitFort`, `src/game/copenhagen/variants.ts`), resolved by `exitFort()` in
  `src/game/copenhagen/rules.ts`, and covered by a ten-assertion `describe("exitFort", …)`
  block in `src/game/copenhagen/rules.test.ts`. Copenhagen-only: neither Brandubh
  nor Tablut's `RuleSet` carries the flag, so this was never reachable from
  either of the games this file otherwise tracks, which is why it went unnoticed
  for as long as the shieldwall line above did.
- [x] **Game replay / import** — done (Session 3), *not* future work: `src/game/gameFile.ts`
  parses and writes the PGN-style format (aagenielsen.dk-compatible), `src/game/replay.ts`
  is the shared replay-and-validate boundary, and `src/components/GameFilePanel.tsx` is the
  UI. Imported games load into the existing step/branch timeline.
- [x] **Opening book** — done (roadmap Session 6). `OPENING_BOOK` is populated from the
  bundled deep-search book (`src/game/openingBook.data.ts`); the original "only proven
  moves" bar was retired *explicitly* and the book relabelled best-effort — see
  `docs/solving.md` §5.
- [x] **Game state persistence** — done. The live game (move list, cursor, clock
  banks, match score) is written to the versioned `brandubh.game.v1` key and
  replayed on load; the opening overlay offers **Resume / New**. See
  `src/game/persist.ts` and [`docs/design/game-persistence.md`](docs/design/game-persistence.md).
  URL-param sharing is still open, and belongs with the PGN-style import/export work.

## Minor UX

- [x] **"Play vs AI" overlay always picks defenders** — fixed: the overlay now steps side → difficulty, and every derived side comes from `game/sides.ts`.
- [x] **Custom Rule Editor doesn't reset game** — Fixed. Toggling a custom rule now routes through `changeCustomRules()`, which resets the board and match just like `changeVariant()`, so the move history and live ruleset stay consistent.
- [ ] **`loadCustomIncrement` never reaches its own default** — `DEFAULT_CUSTOM_INCREMENT` is 3, but `src/game/clock.ts` reads the key as `Number(localStorage.getItem(...))` and `Number(null)` is `0`, which is finite and passes the `>= 0` guard. So a first visit gets an increment of 0, not 3, and the custom control opens on `5+0`. Dead default rather than a wrong one: nothing misbehaves, the editor simply starts somewhere other than where the constant says. `loadCustomMinutes` escapes it only because its guard is `> 0`. Found while adding the overlay's time step (Session 10) and left alone there — a one-line fix, but it changes what an existing player's untouched custom control resolves to, which is not a thing to slip into a session about the setup flow.
- [ ] **Two buttons both named "Menu"** — the header's hamburger (see `MenuIcon` in `src/App.tsx` — cited by name rather than a line, since uncommitted work in the main tree is moving this button into `GameToolbar.tsx`, which would make any line number wrong the moment it lands) opens the drawer and the bottom toolbar's list button (`src/components/GameToolbar.tsx:53`) opens the in-game menu, and both take their accessible name from the one `t.menu` key; the toolbar `<nav>` and the drawer take it too, so four elements answer to "Menu" and two of them are buttons leading to different places. Found by the same accessibility pass as Session 9 (`ddfd5f8`) and kept out of that session deliberately: it shares no code with the board and no mechanism with focus, and it is a copy change in three locales. It wants two distinct names, not a rename of one.

## Docs

- [ ] **Decide what the cover screenshot should show now that Zen is the default** — Session 10 made Zen on out of the box, and `scripts/screenshot.mjs` walks a *fresh* profile through the overlay, so `npm run screenshot` now captures a stripped Zen board where `docs/screenshot.png` still shows the full UI. The image was deliberately not regenerated: an honest picture of a first visit and the most appealing picture of the app are no longer the same shot, and choosing between them is a product call. Either regenerate it and let the cover be what a new player meets, or pin `brandubh.zen.enabled` to `"0"` in the script the way it already pins the theme, and say in the script *why*.
- [x] **Update screenshot** — `docs/screenshot.png` is regenerated from the production build with `npm run screenshot` (driven by `scripts/screenshot.mjs`). It shows the current *Brandubh · World Tafl Federation* variant name and the **EN / ES** switcher (Irish is held back — see `CLAUDE.md`). It does **not** show the eval bar, and should not: the shot is a game in progress, and the eval is a post-game tool (Session 7a). The script pins `brandubh.theme` before first paint, because `pickDefaultTheme()` is a 66/34 coin flip and the image would otherwise change palette at random on every regeneration. Refresh it whenever the board view changes.
