# Session 13 — OpenTafl Notation, the core

**Status: open.** Size **L** — one focused session that **starts by writing its
own design doc**. This is the highest-value item in the whole landscape analysis:
`.tafl` is a good format that talks only to itself, and OTN is the only
interchange standard the game has.

---

Session 13 of the Brandubh roadmap. Repo: jojopeligroso/brandubh. Branch:
`claude/13-otn-core`. Start from latest `main`.

Your job is a **pure-logic OTN module and its conformance corpus**. There is
**no UI in this session** — the panel is Session 14, deliberately, because the
project rule is never to mix engine internals with UX in one session.

## READ FIRST

1. `docs/design/game-import-export.md` — the `.tafl` format this parallels
2. `src/game/gameFile.ts` (425 lines) — the existing tolerant parser, and the model to follow
3. `src/game/replay.ts` — the replay-and-validate boundary every import must pass through
4. `src/game/position.ts` — the existing FEN-equivalent encoder
5. `src/game/variants.ts` — the 11-flag `RuleSet` you must map onto a rules string
6. `CLAUDE.md` — the replay-from-opening invariant, in full
7. `docs/design/otn.md` — **which you write first** (see BUILD 1)

**DEPENDS ON:** Session 12, for `exitFortWin`. OTN encodes exit-fort escape as
`efe:y|n`, and without the flag you cannot round-trip it. Verify 12 is merged
(`git log --oneline | grep -i "exit fort"`); if it is not, either build 12 first
or implement OTN with `efe:` parsed-and-rejected and say so in the doc. Do not
silently drop the key.

## WHAT EXISTS

- **`gameFile.ts` is the precedent for a tolerant parser that never guesses.** It
  reads a PGN-style `.tafl` (`FORMAT_VERSION = "brandubh-1"`, `:44`), tolerates
  comments, CRLF and odd numbering, carries a custom ruleset in one flat `Rules`
  tag, and refuses a file it cannot validate rather than repairing it. Copy that
  temperament exactly.
- **All import goes through `src/game/replay.ts`**, which replays a move list from
  `initialState()`. This is load-bearing: a file can assert moves, never a board
  and never a result.
- **`src/game/position.ts`** already encodes a board as a one-line FEN-equivalent
  (`3A3/A6/… a`). OTN's position record is the same idea with different spelling —
  reuse the reasoning, not necessarily the code.
- **`hashBoard` (`rules.ts`)** and the D4 machinery in `engine.ts` (`stabilizer`,
  `foldRootMoves`) exist and are not needed here. OTN is not canonicalised.

## THE SPEC

Canonical source: `opentafl-notation-spec.txt` (549 lines) and
`opentafl-engine-protocol.txt` (263 lines) in <https://github.com/jslater89/OpenTafl>.
Clone it to a scratch directory. **The repository is under a bespoke
"Stout Free-As-In-Beer License" — not OSI-approved.** Implement from the
specification; **copy no Java, and do not paste the spec's prose into this repo.**
Ideas are free, that text is not. Link to it instead.

The four layers you must support:

- **Coordinates** — algebraic, files left→right, ranks bottom→top. Position
  records always start at a1 and run left-to-right, rank 1 upward, regardless of
  display orientation. Note this is the opposite vertical order from
  `position.ts`; get it wrong and every import is mirrored.
- **Position record** — `/<row>/<row>/…/`, leading *and* trailing slashes, each
  row a run of `[empty-count][piece]`. Attackers lowercase, defenders uppercase:
  `t/T` taflman, `k/K` king, plus `n/N c/C m/M g/G` for pieces Brandubh does not
  have. Brandubh opening: `/3t3/3t3/3T3/ttTKTtt/3T3/3t3/3t3/`
- **Move record** — `[piece]<from><type><to>[xcaptures][info]`, or short algebraic
  `<from>-<to>[xcaptures][info]`. Types `-` normal, `^` jump, `=` berserk, `^=`.
  Captures `x<sq>[/<sq>]…`. Info `+` king vulnerable, `-` king has an escape,
  `++` captured, `--` escaped, `---` resignation. The capture records are
  deliberately redundant so a machine can replay without knowing the rules — which
  makes them a **cross-check against your own move generator**, and that is the
  single most valuable property of this format for this repo.
- **Rules string** — space-separated `key:value`. `dim:` first, `start:`/`starti:`
  last. Keys you must handle: `dim esc surf atkf tfr ka ks kj cor cen corh cenh
  cenhe corp cenp cors cens corre cenre sw swf efe linc ber spd afor dfor` and the
  `name:` key, which **real files emit but the spec does not document** — tolerate
  it. `.otg` files also show a trailing comma in list values (`cor:g7, cen:b2,`).

