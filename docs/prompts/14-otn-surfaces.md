# Session 14 — OTN reaches the user, and the puzzle bank becomes open data

**Status: open.** Size **M** — one session. This is the UX half of the notation
work, split from Session 13 on purpose: engine internals and UX never share a
session here.

---

Session 14 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/14-otn-surfaces`. Start from latest `main`.

Two deliverables: OTN alongside `.tafl` in the export panel, and a script that
emits the puzzle bank as `.otg`. They batch because both are thin consumers of
one module (`src/game/otn.ts`) — the expensive context is that module's API, and
you load it once.

## READ FIRST

1. `docs/design/otn.md` — written by Session 13. **Authoritative over anything here.**
2. `src/game/otn.ts` — the API you are consuming
3. `src/components/GameFilePanel.tsx` — the existing export/import surface
4. `src/game/puzzleBank.ts` + `src/game/puzzleBank.data.ts` — the bank and its record format
5. `docs/adr/0002-puzzle-lines-are-truncated-at-the-deciding-move.md` and
   `docs/adr/0001-bank-puzzles-require-a-unique-solving-move.md` — what a puzzle
   is allowed to reveal
6. `scripts/genbook.ts` — the house pattern for a script that emits a committed artefact

**DEPENDS ON:** Session 13, hard. Verify `src/game/otn.ts` and
`docs/design/otn.md` both exist on `main` before starting. If they do not, stop —
this session has no content without them.

## WHAT EXISTS

- **`GameFilePanel.tsx`** is the whole import/export UI: it writes and reads the
  `.tafl` format via `src/game/gameFile.ts` and routes every import through
  `src/game/replay.ts`. It is already a Zen-hideable extra (`gamefile` in
  `src/zen.ts`).
- **`positionGame` in `App.tsx`** closes the autosave and replaces the export
  panel with a reason when the live game did not start from the opening
  (`positionRoot` in `src/analysis.ts`). That mechanism already exists and you
  must not weaken it.
- **The bank is 158 puzzles**, records shaped
  `id|pos|leadIn|line|goal|flags|dtm|depthToFind|salience|motif|tags`,
  fingerprint-gated to one ruleset and board size. `data/puzzle-ledger.json` holds
  161 numbered entries; the shipped bank is 158. Some source comments still say
  161 — **the data is the truth, and if you touch those comments, correct them.**
- **OTN has puzzle tags**: `puzzle-mode:none|loose|strict`, `puzzle-prestart:`,
  `puzzle-start:`, and `(hint:<text>)` inside commentary. The bank's shape maps
  onto them almost exactly, which is why this is cheap.

## BUILD

1. **OTN import in `GameFilePanel`**, beside the existing `.tafl` path. Accept
   `.otg`. On success, load through `replay.ts` exactly as `.tafl` does. On
   failure, show the parser's stated reason — do not collapse distinct failures
   into "invalid file". A rules string this build cannot express is a *specific*
   message naming the key, because that message is the only way a user learns the
   file was for a different variant.
2. **OTN export**, beside `.tafl` export. Populate the tags this app actually
   knows: `date`, `attackers`, `defenders`, `result`, `termination`, `variant`,
   `compiler`, and `rules:` last. Do not invent an `event` or a `site`.
3. **Decide and document what happens to a non-opening board.** OTN can express a
   `start:`; this app's export cannot. The honest options are (a) refuse to export
   OTN from a `positionRoot` game, matching what the panel already does, or
   (b) export it with `start:` and mark it clearly as not-a-game-record. **Pick
   one, write it in `docs/design/otn.md`, and make the UI say which.** Silence
   here is how the replay-from-opening invariant gets broken by accident.
4. **`scripts/export-puzzles.ts`** — emit all 158 puzzles as `.otg` with
   `puzzle-mode`, the lead-in as `puzzle-prestart`, the solving line as the
   mainline, grade, motif, tags and provenance flags in commentary. Write to a
   committed artefact under `data/` the way `genbook.ts` writes its book. Include
   a short header naming the licence (MIT, this repo) and the ruleset fingerprint
   the puzzles were verified under — a puzzle served under the wrong rules is
   wrong, and the bank already knows this.
5. **Respect ADR-0002.** Lines are truncated at the deciding move and truncation
   must stay indistinguishable from a naturally short line. The export must not
   leak distance-to-mate or a "game over" marker that reveals which is which.
   OTN's `++`/`--` info symbols are exactly the leak to watch: **do not emit them
   on the final move of a truncated line.** Say so in a comment where the choice
   is made.
6. **A short `data/puzzles-otg/README.md`** stating what the corpus is, the
   licence, the ruleset, how it was generated, and that no comparable openly
   licensed tafl puzzle set exists. That last sentence is the point of the
   exercise; make it easy for someone else to cite.

## CONSTRAINTS

**Replay-from-opening** (`CLAUDE.md`) — unchanged, and item 3 is where you could
break it. **Do not thread a custom starting position through `persist.ts` or
`gameFile.ts`.** Zen: any new control is an opt-in extra registered in
`src/zen.ts`, not a new default. i18n: every new string in `en` + `es` + `ga`
drafts; **`ga` stays out of `VISIBLE_LANGS`**. Theme-aware, `prefers-reduced-motion`
respected, 100% offline, no new runtime dependency. Pure-logic test policy: the
panel itself is untested by construction, so **put every decision worth testing
into a pure module and test it there** — the same reason `bankLine.test.ts` exists.

## VERIFY

`npm test` green, including export-script output parsed back through
`src/game/otn.ts` (round-trip the corpus you just generated — that is the real
test of both). `npm run build` clean. **Driven-browser pass required**, this is a
UI session: export a finished game as `.otg`, re-import it into a fresh profile,
confirm the moves and result match; import one of the vendored OpenTafl fixtures
and confirm either a clean load or a specific, readable refusal; confirm a
`positionRoot` game does whatever item 3 decided and says so on screen. Commit +
push; no PR unless asked. Update `docs/ROADMAP.md`, `docs/design/otn.md`,
`docs/prompts/README.md`. Consider announcing the corpus in `README.md` — it is
the first of its kind and nobody will find it otherwise.

## PROGRESS

- [ ] 1. OTN import wired, failures reported specifically
- [ ] 2. OTN export wired, tags populated honestly
- [ ] 3. Non-opening-board decision made, documented, surfaced in the UI
- [ ] 4. `scripts/export-puzzles.ts` emits the committed corpus
- [ ] 5. ADR-0002 truncation leak checked; no `++`/`--` on truncated finals
- [ ] 6. Corpus README with licence and fingerprint
- [ ] Tests green, build clean, driven-browser pass done, pushed
