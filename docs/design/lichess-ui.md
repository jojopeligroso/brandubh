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
   import/export format in the sibling design doc). **Shipped (7e).**
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
- 7d — Post-game annotations (needs export/replay). **Shipped** — brief: [`docs/prompts/7d-annotations.md`](../prompts/7d-annotations.md).
- 7e — Position setup (FEN-equivalent). **Shipped.** Not in the original slicing;
  added to close out target feature 5.

The ordering above is about *size*, not dependency. 7b shipped before 7a because
its two features stand on their own; what 7a needed from it is described next.
**All shipped**, but not in this order and not all on one branch. 7b came first —
its brief claimed a dependency on 7a that did not exist — followed by 7c, 7d and
7e. **7a was built in parallel on a separate branch** and merged before the rest.

The two never coordinated, and did not need to: 7b had left the seam 7a would
need (`src/orientation.ts`) tested before it had a caller, and 7a picked it up
unchanged. That is the argument for writing a contract down rather than promising
one. The cost of the overlap was a duplicate 7a, written on the other branch and
discarded at merge.

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
  analysing *and* the live timeline was snapshotted on enter and restored on
  exit. *(Superseded in 7c: analysis stopped borrowing the timeline, so the
  snapshot is gone. The autosave guard remains and still matters.)*
- **Analysis moves from a rewound position truncate.** *(Superseded in 7c: they
  branch. `commitBasePly` was retired with the behaviour it described.)*

## 7a — what shipped

The eval bar and the best-move arrow, read-only, for the position the cursor is
on. `src/evalBar.ts` is the whole score → picture mapping (pure, unit-tested);
`src/components/EvalBar.tsx` draws it; the arrow lives in `Board.tsx` as an
overlay; `useAnalysisWorker` runs the search.

### Decisions taken in 7a

- **The score is now threaded end to end.** `pickMove` always returned one; every
  layer above it dropped it on the floor. It rides `MoveInfo` → `AiResponse` →
  `AiMove` now, and `WIN`/`DECISIVE` are exported from `engine.ts` rather than
  re-declared, so "decisive" cannot come to mean two different numbers.
- **Analysis gets its own worker instance, not a second request type on the
  same one.** Play hard-cancels by *terminating* its worker; sharing an instance
  would mean each cursor step could kill the AI's move mid-search and vice
  versa. Separate instances also keep `engine.ts`'s module-global transposition
  table separate, which matters because analysis searches with different
  weights. Measured at peak 2 workers alive simultaneously.
- **The bar's ends are the two chairs, and it flips with the north–south
  mirror** — the
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
- **Post-game only, and gated at the room rather than the furniture.** Analysis
  cannot be entered until the game has concluded; the eval bar is part of
  analysis and simply appears inside it, with no gate of its own. The test is the
  *live* game's result, so analysing a finished game keeps the eval down a
  variation (which truncates the timeline and would otherwise revoke it), while
  analysis mode entered on an unfinished game gets nothing — that path was a way
  to ask the engine mid-game and then play on. `evalAvailable` in `evalBar.ts`. Three routes were closed, not one:
  analysis mode on an unfinished game; the **7d annotation pass**, which was
  gated on not disturbing the AI rather than on the game being over, and so ran
  mid-game over the board; and a **pasted position**, since the position panel
  shows the current board with a copy button and keying the eval off the pasted
  root would have made copy-then-paste a two-click bypass. Pasting and exploring
  by hand still works mid-game — only the engine's opinion waits.
- **Opt-in twice over** (once available): a Zen extra (`eval`) decides whether the toggle button
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

## 7d — what shipped

`src/game/annotate.ts` holds the judgement; `App.tsx` holds only the walk.

### Decisions taken in 7d

- **The bands are measured.** `scripts/annotate-calibrate.ts` sampled 40 seeded
  self-play games at depth 3 — 850 plies, 327 losing ground — giving p50 30,
  p75 76, p90 110, p95 180. inaccuracy **40** (≈p60, one piece), mistake **80**
  (≈p80), blunder **120** (≈p91, `escapeLane`: an open road to a corner). Re-run
  the script if `DEFAULT_WEIGHTS` changes; bands measured against a different
  evaluation say nothing about this one.
- **The pass searches at the depth the bands were measured at** (`medium`, fixed
  depth 3). Scores from another depth are not comparable to them.
