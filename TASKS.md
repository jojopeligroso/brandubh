# Brandubh — Open Tasks

## ▶ Roadmap (start here)

The remaining work is planned as sized, shippable **sessions** in
[`docs/ROADMAP.md`](docs/ROADMAP.md), with design docs for the two big features.
Ordered by value ÷ effort:

1. ~~**Game resumability** *(M)* — a refresh never loses a game in progress.~~ **Shipped** → [`docs/design/game-persistence.md`](docs/design/game-persistence.md).
2. ~~**Play either side** *(S–M)* — choose raiders or king from the overlay.~~ **Shipped** → `src/game/sides.ts`.
3. **Export / import games** *(L)* — PGN-style save/load → [`docs/design/game-import-export.md`](docs/design/game-import-export.md).
4. ~~**Attacker endgame recognizer** *(M)* — exact forced-attacker-win twin of the defender recognizers.~~ **Shipped** as a cross-validated, default-off knob (`attackerRecognizer`): a capture needs move-gen where an escape is O(1) geometry, so it is neutral-but-not-free — off by default, no throughput regression. See `docs/ROADMAP.md` Session 4.
5. ~~**Correctness & discoverability polish** *(S)* — clock reachable in Zen, custom-rule reset bug, unhide Irish locale, dead CSS/screenshot.~~ **Shipped**.
6. **Opening book (Ollamh)** *(M–L)* — deep-search book for instant, varied openings.
7. **Lichess-style analysis UI** *(L)* — eval bar, analysis, move tree → [`docs/design/lichess-ui.md`](docs/design/lichess-ui.md).

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
- [x] **`.piece.threat` CSS** — Removed as dead code; it was styled in `index.css` but never applied in any component. (`.piece.captured` is still used by the "Show me how" demo, now in `ObjectivesContent.tsx`.)

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

- [x] **"Play vs AI" overlay always picks defenders** — fixed: the overlay now steps side → difficulty, and every derived side comes from `game/sides.ts`.
- [x] **Custom Rule Editor doesn't reset game** — Fixed. Toggling a custom rule now routes through `changeCustomRules()`, which resets the board and match just like `changeVariant()`, so the move history and live ruleset stay consistent.

## Docs

- [x] **Update screenshot** — `docs/screenshot.png` refreshed from the current build (`npm run screenshot`, driven by `scripts/screenshot.mjs`); it now shows the current *Brandubh · WTF* variant name and the GA locale toggle.
