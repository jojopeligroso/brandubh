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
  from the bottom. The suites are pure logic and the screenshot does not frame the
  bar, which is how an inverted bar shipped in `05c187e` and survived. Run it
  after touching `.evalbar-*` in `src/index.css`
- `npm run check:ai-reveal` — driven-browser assertions that the engine's move is
  *shown*: its stone travels between the two squares instead of teleporting,
  lands on the square the move went to, keeps the real stone hidden underneath
  while its copy is in flight, and leaves the square it came from lit after it
  has landed. The suites are pure logic and cannot see a stone move, so a
  keyframe that renders but never translates would look exactly like the old
  behaviour and fail nothing. It runs over **two board themes**, because the
  flight overlay is inset by `--board-pad` and Ballinderry is the one board that
  widens it — a literal inset there lands the stone off its own grid and nowhere
  else, which a single-theme run cannot see. Run it after touching
  `.ai-mover`/`.ai-origin`/`--board-pad` in `src/index.css`, or
  `src/useAiReveal.ts`
- `npm run check:setup-lock` — driven-browser assertions that the next-game setup
  controls (*Play as*, *AI level*, the variant picker, the clock) leave the screen
  once a game has begun, that the conditions card names what that game is being
  played under, and that the toolbar menu leads back to all of it — *Set up a new
  game* (with the overlay's ruleset row, now the only way to the variant), *Export
  this game*, and *Analyse from here*, which still buys its way in with a
  resignation. The two halves only make sense together: hiding a panel is safe
  because a menu row leads back to it, and the suites are pure logic, so a
  predicate that hid the panels while a row went missing would fail nothing. Run
  it after touching `gameSetupLocked` (`src/analysis.ts`), the settings stack or
  the menu sheet's rows in `src/App.tsx`
- `npm run check:tablut` — driven-browser assertions for the Tablut surface: 9×9
  tracks, coordinates a–i/1–9, a baseline corner drawn as ordinary ground, the
  drawer's More games section, the Tablut worker replying, a Brandubh save
  surviving the visit, a Tablut game (and the surface itself) surviving
  leave/re-entry and a full reload, and the Ballinderry theme falling back to
  Gokstad on the 9×9 without disturbing the stored choice. Run it after touching
  `.board`/`.tablut-screen` in `src/index.css`, `components/Board.tsx`,
  `orientation.ts`, `theme.ts` or anything under `src/game/tablut/`

## Two boardgames, forked on purpose

Brandubh (7×7, corner escape) lives in `src/game/`. **Tablut** (9×9, White moves
first, the king escapes to any edge square) lives in `src/game/tablut/` with its
own rules, engine, save key (`tablut.game.v1`), `.tafl` format (`tablut-1`) and
screen (`components/TablutScreen.tsx`), reached from the drawer's collapsed *More
games* section.

Tablut's default ruleset is `tablut-linnaeus` — the three-tier king capture
(four attackers on the throne, three plus the hostile throne beside it, two
elsewhere); see `docs/tablut-rules.md` for the sourcing. The surface is fully
persistent: the game autosaves under `tablut.game.v1`, and `tablut.surface.v1`
records that the player is *in* Tablut, so a reload lands back on the 9×9 board
until they leave by the back button.

The duplication is an accepted decision, not drift — read
`docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md` and its
addendum before merging anything across. In short: corner-escape geometry is baked
into the evaluation and teaching layers, and it is *meaningless* when the whole rim
wins, so a shared core would have to carry that distinction inside the search. One
concrete trap — Brandubh proves a forced win from a single open lane when the king
touches a corner (no soldier may stand on a corner); the same shortcut is
**unsound** under edge escape, where an attacker can occupy the escape square.

What *is* shared, and should stay shared: `Board` (via the optional geometry in
`src/games/geometry.ts`), `orientation.ts`, `gameOverText.ts`, and the already
game-agnostic `clock`/`clockLine`/`matchSet`/`records`/`puzzleProgress`/`trainer`/
`grade`/`sides`. Tablut's presets and their sourcing — including one preset marked
⚠ UNVERIFIED because aagenielsen.dk is 403 behind the egress proxy — are in
`docs/tablut-rules.md`.

## Decisions to respect

### Irish (ga) locale is hidden — do not re-expose it

`VISIBLE_LANGS` in `src/i18n.ts` deliberately lists only `en` and `es`. The
`ga` translations in that file are **unreviewed machine drafts** and the owner
considers them not fit to ship; the locale stays out of the language toggle
until a human Irish speaker reviews and signs off the copy. Keep new keys
flowing into the `ga` table (TypeScript requires it) and mark them as drafts,
but do not add `ga` back to `VISIBLE_LANGS`. (`TASKS.md` once recorded this
locale as "unhidden" — that decision was reversed here.)

### Setup belongs to the next game, not this one

Once a game has begun — one move played, or a **Puzzle** played on from its
position — the controls that configure a game are **not rendered**: not disabled,
not greyed, gone. `gameSetupLocked` in `src/analysis.ts` is the one rule, shared
by the inline stack and the gear ⚙ modal, and `GameConditions` in `App.tsx` is
what stands in their place: a read-only card naming the side, the AI strength, the
ruleset and the clock the game is actually being played under.

They are safe to hide only because the toolbar's menu sheet leads back to every
one of them. *Set up a new game* opens the setup overlay, and that overlay is now
the **only** door to the variant — the picker that used to live in the settings
card is off the screen mid-game and hidden outright by Zen, so the overlay's
ruleset row (`data-testid="overlay-ruleset"`) must not be removed without giving
the variant another home. `npm run check:setup-lock` asserts both halves.

`analysisAvailable`'s post-game gate is **unchanged** by any of this. The menu's
*Analyse from here* does not walk past it: on a live game it asks, and then
resigns from the position on the board before opening the room. The resignation
is real — the result stands and the set score takes it — which is the point.

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

### The Ballinderry theme's ornament is unverified

`[data-theme="ballinderry"]` is the one theme that changes the board's
construction — holes instead of squares, because the object it is named for
(NMI 1932:6583) is a peg board — and the one whose ornament is **drawn from
published descriptions, not traced from the artefact**: the NMI's photographs
and the Discovery Programme's 3D model are both blocked by the egress proxy.
Read `docs/ballinderry-board.md` before touching `src/ballinderry/` or the
Ballinderry blocks in `index.css`; it records what is attested, what is filled
in, and what to replace if the sources ever become reachable. Regenerate the
panels with `node scripts/gen-ballinderry-ornament.mjs` — the geometry lives
there and nowhere else.

It is also the one theme that is **not** app-wide: `resolveTheme` in `theme.ts`
falls it back to Gokstad on the Tablut surface (a 7×7 board of 49 holes is a
lie about a 9×9), and `index.html`'s pre-paint script repeats the rule so a
reload onto Tablut does not flash it. The fallback changes what is painted and
never what is stored.

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
