# Session 7c — move-tree panel (variations, navigation)

**Status: open.** The biggest single piece of Session 7 (see
[`docs/design/lichess-ui.md`](../design/lichess-ui.md)). Treat it as its own session
and do not fold 7d into it.

---

Session 7c of the Brandubh roadmap: analysis UI slice — the move tree.

Repo: jojopeligroso/branndubh. Start from latest main. Read
`docs/design/lichess-ui.md` (the "Anchors for 7c" section is written for you) and the
Session 7 block of `docs/ROADMAP.md`. Your job is 7c ONLY: turn the linear timeline
into a real **variation tree** with a panel to see and navigate it. Do NOT build the
eval bar or best-move arrow (7a, still unbuilt) or post-game annotations (7d).

**DEPENDS ON:** 7b (board flip + analysis mode) — **merged**, commit `b85ee08`.
7a is *not* a dependency and does not exist; do not wait for it and do not build it.
Verify both claims yourself before starting (`git log`, `git branch -r`) — 7b's own
brief asserted a dependency that turned out to be fiction.

## WHAT EXISTS

- **The timeline is a single line.** `states[]` + `cursor` in `App.tsx` (~line 400);
  `states[k]` is the whole position after k plies, `cursor` is what's on screen.
  `commitMove` (`App.tsx:505`) is its **only writer**, and it truncates: it slices to
  the base ply and appends, so a move from a rewound position discards the future.
- **`commitBasePly` (`src/analysis.ts`) is where that truncate decision is taken**,
  deliberately isolated there in 7b so 7c has one place to change. Its doc comment
  names this session.
- `rewindTo` (`App.tsx:608`) cuts the timeline back and restores that position's
  clock banks. `playFromHere` (`App.tsx:988`) is the existing user-facing branch, and
  `requestPlayFromHere` (`App.tsx:1014`) routes it through an over-the-board
  confirmation because it destroys moves.
- **Analysis mode** (7b) is the natural home for the tree: `enterAnalysis` /
  `exitAnalysis` (`App.tsx:634`, `:645`) snapshot and restore `{states, cursor,
  clockLine}` (`AnalysisSnapshot`, `src/analysis.ts`), and the autosave is closed
  while analysing (`autosaveAllowed`).
- **`MoveLog` (`App.tsx:2920`)** renders `game.history` as a flat two/three-column
  `<ol>` with click-to-jump. It reads `states[tip].history`, so it only ever shows the
  mainline. This is the component the tree panel replaces or subsumes.
- **`ReviewBar` (`App.tsx:1998`)** and `MoveNav` show "reviewing k/n" and offer
  "play from here". Their meaning changes once there are siblings — decide what
  they say and keep it honest.
- **Persistence** (`src/game/persist.ts`): `SavedGame.moves` is `SavedMove[]`, a flat
  list of `[fromRow, fromCol, toRow, toCol, captureCount?]`, replayed from
  `initialState()` by `src/game/replay.ts`. `snapshotGame` (`:197`) and `restoreGame`
  (`:378`) are the two ends.
- **Export/import** (`src/game/gameFile.ts`, `FORMAT_VERSION = "brandubh-1"`) is
  likewise a flat mainline with a `capture_mismatch` trust check.

## BUILD

1. **A tree data structure for the timeline.** Replace the `states[] + cursor` pair
   with nodes carrying `{state, move, parent, children[]}` (or an id-indexed map plus
   a current-node id — your call, but justify it in a comment). Requirements:
   - A move from a position that already has a continuation creates a **sibling**,
     not a truncation. The old line survives.
   - The **mainline** is still well defined (first child by default), because
     persistence, export and the status bar all need "the game" to mean something.
   - Promote / delete a variation, at minimum: *promote to mainline* and *delete
     variation*. Without those a tree just accumulates junk.
   - Keep it a **pure module** (`src/game/moveTree.ts` or similar) with no React in
     it, and unit-test it directly — the suites here are pure-logic only, so anything
     left inside the component is untested by construction.
2. **The panel.** Render the tree with the current node highlighted, siblings visibly
   branching, and click-to-jump anywhere. Lichess-style inline nesting is the model;
   a 7×7 game's trees are small, so favour legibility over cleverness. Keyboard
   navigation (←/→ along a line, ↑/↓ between siblings) if it fits the session.
3. **Decide where trees are allowed, and document it.** The obvious answer is
   *analysis mode only*, leaving live play a single line — but that is a real design
   decision with consequences for the move log, the takeback and the save, so make it
   explicitly and write it down in `docs/design/lichess-ui.md` rather than letting it
   emerge.
4. **Persistence and export must not silently lose branches.** Pick one and say so:
   (a) trees are session-only and the save/export stays mainline (then the UI must
   tell the user that leaving loses variations), or (b) extend `SavedGame` behind a
   version bump and the file format behind `FORMAT_VERSION`, keeping the existing
   `capture_mismatch` trust check. **A newer save must fail closed on an older build**
   — that rule is already load-bearing (Session 5, `docs/ROADMAP.md`).
5. Zen-hideable extra for the panel, mirroring the `flip`/`analysis` extras added in
   7b (`src/zen.ts`); i18n labels in `en` + `es`, `ga` drafts marked as drafts. Do
   **not** unhide the `ga` locale.

## CONSTRAINTS

100% offline. Theme-aware (light/dark). Respect `prefers-reduced-motion`. The
**replay-from-opening invariant** (`CLAUDE.md`) still holds: persistence and
import/export replay move lists from `initialState()` only — if a tree is persisted,
each line must still replay from the opening, not from a stored mid-game board. No
regression to live play, to the clock line's index alignment, or to the 7b guarantee
that analysis never overwrites the live save.

## VERIFY

Tests green, including the tree module directly: creating a sibling instead of
truncating, promote, delete, mainline resolution, and round-tripping through whatever
persistence choice you made. `npm run build` clean. Driven-browser pass against the
production build (the project convention — see `scripts/screenshot.mjs` for the
harness): branch a line in analysis, confirm the original survives, navigate between
siblings, promote one, and confirm the live game and its save are untouched
throughout. Commit + push to your assigned branch; no PR unless asked. Mark 7c
shipped in `docs/ROADMAP.md` and `docs/design/lichess-ui.md`, update
`docs/prompts/README.md`'s status table, and leave 7d open. Do not start 7d.
