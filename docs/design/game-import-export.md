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
