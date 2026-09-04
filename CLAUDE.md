# Brandubh — project notes for Claude

A React 18 + TypeScript + Vite SPA (Tailwind v4) implementing Brandubh, the
Irish 7×7 tafl game, plus two larger tafl boardgames reached from the drawer.
No router, no backend: `src/App.tsx` is the shell, pure game logic lives in
`src/game/`, and screens are conditionally-rendered overlays.

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
- `npm run check:tablut` — driven-browser assertions for the Tablut surface: 9×9
  tracks, coordinates a–i/1–9, a baseline corner drawn as ordinary ground, the
  drawer's More games section, the Tablut worker replying, a Brandubh save
  surviving the visit, a Tablut game (and the surface itself) surviving
  leave/re-entry and a full reload, and the Ballinderry theme falling back to
  Gokstad on the 9×9 without disturbing the stored choice. Run it after touching
  `.board`/`.tablut-screen` in `src/index.css`, `components/Board.tsx`,
  `orientation.ts`, `theme.ts` or anything under `src/game/tablut/`
- `npm run check:copenhagen` — the same for the 11×11 surface, and the same
  reason it exists. Two assertions are its own rather than a copy: a Copenhagen
  corner must draw as a **marked** square (the exact inverse of the Tablut
  assertion, against the same `Board` component), and `a1`/`a11` must be distinct
  squares — `[aria-label^="a1"]` matches both, which is the mistake a double-digit
  rank invites everywhere. It also reloads *onto* the surface, because
  `index.html`'s pre-paint script carries a hand-written list of surface keys and
  is the one place adding a board can silently go wrong. It also opens the
  **custom rule editor**, which lists enum rules by the runtime type of each
  default and then indexes a table of permitted values — so an enum missing from
  that table is a blank-screen React crash on the setup sheet, invisible to every
  pure-logic suite, and it shipped that way for three of them. Run it after
  touching the same files, or anything under `src/game/copenhagen/`

## Three boardgames, forked on purpose

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

**Copenhagen Hnefatafl** (11×11, corner escape, 24 v 12+1, attackers first) lives
in `src/game/copenhagen/` with the same shape again — save key
`copenhagen.game.v1`, `.tafl` format `copenhagen-1`, screen
`components/CopenhagenScreen.tsx`. It is the modern tournament standard, and the
only one of the three whose baseline is a published ruleset rather than a
reconstruction. Its own rules are `exitFort` (a win decided by a structural
property of the board, not the move just played) and
`repetitionResult: "loss_for_repeater"` — which is why it is the only game that
can end in `defenders_win_fort` or `defenders_win_repetition`. Sourcing, and the
one rule where the sources flatly contradict each other, are in
`docs/copenhagen-rules.md`.

### Three Copenhagen rules are the owner's, not the source's

Marked ★ in `variants.ts` and `docs/copenhagen-rules.md`, and worked through
position by position in `docs/reports/copenhagen-king-capture-edge-cases.md`:

- `strongKingEdgeRule: "three_attackers"` — on the rim the king falls to three
  *attackers*, and a hostile square does not stand in for a man. Three sources
  give three readings; this is a choice between them, and it makes a king
  orthogonally beside a corner **uncapturable** (no soldier may stand on a
  corner, so the third attacker has nowhere to be) and therefore winning in one.
  `copenhagen-fetlar` carries the edge-safe reading, which is where the evidence
  for it actually points.
- `edgeCompletesRing: true` — a pocket sealed by attackers *and the rim* counts
  as rule 7b's ring, which the sourced wording explicitly denies. The clause that
  keeps it honest is "no escape square inside the pocket".
- `entombedKingLoses: true` — a king walled in at the rim whose own side cannot
  open a square beside him loses. In no published ruleset; it exists to close the
  hole the first rule opens. **Unlike `exitFort`, it is not a proof** — it is a
  positional rule with one known, tested false positive (a two-ply capture
  rescue). Do not "fix" it by borrowing `exitFort`'s pessimism without reading
  §2.12 of the report; that replaces the rule rather than tightening it.

`attackers_win_entombment` is the fourth Copenhagen-only `GameStatus`.

The duplication is an accepted decision, not drift — read
`docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md` and its
addendum, then
`docs/adr/0007-copenhagen-forks-a-third-time-and-defers-the-shared-core.md`,
before merging anything across. In short: corner-escape geometry is baked into the
evaluation and teaching layers, and it is *meaningless* when the whole rim wins,
so a shared core would have to carry that distinction inside the search. One
concrete trap — Brandubh proves a forced win from a single open lane when the king
touches a corner (no soldier may stand on a corner); the same shortcut is
**unsound** under edge escape, where an attacker can occupy the escape square, and
**sound again** under Copenhagen, which restricts its corners. Three games, two
answers to one geometric question.

**ADR-0006's "revisit at a third game" trigger has fired and was deliberately not
acted on.** ADR-0007 records why (Copenhagen brings new rules, and extracting a
core while adding them makes a failure impossible to attribute), the evidence that
the trigger was right (shieldwall capture now exists three times; `d4.ts` is three
copies of nine lines; two real bugs came from constants that were correct in the
file they were copied from), and the order to take the extraction in. If you are
adding a **fourth** board, read ADR-0007 first: the shell refactor, not the rules
core, is the thing that now gets worse with every board.

What *is* shared, and should stay shared: `Board` (via the optional geometry in
`src/games/geometry.ts`), `orientation.ts`, `gameOverText.ts`, `GameStatus`, the
`tafl*` i18n keys (the strings every board says identically — only what a *game*
asserts gets its own key), and the already game-agnostic
`clock`/`clockLine`/`matchSet`/`records`/`puzzleProgress`/`trainer`/`grade`/
`sides`. Each game's presets and their sourcing are in `docs/tablut-rules.md` and
`docs/copenhagen-rules.md`; both carry a preset marked ⚠ UNVERIFIED, because every
tafl rules site is blocked behind the egress proxy and the corroboration came
through search excerpts rather than full text.

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
