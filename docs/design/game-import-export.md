# Design — Game import / export (PGN-style)

**Session 3 of [`docs/ROADMAP.md`](../ROADMAP.md).** Save a game to a file and
load one back, the way Lichess lets you export/import PGN.

## Format name (the thing the user asked about)

Chess uses **PGN — Portable Game Notation**: a plain-text file with a header of
`[Tag "value"]` metadata lines, a blank line, then the move list. (Not PNG, which
is an image; not "PVG".) Tafl/hnefatafl has **no universal standard**, but:

- The app already emits moves in an aagenielsen.dk-compatible algebraic notation
  (`moveName` → `d7-c7`, captures marked, corners/throne well-defined).
- So we adopt a **PGN-style text format**: a small metadata header plus that move
  list. Human-readable, diff-able, copy-pasteable, and round-trippable.

## Proposed file shape (`.txt` / `.tafl`)

```
[Event "Brandubh — Ollamh"]
[Variant "WTF"]
[Date "2026.07.29"]
[Attackers "Claude (ollamh)"]
[Defenders "Eoin"]
[Result "0-1"]           ; 1-0 attackers, 0-1 defenders, 1/2-1/2 draw

1. f4-f6 c4-c3
2. b4-c4 d5-c5x1
...
22. c2-c3 a5-a7
```

- Header carries everything needed to reconstruct rules + names + result.
- `Variant` maps to a `VARIANTS` key (or an embedded custom ruleset block for `custom`).
- Move tokens reuse the existing notation; `x<n>` capture suffix already produced.

## Scope

**Export**
- Serialize the live timeline (or a finished game) to the format above.
- Two outputs: **Download** (`Blob` → `.tafl` file) and **Copy to clipboard**.
- Export from any cursor position exports the full mainline to the tip.

**Import**
- Paste-in textarea **and** file upload.
- Tolerant parser: ignore comments (`;…`), tolerate spacing, validate each move
  against `allMoves` as it replays (reject on first illegal move with a clear error).
- Unknown/again-compatible variants: map `Variant` → ruleset; error clearly if unknown.
- Load into the existing replay timeline so step/branch/review all work immediately.

**Out of scope (later):** bulk import, aagenielsen.dk scraping, cloud sync.

## Tests
- Round-trip: play N random games → export → import → deep-equal timeline + result.
- Parser robustness: malformed headers, illegal move mid-list, empty file, CRLF.
- Variant fidelity: custom ruleset survives export→import.

## Risks / notes
- Repetition/threefold status is derived from history — replay through `applyMove`
  so status is recomputed exactly (don't trust a stored result blindly; recompute).
- Keep the format stable and versioned (a `[Format "brandubh-1"]` tag) so future
  changes stay backward-compatible.

---

# As shipped

Code: `src/game/gameFile.ts` (format), `src/game/replay.ts` (replay-and-validate),
`src/components/GameFilePanel.tsx` (UI). Tests: `gameFile.test.ts`,
`replay.test.ts`.

## Decisions this doc left open

- **Custom rulesets** ride in one flat tag — `[Rules "armedKing=1
  throneHostileToSoldiers=1 … repetitionResult=loss_for_defenders"]` — rather than
  a nested block, so the header stays a plain PGN-style tag list. It is read only
  for `Variant "custom"` (a `Rules` tag beside a named variant is ignored, with a
  warning). Unknown keys are ignored and absent keys keep their default, so a
  partial hand-written block still loads. The key list is derived from the
  `RuleSet` type, so a new rule flag travels for free.
- **Resignations and flags** cannot be derived by replay — they are decisions
  *about* a game, not moves within it — so they travel in `[Termination "…"]`.
  It is honoured **only** when the replay left the game unfinished, which is what
  stops a doctored tag inventing a win. Every other terminal status is recomputed
  and a `Termination` tag claiming one is ignored with a warning.
- **`[Result]` is advisory.** It is written from the recomputed status and, on
  import, only cross-checked: a disagreement raises a warning (it almost always
  means a wrong `[Variant]` tag) rather than overriding either side.
- **Capture suffixes are cross-checked, not trusted.** `x2` must match what the
  engine computes, and a mismatch is refused — it is the cheapest detector of a
  game imported under the wrong ruleset. A capture written as a separator
  (`d5xc5`, chess-style) asserts no count and so is accepted either way.
- **Unreadable tokens are refused, not skipped.** Tolerance covers comments
  (`;`, `{…}`, leading `%`), CRLF, BOM, ragged whitespace, missing tags,
  eccentric numbering (`1.`, `1...`, `2)`, none at all, one per ply, starting
  from 0), uppercase files, en/em dashes, a missing separator and annotation
  glyphs. It stops at guessing: silently dropping a token would import a
  *different* game than the file describes.
- **Imports land over the board.** An imported game is often mid-position and
  often the computer's turn; leaving the AI switched on would have it play a move
  on top of the import the instant it appeared. "Play from here vs the computer"
  hands a side back.
- **`Variant` matching is generous** — id, display name, or the shorthands people
  type (`WTF`, `Cyningstan`) — but an unrecognised ruleset is an error rather
  than a guess.

## Format independence

The export format is deliberately **not** coupled to any storage encoding, the
same split chess keeps between PGN and an engine's on-disk format. Session 1
(localStorage resumability, `brandubh.game.v1`) had not landed on `main` when
this shipped, so there was nothing to reuse from `persist.ts`; the replay-and-
validate pattern it needs lives in `src/game/replay.ts` instead, format-agnostic
and ready for the storage side to sit on. A test asserts the export carries no
storage keys and is not JSON, so the two cannot drift into each other.
