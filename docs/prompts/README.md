# Session prompts

One file per planned session of [`docs/ROADMAP.md`](../ROADMAP.md). A session
prompt is the brief you hand an agent (or yourself) to start that session cold:
what already exists, what to build, what not to build, and what "done" means.

They live in the repo because the alternative is retyping them, and a retyped
brief loses exactly the parts that took the longest to work out — the anchors,
the invariants you must not break, and the decisions already taken. A prompt
here is a **contract with the next session**, not a wish list.

## Format

Six sections, in this order:

| Section | What goes in it |
| --- | --- |
| **Header** | Repo, branch name, the roadmap slice this is. |
| **DEPENDS ON** | What must be merged first, and honestly whether it is. |
| **WHAT EXISTS** | Real anchors — `file.ts:123`, function names, current behaviour. The reason a session doesn't rebuild what's there. |
| **BUILD** | Numbered deliverables. Scope is a fence, not a suggestion. |
| **CONSTRAINTS** | The project-wide rules that a new feature is most likely to break. |
| **VERIFY** | Tests, build, driven-browser pass, docs to mark, what to leave alone. |

Briefs written from Session 11 onward carry two extra sections, for reasons given
under *Working inside one* below:

| Section | What goes in it |
| --- | --- |
| **READ FIRST** | A bounded, ordered reading list. "Read exactly these; do not explore further before writing code." |
| **PROGRESS** | A checklist the agent ticks *and commits* as it goes, so a compacted session recovers by reading one file. |

## Rules for keeping these honest

- **Anchors rot.** Line numbers drift with every commit. Treat them as a hint
  and the symbol name as the truth; if a prompt sends you to the wrong line,
  fix the prompt in the same change.
- **Check the dependency before trusting it.** Session 7b's brief said 7a was
  merged. It was not — not on `main`, not on any of the 23 remote branches. The
  session shipped anyway because 7b did not truly need it, but the first move
  of any session is to verify its own premises. Prompts describe intent; the
  repo is the fact.
- **A shipped session's prompt stays.** It is the record of what was asked for,
  which is what makes "did this deliver?" answerable later.
- **Clones arrive shallow.** A fresh checkout has ~106 commits and 2 branches
  (`.git/shallow`). A brief that sends you into history — as `TASKS.md` once did,
  for CSS that turned out never to have been in `src/` — needs
  `git fetch --unshallow` first, and may still come up empty. Budget for
  rewriting, not for archaeology.

## How these are batched

The sizes come from `docs/ROADMAP.md`: **S** ≈ half a session and batchable,
**M** ≈ one, **L** ≈ one that starts from its design doc. What that file leaves
implicit, and what these briefs make explicit:

**Batch by shared file context, not by shared size.** The expensive thing in a
session is loading `rules.ts`, `engine.ts` or the 4,253-line `App.tsx` into
working memory. Batching pays only when the second item reuses files the first
already loaded. Two S items in different modules cost the same as two sessions
*and* add the risk of compacting halfway through — strictly worse. So Session 12
pairs exit-fort with perft (both `rules.ts`), and Session 13 is split from 14
even though both are "OTN", because one is a pure module and the other is a panel.

That is also the token reading of the roadmap's existing rule, **never mix engine
internals with UX in the same session**: those are two different file sets, and a
session that touches both pays for both.

**Test at the file level while working.** `npm test` is 40–90 s and
`puzzleBank.test.ts` dominates it (see `.github/workflows/ci.yml`, which says so
in a comment). Run `npx vitest run src/game/<file>.test.ts` during the loop and
the full suite before each commit.

## Working inside one

Context does not survive a long session; the repo does. Every brief from 11
onward is built on that:

- **A bounded reading list**, so recovery after a compaction is deterministic
  re-reading rather than re-derivation — and so the first move of a session is not
  an unbounded crawl of the codebase.
- **A PROGRESS block, committed as it is ticked.** The state lives in the file,
  not in the conversation.
- **3–6 commits, one theme** — the roadmap's rule, and also the reason `git log`
  can reconstruct a session that the context window cannot.
- **Invariants restated in full in every brief**, because those are what a
  compacted agent breaks: replay-from-opening, `ga` stays out of `VISIBLE_LANGS`,
  pure-logic tests only, ruleset-fingerprint gating, never ship a measured
  regression.
- **L sessions write their design doc first**, so that if the session ends early
  the thinking survives and the code can be rebuilt from it.

A brief must be **paste-able cold**: no reference to a conversation, a chat
session, or anything outside this repository. If a brief only makes sense to
someone who was there, it has failed at the one job this directory exists for.

## Status

| Prompt | Roadmap slice | Size | State |
| --- | --- | --- | --- |
| [`00-deferred.md`](00-deferred.md) | *(standing)* — do not rebuild these | — | **Standing** |
| [`7b-board-flip-and-analysis.md`](7b-board-flip-and-analysis.md) | 7b — board flip + analysis toggle | — | **Shipped** |
| [`7c-move-tree.md`](7c-move-tree.md) | 7c — move-tree panel (variations) | — | **Shipped** |
| [`7d-annotations.md`](7d-annotations.md) | 7d — post-game annotations | — | **Shipped** |
| *(no brief)* | 7e — position setup (FEN-equivalent) | — | **Shipped** |
| *(briefed in `ROADMAP.md`)* | 9 — keyboard & accessibility (9a/9b/9c) | M–L | **Open** |
| [`11-close-the-record.md`](11-close-the-record.md) | 11 — close the record | S | **Open** |
| [`12-rules-engine.md`](12-rules-engine.md) | 12 — exit fort + perft | M | **Open** |
| [`13-otn-core.md`](13-otn-core.md) | 13 — OpenTafl Notation, core | L | **Open** |
| [`14-otn-surfaces.md`](14-otn-surfaces.md) | 14 — OTN in the UI + puzzles as open data | M | **Open** |
| [`15-evaluation-second-opinion.md`](15-evaluation-second-opinion.md) | 15 — evaluator's second opinion | M | **Open** |
| [`16-installable-and-a-third-language.md`](16-installable-and-a-third-language.md) | 16 — PWA + compact header + a locale | M | **Open** |
| [`17-endgame-tablebase.md`](17-endgame-tablebase.md) | 17 — Brandubh endgame tablebase | L | **Open** |

Sessions 11–17 come from the differential analysis of the GitHub tafl landscape
(64 repositories surveyed, 6 read at source). Their **critical path is
11 → 12 → 13 → 14**, which is what delivers the two things no other tafl project
has: a published perft suite and an openly licensed puzzle corpus in the game's
own notation. 15, 9 and 16 are independent and may run in any order. 17 is
optional and is allowed to fail.

**7a shipped from a different branch, with no brief in this directory** — it was
written in parallel with 7c/7d/7e and merged first. It needed no brief because
7b had already left it a tested contract (`src/orientation.ts`), which it used
unchanged.

That parallelism also cost a duplicate: a second 7a was written on the other
branch and discarded at merge. The rule above about checking a brief's premises
against the repo extends to this — **check what is already on `main` and on other
branches before starting a slice**, not just what the brief asserts.

Sessions 1–6 predate this directory and were briefed conversationally; their
outcomes are recorded in [`docs/ROADMAP.md`](../ROADMAP.md).
