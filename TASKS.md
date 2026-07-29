# Brandubh — Open Tasks

## ▶ Roadmap (start here)

The remaining work is planned as sized, shippable **sessions** in
[`docs/ROADMAP.md`](docs/ROADMAP.md), with design docs for the two big features.
Ordered by value ÷ effort:

1. ~~**Game resumability** *(M)* — a refresh never loses a game in progress.~~ **Shipped** → [`docs/design/game-persistence.md`](docs/design/game-persistence.md).
2. **Play either side** *(S–M)* — choose raiders or king from the overlay.
3. **Export / import games** *(L)* — PGN-style save/load → [`docs/design/game-import-export.md`](docs/design/game-import-export.md).
4. **Attacker endgame recognizer** *(M)* — exact forced-attacker-win twin of the defender recognizers.
5. **Correctness & discoverability polish** *(S)* — clock reachable in Zen, custom-rule reset bug, unhide Irish locale, dead CSS/screenshot.
6. **Opening book (Ollamh)** *(M–L)* — deep-search book for instant, varied openings.
7. **Lichess-style analysis UI** *(L)* — eval bar, analysis, move tree → [`docs/design/lichess-ui.md`](docs/design/lichess-ui.md).

Session-sizing rule and per-session tasks live in the roadmap. The items below are
the raw backlog those sessions draw from.

## Half-built

- [ ] **Irish (ga) locale** — Full translation exists in `i18n.ts` but hidden from UI via `VISIBLE_LANGS`. Unhide when ready.
- [ ] **`.piece.threat` CSS** — Styled in `index.css` but never applied in components. Either wire up or remove dead CSS. (`.piece.captured` is now used by the "Show me how" demo in `HowToDemo.tsx`.)

## AI engine — next levers

The search core (iterative deepening + transposition table + quiescence + move
ordering) landed in `ai.ts`; it is board-size-agnostic and variant-driven, so it
carries over to future tafl variants (Tablut, etc.) without change. Remaining:

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
- [ ] **Opening book** — ties into the replay/import task below; would remove the
  weak, samey opening play.
- [ ] **Per-variant tuning hooks** — when a new variant (e.g. Tablut 9×9) is
  added, revisit the `hard` time budget and eval weights for the larger board.
- [x] **Board-symmetry (D4) root-move folding** — done (`ai.ts`: `stabilizer` /
  `foldRootMoves`). The opening's 40 first moves fold to 5 at symmetric positions,
  buying ~1 ply and cutting opening nodes ~2×. Applied per-turn at the root only;
  TT-key canonicalisation deliberately skipped (per-node hashing cost for little
  midgame gain). Generalises to any square board (carries to Tablut).

## Not implemented (documented as future)

- [ ] **Shieldwall capture** — Tournament rule extension. No code, no RuleSet flags.
- [ ] **Exit-fort win** — King builds an impregnable formation. No code, no RuleSet flags.
- [ ] **Game replay / opening book** — Import recorded games from aagenielsen.dk. Move notation is compatible but no replay UI or import mechanism exists.
- [x] **Game state persistence** — done. The live game (move list, cursor, clock
  banks, match score) is written to the versioned `brandubh.game.v1` key and
  replayed on load; the opening overlay offers **Resume / New**. See
  `src/game/persist.ts` and [`docs/design/game-persistence.md`](docs/design/game-persistence.md).
  URL-param sharing is still open, and belongs with the PGN-style import/export work.

## Minor UX

- [ ] **"Play vs AI" overlay always picks defenders** — `App.tsx:457-459` hardcodes `onChoose("defenders")`. No way to choose attacker side from the overlay.
- [ ] **Custom Rule Editor doesn't reset game** — Toggling rules mid-game creates inconsistent state. Variant dropdown resets correctly (`changeVariant()`) but custom rule toggles don't call `newGame()`.

## Docs

- [ ] **Update screenshot** — `docs/screenshot.png` shows old variant names (Copenhagen Brandubh).
