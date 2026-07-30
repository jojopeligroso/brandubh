# Brandubh — Engine & Product Roadmap

The remaining work, broken into **sessions** sized so each can be implemented
*correctly* — finished, tested, and shipped — in one focused block. Big,
spec-heavy features have their own design docs (linked below); this file is the
master index and the per-session plan.

Detailed specs:
- Game resumability (shipped): [`docs/design/game-persistence.md`](./design/game-persistence.md)
- Game import/export (PGN-style): [`docs/design/game-import-export.md`](./design/game-import-export.md)
- Lichess-style analysis UI: [`docs/design/lichess-ui.md`](./design/lichess-ui.md)

---

## How to size a session (the rule this plan follows)

A session is **one coherent theme** that ends **green** — tests pass, build
clean, and any strength-affecting change gauntletted — and is **independently
shippable** on its own commit/push. Concretely:

- **~3–6 commits**, one theme; never mix engine internals with UX in the same session.
- **Ends verifiable:** a round-trip test, a gauntlet, or a manual check with evidence.
- **Small enough to fully test**, large enough to deliver one complete improvement.
- Sizes below: **S** ≈ half a session (batchable), **M** ≈ one session, **L** ≈ one
  focused session that should start from its design doc.

Never ship a measured regression. When a change is "neutral", say so and decide
on cost (free ⇒ may keep; costly ⇒ drop) — the discipline used all through the
last session (PVS dropped, recognizers kept, kingRegion shipped).

---

## Sessions (ordered by value ÷ effort)

### Session 1 — Game resumability *(M)* — **shipped**
**Goal:** a page refresh never loses a game in progress.
Match-setup (difficulty/variant/side) already persisted; this extended it to the live game.
Design + Lichess comparison: [`docs/design/game-persistence.md`](./design/game-persistence.md).
- [x] Serialize the game, `cursor`, clock banks and match score to `localStorage` under the versioned key `brandubh.game.v1`. The timeline is stored as its **move list** and replayed on load (as lila does), not as a position per ply — ~550 bytes for a three-move game.
- [x] Restore on load; a saved game is offered as **Resume / New** in the opening overlay, and nothing overwrites it until that choice is made.
- [x] Invalidate on corrupt / old-schema / stale (>14 days) data, on an unknown variant, on a move list that will not replay legally, and on "New match" / "New game".
- [x] Round-trip unit tests (`persist.test.ts`, 23 tests) plus a driven-browser refresh mid-game: board, move log and clock banks identical after Resume.

### Session 2 — Play either side *(S–M)* — **shipped**
**Goal:** choose to play the **raiders (attackers)** or the **king (defenders)** from the overlay.
- [x] Overlay side picker: *Play vs AI* now steps **side → difficulty** before the board appears, and the last side played is pre-selected. Over the board stays a top-level choice, as before.
- [x] Sides all derive from the play mode in one place, [`src/game/sides.ts`](../src/game/sides.ts) — `humanSideOf` / `aiSideOf` / `clockPlacement`. `App.tsx` no longer hardcodes `onChoose("defenders")`; the picked side is what starts the game.
- [x] Board **orientation** needs nothing: the opening is D4-symmetric (two raiders at the head of each arm, king centred), so there is no near/far half to flip. Only `controllable` changes. Recorded in `sides.ts`.
- [x] Clock placement follows the human: they sit at the bottom whichever side they took; over the board the raiders keep the top (they move first).
- [x] Side persists (Session 0) and rides in the resumable game (Session 1) for **both** sides — `sides.test.ts` round-trips each.
- [x] `sides.test.ts` (13 tests): both sides drive the AI to legal moves by pieces it owns, and the computer opens when the human takes the king (the raiders always move first).
- [x] Driven-browser check against the production build (29 assertions, all passing): a game played as the raiders (human opens, the AI answers with a defender) and as the king (the AI opens with a raider unprompted), each refreshed mid-game and resumed to an identical board, move log and side; plus the clock faces — the computer above the board, the human below, either way.

### Session 3 — Export / import games (PGN-style) *(L — see design doc)* — **shipped**
**Goal:** save a game to a file and load one back, Lichess-style.
- [x] Serialize a finished/in-progress game to the PGN-style text format (metadata header + move list in the app's existing notation) — `src/game/gameFile.ts`.
- [x] Download/copy export; paste/upload import with a tolerant parser (aagenielsen.dk-compatible) — `src/components/GameFilePanel.tsx`.
- [x] Load an imported game into the existing replay timeline (step/branch already exist).
- [x] Parser/round-trip tests; reject malformed input gracefully — `gameFile.test.ts`, `replay.test.ts` (60 tests), plus a browser pass (29 checks).

`src/game/replay.ts` came out of this session: replay-and-validate, with no
knowledge of any file format. Session 1's `restoreGame` now sits on it too, so
a save and a pasted game are validated by the same code — one trust boundary,
two encodings, neither coupled to the other.

### Session 4 — Attacker endgame recognizer *(M)*
**Goal:** the exact twin of the defender recognizers, for **forced attacker wins** (imminent king capture / forced encirclement) — helps the side you're pressure-testing.
- [ ] `forcedAttackerWin(state, rules)` returning `+RECOGNIZED_WIN`; escape-zone-style gate for zero throughput cost.
- [ ] Cross-validate against the solver + an independent AND-OR oracle (as `recognizers.test.ts` does).
- [ ] Confirm throughput-neutral; gauntlet for strength/neutrality; document honestly.

### Session 5 — Correctness & discoverability polish *(S — batch)*
**Goal:** fix known bugs and make features findable.
- [ ] **Clock reachable in Zen:** surface the clock toggle in the gear ⚙ modal (like `ZenSettings`) so enabling Zen doesn't hide the timer.
- [ ] **Custom-rule-editor reset:** toggling a custom rule mid-game must call `newGame()` (currently leaves inconsistent state).
- [ ] **Unhide Irish (`ga`) locale** — full translation exists behind `VISIBLE_LANGS`; verify cló rendering, then reveal. On-brand with Ollaṁ.
- [ ] Remove or wire the dead `.piece.threat` CSS; refresh `docs/screenshot.png`.

### Session 6 — Opening book (Ollamh) *(M–L)*
**Goal:** Ollamh opens instantly, varied, and strong.
- [ ] Offline generator: deep search over the (D4-folded) opening tree, best-N with light randomization → data file.
- [ ] Load into the existing `OPENING_BOOK` hook (already wired); label honestly as *deep-search*, not *proven*.
- [ ] Book-lookup tests; measure opening speed + move variety.

### Session 7 — Lichess-style analysis UI *(L — see design doc)*
**Goal:** the analysis experience: eval bar, analysis mode, move tree, board flip, etc. Likely spans multiple sessions; start from the design doc and slice.

---

## Deferred / not worth it (with rationale)

- **Material endgame tablebases** — decisive endgames keep too many attackers to tabulate (~10⁸–10¹⁴); the tabulatable ones are foregone. See `docs/solving.md`.
- **Full game solve** — ~6×10¹⁴ states, ~228 yrs at current speed. Not here.
- **Null-move pruning** — tafl zugzwang makes it unsound without heavy guards; uncertain payoff.
- **PVS / aspiration windows** — measured neutral (ordering + TT + LMR already tighten windows). Kept as an off-by-default knob for wider variants.

## Verification standard (every session)
Tests green · build clean · gauntlet any strength-affecting change · commit + push · never ship a measured regression.
