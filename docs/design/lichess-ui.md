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
- 7a — Eval bar + best-move arrow (background worker eval; read-only). **Shipped** — see below.
- 7b — Board flip + analysis "free move" toggle. **Shipped** — see below.
- 7c — Move-tree panel (variations, navigation). **Shipped** — brief: [`docs/prompts/7c-move-tree.md`](../prompts/7c-move-tree.md).
- 7d — Post-game annotations (needs export/replay). **Open** — brief: [`docs/prompts/7d-annotations.md`](../prompts/7d-annotations.md).

The ordering above is about *size*, not dependency. 7b shipped before 7a because
its two features stand on their own; what 7a needed from it is described next.

## 7b — what shipped, and what 7a should build on

**`src/orientation.ts` is the single mapping between board space and view space.**
Anything that draws *on* the board goes through it: the board's own cells, square
highlighting, and — when it arrives — the best-move arrow.

```ts
viewCenter(sq, flipped)   // → {x, y}, fractions 0–1 of the board box
viewArrow(move, flipped)  // → {from: {x, y}, to: {x, y}}
```

An overlay positioned from those is orientation-aware with no further work and
cannot disagree with the board underneath it. The contract is unit-tested ahead
of its first caller (`src/orientation.test.ts`): endpoints reflect through the
centre when flipped, arrow length is preserved, on-screen direction reverses, and
the throne stays put. **7a should not read `row`/`col` directly** — that is the
one way the arrow and the board can drift apart.

The eval bar has no orientation question of its own to answer *unless* it is
drawn as a vertical attacker-over-defender bar beside the board, in which case it
should swap ends with the clocks — see the flip decision below.

### Decisions taken in 7b

- **Flip is view-only.** The board iterates in view order and resolves each drawn
  cell back to its square; game logic, `controllable` and the saved game never see
  a flipped board. `game/sides.ts` still holds that orientation does not follow
  the side you play — this is a preference about the picture, nothing more.
- **The clocks flip with the board.** The whole view turns over or none of it
  does. The clocks are the two players' chairs; rotating the board while they
  stayed put would seat the away player's clock beside the near player's pieces.
  The swap lives in the view — `clockPlacement` is unchanged.
- **Coordinates stay truthful.** Labels move to whichever drawn edge is now
  bottom/left (files `g…a`, ranks `1→7` when flipped) and every cell carries its
  own square name as an `aria-label`, so assistive tech reads the board rather
  than the view.
- **Analysis never touches the live save.** The autosave is closed while
  analysing *and* the live timeline — states, cursor, and the index-aligned clock
  line — is snapshotted on enter and restored on exit. Belt and braces, because
  the page-hide autosave can fire at any moment. New game / import / resume drop
  the snapshot rather than restoring it: they are replacing the game it describes.
- **Analysis moves from a rewound position truncate**, exactly as "play from
  here" always has. That is deliberate and is not a stand-in for variations; see
  `commitBasePly` in `src/analysis.ts`, which is the line 7c replaces.

## 7a — what shipped

The eval bar and the best-move arrow, read-only, for the position the cursor is
on. `src/evalBar.ts` is the whole score → picture mapping (pure, unit-tested);
`src/components/EvalBar.tsx` draws it; the arrow lives in `Board.tsx` as an
overlay; `useAnalysisWorker` runs the search.

### Decisions taken in 7a

- **The score is now threaded end to end.** `pickMove` always returned one; every
  layer above it dropped it on the floor. It rides `MoveInfo` → `AiResponse` →
  `AiMove` now, and `WIN`/`DECISIVE` are exported from `ai.ts` rather than
  re-declared, so "decisive" cannot come to mean two different numbers.
- **Analysis gets its own worker instance, not a second request type on the
  same one.** Play hard-cancels by *terminating* its worker; sharing an instance
  would mean each cursor step could kill the AI's move mid-search and vice
  versa. Separate instances also keep `ai.ts`'s module-global transposition
  table separate, which matters because analysis searches with different
  weights. Measured at peak 2 workers alive simultaneously.
- **The bar's ends are the two chairs, and it flips with the board** — the
  question this doc left open, answered the way the clock decision above
  answers it. The caller passes `bottomClockSide`; a fill above half and a
  positive number both mean *the near player* is ahead. Pinning attackers to
  one end forever would have made the picture read backwards from one seat.
- **Analysis is deterministic in the position alone.** A pinned tie-break `rng`
  is not enough: the transposition table feeds move *ordering*, so re-analysing
  a position you had stepped away from and back to could surface a different
  member of the equally-best set. `analysePosition` clears the table first.
  Owning its own worker thread is what makes that safe to do.
