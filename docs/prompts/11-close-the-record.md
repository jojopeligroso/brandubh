# Session 11 — close the record

**Status: open.** Size **S** — three small items batched because they share one
theme, not because they are all small. The theme is: *make the written record
match the code.* Nothing here changes how the game plays.

---

Session 11 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/11-close-the-record`. Start from latest `main`.

## READ FIRST

Read exactly these, in this order, and **do not explore further before writing
code** — everything you need is anchored below:

1. `docs/rules-review.md` (54 lines — the open question you are closing)
2. `src/game/variants.ts` — the ⚠ CONTESTED RULE block and the `wtf` / `walker` presets
3. `src/game/rules.ts` — `kingIsCaptured` and its inner `flankHostile` (from ~`:306`)
4. `README.md` — the "Winning" bullet list only
5. `src/game/clock.ts:162` — `loadCustomIncrement`
6. `docs/adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md` (for ADR house style)

**DEPENDS ON:** nothing. Verify that yourself (`git log --oneline -5`).

## WHAT EXISTS

- **`docs/rules-review.md` records one open question** — throne-adjacent king
  capture — with three sub-questions and the note that `aagenielsen.dk` and
  `tafl.cyningstan.com` were unreachable when it was written. **They are still
  unreachable**; this environment's egress proxy blocks both. Do not spend a
  single tool call trying. The question is answered from a different source
  (below).
- **`src/game/variants.ts` carries a ⚠ CONTESTED RULE comment** on
  `throneHostileToKing` + `strongKingAdjacentToThrone`, saying the two flags may
  be wrong and are exposed in the custom editor so the rule can be toggled while
  under review.
- **`kingIsCaptured` (`src/game/rules.ts:306`)** is unambiguous and correct. Its
  `flankHostile` helper returns `true` for an attacker, for the empty throne when
  `rules.throneHostileToKing`, and for a corner when `rules.cornersHostile`; it
  returns `false` for the board edge. So a king beside a corner **can** be taken
  by one raider moving in behind him.
- **The README contradicts that.** Its Winning section reads:
  *"a raider, a hostile corner, or the board edge does **not** help here — the
  king needs actual flanking"*, which parses as though a hostile corner cannot
  complete a king capture. The code says it can. The sentence is wrong (or at
  best unreadable); the code is right.
- **`loadCustomIncrement` (`src/game/clock.ts:162`) never reaches its own
  default.** `Number(localStorage.getItem(...))` on a missing key is
  `Number(null)`, which is `0`; `Number.isFinite(0)` is true and `0 >= 0` passes
  the guard, so it returns `0` and `DEFAULT_CUSTOM_INCREMENT = 3` (`:73`) is
  dead. A first visit gets `5+0`, not `5+3`. `loadCustomMinutes` escapes this
  only because its guard is `> 0`. Recorded in `TASKS.md` under *Minor UX*.

## THE EVIDENCE THAT CLOSES THE RULE

You do not need the blocked sites. The answer is in a game record inside the
OpenTafl repository — `saved-games/replays/Animals-Xerxes-Brandub-Triathlon-2015.otg`
(<https://github.com/jslater89/OpenTafl>), a **Brandubh** round of the 2015 Tafl
Triathlon played on aagenielsen.dk, annotated by **Tim Millar**, one of the three
authors of the Copenhagen rules, originally posted to the World Tafl Federation's
Facebook page. Its `[start-comment:]` states:

> "The King is captured by being surrounded on two sides, except in the following
> cases: If the king is on the central 'throne' square, he must be surrounded on
> all 4 sides to be captured. If the king is on the square next to the throne, he
> must be surrounded on the other 3 sides to be captured. If the king is on the
> square next to the corner, he can be captured by one enemy warrior moving in
> behind him, trapping him against the corner."

That is exactly the shipped `wtf` preset, and exactly what `flankHostile` does.
The same file's `[rules:]` tag reads `ks:c` — *conditional* king strength — and
its editorial note adds that OpenTafl's **built-in** Brandub mode uses a weak king
instead. So **both shipped presets are attested**: `wtf` is tournament Brandubh,
`walker` is the weak-king reconstruction. The rule was never a bug; it was two
real traditions.

One honest caveat you must carry into the ADR: that file's machine-readable tag
writes `cenh: cenhe:` (empty hostility lists) while Millar's prose says the throne
*is* hostile. Prose and tag disagree **in the source document**. Treat the prose
as the human authority and say so.

## BUILD

1. **Close `docs/rules-review.md`.** Rewrite it from "open question" to "settled,
   with two attested forms". Keep the three sub-questions visible with their
   answers rather than deleting them — the record of what was asked is what makes
   the answer checkable. Cite the `.otg` file, the tournament, the annotator, and
   the prose/tag disagreement.
2. **Rewrite the ⚠ CONTESTED RULE block in `src/game/variants.ts`.** It stops
   being a warning and becomes an explanation: two attested traditions, one per
   preset, both reachable from the custom editor. **Do not delete it** and **do
   not change any flag value** — `wtf` and `walker` are both correct as they
   stand. This is a comment-only change to that file.
3. **Add `docs/adr/0007-the-king-beside-the-throne-has-two-attested-rules.md`**,
   following the house format of the six existing ADRs. Record the evidence, the
   decision (ship both, default `wtf`), and the consequence (the custom-editor
   toggles stay, permanently, because they encode a real disagreement rather than
   an unresolved one).
4. **Fix the README's Winning bullet.** State plainly that the king is flanked on
   two opposite sides, that a **hostile corner or the empty throne can stand in
   for one flank**, that the **board edge cannot**, and that on or beside the
   throne the `wtf` preset requires all four sides. Add the corner-trap case,
   which the README does not currently mention at all.
5. **Fix `loadCustomIncrement`.** Read the raw string first and only coerce when
   it is present — mirror whatever shape you choose onto `loadCustomMinutes` if
   it makes the pair consistent, but do not change `loadCustomMinutes`'
   *behaviour*. Note in the commit message that this changes what an existing
   player's untouched custom control resolves to (`5+0` → `5+3`), which is the
   reason it was left alone in Session 10.
6. **Update `TASKS.md`**: strike the `loadCustomIncrement` item, move the rules
   question out of "⚠ Rules under review", and **correct the `.seg-compact`
   entry** — see the correction below, which you found the hard way so Session 16
   does not have to.

### A correction you must land in `TASKS.md`

`TASKS.md` says the lost compact-header CSS is recoverable via
`git log --all -S "seg-compact" -- src/` and names commits `768f12a` and
`aa99dca`. **Neither commit exists in a fresh clone, and the string has never
appeared in any `src/` blob in fetched history.** Clones of this repo arrive
shallow (`.git/shallow`, ~106 commits, 2 branches). Rewrite that entry to say the
compact header must be **written again**, not recovered, and note that a session
needing deep history must `git fetch --unshallow` first.

## CONSTRAINTS

No behavioural change to the engine, the presets, or the rules. `t.*` copy
touched in the README only — if you find yourself editing `src/i18n.ts`, you have
left the session. **Do not add `ga` to `VISIBLE_LANGS`** (`CLAUDE.md`). Do not
regenerate `docs/screenshot.png`. Pure-logic test policy stands: no jsdom, no
component tests.

## VERIFY

`npm test` green and `npm run build` clean — the build is the i18n completeness
gate, so it must pass even though you touched no locale. Add or extend a clock
test asserting that a first visit with an empty `localStorage` yields
`DEFAULT_CUSTOM_INCREMENT`, not `0` — the bug is invisible without it. No
driven-browser pass is required: nothing here changes what is drawn. Commit +
push to your branch; no PR unless asked. Update `docs/prompts/README.md`'s status
table. Do not start Session 12.

## PROGRESS

Tick these as you go and commit the tick with the work. After a context compaction,
**re-read this file and this block first** — it is the state, not the conversation.

- [ ] 1. `docs/rules-review.md` closed, evidence cited
- [ ] 2. `variants.ts` contested block rewritten as explanation (no flag changes)
- [ ] 3. ADR 0007 written
- [ ] 4. README Winning bullets corrected, corner trap documented
- [ ] 5. `loadCustomIncrement` fixed + regression test
- [ ] 6. `TASKS.md` updated, `.seg-compact` entry corrected
- [ ] Tests green, build clean, pushed, status table updated