- **A decided position is never marked**, or the tail of every finished game is a
  wall of `??`. **A forced move is never a mistake.** Walking from a live
  position into a forced loss still marks at full severity — that is the move
  that threw it.
- **The sign convention lives in one function.** `lossFor` is the only place the
  attacker-positive asymmetry is handled, and it is tested from both sides.
- **One search per position, not two per move.** The value after ply k is the
  value before ply k+1.
- **Stopping does not kill the worker.** `cancel()` terminates mid-search and the
  promise awaiting it would never settle, so a stopped pass lets the search in
  flight finish (~50ms at this depth) and then bails.
- **Nothing is persisted.** Annotations are derived and re-derivable in seconds,
  so no save or `FORMAT_VERSION` bump and none of that risk. Marks are keyed to
  the line they were computed for, so a variation hides them rather than
  inheriting another line's verdicts.

### Anchors for 7a — the one slice left

- `src/orientation.ts` — `viewCenter` / `viewArrow` give the arrow overlay its
  endpoints; do not read `row`/`col` directly.
- `AiResponse.score` (`src/game/ai.worker.ts`) — 7d added it. The eval bar needs
  exactly this number, so the plumbing already exists.
- `src/game/annotate.ts` — `terminalScore` and `DECISIVE_SCORE` show how a
  decided position should be displayed rather than searched.

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
### Decisions taken in 7a

- **The arrow goes through the orientation seam and nowhere else.**
  `arrowGeometry` calls `viewArrow` and never touches `row`/`col`. That is what
  makes it rotate with a flipped board for free — and it is checked in the
  browser, not just asserted: after a flip the tip still lands inside the same
  *named* square, cross-checked against that cell's own bounding rect.
- **The bar flips with the board**, its top belonging to whichever side is drawn
  up there — the same rule the clocks follow. Otherwise it reads the position
  for the wrong chair.
- **A logistic squash, not a linear fill.** `BAR_K` = 120 (`escapeLane`), so one
  piece reads ~58% — a real but recoverable edge — instead of a linear bar
  saturating on the first capture. A forced result pins it.
- **Hidden while you play the computer.** Asking the engine you are competing
  against for its move is the answer sheet, not analysis. Shown in analysis, on
  a finished game, and over the board, where both players share one screen.
- **Its own worker.** `requestMove` kills a busy worker to start a new search, so
  sharing one with the AI or 7d's pass would let either strand the other's
  pending promise.
- **Read-only.** The overlay is `pointer-events: none` and `aria-hidden`; the
  suggestion is announced in a text line rather than only drawn.

## 7e — what shipped

`src/game/position.ts` is a one-line FEN-shaped encoding of a board plus the side
to move: seven ranks top-first, `A` raider / `D` defender / `K` king, a digit for
empty squares, then `a` or `d`. `encodePosition` / `parsePosition`, 27 tests.

It is the deliberate complement of `gameFile.ts`: that format carries a *game*
(a move list replayed from the opening), this one carries a *position*, which is
exactly what a move list cannot express.

### Decisions taken in 7e

- **A pasted position never becomes the live game.** It arrives as the *root of
  an analysis tree* — `moveTree.ts` already roots at any `GameState`, so 7c had
  built this without knowing it — and lives in component state, exactly where the
  tutorial set-plays keep their hand-built boards. The replay-from-opening
  invariant (`CLAUDE.md`) therefore holds with no guard of its own, because
  analysis has never written to storage.
- **Game export is blocked while a pasted position is loaded**, and says why.
  This is the one place the invariant could actually leak: the file format
  records a move list replayed from `initialState()`, so exporting a tree rooted
  on a pasted board would write a file that replays into a *different game*. The
  panel is replaced by the reason rather than silently disappearing.
- **Validation refuses anything unplayable**, with the rank quoted back: not
  seven ranks, a rank that does not total seven, an unknown symbol, a missing
  side to move, no king or two kings, and a soldier standing on a corner or the
  throne — a position no sequence of legal moves could have reached. When a board
  is wrong in two ways at once the missing king is reported first: a fact about
  the whole position outranks a fact about one square.
- **No invented history.** A pasted position has `history: []` and `moveCount: 0`
  because that is the literal truth. Repetition counting starts fresh from it,
  which is the honest behaviour — the moves that led there are not known.

## What is left

Every target feature in the list above is now shipped. Session 7 is closed.

## Non-goals
Online play, accounts, server-side analysis, opening explorer database. Everything
stays offline/local, consistent with the app's design.
