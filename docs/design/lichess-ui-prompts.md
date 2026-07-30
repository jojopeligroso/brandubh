# Session-launch prompts — remaining roadmap work

Ready-to-paste prompts for opening each remaining session in a **fresh** session.
Companion to [`docs/ROADMAP.md`](../ROADMAP.md) (status of record) and, for Session 7,
[`lichess-ui.md`](./lichess-ui.md) (the vision + slicing). Anchors here are checked
against `main`; if `main` has moved, re-verify before pasting.

**Status at time of writing:** Sessions 1–5 shipped; **Session 4** shipped (attacker
recognizer, default-off knob); **Session 7b** shipped (board flip + analysis toggle,
which left the `src/orientation.ts` and `src/analysis.ts` seams). **Remaining:**
Session 6, and Session 7 slices **7a**, **7c**, **7d**.

Every prompt assumes the standing verification bar: tests green · `npm run build` clean ·
gauntlet any strength-affecting change · commit + push to the assigned dev branch · no PR
unless asked · never ship a measured regression · the Irish (`ga`) locale stays held back
from `VISIBLE_LANGS` pending human translation review (adding trivial `ga` strings is fine,
unhiding the locale is not).

---

## Session 6 — Opening book (Ollamh)

```
Session 6 of the Brandubh roadmap: build the Ollamh opening book.

Repo: jojopeligroso/branndubh. Start from latest main. Read docs/ROADMAP.md
"Session 6" (the spec — no separate design doc) and docs/solving.md.

GOAL: Ollamh (strongest tier) opens instantly, varied, and strong, from a
precomputed book instead of a slow live search.

Integration point already exists — do NOT re-plumb it:
  • src/game/ai.ts ~line 995: `export const OPENING_BOOK: Record<string, Move> = {}`
    (empty), consumed by `bookMove()`, keyed by `hashBoard(board, turn)`, re-validated
    against live legal moves before trust. Only `ollamh` consults it (ai.ts ~1065; a
    booked move returns depth −1). Test to extend: src/game/ai.test.ts "opening book".
  • D4 folding to reuse: `stabilizer` / `foldRootMoves` in ai.ts ~815 (40 first moves
    fold to 5). scripts/solve.ts + scripts/aibench.ts show the offline-script + gauntlet
    patterns.

TASKS:
1. Offline generator (e.g. scripts/genbook.ts, tsx): deep search over the D4-folded
   opening tree, best-N per position with light seeded randomization → a BUNDLED data
   file (e.g. src/game/openingBook.data.ts) keyed by hashBoard, populating OPENING_BOOK
   at import (must bundle into dist — stays 100% offline; keep it compact).
2. HONEST LABELING: the current comments at ai.ts:987 ("solver-fed", "only *proven*
   moves belong here") and the test name describe a PROVEN book. A deep-search book is
   not proven/optimal. Relabel it honestly as deep-search; keep the re-validation
   guarantee as the thing that stays true.
3. Book-lookup tests (booked position → legal-validated move; ollamh uses it, hard does
   not; data round-trips; randomization behaves) — extend the existing block.
4. MEASURE + document: opening speed (booked vs searched), move variety, and a gauntlet
   ollamh-WITH-book vs ollamh-WITHOUT (fixed budget) confirming ≥ neutral strength.

BOOK SIZE / SHAPE TARGET (tune against the measured tree, not law):
  • Cover the first ~6–8 plies (the slow, samey part); beyond that leave live search.
  • Generate each booked position ≥ as deep as ollamh's live opening search (~depth
    8–10) from the D4-folded tree (~1 in 8 positions computed).
  • Keep top 2–3 moves within a small eval margin (≤ ~1/3 material unit) of best; pick
    among them with light seeded randomization. Never book outside that margin.
  • A few hundred–low thousands of folded entries; added bundle weight well under
    ~150 KB gzipped (app ships ~496 KB gzip — report before/after).
  • If the honest numbers don't fit, shrink coverage depth rather than bloat/weaken, and
    say so.

VERIFY: tests green, build clean, commit + push to your branch, no PR unless asked. Mark
Session 6 shipped in docs/ROADMAP.md + TASKS.md with the measured speed/variety/strength
numbers.
```

