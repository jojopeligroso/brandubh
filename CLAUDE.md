# Brandubh — project notes for Claude

A React 18 + TypeScript + Vite SPA (Tailwind v4) implementing Brandubh, the
Irish 7×7 tafl game. No router, no backend: `src/App.tsx` is the shell, pure
game logic lives in `src/game/`, and screens are conditionally-rendered
overlays.

## Commands

- `npm test` — vitest, pure-logic suites only (no jsdom, no component tests)
- `npm run build` — `tsc -b && vite build`; strict TS is also the i18n
  completeness check (every `Translations` key must exist in all locales)
- `npm run dev` / `npm run preview` — local server
- `npm run screenshot` — playwright-core driven-browser capture; the project
  convention is a manual driven-browser pass for UI changes
- `npm run check:evalbar` — driven-browser assertion that the eval bar fills
  from the bottom. The one UI check that can fail: the suites are pure logic and
  the screenshot does not frame the bar, which is how an inverted bar shipped in
  `05c187e` and survived. Run it after touching `.evalbar-*` in `src/index.css`

## Decisions to respect

### Irish (ga) locale is hidden — do not re-expose it

`VISIBLE_LANGS` in `src/i18n.ts` deliberately lists only `en` and `es`. The
`ga` translations in that file are **unreviewed machine drafts** and the owner
considers them not fit to ship; the locale stays out of the language toggle
until a human Irish speaker reviews and signs off the copy. Keep new keys
flowing into the `ga` table (TypeScript requires it) and mark them as drafts,
but do not add `ga` back to `VISIBLE_LANGS`. (`TASKS.md` once recorded this
locale as "unhidden" — that decision was reversed here.)

### Replay-from-opening invariant

Persistence (`src/game/persist.ts`) and import/export (`src/game/gameFile.ts`)
replay move lists from `initialState()` only — see `src/game/replay.ts`. Do
not thread custom starting positions through them. The tutorial set plays
(`src/game/tutorials.ts`) intentionally keep their hand-built boards in
component state only, never in the persisted/exported timeline.

A finished **Puzzle** can now be played on as a live game ("Play from here",
`BankPuzzlePlayer` → `App.playFromPosition`), and that is the one live game
whose first board is not the opening. It is held to the invariant rather than
excused from it: `positionGame` in `App.tsx` closes the autosave (via
`positionRoot` in `src/analysis.ts`) and replaces the export panel with its
reason, and starting one drops the save on disk, which describes a different
game. Anything else that installs a non-opening board as the live game must set
that flag — no custom starting position may reach `persist.ts` or `gameFile.ts`.

### Contested rule

`throneHostileToKing` + `strongKingAdjacentToThrone` in `src/game/variants.ts`
carry a ⚠ CONTESTED RULE note — read it (and `docs/rules-review.md`) before
touching king-capture logic. The `fourth-wall` tutorial scenario teaches this
rule and is pinned to the `wtf` preset; update it if the rule changes.

## i18n

Hand-rolled: `src/i18n.ts` holds a `Translations` interface and full `en`,
`es`, `ga` tables; `t` is prop-drilled from `App`. The language choice
persists under `brandubh.lang` and defaults from `navigator.language`
(Spanish browsers start in Spanish). Gaelic locales are deep-converted to
overdot orthography by `src/gaelic.ts` — never set non-Gaelic text in the cló
face.
