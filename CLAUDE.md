# Brandubh — project notes for Claude

A React 18 + TypeScript + Vite SPA (Tailwind v4) implementing Brandubh, the
Irish 7×7 tafl game, plus two larger tafl boardgames and Nine Men's Morris,
all three reached from the drawer. No router, no backend: `src/App.tsx` is the
shell, pure game logic lives in `src/game/`, and screens are
conditionally-rendered overlays.

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
  is the one place adding a board can silently go wrong. Run it after touching
  the same files, or anything under `src/game/copenhagen/`
- `npm run check:morris` — the same for the Morris surface, which is not a grid
  and so breaks in its own ways: the board must render exactly **24 point
  targets** (`a7 … a1`, `d7` top-middle) rather than a square lattice, closing a
  mill must enter a **removal step** that highlights only the stones the rules
  actually allow taking, the engine's reply must be *shown* on the point it went
  to, and the surface must survive leave/re-entry and a full reload. The suites
  are pure logic: they can prove `removable()` correct and cannot see whether the
  board lit those stones. It also asserts the **inverse** of the tafl surfaces'
  theme rule — Ballinderry is **kept** on Morris (a 24-hole peg board is a
  truthful Morris board) with the stored choice untouched, and `morris.surface.v1`
  is deliberately **absent** from `index.html`'s pre-paint list for that reason,
  which makes that hand-written list the one place this decision can silently
  rot. Run it after touching `.morris-board`/`.morris-screen` in `src/index.css`,
  `components/MorrisBoard.tsx`, `components/MorrisScreen.tsx`, `theme.ts` or
  anything under `src/game/morris/`

## Four boardgames, forked on purpose

Brandubh (7×7, corner escape) lives in `src/game/`. **Tablut** (9×9, Black moves
first, the king escapes to any edge square) lives in `src/game/tablut/` with its
own rules, engine, save key (`tablut.game.v1`), `.tafl` format (`tablut-1`) and
screen (`components/TablutScreen.tsx`), reached from the drawer's collapsed *More
games* section.

Tablut's default ruleset is `tablut-linnaeus-2` — the three-tier king capture
(four attackers on the throne, three plus the hostile throne beside it, two
elsewhere); see `docs/tablut-rules.md` for the sourcing. The `-2` suffix marks
it (and every other current Tablut preset) as corrected on 2026-09-09 —
`firstMove` was "defenders" and should have been "attackers" — with the
pre-correction presets kept under their original, unsuffixed ids as hidden
LEGACY presets so old saves and `.tafl` files keep their meaning; see
`docs/tablut-rules.md`, "Corrections of 2026-09-09". The surface is fully
persistent: the game autosaves under `tablut.game.v1`, and `tablut.surface.v1`
records that the player is *in* Tablut, so a reload lands back on the 9×9 board
until they leave by the back button.

**Copenhagen Hnefatafl** (11×11, corner escape, 24 v 12+1, attackers first) lives
in `src/game/copenhagen/` with the same shape again — save key
`copenhagen.game.v1`, `.tafl` format `copenhagen-1`, screen
`components/CopenhagenScreen.tsx`. It is the modern tournament standard, and the
only one of the three whose baseline is a published ruleset rather than a
reconstruction. Its own rules are `exitFort` (a win decided by a structural
property of the board, not the move just played) and a fourth repetition
outcome, `"loss_for_repeater"`, reachable only through the custom rule editor
now — it is the only way any game in this project ends in
`defenders_win_repetition`. The shipped `copenhagen-2` preset itself reads
rule 8 as `repetitionResult: "loss_for_defenders"` — corrected 2026-09-09; the
pre-correction default was `"loss_for_repeater"`, traced to a secondary
paraphrase rather than Copenhagen's own text (see
`docs/copenhagen-rules.md`, "Corrections of 2026-09-09") — so like Brandubh
and Tablut it now ends a repeated position in `attackers_win_repetition`, not
`defenders_win_repetition`. The legacy `copenhagen` preset (hidden, kept for
old saves and `.tafl` files) is unchanged and still carries the old default. Its setup sheet offers only `easy`/`medium` —
`hard`/`ollamh` render disabled with an explanation (owner decision 2026-09-09,
WP-4.2): the search is too slow to run in the browser at this board's opening
branching factor. The cap lives in `game/copenhagen/difficultyCap.ts`
(`COPENHAGEN_MAX_DIFFICULTY`), not in `engine.ts` — `DIFFICULTIES`/`DIFFICULTY`
there are unchanged, since scripts and tests still drive the full ladder; a save
or import carrying `hard`/`ollamh` is clamped to `medium` on load. See TASKS.md's
Tablut/Copenhagen parity section for when this is expected to lift.

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
file they were copied from), and the order to take the extraction in. ADR-0007
also says a fourth board should wait for the shell refactor; the owner added one
anyway on 2026-09-10, and `docs/adr/0008-nine-mens-morris-is-a-fourth-board-and-not-a-tafl-game.md`
records that decision, the one respect in which the objection did not apply, and
what it cost. **If you are adding a fifth board, read ADR-0007's shell-refactor
item and ADR-0008's consequences first: the shell, not the rules core, is what
gets worse with every board.**