---

## Session 7a — Eval bar + best-move arrow

7b already shipped the orientation seam, so the arrow is orientation-aware for free —
consume it, don't reinvent it. The score is still **not** threaded through the worker;
that plumbing is 7a's first task.

```
Session 7a of the Brandubh roadmap: analysis UI slice — eval bar + best-move arrow.

Repo: jojopeligroso/branndubh. Start from latest main. Read docs/design/lichess-ui.md and
the Session 7 roadmap section. 7b (board flip + analysis toggle) is already shipped — build
on its seams. Your job is 7a ONLY (eval bar + best-move arrow, read-only). Do NOT touch the
move-tree (7c) or annotations (7d).

GOAL: while viewing any position (live, reviewing, or in 7b's analysis mode), show (1) a
vertical EVAL BAR of the current score and (2) the engine's BEST-MOVE ARROW on the board —
driven by a shallow background search, non-blocking, never interfering with live play.

WHAT EXISTS (reuse):
  • Orientation seam (from 7b): src/orientation.ts — `viewArrow(from, to, flipped)` and
    `viewCenter(sq, flipped)` give view-space endpoints, so an arrow overlay drawing from
    them is flip-correct automatically. Board renders a CSS `.cell` grid (no overlay layer
    yet — add an absolute-positioned SVG overlay). Analysis/flip state lives in App.tsx +
    src/analysis.ts.
  • Engine: evaluate is ATTACKER-POSITIVE (+WIN attackers, −WIN defenders); pickMove
    returns { move, score, depth, nodes }; decisive ≈ ±1_000_000 (WIN/DECISIVE/
    RECOGNIZED_WIN in ai.ts). Worker: src/game/useAiWorker.ts + ai.worker.ts (off-thread,
    cancels stale work). Existing readout: App.tsx ~1135 fed by `lastAiInfo`.

REQUIRED PLUMBING FIRST — the score is currently dropped: thread `score` from pickMove →
MoveInfo (chooseMoveDetailed) → AiResponse (ai.worker.ts) → AiMove (useAiWorker). No score,
no eval bar.

BUILD:
  1. Eval bar beside the board: map score → fill with a documented orientation and a
     clamped/sigmoid scale; render decisive scores specially (±WIN → attackers/defenders
     win; recognizers return ±RECOGNIZED_WIN); show a sign-consistent numeric score. It
     reflects the VIEWED position (states[cursor]), not only the tip.
  2. Best-move arrow: SVG overlay drawing `viewArrow(bestMove.from, bestMove.to, flipped)`
     for the engine's top move at the viewed position. Because it uses the seam it stays
     aligned under flip with no extra work.
  3. Background analysis eval: a SHALLOW pickMove for the viewed position that MUST NOT
     slow or cancel the live game's move search — separate worker instance or an analysis
     request type; debounce on position change; cancel stale analysis. May pass
     { ...DEFAULT_WEIGHTS, attackerRecognizer: true } for a sharper eval (that Session-4
     knob is off in normal play by design — analysis is its intended use).
  4. Eval bar + arrow are Zen-hideable extras (mirror the existing `flip`/`analysis` Zen
     extras); i18n labels en + es (ga held back).

CONSTRAINTS: 100% offline; no live-play regression (prove the analysis search doesn't
delay the AI move — separate worker or show cancellation); theme-aware; respect
prefers-reduced-motion (usePrefersReducedMotion exists); arrow is aria-hidden; keep read-only.

VERIFY: tests green (score→bar mapping incl. sign + decisive cases; score threading; a
driven-browser check that bar + arrow render and update when stepping the cursor and stay
aligned when flipped), build clean, commit + push, no PR unless asked. Mark 7a shipped in
docs/ROADMAP.md + docs/design/lichess-ui.md; leave 7c/7d open. If time remains do NOT start
7c — leave a warm "next" note with anchors.
```

---

## Session 7c — Move-tree panel (variations) — the big one

