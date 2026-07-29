# Design — Game resumability (localStorage)

**Session 1 of [`docs/ROADMAP.md`](../ROADMAP.md), shipped.** A page refresh
never loses a game in progress. Implementation: [`src/game/persist.ts`](../../src/game/persist.ts),
tests in `src/game/persist.test.ts`, wiring in `src/App.tsx`.

## What is saved

One versioned key, `brandubh.game.v1`:

| Field | Why |
| --- | --- |
| `moves` | `[fromRow, fromCol, toRow, toCol]` per ply — the game itself |
| `status` | the tip's result (a resignation or a flag leaves no trace in the moves) |
| `cursor` | which position was on screen, so review position survives too |
| `variantId` + `customRules` | the rules the moves were legal under |
| `playMode`, `difficulty` | who was playing whom |
| `clock` | both banks, who holds them, the flag, and the control they belong to |
| `match`, `gamesPerSet`, `names`, `recorded` | the over-the-board score |

A three-move save is ~550 bytes. Positions are **not** stored — they are replayed.

## How this lines up with Lichess

Lichess is the reference for "a game you are playing survives whatever happens
to your browser", so each decision here is either the same idea or a deliberate
departure.

**Same idea:**

- **Store moves, replay positions.** Lila stores a game as its move list —
  Huffman-encoded SAN for standard chess, a binary format for variants — and
  rebuilds positions by replaying; it never stores a board per ply. `restoreGame`
  replays the saved moves through the same `applyMove` the live game uses. The
  save stays small, and the replay doubles as validation: an illegal move list
  cannot be replayed, so it is dropped rather than half-loaded. A tampered save
  can therefore never put a position on the board that the engine did not itself
  compute (`persist.test.ts` asserts exactly that).
- **Clock state kept separately, not derived from moves.** Lila keeps a
  compressed clock history (centis per ply) alongside the moves. We keep the
  minimal version: two banks, the side on the move, the flag, and the control
  they belong to. Banks are only restored onto a *matching* control, so
  resuming a 3+2 game while the settings now say 10+0 starts the clock fresh
  instead of handing out or stealing time.
- **Versioned key, discard what you cannot read.** Lila's client storage bumps a
  version suffix and drops unreadable values. Unknown schema version, corrupt
  JSON, unknown variant, out-of-range cursor, or a save older than 14 days: all
  discarded on sight, and the key is cleared so the next save starts clean.
- **Storage format ≠ export format.** Lichess's on-disk encoding and its PGN
  export are separate concerns. The PGN-style text format
  ([`game-import-export.md`](./game-import-export.md), Session 3) is the
  human-facing serialization and is free to evolve without touching this one.

**Deliberately different:**

- **No server, so the client is authoritative.** Lichess never trusts a client
  clock: the server owns the game and the browser only interpolates. This app is
  a static, offline SPA — there is nothing to arbitrate with. The replay-based
  validation above is what stands in for server authority: the save can only
  describe a game the engine agrees is playable.
- **The clock freezes while the tab is away.** A real-time Lichess game keeps
  ticking whether or not you are watching, because the server is timing you.
  Charging wall-clock time for a closed tab here would be unverifiable and
  unfair, so the banks are frozen at their last saved value — the behaviour of
  Lichess's offline play. The banks are re-saved on `pagehide` and on
  `visibilitychange`, which is what makes "frozen where you left it" accurate to
  the tenth of a second rather than to the last move played.
- **Resume is offered, not assumed.** Lichess resumes an online game the moment
  you open it, because the server says the game is live. With a single local
  slot, silently restoring would make "just start a new game" impossible, so the
  opening overlay asks: **Resume game** or **New game**. Nothing is written over
  the save until that choice is made.

## Invalidation, in one list

The save is dropped when it is: unparseable, from another schema version, older
than 14 days (or stamped in the future), for an unknown variant or play mode,
holding a malformed move list or an out-of-range cursor, not legally replayable,
or claiming a result the replay contradicts (a resignation or loss on time is
the one result that is re-applied, since the moves cannot imply it). It is
cleared outright on **New match** / **New game**, and whenever the board is back
to the opening position with no score riding on it.

## Verification

- `src/game/persist.test.ts` — 23 tests: serialize → restore round trip (timeline
  deep-equal, cursor, clock, match, names, custom rules), every invalidation
  path, and the storage wrappers under a memory `localStorage` (including
  storage being unavailable, as in private mode).
- Driven in a real browser (Chromium): refresh mid-game → Resume → board and
  move log identical, AI resumes play; clock banks come back where they stood
  (3:04 / 3:01, not re-armed to 3:00); declining clears the save; a corrupt save
  is dropped and cleared; a fresh board is never offered as resumable.
