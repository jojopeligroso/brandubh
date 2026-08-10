# OpenTafl Notation — raw notes for Session 13

**Status: notes, not a design doc.** This file exists so that research already
done is not done twice. [Session 13](../prompts/13-otn-core.md) turns it into the
real design doc — chiefly by adding the `RuleSet` ↔ rules-string mapping table,
which is the part that requires judgement and is deliberately *not* attempted here.

Everything below was read from the specification files in
<https://github.com/jslater89/OpenTafl> (`opentafl-notation-spec.txt`, 549 lines;
`opentafl-engine-protocol.txt`, 263 lines) and from the `.otg` files in that
repository's `saved-games/replays/`.

> **Licence.** That repository is under a bespoke **"Stout Free-As-In-Beer
> License, v0.6"** — not OSI-approved. A specification may be *implemented*
> freely; its prose and its Java may not be copied. The notes below are a
> restatement in our own words for our own use. Do not paste spec text into this
> repo. Its `.otg` files may be vendored **with attribution, a link to the
> unmodified original, and a note of any modification**.

---

## Status of the standard

De-facto by default rather than by adoption, and worth being honest about:
OpenTafl's last commit is **2020-01-09**. Known consumers are OpenTafl itself, a
PlayTaflOnline JSON→OTN converter inside it, `etandel/tafl` (9 commits, abandoned),
and `bunburya/hnefatafl-rs` where it is a roadmap *maybe*. Aage Nielsen's site,
Board Game Arena, the Bologna Tablut Challenge, Jocly, `hnefatafl-copenhagen` and
`demircancelebi/tafl` all use their own formats.

The spec is unversioned, unauthored, carries no formal grammar, and has at least
one implementation divergence (below). **Which is the opportunity:** a
well-tested, MIT-licensed TypeScript OTN implementation with a conformance corpus
does not exist.

## Coordinates

Algebraic. Files run left→right (`a`…), ranks bottom→top (`1`…). No letters or
numbers skipped.

⚠ **Position records always start at a1 and proceed left-to-right, rank 1 upward**,
regardless of display orientation. This is the **opposite vertical order** from
`src/game/position.ts`. Getting it wrong mirrors every import; write the test first.

## Position record

`/<row>/<row>/…/` — leading **and** trailing slashes. Each row is a sequence of
`[empty-count][piece-symbol]`. Attackers lowercase, defenders uppercase:

| Symbol | Piece |
| --- | --- |
| `t` / `T` | taflman |
| `k` / `K` | king |
| `n` / `N` | knight (berserk) |
| `c` / `C` | commander (berserk) |
| `m` / `M` | mercenary |
| `g` / `G` | guard (neither captures nor is captured) |

Brandubh opening: `/3t3/3t3/3T3/ttTKTtt/3T3/3t3/3t3/`

Ready-made 7×7 layouts found in OpenTafl's `PTOConstants.java` (these are factual
board layouts, trivially re-expressible):

| Variant | Position record |
| --- | --- |
| Brandub | `/3t3/3t3/3T3/ttTKTtt/3T3/3t3/3t3/` |
| Ard Rí | `/2ttt2/3t3/t1TTT1t/ttTKTtt/t1TTT1t/3t3/2ttt2/` |
| Ballinderry-2 | `/2t1t2/7/t2T2t/2TKT2/t2T2t/7/2t1t2/` |
| Ballinderry-3 | `/3t3/1t3t1/3T3/t1TKT1t/3T3/1t3t1/3t3/` |

## Move record

Full: `[piece-symbol]<from><move-type><to>[capture-record][info-symbol]`
Short algebraic: `<from>-<to>[capture-record][info-symbol]`

- Move types: `-` normal, `^` jump (berserk), `=` berserk move, `^=` berserk jump
- Capture record: `x<square>[/<square>]…`
- Info symbols: `+` king vulnerable · `-` king has an escape route · `++` king
  captured · `--` king escapes · `---` resignation

Examples: `e5-e8` · `e5-e8xe9` · `Ke1-a1--`

**The capture records are deliberately redundant** so a machine can replay a game
from a start position and a move list *without knowing the rules*. For us that
makes them a free cross-check against our own move generator — and the reason
Session 13 treats a capture mismatch as a rejection, exactly as
`src/game/gameFile.ts` does with `capture_mismatch`.

## Rules string

Space-separated `key:value`. **`dim:` first, `start:`/`starti:` last.**

- Core: `dim:<n>` · `esc:c|e` (corner/edge, default `c`) · `surf:y|n` (surround
  fatal, default `y`) · `atkf:y|n` (attackers first, default `y`) ·
  `tfr:i|d|w|l` (threefold: ignore / draw / repeating side wins / loses, default `d`)
- King: `ka:y|a|h|n` (armed) · `ks:s|w|c|m` (strong / weak / **conditional** /
  middleweight, default `s`) · `kj:n|r|j|c` (jump)
- Other jumps: `nj:` (knight, default `c`) · `cj:` (commander, default `j`) ·
  `mj:` (mercenary, default `n`) · `gj:` (guard, default `n`)
- Special-space **locations**, each a comma-separated square list: `cor:` corners ·
  `cen:` centre/throne · `afor:` attacker fort · `dfor:` defender fort. An empty
  list removes the feature. Real files emit a **trailing comma** (`cor:g7, cen:b2,`).
- Special-space **semantics**, each taking a piece-type list from `tcnkmTCNKM`:
  `corh/cenh/aforh/dforh` (hostile to) · `cenhe` (hostile when empty) ·
  `corp/cenp/aforp/dforp` (passable through) · `cors/cens/afors/dfors` (may stop on) ·
  `corre/cenre/aforre/dforre` (may re-enter)