**Nine Men's Morris** (24 points on three rings, nine stones a side, no king)
lives in `src/game/morris/` — the same *file* shape again (types, rules, variants,
engine, solver, worker, persistence, screen) and almost none of the same content,
because it is not a tafl game: a graph rather than a grid, symmetric sides, a
placing and a moving phase, a turn that carries its own capture (so no
quiescence), and a **16-element** symmetry group that `makeD4(n)` cannot express.
Save key `morris.game.v1`, surface key `morris.surface.v1`, file format
`morris-1` with extension **`.morris`** (a `.tafl` would be a lie), screen
`components/MorrisScreen.tsx` with its own `components/MorrisBoard.tsx` (an SVG
board — `Board`'s geometry seam is for square lattices and was not stretched),
and one visible preset, `morris-gasser-1`.

Two things about that preset need respecting. It adds **two practical draw rules
that are not in Gasser's paper** — `repetitionResult: "draw"` (threefold) and
`noMillDrawMoves: "50"` (fifty moves each with no stone removed), owner decision
2026-09-10, both settable to `"none"` in the custom editor, and `"none"` on both
is the game Gasser actually solved. And **the paper could not be read**: every
host carrying "Solving Nine Men's Morris" is blocked by the egress proxy, so
every rule credited to Gasser is a search excerpt marked ⚠ UNVERIFIED
(excerpt) in `docs/morris-rules.md`, which also holds the re-verification
checklist for when the owner pastes the text. `ollamh` ships small endgame
databases generated by Gasser's retrograde analysis (`scripts/morris-solve.ts`,
with a verifier pass), and its claim is exactly two-part: **perfect once play
reaches a shipped table, deep-search best-effort before that** — the bar
`docs/solving.md` set. Do not let either half of that sentence travel without
the other.

What *is* shared, and should stay shared, in two tiers. The **three tafl
boards** share `Board` (via the optional geometry in `src/games/geometry.ts`),
`orientation.ts`, `gameOverText.ts`, `GameStatus`, `sides`, and the `tafl*` i18n
keys (the strings every tafl board says identically — only what a *game* asserts
gets its own key). **All four boards** share what is genuinely game-agnostic:
`clock`/`clockLine`/`matchSet`/`records`/`puzzleProgress`/`trainer`/`grade`,
`aiResults`, and the shell furniture (PlayerBar, GameToolbar, GameMenuSheet,
MoveLog, ReviewBar, VictoryOverlay, ZenSwitch, the dialog/motion/clock hooks,
theme tokens). Morris shares the second tier only — it has no king, no sides in
the tafl sense and no square lattice, so reaching for the first tier there is an
error rather than a saving. Each game's presets and their sourcing are in
`docs/tablut-rules.md`, `docs/copenhagen-rules.md` and `docs/morris-rules.md`;
each tafl file carries a preset marked ⚠ UNVERIFIED, and on Morris *every* rule
credited to the paper is marked so — in both cases because the sources sit
behind the egress proxy and the corroboration came through search excerpts
rather than full text.

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

### Contested rule — verified 2026-09-09, retained on purpose

`throneHostileToKing` + `strongKingAdjacentToThrone` in `src/game/variants.ts`
carry a note on the `wtf` preset — read it (and `docs/rules-review.md`) before
touching king-capture logic. It is no longer an open question: the WTF
Brandubh rules PDF and worldtafl.com were both read in full on 2026-09-09, and
they agree that a king *next to* the throne on 7×7 falls to an ordinary
two-sided capture, not the four-sided surround these flags implement — only a
king *on* the throne gets the four-sided rule. The owner decided to keep `wtf`
shipping the four-sided reading regardless: the opening book, the 158
solver-verified puzzles, the annotation bands and every gauntlet result were
all computed under it, and none of that has been regenerated against the
sourced flags. So this is a verified-and-deliberately-wrong default, not an
unverified one — the custom-rule editor is where a player gets the sourced
reading. The `fourth-wall` tutorial scenario teaches the shipped (four-sided)
rule and is pinned to the `wtf` preset; update it if the flags ever change.

## i18n

Hand-rolled: `src/i18n.ts` holds a `Translations` interface and full `en`,
`es`, `ga` tables; `t` is prop-drilled from `App`. The language choice
persists under `brandubh.lang` and defaults from `navigator.language`
(Spanish browsers start in Spanish). Gaelic locales are deep-converted to
overdot orthography by `src/gaelic.ts` — never set non-Gaelic text in the cló
face.
