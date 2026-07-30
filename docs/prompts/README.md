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
| [`7c-move-tree.md`](7c-move-tree.md) | 7c — move-tree panel (variations) | Open |
| [`7d-annotations.md`](7d-annotations.md) | 7d — post-game annotations | Open |

**7a (eval bar + best-move arrow) has no prompt yet and no code anywhere.** It
is the only unwritten slice of Session 7. 7c and 7d are both written to stand
without it; the orientation seam it will need is already built and tested
(`src/orientation.ts` — see the 7b prompt).

Sessions 1–6 predate this directory and were briefed conversationally; their
outcomes are recorded in [`docs/ROADMAP.md`](../ROADMAP.md).
