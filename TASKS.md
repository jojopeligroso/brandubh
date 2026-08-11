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

Open, contested rules questions with a shipped default + custom toggle — see
[`docs/rules-review.md`](docs/rules-review.md). Currently: **king capture next to
the throne** (four-sided surround with the empty throne as the fourth wall) — needs
verification against authoritative Brandub/Copenhagen sources; toggleable in the
custom-rule editor.

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
  unavailable. With the UI freed, `hard` grew to a ~1.5 s budget, and pickMove
  gained predictive iteration stopping so slower devices wait less (they simply
  search shallower) instead of burning the whole budget on an unfinishable ply.
- [x] **Evaluation tuning** — investigated via `scripts/evaltune.ts` (weighted
  `evaluate()` + self-play gauntlet). Outcome: **keep the default weights.** No
  candidate term beat the baseline at the depths the game plays — mobility only
  helped at depth 2 (even by depth 3) and cost ~2× per node, shield/liberties
  were worse, blocker-aware king distance was neutral. The search rewrite already
  captures what those heuristics proxied for. The terms remain as opt-in knobs
  for per-variant retuning (see below).
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

## Not implemented (documented as future)

- [x] **Shieldwall capture** — done (`72a7e19`), and this line claimed "no code, no
  RuleSet flags" for every commit since. It is a `RuleSet` flag
  (`shieldwallCapture`, `src/game/variants.ts`), resolved in `src/game/rules.ts`
  (`resolveShieldwallCaptures`), offered in the custom-rule editor with copy in all
  three locales, and covered by an `engine.test.ts` block. **Off in both shipped
  presets** (a Copenhagen innovation, not part of WTF Brandubh), which is why it
  is easy to keep believing it does not exist.
- [ ] **Exit-fort win** — King builds an impregnable formation. No code, no RuleSet flags.
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
- [ ] **Two buttons both named "Menu"** — the header's hamburger (`src/App.tsx:2560`) opens the drawer and the bottom toolbar's list button (`src/components/GameToolbar.tsx:53`) opens the in-game menu, and both take their accessible name from the one `t.menu` key; the toolbar `<nav>` and the drawer take it too, so four elements answer to "Menu" and two of them are buttons leading to different places. Found by the same accessibility pass as Session 9 (`ddfd5f8`) and kept out of that session deliberately: it shares no code with the board and no mechanism with focus, and it is a copy change in three locales. It wants two distinct names, not a rename of one.

## Docs

- [ ] **Decide what the cover screenshot should show now that Zen is the default** — Session 10 made Zen on out of the box, and `scripts/screenshot.mjs` walks a *fresh* profile through the overlay, so `npm run screenshot` now captures a stripped Zen board where `docs/screenshot.png` still shows the full UI. The image was deliberately not regenerated: an honest picture of a first visit and the most appealing picture of the app are no longer the same shot, and choosing between them is a product call. Either regenerate it and let the cover be what a new player meets, or pin `brandubh.zen.enabled` to `"0"` in the script the way it already pins the theme, and say in the script *why*.
- [x] **Update screenshot** — `docs/screenshot.png` is regenerated from the production build with `npm run screenshot` (driven by `scripts/screenshot.mjs`). It shows the current *Brandubh · World Tafl Federation* variant name and the **EN / ES** switcher (Irish is held back — see `CLAUDE.md`). It does **not** show the eval bar, and should not: the shot is a game in progress, and the eval is a post-game tool (Session 7a). The script pins `brandubh.theme` before first paint, because `pickDefaultTheme()` is a 66/34 coin flip and the image would otherwise change palette at random on every regeneration. Refresh it whenever the board view changes.
