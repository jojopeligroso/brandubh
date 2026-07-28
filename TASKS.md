# Brandubh — Open Tasks

## Half-built

- [ ] **Irish (ga) locale** — Full translation exists in `i18n.ts` but hidden from UI via `VISIBLE_LANGS`. Unhide when ready.
- [ ] **`.piece.captured` / `.piece.threat` CSS** — Styled in `index.css:269-275` but never applied in components. Either wire up or remove dead CSS.

## AI engine — next levers

The search core (iterative deepening + transposition table + quiescence + move
ordering) landed in `ai.ts`; it is board-size-agnostic and variant-driven, so it
carries over to future tafl variants (Tablut, etc.) without change. Remaining:

- [ ] **Move search to a Web Worker** — `chooseMove` is synchronous, so `hard`'s
  ~500 ms budget briefly blocks the UI. A worker keeps it fully offline (Vite
  bundles the worker into `dist/`) while freeing the main thread. Would let the
  hard budget grow without janking the board.
- [ ] **Evaluation tuning** — the search rewrite deliberately left `evaluate()`
  untouched so self-play could attribute gains to search alone. Next: mobility,
  defender-shield structure, and blocker-aware king distance — A/B each change
  through `scripts/aibench.ts` self-play before keeping it.
- [ ] **Opening book** — ties into the replay/import task below; would remove the
  weak, samey opening play.
- [ ] **Per-variant tuning hooks** — when a new variant (e.g. Tablut 9×9) is
  added, revisit the `hard` time budget and eval weights for the larger board.

## Not implemented (documented as future)

- [ ] **Shieldwall capture** — Tournament rule extension. No code, no RuleSet flags.
- [ ] **Exit-fort win** — King builds an impregnable formation. No code, no RuleSet flags.
- [ ] **Game replay / opening book** — Import recorded games from aagenielsen.dk. Move notation is compatible but no replay UI or import mechanism exists.
- [ ] **Game state persistence** — All state lost on page refresh. No localStorage/sessionStorage/URL params.

## Minor UX

- [ ] **"Play vs AI" overlay always picks defenders** — `App.tsx:457-459` hardcodes `onChoose("defenders")`. No way to choose attacker side from the overlay.
- [ ] **Custom Rule Editor doesn't reset game** — Toggling rules mid-game creates inconsistent state. Variant dropdown resets correctly (`changeVariant()`) but custom rule toggles don't call `newGame()`.

## Docs

- [ ] **Update screenshot** — `docs/screenshot.png` shows old variant names (Copenhagen Brandubh).
