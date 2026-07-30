# Design — Lichess-style analysis UI

**Session 7 of [`docs/ROADMAP.md`](../ROADMAP.md).** The analysis experience.
Large; expect to slice across multiple sessions. This doc is the vision + a
suggested slicing so each slice is its own shippable session.

## What already exists (don't rebuild)
- Move log with click-to-jump, step back/forward, branch from a past position
  (`states[]` timeline + `cursor`).
- Board orientation follows the human side; clock UI (Lichess-style placement).
- The engine can evaluate any position (`evaluate`) and search it (`pickMove`),
  and reports `depth`/`nodes`/`score` (already surfaced as a small readout).

## Target features (Lichess parity, tafl-adapted)
1. **Eval bar** — a vertical bar showing the current position's score (attacker vs
   defender), driven by a shallow background `pickMove`. Reuse the worker.
2. **Analysis mode** — free move exploration off the main line, with a **move tree**
   (variations), not just a single mainline. The timeline already branches; this is
   the UI to see/navigate branches.
3. **Best-move / hint arrow** — draw the engine's suggested move on the board.
4. **Board flip** — view from either side regardless of who you play.
5. **Position setup / FEN-equivalent** — paste a position to analyze (ties to the
   import/export format in the sibling design doc).
6. **Blunder/inaccuracy annotations** — after a game, re-search each move and mark
   large eval swings (needs the export/replay plumbing first).

## Dependencies / ordering
- Do **import/export (Session 3)** first — it gives a position/game format the
  analysis tools consume.
- The **eval bar** and **hint arrow** are the smallest, highest-signal slices; ship
  them first as their own session.
- The **move tree** UI is the biggest single piece; treat it as its own session.

## Suggested slicing (each a session)
- 7a — Eval bar + best-move arrow (background worker eval; read-only). **Not started.**
- 7b — Board flip + analysis "free move" toggle. **Shipped** — see below.
- 7c — Move-tree panel (variations, navigation). **Open.**
- 7d — Post-game annotations (needs export/replay). **Open.**

The ordering above is about *size*, not dependency. 7b shipped before 7a because
its two features stand on their own; what 7a needs from it is described next.

## 7b — what shipped, and what 7a should build on

**`src/orientation.ts` is the single mapping between board space and view space.**
Anything that draws *on* the board goes through it: the board's own cells, square
highlighting, and — when it arrives — the best-move arrow.

```ts
viewCenter(sq, flipH, flipV)   // → {x, y}, fractions 0–1 of the board box
viewArrow(move, flipH, flipV)  // → {from: {x, y}, to: {x, y}}
```

`flipH` and `flipV` are independent single-axis mirrors — east–west (columns)
and north–south (rows) respectively; turning both on reproduces a 180°
rotation, but either works alone. An overlay positioned from those is
orientation-aware with no further work and cannot disagree with the board
underneath it. The contract is unit-tested ahead of its first caller
(`src/orientation.test.ts`): endpoints reflect through the centre when both
flip, each axis reflects independently when only one does, arrow length is
preserved, on-screen direction reverses, and the throne stays put. **7a should
not read `row`/`col` directly** — that is the one way the arrow and the board
can drift apart.

The eval bar has no orientation question of its own to answer *unless* it is
drawn as a vertical attacker-over-defender bar beside the board, in which case it
should swap ends with the clocks — see the flip decision below.

### Decisions taken in 7b

- **Flip is view-only.** The board iterates in view order and resolves each drawn
  cell back to its square; game logic, `controllable` and the saved game never see
  a flipped board. `game/sides.ts` still holds that orientation does not follow
  the side you play — this is a preference about the picture, nothing more.
- **Two independent mirrors, not one rotation.** East–west (`flippedH`, left/right
  swap) and north–south (`flippedV`, top/bottom swap) are separate toggles with
  separate buttons; either can be on alone, and both together look like the old
  180° rotation.
- **Only the north–south flip moves the clocks.** The clocks are the two players'
  chairs, seated above/below the board — a top/bottom mirror swaps them, an
  east–west one doesn't touch which side of the screen is "up". The swap lives
  in the view, keyed off `flippedV` alone — `clockPlacement` is unchanged.
- **Coordinates stay truthful.** Labels move to whichever drawn edge is now
  bottom/left (files `g…a` when east-west flipped, ranks `1→7` top-down when
  north-south flipped) and every cell carries its own square name as an
  `aria-label`, so assistive tech reads the board rather than the view.
- **Analysis never touches the live save.** The autosave is closed while
  analysing *and* the live timeline — states, cursor, and the index-aligned clock
  line — is snapshotted on enter and restored on exit. Belt and braces, because
  the page-hide autosave can fire at any moment. New game / import / resume drop
  the snapshot rather than restoring it: they are replacing the game it describes.
- **Analysis moves from a rewound position truncate**, exactly as "play from
  here" always has. That is deliberate and is not a stand-in for variations; see
  `commitBasePly` in `src/analysis.ts`, which is the line 7c replaces.

### Anchors for 7c

- `src/analysis.ts` — `commitBasePly` is where the truncate-or-branch decision is
  taken today; the pure predicates around it (`aiMayReply`, `autosaveAllowed`,
  `boardIsInteractive`) are the mode's contract and are unit-tested.
- `src/App.tsx` — `states[]` + `cursor` is the linear timeline a move tree would
  replace, and `commitMove` is its only writer. `enterAnalysis`/`exitAnalysis`
  show what a mode has to save and restore to leave the live game intact.

## Non-goals
Online play, accounts, server-side analysis, opening explorer database. Everything
stays offline/local, consistent with the app's design.