- **Soft curve, reserved ends.** A logistic on the engine's own scale (one piece
  ≈ 40 points moves the bar 7%), with the last 3% at each end held back so a
  *proven* win is visibly different from a crushing one. Decisive scores —
  including the recognizers' `±RECOGNIZED_WIN` — render as a verdict in words
  rather than a number.
- **Analysis switches `attackerRecognizer` on.** Session 4 shipped it off for
  play, measured neutral and not free; analysis is the deliberate, on-demand
  case it was kept for. The playing engine is unchanged.
- **The arrow goes through `viewCenter`/`viewArrow`, never `row`/`col`.** That is
  the seam 7b left, used as intended: the arrow cannot drift out of alignment
  with the board under it. It is absolutely positioned (so the 7×7 grid
  auto-placement is untouched) and `aria-hidden` (so the accessible grid is
  still 49 gridcells).
- **Opt-in twice over**: a Zen extra (`eval`) decides whether the toggle button
  exists; a persisted preference holds whether the bar is on. Off means the
  search is *cancelled*, not merely hidden.

### What 7a did not do

Read-only means read-only: no position setup, no eval on the move-log rows, no
per-move swing annotation. The bar answers "what is this position worth"; "which
move was the mistake" is 7d and needs a search per ply, not one per view.

## 7c — what shipped

`src/game/moveTree.ts` is the tree: pure, React-free, nodes keyed by ids that are
never reused, **first child = mainline**. `addMove` / `promote` / `remove` /
`treeLines`, all unit-tested.

### Decisions taken in 7c

- **The tree is analysis's structure, not the game's.** Live play stays a single
  line, because a game has one history — the save and the export encode one move
  list, and a takeback is *supposed* to destroy moves. `rewindTo`, `doTakeback`,
  `playFromHere` and `resign` are explicitly closed to analysis so the two
  representations can never cross.
- **The UI never learned about trees.** `App.tsx` derives `states`/`cursor` from
  the line between the root and the selected node, so the board, move log,
  captured tray and review controls work inside a variation unchanged. In
  analysis "back" selects the *parent node* rather than sliding an index, which
  is precisely why stepping back and playing something else branches.
- **Replaying a tried move navigates rather than duplicating.** Without that a
  tree fills with copies of itself; it is the difference between a panel that
  stays readable and a pile.
- **`promote` walks the whole path to the root.** A node promoted only within its
  own parent would still sit inside a variation, leaving `isMainline` false and
  the button apparently broken.
- **Variations are session-only**, and the panel says so rather than letting a
  reload teach it. Analysis has never written to storage, so this needed no
  save-format or `FORMAT_VERSION` bump and carries none of that risk.
- **7b's snapshot is gone.** Analysis no longer borrows the live timeline, so
  there is nothing to restore; `commitBasePly` went with it. The autosave guard
  stays and still matters — the autosave reads the *derived* line, which in
  analysis is a variation, not the game.

### Anchors for 7d

- `src/game/ai.ts` — `evaluate` (`:378`) and `pickMove` (`:890`). Scores are
  **attacker-positive**; `DECISIVE` marks a forced mate.
- `src/game/useAiWorker.ts` — `requestMove` is one search, off the main thread,
  and `cancel()` terminates the worker.
- `src/App.tsx` — `MoveLog` is where a per-ply mark attaches.

Added by 7a — what a move tree will have to carry with it:
- **The eval is keyed on the viewed position, not on a ply index.** The analysis
  effect in `App.tsx` depends on `game` (`states[cursor]`) and nothing else, so
  it already follows a cursor wherever a tree moves it. A tree that swaps the
  linear `states[]` for nodes needs only to keep handing the effect *the position
  on screen*; nothing in `evalBar.ts`, `EvalBar.tsx` or the arrow overlay knows
  the timeline is linear.
- **A per-node eval is nearly free once the tree exists**, and is the obvious
  join between 7c and 7d: `analysePosition` is deterministic in the position
  alone (it clears the TT), so a node's score can be cached against the node and
  will not drift when it is re-derived. 7d's eval swings are then differences
  between adjacent cached nodes rather than a fresh search per ply.
- **One search at a time is the current contract.** `useAnalysisWorker` hard-
  cancels by terminating, so a tree that wants to evaluate several sibling
  variations at once needs a request queue or a small worker pool — not a second
  copy of the hook. That is the first thing to change if 7c wants breadth.

## Non-goals
Online play, accounts, server-side analysis, opening explorer database. Everything
stays offline/local, consistent with the app's design.