- Extras: `sw:n|w|s` (shieldwall none/weak/strong) · `swf:y|n` (flanking required) ·
  `efe:y|n` (**exit fort escape**) · `linc:y|n` (Linnaean capture) ·
  `ber:n|c|m` (berserk) · `spd:` speed limits (one number for all, two for
  attackers/defenders, or ten in `tcnkmTCNKM` order; 8-item arrays accepted for
  backward compatibility)
- Position: `start:<position-record>` or `starti:<inverted-position-record>`

⚠ **Divergence:** real OpenTafl-written files also emit a **`name:`** key
(`name:CopenhagenPuzzle`, `name:Brandub_Strong_Center_King`) which the spec text
does not document. An importer must tolerate it.

### Why the mapping needs judgement

`RuleSet`'s 11 flags do not line up one-to-one. Two examples that Session 13 must
resolve explicitly:

- `throneHostileToSoldiers` and `throneHostileToKing` are **two booleans** where
  OTN has **one `cenh:` piece-type list** — OTN is finer here, and we can express
  a subset.
- `strongKingOnThrone` and `strongKingAdjacentToThrone` collapse into a single
  `ks:s|w|c|m` — **we are finer here**, and `ks:c` ("conditional") is the closest
  match to our `wtf` preset.

Name the lossy cells in both directions. A file we cannot express faithfully is a
rejection with a specific reason, never a silent approximation.

## Game record (`.otg`)

Tag block, then numbered turns, then commentary.

Tags: `event` · `site` · `date:YYYY.MM.DD` · `round` · `attackers` · `defenders` ·
`result:1|0|-1|?` (**1 = attackers win, 0 = draw, −1 = defenders win, ? = unknown**) ·
`annotator` · `compiler` · `time-control` (e.g. `3600 30/3 3i` = 1 h main + 3
overtimes of 30 s + 3 s increment) · `time-remaining:<atk>, <def>` · `termination` ·
`variant` · `start-comment` · `position` · `puzzle-mode:none|loose|strict` ·
`puzzle-prestart` · `puzzle-start` · and `rules:<rules-string>` **last**.

Turns: `1. <attacker-move> <defender-move>`. Commentary is a bracketed block using
`|` to separate multiple comments in one turn; an empty block is literally `[|]`.
Puzzle hints use `(hint:<text>)`. By convention a leading clock-spec string in a
comment is stripped from display.

Variations use an address scheme `<move-address><variation-number><1a>`:
`2a.1.1a.` is the first variation off the first (attacker) move of turn 2;
`3b.3.1a` is off the second (defender) move of turn 3; `.....` is the ellipsis
placeholder when a variation starts on the defender's move.

### A complete real file (truncated)

```
[date:2017.04.15]
[result:?]
[compiler:OpenTafl]
[rules:dim:7 name:CopenhagenPuzzle atkf:y tfr:w cor:g7, cen:b2, sw:s efe:y starti:/tt2T2/1t2K2/2tt3/6t/3TTt1/4Tt1/4Tt1/]

1. f3-f6 e7-d7
[|]

2. f6-g6 Ke6-e7
[|]

2a.1.1a. d5-f5 Ke6-e7
[|]
```

## The corpus available to us

14 `.otg` files in OpenTafl, **9 carrying `puzzle-mode` tags**:

- **Puzzles** — `Copenhagen-Escape-Puzzle`, `Puzzle-Corner-Endgame`,
  `Fetlar-Escape-Puzzle`, `Ard-Ri-Escape-Puzzle`, `-2`, `-cooked`,
  `Ard-Ri-Capture-Puzzle`
- **Real annotated games** — **`Animals-Xerxes-Brandub-Triathlon-2015.otg`**
  (Brandubh, commentary by **Tim Millar**, originally posted to the World Tafl
  Federation's Facebook page), `Crust-vs-Schachus-Grandmasters-2015`,
  `Altti-Piirsoo-Steve-Lonsdale-Sea-Battle-Triathlon-2015`, `Fish-Nasa-2015-Fetlar`,
  `realgamelog`

The Brandubh file's rules string, which is also the evidence that settled our own
contested rule (see [`11-close-the-record.md`](../prompts/11-close-the-record.md),
which lands ADR 0007):

```
dim:7 name:Brandub_Strong_Center_King surf:n atkf:y ks:c nj:n cj:n cenh: cenhe: start:/3t3/3t3/3T3/ttTKTtt/3T3/3t3/3t3/
```

⚠ Note the prose in that file's `start-comment` says the throne **is** hostile,
while `cenh: cenhe:` are empty. **The document contradicts itself.** Treat the
prose as the human authority and record the discrepancy rather than resolving it
silently.

## Engine protocol (not in scope for Session 13)

Line-oriented over stdin/stdout; see [`00-deferred.md`](../prompts/00-deferred.md)
for why it is not worth its own session.

- **Engine → host:** `hello` · `simple-moves <on|off>` · `move <record>` ·
  `analysis <n> [<move-list> <eval>]…` · `status` · `error <code>` ·
  `position` · `side`
- **Host → engine:** `rules <rules-string>` · `position` · `side` ·
  `clock <atk-ms>[*] <def-ms>[*] <ot-secs> <atk-ots> <def-ots>` ·
  `analyze <n> <secs>` · `play <attackers|defenders>` · `move <position-record>` ·
  `error` · `opponent-move <move-list> <position-record>` · `finish <code>` ·
  `goodbye`

Handshake: the engine sends `hello`; OpenTafl waits 5 s before assuming startup
failure. Rules travel as an OTN rules string, so the protocol is variant-agnostic
by construction — nicer than UCI in that one respect. No version negotiation.
