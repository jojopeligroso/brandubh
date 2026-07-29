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
- 7a — Eval bar + best-move arrow (background worker eval; read-only).
- 7b — Board flip + analysis "free move" toggle.
- 7c — Move-tree panel (variations, navigation).
- 7d — Post-game annotations (needs export/replay).

## Non-goals
Online play, accounts, server-side analysis, opening explorer database. Everything
stays offline/local, consistent with the app's design.
