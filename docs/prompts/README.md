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

## Status

| Prompt | Roadmap slice | State |
| --- | --- | --- |
| [`7b-board-flip-and-analysis.md`](7b-board-flip-and-analysis.md) | 7b — board flip + analysis toggle | **Shipped** |
| [`7c-move-tree.md`](7c-move-tree.md) | 7c — move-tree panel (variations) | **Shipped** |
| [`7d-annotations.md`](7d-annotations.md) | 7d — post-game annotations | **Shipped** |
| *(no brief)* | 7e — position setup (FEN-equivalent) | **Shipped** |

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
