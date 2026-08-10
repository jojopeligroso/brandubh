# Deferred, blocked, and rejected — do not rebuild these

**Status: standing.** Not a session. This file exists so that a future session
does not spend its first hour re-deciding something already decided, or its last
hour building something that was rejected on purpose.

Each entry says **what**, **why**, and **what would change the answer**. An entry
leaves this file only when its unblocking condition is actually met — not when
someone feels differently about it.

---

## Rejected on architecture

### Rated online play, accounts, ladders

**Rejected.** It is the one obvious product gap: `litafl.com` runs rated tafl, and
`dcampbell24/hnefatafl` runs a Glicko-rated server with tournaments. It is also
flatly against two decisions this project has already taken and written down:
there is no backend (`README.md`, and the whole shape of `src/game/persist.ts`),
and [`docs/adr/0004`](../adr/0004-the-proving-ground-collects-nothing.md) commits
to collecting nothing — the proving ground exports by `mailto:` rather than to an
endpoint, on purpose.

Note that [`docs/design/database.md`](../design/database.md) already describes the
relational schema this app *would* need. That document exists to find the awkward
parts early, **not** as a plan of record. Reading it is not authorisation.

**What would change the answer:** an explicit decision to become a hosted service,
taken as its own ADR that supersedes 0004. Nothing smaller.

---

## Blocked on a human

### Unhiding the Irish (`ga`) locale

**Blocked, and the block is not technical.** The `ga` table in `src/i18n.ts` is
complete — strict TypeScript enforces it — and `src/gaelic.ts` already converts to
traditional overdot orthography. But the strings are **unreviewed machine drafts**
and the owner considers them not fit to ship. `CLAUDE.md` records this decision
and records that it was once reversed and then reinstated; `src/i18n.test.ts`
carries an assertion that `ga` is *not* in `VISIBLE_LANGS`, to be deleted in the
same change that reveals it.

Keep new keys flowing into the `ga` table and mark them as drafts. **Do not add
`ga` to `VISIBLE_LANGS`.** Shipping the compact header (Session 16) removes a
*layout* obstacle and does not unblock this.

**What would change the answer:** a human Irish speaker reviewing and signing off
the copy.

---

## Blocked on network policy

### Aage Nielsen's game and opening corpora

`aagenielsen.dk` publishes `tafl_openings.txt` (the first four moves of games
between strong players, **already normalised to one quadrant by eight-fold
symmetry** — the same D4 folding this engine does at the root, arrived at
independently), plus full extracts for Tablut and Tawlbwrdd, and a ratings-filtered
archive. It is the only real corpus of strong human tafl games in existence.

**`aagenielsen.dk` and `tafl.cyningstan.com` are both blocked by this
environment's egress proxy.** So is `litafl.com` and `codeberg.org`. Repeated
attempts have confirmed it. **Do not spend tool calls retrying them.**

Two further cautions if the block is ever lifted: no Brandubh-specific extract has
been confirmed to exist (only Tablut and Tawlbwrdd were named), and **the corpus
carries no stated licence**. It is user-generated game data on someone's personal
site. Ask Aage Nielsen before redistributing any of it; private analysis is a
different risk profile from shipping it in this repo.

**What would change the answer:** a network-policy change to the environment, or
a manual fetch by the owner — plus, for redistribution, an email.

### Damian Walker's Brandub puzzles

`tafl.cyningstan.com` hosts hand-composed Brandub puzzles — human-composed
positions for exactly this variant, which would complement the auto-mined bank
rather than duplicate it. Same egress block. **Copyright Damian Walker, no open
licence observed.** Ask before reusing.

---

## Considered and not worth a session yet

### The OpenTafl engine protocol

A UCI-analogue, documented in `opentafl-engine-protocol.txt`, variant-agnostic by
construction because rules travel as an OTN rules string. Adopting its command
vocabulary at the Web Worker boundary would cost very little and would make this
engine externally pluggable — and there is an **OpenTafl Computer Tafl Open**,
which is the only route in this game to a strength claim somebody else verifies.

**Why not yet:** the ecosystem is roughly two engines. OpenTafl's last commit is
2020-01-09; the tournament appears dormant since 2016; the one third-party Rust
implementation (`etandel/tafl`) has 9 commits and 0 stars. Do this opportunistically
inside Session 13 or 14 if the OTN work makes it nearly free — the rules-string
parser is the hard part and that session builds it anyway — but do not open a
session for it.

### Lifting art, sound or board sprites

MIT-licensed assets exist (`phemonoe-stack/brandubh-aon` ships Brandubh board and
piece art plus sound; `mikyll/TablutTactics` ships board and piece graphics).
**Not recommended.** The traced Celtic emblem set, the twelve themes and the cló
Gaelach wordmark are already stronger and are this project's visual identity —
see [`NOTICE.md`](../../NOTICE.md) for their provenance. Recorded here only so the
question is closed rather than re-asked.

### Porting `demircancelebi/tafl` as a rules dependency

**No.** It is MIT, actively maintained, TypeScript-native and has nine preset
boards, so it looks like an upgrade. It is not. Its rule defaults come from
`TaflRuleSet.COPENHAGEN` and it applies board-specific overrides to exactly one
board (Alea Evangelii, corner width only) — so its **Brandubh inherits
`ATTACKER_COUNT_TO_CAPTURE: 4`**, shieldwalls and exit forts. On a 7×7 board with
eight attackers, a king requiring four attackers *anywhere* is not any
reconstruction of Brandubh. Its king capture is position-independent with no
throne-adjacency case, and hostility is one undifferentiated `isEmptyBase()` test.

This repo's 11-flag `RuleSet` is **strictly finer-grained** than the field's most
popular tafl library. Read it for exit-fort edge cases (Session 12 does); do not
depend on it.

### Parameterising `BOARD_SIZE` for Tablut or Copenhagen

Already decided in
[`docs/adr/0006`](../adr/0006-tablut-forks-the-rules-rather-than-parameterising-them.md):
a 9×9 variant **forks** `rules.ts` rather than generalising the geometry. The
evaluator and the D4 folding are already written board-size-agnostically and carry
over. Variant breadth is this project's weakest axis against both the mobile apps
and the best libraries — that is a known, deliberate trade, and reversing it is an
ADR-sized decision, not a session's side effect.

---

## AGPL — read, never vendor

`dcampbell24/hnefatafl` (engine, server, ONNX neural net, Glicko ratings) and
`aclap-dev/jocly` are **AGPL-3.0**. This repo is MIT and deploys as a hosted static
site; vendoring either would relicense the app. Use them as reference
implementations and as benchmark opponents — never as dependencies, and never
copy code from them.

**One exception, verified:** `dcampbell24/hnefatafl`'s `locales/app.toml` is
separately marked `SPDX-License-Identifier: CC0-1.0`. Those 115 keys × 15
languages are public domain and may be used freely. That is the only part of that
repository this project may take.

Likewise `jslater89/OpenTafl` is under a bespoke **"Stout Free-As-In-Beer
License"** — not OSI-approved, and incompatible with this project's dependency
hygiene. Its *specifications* may be implemented freely (ideas are not
copyrightable); its Java and its spec prose may not be copied. Its `.otg` files
may be vendored with attribution, a link to the unmodified original, and a note of
any modification.

**And the general rule:** roughly 28 of the 64 tafl repositories surveyed carry
**no LICENSE file at all**. That means all rights reserved, however casually the
code was published. Absence of a licence is not permission.