```
Session 7c of the Brandubh roadmap: the analysis move-tree (variations). LARGEST slice —
may itself span sessions; scope tightly and slice further if needed.

Repo: jojopeligroso/branndubh. Start from latest main. Read docs/design/lichess-ui.md (it
calls this the biggest piece) and the Session 7 roadmap section. Best after 7a/7b. Your job:
replace the linear timeline with a real variation TREE + a navigable panel. Do NOT build
annotations (7d).

THE CORE REFACTOR:
  • Today the timeline is LINEAR: `states: GameState[]` + `cursor` in src/App.tsx; a move
    from a rewound position TRUNCATES — the decision lives in `commitBasePly(analysis,
    cursor, tip)` in src/analysis.ts (7b routed it there). There is NO variation
    preservation.
  • Replace with a TREE: nodes { id, state, move, parent, children[] } + a currentNodeId.
    A move that matches an existing child navigates to it; a different move adds a sibling
    VARIATION instead of truncating.

TOUCHES (audit each — this is why it's L):
  • commitMove / rewind / the move-log rendering in App.tsx; `commitBasePly` in analysis.ts.
  • Clock line (src/game/clockLine.ts) is PLY-INDEX aligned; a tree has no single ply
    index. Decision: mainline stays clock-driven, variations are clock-less. Document it.
  • Persistence (src/game/persist.ts) + export (src/game/gameFile.ts, replay.ts) store a
    LINEAR move list. Do NOT block on serializing the whole tree: persist/export the MAIN
    LINE only for now (documented limitation), keep the tree in memory. Variation
    serialization (PGN parenthesised variations) is a follow-up — note it, don't build it
    unless time allows.

BUILD: tree data model + navigation (board/eval-bar/arrow follow currentNode); a move-tree
panel (mainline + indented variations, current node highlighted; promote/delete if cheap,
else defer with a note); keep click-to-jump/step working against the tree.

SLICING: if too big for one session, ship "tree data model + navigation + main-line
persistence" first and leave panel polish / promote-delete / variation serialization as an
explicit 7c-ii note — each landing green.

VERIFY: tests green (tree ops: add child, navigate, sibling-vs-overwrite; a round-trip that
a branchless game persists/exports/imports identically to the old linear path; driven-browser
that a variation is created, shown, navigable), build clean, commit + push, no PR unless
asked. Update docs with what shipped, what's deferred, and the persistence limitation.
```

---

## Session 7d — Post-game annotations (blunders / inaccuracies)

```
Session 7d of the Brandubh roadmap: post-game annotations.

Repo: jojopeligroso/branndubh. Start from latest main. Read docs/design/lichess-ui.md and
the Session 7 roadmap section. DEPENDS ON 7a (the eval-score channel through the worker); if
7a isn't merged, do that plumbing first or stop and say so. Your job is 7d ONLY. Do NOT build
the move-tree (7c).

WHAT EXISTS: pickMove returns { move, score, depth, nodes }; evaluate is ATTACKER-POSITIVE;
decisive ≈ ±1_000_000. 7a threaded `score` through the worker — reuse it. Timeline: states[]
+ cursor; analysis mode + flip exist (7b). Worker cancels stale work.

BUILD:
  1. For each played move on the line, compute the eval SWING (best-move score vs
     played-move score, from the MOVING side's perspective — mind the attacker-positive
     sign). Classify inaccuracy / mistake / blunder by tafl-tuned thresholds; CALIBRATE on
     a few real games and DOCUMENT them as engine-relative heuristics at a fixed analysis
     depth, not authoritative.
  2. Batch through the worker sequentially (UI never freezes), with progress + cancel;
     trigger on game-over and/or an on-demand "analyse" button. May pass
     { ...DEFAULT_WEIGHTS, attackerRecognizer: true } for sharper eval.
  3. Annotate the move log (?! / ? / ?? with colour + optional better move, hookable to
     7a's arrow). Zen-hideable; i18n en + es (ga held back).

CONSTRAINTS: 100% offline; the pass must not run during live play or slow the game's search
(separate/queued worker, cancellable); fixed analysis depth for reproducibility (record it);
theme + a11y intact.

VERIFY: tests green (swing computation + classification incl. sign + decisive edges on
hand-built positions; driven-browser that finishing a game produces annotations and
progress/cancel works), build clean, commit + push, no PR unless asked. Mark 7d shipped in
docs with the calibrated thresholds and fixed depth documented.
```
