# Branndubh — Open Tasks

## Half-built

- [ ] **Irish (ga) locale** — Full translation exists in `i18n.ts` but hidden from UI via `VISIBLE_LANGS`. Unhide when ready.
- [ ] **`.piece.captured` / `.piece.threat` CSS** — Styled in `index.css:269-275` but never applied in components. Either wire up or remove dead CSS.

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