**The mapping is the hard part and belongs in the design doc, not in your head.**
`RuleSet`'s 11 flags do not line up one-to-one: `throneHostileToSoldiers` and
`throneHostileToKing` are two flags where OTN has one `cenh:` piece-type list, and
`strongKingOnThrone` / `strongKingAdjacentToThrone` collapse into `ks:s|w|c|m`.
The repo's model is **finer-grained than OTN's in one place and coarser in
others**; write the table down before writing the code.

## BUILD

1. **`docs/design/otn.md` first.** The full key vocabulary, the `RuleSet` ↔ rules
   string mapping table (both directions, with the lossy cells named), what
   `brandubh-1` and OTN can each express that the other cannot, and the decision
   on what to do with an unmappable file. Write this before any code, because if
   the session runs out of room this document is what survives.
2. **`src/game/otn.ts`** — pure, no React, no imports from components:
   - `parseRulesString` / `formatRulesString` ↔ `RuleSet`
   - `parsePositionRecord` / `formatPositionRecord` ↔ `Board`
   - `parseMoveRecord` / `formatMoveRecord`
   - `parseGameRecord` / `formatGameRecord` for `.otg`: the tag block
     (`event site date round attackers defenders result annotator compiler
     time-control termination variant start-comment position puzzle-mode
     puzzle-prestart puzzle-start`, with `rules:` **last**), numbered turns,
     `[|]` commentary blocks, and the variation address scheme
     (`2a.1.1a.`, `3b.3.1a`, `.....` as the defender-side ellipsis).
3. **Refuse, do not repair.** An unparseable file, an unmappable ruleset, a board
   size other than 7, or a capture record that disagrees with the move generator
   are all **rejections with a reason** — mirror `gameFile.ts`'s
   `capture_mismatch` trust check. A file that says a capture happened which this
   engine does not produce is evidence of a rules mismatch and must never be
   silently accepted.
4. **The conformance corpus.** OpenTafl ships **14 `.otg` files**, 9 with
   `puzzle-mode` tags, in `saved-games/replays/` and `unbuilt/saved-games/replays/`.
   Vendor the ones you use under `test/fixtures/otn/` **with attribution, a link
   to the unmodified original, and a note of any modification** — that is what the
   Stout licence requires. `Animals-Xerxes-Brandub-Triathlon-2015.otg` is the
   important one: a real Brandubh tournament game annotated by Tim Millar. Its
   commentary is separately his work; credit him by name.
5. **Round-trip tests**: parse → format → parse is stable; every fixture either
   parses or is rejected with a stated reason (both are passes, neither is a
   crash); the Brandubh fixture replays move-for-move through `replay.ts` with
   every OTN capture record matching what this engine computes.

## CONSTRAINTS

**The replay-from-opening invariant holds absolutely** (`CLAUDE.md`). OTN's
`start:` can express any board; this repo's persistence and export cannot, and
this session does not change that. An OTN file whose start position is not the
Brandubh opening may be *parsed* into a position for analysis — that is what
`position.ts` is for — but it must **never** reach `persist.ts` or `gameFile.ts`
as a live game without the `positionRoot` flag that `App.playFromPosition`
already sets. Do not thread a custom start through the timeline.

100% offline; no new runtime dependency. Pure-logic tests only. Do not add `ga`
to `VISIBLE_LANGS`. No UI in this session — if you are editing a `.tsx` file you
have left the fence.

## VERIFY

`npm test` green including the corpus. `npm run build` clean. `npx vitest run
src/game/otn.test.ts` while iterating; full suite before each commit. No
driven-browser pass — nothing renders yet. Commit + push; no PR unless asked.
Add Session 13 to `docs/ROADMAP.md`, update `docs/prompts/README.md`, and leave
14 open. **Do not wire OTN into the UI. That is Session 14.**

## PROGRESS

After a compaction, re-read this file and this block first. If `docs/design/otn.md`
exists, trust it over your memory of the mapping.

- [ ] 1. `docs/design/otn.md` written, mapping table complete, lossy cells named
- [ ] 2a. Rules string ↔ `RuleSet`
- [ ] 2b. Position record ↔ `Board` (vertical order verified against `position.ts`)
- [ ] 2c. Move record parse/format
- [ ] 2d. `.otg` game record incl. variations and commentary
- [ ] 3. Rejection paths, no repair, `capture_mismatch`-equivalent trust check
- [ ] 4. Fixtures vendored with attribution
- [ ] 5. Round-trip + replay tests green
- [ ] Build clean, pushed, roadmap and status table updated
