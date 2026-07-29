# Brandubh — Open Tasks

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
- [ ] **Board-symmetry (D4) root-move folding** — the opening is invariant under
  all 8 dihedral symmetries, so its 40 legal first moves collapse to just 5
  distinct moves (e.g. `d7-c7`, `d1-e1`, `g4-g5`, `a4-a3` are one move in four
  costumes). Search only one representative per orbit *at symmetric positions*
  (cheap: per-turn, not per-node) for ~1 extra opening ply. Efficiency only, not
  strength — equivalent moves already score identically — and the payoff is
  opening-concentrated (symmetry breaks within a move or two). Skip TT-key
  canonicalisation: ~8× per-node hashing cost for negligible midgame gain. The
  symmetry group generalises to any square board, so it carries to Tablut.

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
