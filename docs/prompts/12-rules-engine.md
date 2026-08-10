# Session 12 — the rules engine, completed and made checkable

**Status: open.** Size **M** — one session. Two deliverables that share
`src/game/rules.ts`, which is why they are batched: the expensive part of this
session is holding the capture/win logic in your head, and both items need it.

---

Session 12 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/12-rules-engine`. Start from latest `main`.

Your job is **exit-fort win** and **perft**. Do NOT touch the evaluator, the
search, or the notation work (Sessions 13/15).

## READ FIRST

1. `src/game/rules.ts` — in full. It is 547 lines and it is the session.
2. `src/game/variants.ts` — the `RuleSet` interface and both presets
3. `src/game/rules.test.ts` — how rule behaviour is tested here (44 tests)
4. `docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md`
5. The `shieldwallCapture` commit — `git log --oneline -S "resolveShieldwallCaptures" -- src/game/rules.ts`

**DEPENDS ON:** Session 11 only for tidiness (it rewrites a comment in
`variants.ts` you will edit near). Not a hard dependency — if 11 is unmerged,
proceed and avoid that comment block. Verify with `git log`, do not trust this line.

## WHAT EXISTS

- **`RuleSet` has 11 flags** (`src/game/variants.ts:63` area). `shieldwallCapture`
  is the model to copy: a flag, `false` in both shipped presets, `true` available
  in `CUSTOM_RULE_DEFAULTS`, resolved in one dedicated function, offered in the
  custom-rule editor with copy in all three locales, covered by tests.
- **`resolveShieldwallCaptures` (`src/game/rules.ts:218`)** is that function, and
  it is called from the capture resolution path at `:427` behind
  `if (rules.shieldwallCapture)`. Exit fort is its structural twin: a positional
  win condition gated on a flag, checked at the same point in the move pipeline.
- **Move generation is `movesFrom` (`:96`) → `allMoves` (`:127`)**, with
  `hasAnyMove` (`:142`) as an early-exit used at every search node. `allMoves`
  returns `Move[]`. There is **no perft anywhere in this repo** — the closest
  thing is the bounded solver in `src/game/solver.ts`, which counts nodes but
  answers a different question.
- **Win conditions are an 11-value `GameStatus`**. Exit fort adds a defender win
  alongside `defenders_win_escape`.
- **`TASKS.md` lists exit fort as the one remaining unimplemented rule**: "King
  builds an impregnable formation. No code, no RuleSet flags." That is still true.

## PRIOR ART YOU SHOULD READ BEFORE WRITING THE FORT CHECK

Two MIT-licensed implementations exist. Read them for the edge cases, then write
your own — do not port either.

- **`demircancelebi/tafl`** (`src/index.ts`, single file). Its exit-fort check
  sits near `:1527` behind `TaflRule.EXIT_FORTS`. Its July 2026 commit fixed
  *positional* exit-fort detection by adding an **explicit king-mobility check** —
  a king walled in with no empty orthogonally-adjacent square to move to is not in
  a fort. That is the edge case you would otherwise ship broken.
- **`demircancelebi/tafl-rs`** — `PERFORMANCE.md` documents a proximity pregate:
  the full fort check only runs when the king is on a non-corner edge, a king move
  always triggers it, and other moves trigger it within Chebyshev distance 2.
  Worth copying as a *technique* if the naive check measures slow.

Clone them to a scratch directory, not into this repo.

## BUILD

1. **`exitFortWin: boolean` on `RuleSet`.** `false` in `walker` and `wtf` — it is
   a Copenhagen innovation, exactly like `shieldwallCapture` — `true` in
   `CUSTOM_RULE_DEFAULTS`. Add it to `ruleFlags()` and `rulesFor()` so the custom
   editor round-trips it.
2. **The fort check itself**, in `rules.ts`, as a named function with a doc
   comment in the register the file already uses. Definition: the king is on a
   **non-corner edge square**, he has **at least one empty orthogonally-adjacent
   square to move to**, and the defender formation enclosing him **cannot be
   broken** by the attackers — i.e. no attacker move captures a fort member. Say
   in the comment which reading you implemented and why, because reconstructions
   differ.
3. **Wire it as a defender win** with its own `GameStatus` value, resolved at the
   same point in the pipeline as the shieldwall. Losing to a fort must be
   distinguishable from losing to a corner escape in the move log and the review.
4. **Custom-rule editor entry + copy in `en`, `es`, `ga`.** `ga` is a draft and
   marked as one. **Do not add `ga` to `VISIBLE_LANGS`.**
5. **`perft(depth, rules, side)`** — count leaf nodes of the legal move tree from
   `initialState()`. Pure, exported from `rules.ts` or a sibling module, no search
   heuristics, no transposition table, no D4 folding: perft is a *correctness*
   instrument and folding would defeat the purpose.
6. **Publish the numbers.** A committed table — `docs/perft.md` — of node counts
   for depths 1..N for **both shipped presets**, with the exact ruleset fingerprint
   each was measured under and the date. Go as deep as runs in a sane time and say
   where you stopped and why. Nobody in tafl has published one of these for any
   variant; it is the cheapest thing this repo can do to become the reference
   implementation, and it is worthless if the ruleset is not pinned beside it.
7. **A perft test** asserting the shallow counts, so a move-generation regression
   fails loudly. Keep the deep numbers out of the fast suite — `npm test` is
   already 40–90s.

## CONSTRAINTS

Pure logic only: no React, no jsdom, no component tests (`CLAUDE.md`).
`BOARD_SIZE` stays 7 and stays un-parameterised — **ADR-0006 says a 9×9 variant
forks `rules.ts` rather than generalising it, and this session does not reopen
that.** Both shipped presets must be byte-identical in behaviour after your
change: `exitFortWin` is off in both, so every existing test must pass untouched.
If any existing test needs editing, you have changed default behaviour — stop and
work out why. Never ship a measured regression; if perft or the fort check slows
the search measurably, gate it (`shieldwallCapture` and the repetition guard at
`sinceCapture >= 8` are the precedents).

## VERIFY

`npm test` green including new fort tests (fort achieved; fort with an immobile
king rejected; fort broken by an attacker capture; fort off by default in both
presets) and the shallow perft assertions. `npm run build` clean. Measure the
search before and after with the existing gauntlet and report the numbers in the
commit message — "neutral" is a fine answer, an unmeasured claim is not.
Driven-browser pass only if the editor entry renders (it does): confirm the new
toggle appears, resets the board like every other custom-rule change
(`changeCustomRules()`), and that a fort win shows the right message. Commit +
push; no PR unless asked. Mark exit fort done in `TASKS.md`, add Session 12 to
`docs/ROADMAP.md` as shipped, update `docs/prompts/README.md`. Do not start 13.

## PROGRESS

After a compaction, re-read this file and this block before anything else.

- [ ] 1. `exitFortWin` flag added, off in both presets, round-trips through the editor
- [ ] 2. Fort check written, reading documented in the comment
- [ ] 3. Wired as a distinct `GameStatus`
- [ ] 4. Editor entry + `en`/`es`/`ga` copy (`ga` marked draft, still hidden)
- [ ] 5. `perft` implemented, unfolded and unheuristic
- [ ] 6. `docs/perft.md` published with ruleset fingerprints
- [ ] 7. Tests green, gauntlet numbers in the commit message, pushed
