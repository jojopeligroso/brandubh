# Design — What a database would look like

Brandubh is a static, offline SPA. There is no server, and every byte of state
lives in `localStorage` (see [`game-persistence.md`](./game-persistence.md)).
This document describes the **relational schema the app would use if it grew a
backend**, and records how far the current code already lines up with it.

It is a design document, not a migration. Nothing here is provisioned, and no
SQL in it is executed — the illustrative DDL is written out so the shapes can be
argued about concretely, not so it can be run. The code side of this work is
[`src/game/records.ts`](../../src/game/records.ts): pure converters between the
save blob and one flat record per table, round-tripped in `records.test.ts`.

## Why do this before there is a server

Two reasons, neither of them "we might need a database someday".

1. **It found real bugs in the shape of our own state.** Writing the converters
   surfaced three things the blob format let us be sloppy about, all now fixed:
   - A game had **no stable identity**. Every autosave was an anonymous
     overwrite, so the same game could not be referred to twice. It has an `id`
     and a `createdAt` now, minted once per game and carried through resume.
   - The review **`cursor` is not game state**. It says which position one viewer
     is looking at. On a shared game it is nonsense as a column, so it is not one
     — `fromRecords` takes it as an argument.
   - **`gamesPerSet` and the player names are settings**, not properties of a
     game or a match. They now live on their own record.

   A fourth was confirmed rather than fixed: the per-ply clock line is
   position-scoped, so it maps onto the **move** rows and not the game row.
2. **It makes the online-play question answerable.** "Add multiplayer" is not a
   schema problem, it is an *authority* problem (see below). Better to know that
   before writing tables.

## The shape of the data

Six tables carry today's app; five more carry the features it does not have yet.

```
players ──┬── games ──── moves                    (a game and its plies)
          ├── ratings ── rating_history            (strength over time)
          ├── matches ── match_games               (over-the-board series)
          ├── player_settings                      (defaults for the next game)
          └── challenges                           (an invitation to play)
                └── seeks                          (an open offer to anybody)
                     evaluations                   (engine analysis of a position)
```

### `games` — one row per game

```sql
create table games (
  id                uuid primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  variant_id        text        not null,           -- 'walker' | 'wtf' | 'custom'
  custom_rules      jsonb,                          -- non-null only when variant_id = 'custom'

  attacker_player_id uuid references players(id),   -- null ⇒ the engine
  defender_player_id uuid references players(id),
  attacker_engine    text,                          -- 'easy'…'ollamh', null ⇒ a human
  defender_engine    text,

  status            text        not null,           -- GameStatus, verbatim
  ply_count         int         not null default 0,
  turn              text        not null,           -- 'attackers' | 'defenders'

  clock_initial_seconds   int,
  clock_increment_seconds int,
  clock_remaining_attackers int,                    -- ms
  clock_remaining_defenders int,
  clock_active      text,
  clock_started      boolean    not null default false,
  clock_flagged      text,
  clock_mode        text        not null default 'frozen',  -- 'frozen' | 'wall'
  last_move_at      timestamptz,                    -- for server-side ticking

  match_id          uuid references matches(id),
  recorded          boolean     not null default false,
  visibility        text        not null default 'private'  -- 'private' | 'public'
);
```

Notes on the choices that are not obvious:

- **`playMode` does not survive as a column.** Locally, "am I the raiders, the
  king, or both?" is one enum. In a schema it is two seats, each held by a person
  or an engine, which is strictly more expressive: it describes engine-vs-engine
  and human-vs-human games the current enum cannot. The mapping is total —
  `attackers` → (me, engine), `defenders` → (engine, me), `hotseat` → (me, me) —
  so nothing is lost going the other way either. `records.ts` keeps `playMode` as
  it is, with the translation noted, rather than inventing player ids the app has
  no use for.
- **The clock is columns, not JSON.** "Which games ended on time?" and "show me
  every bullet game" are the queries an archive is *for*; neither should have to
  unpack a blob.
- **`clock_mode` exists because two honest answers collide.** Offline, the banks
  are frozen while the tab is shut: there is no server to arbitrate, so charging
  someone for time they were not playing is unverifiable and unfair. Online, a
  clock that stops when you close the tab is an exploit. Both behaviours have to
  coexist, so the semantics are named per game rather than assumed.
- **`status` is stored even though a replay recomputes most of it.** A
  resignation and a flag leave no trace in the move list. This is the same
  reasoning `persist.ts` already documents.

### `moves` — the game itself

```sql
create table moves (
  game_id   uuid not null references games(id) on delete cascade,
  ply       int  not null,                 -- 1-based; ply 1 is the raiders'
  side      text not null,
  from_row  smallint not null, from_col smallint not null,
  to_row    smallint not null, to_col   smallint not null,
  captures  smallint not null default 0,  -- derived; kept for querying
  hash_before text,                        -- position hash, for repetition
  clock_after_attackers int,               -- banks this position was offered with, ms
  clock_after_defenders int,
  primary key (game_id, ply)
);
```

**Moves, not positions** — the same decision `persist.ts` already made, and the
same one lila makes. A position per ply would be ~50× the bytes and would let a
tampered row put a board on screen the engine never computed. Replaying through
`applyMove` is both the reconstruction and the validation.

`side` is redundant (it follows from ply parity, since the raiders always open —
`sideOfPly` in `records.ts`), and stored anyway: it makes `where side = …` an
index scan instead of arithmetic, and it makes a hand-inspected row readable.
`captures` is likewise derived-and-kept.

`hash_before` is the one column the client does not currently persist. Threefold
repetition is computed from `history[].hashBefore` in memory, and a replay
regenerates it — but a server that wants to answer "is this move a draw claim?"
without replaying the whole game needs it on the row.

**The clock times live here, not on the game.** This one fell out of the schema
rather than being designed into it. `clockLine` (see
[`clockLine.ts`](../../src/game/clockLine.ts)) records the banks each position
was *first offered with*, so rewinding restores the time a move was originally
played under. That makes clock time a property of the **position**, which means
it belongs on the ply — one entry per move row, with the opening position's entry
on the game row since no move reached it. lila stores a per-ply clock history for
the same reason. The `games.clock_remaining_*` columns are a different thing: the
banks *right now*, for the live game.

### `matches` and `match_games` — the over-the-board series

Brandubh is asymmetric, so a single game is not a fair contest; the scoring unit
is a **set** in which both players take each side equally, and a **match** is a
running series of sets (see `matchSet.ts`). That model transfers to online play
unchanged — it is about fairness, not about who is sitting where.

```sql
create table matches (
  id            uuid primary key,
  player1_id    uuid references players(id),   -- null ⇒ local "P1"
  player2_id    uuid references players(id),
  games_per_set int  not null,
  first_attacker text not null,                -- 'p1' | 'p2'
  set_attackers_player text not null,          -- assignments for the live set
  set_defenders_player text not null,
  set_games_per_set int not null,
  sets_won_p1 int not null default 0,
  sets_won_p2 int not null default 0,
  sets_drawn  int not null default 0,
  game_wins_p1 int not null default 0,
  game_wins_p2 int not null default 0
);

create table match_games (
  match_id uuid not null references matches(id) on delete cascade,
  seq      int  not null,                      -- 0-based, within the live set
  winner   text not null,                      -- 'attackers' | 'defenders' | 'draw'
  status   text not null,
  moves    int  not null,
  attackers_player text not null,
  defenders_player text not null,
  winning_player   text,
  primary key (match_id, seq)
);
```

`match_games` is **deliberately not** a foreign key to `games`. A set can be
scored from games played on a wooden board, and a game can exist with no set at
all; coupling them would make both cases awkward. The cost is that the two can
disagree, which is acceptable for a scoreboard and would not be for a ledger.

### `player_settings` — defaults, not history

```sql
create table player_settings (
  player_id     uuid primary key references players(id),
  games_per_set int  not null default 2,
  name_p1       text not null default '',
  name_p2       text not null default '',
  -- The Session 0 keys belong here too: preferred variant, difficulty, side,
  -- time control, theme, emblems, zen config, language.
  prefs         jsonb not null default '{}'
);
```

The distinction that matters: **settings are what the next game will default to;
the game row is what a game was actually played under.** `games.variant_id` is
not a duplicate of a preference — it is the historical fact, and it must not
change when someone edits their settings afterwards. Today's blob blurs this by
storing both in one place; the records split them.

### `players`, `ratings`, `rating_history`

```sql
create table players (
  id          uuid primary key,
  handle      citext unique not null,
  created_at  timestamptz not null default now()
);

create table ratings (
  player_id  uuid not null references players(id) on delete cascade,
  variant_id text not null,
  side       text not null,          -- 'attackers' | 'defenders' | 'overall'
  rating     numeric not null default 1500,
  deviation  numeric not null default 350,
  games      int     not null default 0,
  primary key (player_id, variant_id, side)
);

create table rating_history (
  player_id uuid not null references players(id) on delete cascade,
  game_id   uuid references games(id) on delete set null,
  at        timestamptz not null default now(),
  variant_id text not null,
  side      text not null,
  rating_before numeric not null,
  rating_after  numeric not null
);
```

**Per-side ratings are a domain requirement, not over-engineering.** In chess,
White's first-move edge is small enough to fold into one number. In Brandubh the
sides are wildly unequal and which side is favoured *depends on the ruleset* — so
a single rating would mostly measure which side someone happens to be handed. The
honest options are a per-side rating (above) or rating only complete sets, where
the sides balance by construction. The set model means we could do the latter and
skip per-game ratings entirely; that is a product decision, and the schema
supports both.

Authentication does not appear here at all: it belongs to whatever provider gets
picked, and `players.id` is the only thing the rest of the schema needs from it.

### `challenges`, `seeks`, `evaluations`

```sql
create table challenges (
  id            uuid primary key,
  from_player_id uuid not null references players(id) on delete cascade,
  to_player_id   uuid references players(id) on delete cascade,  -- null ⇒ open
  variant_id    text not null,
  custom_rules  jsonb,
  clock_initial_seconds int, clock_increment_seconds int,
  side_requested text,                     -- 'attackers' | 'defenders' | 'random'
  status        text not null default 'pending',  -- pending|accepted|declined|expired
  game_id       uuid references games(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz
);

create table evaluations (
  game_id  uuid not null references games(id) on delete cascade,
  ply      int  not null,                  -- position *after* this many plies
  depth    int  not null,
  score    int  not null,                  -- centipawn-equivalent, attackers-positive
  best_move text,
  engine_version text not null,
  primary key (game_id, ply, engine_version)
);
```

`seeks` (an open offer sitting in a lobby) is `challenges` with a null
`to_player_id` and a short expiry — a view, not a table, until there is evidence
it needs its own lifecycle.

`evaluations` keys on `engine_version` because a stored eval from a weaker engine
is worse than no eval: the analysis board must be able to say *which* Ollamh
produced a number, and to invalidate a whole generation at once.

## The hard part: authority

Everything above is easy. This is not.

The app is **client-authoritative** by construction. The browser owns the game,
computes legality, and is trusted because it is only ever playing against itself
or against a person in the same room. `game-persistence.md` says so explicitly:
"there is nothing to arbitrate with."

Online multiplayer inverts that, and it is not a feature you can add to the
edges:

- **Move legality must be decided server-side.** Row-level security can express
  "you may insert a move into a game where you hold the side that is to move" —
  it cannot express Brandubh's capture rules. So a move is not an `INSERT`; it is
  a call to a stored procedure (or edge function) `play_move(game_id, from, to)`
  that loads the move list, replays it through the engine, validates, appends,
  flips `turn`, charges the clock, and writes the new status. The engine has to
  run where the data is — meaning either a port, or running the existing
  TypeScript engine in the function runtime. **The engine being pure, variant-
  parameterized and free of DOM dependencies is what makes the second option
  viable**; that is worth protecting.
- **The clock must tick without the client.** Hence `clock_mode` and
  `last_move_at`: the server charges elapsed wall time on each move and a
  scheduled sweep flags games whose bank has run out. This is a genuinely
  different clock than the one `useGameClock` implements today.
- **Both players must see the same board within ~100ms.** Realtime subscription
  on `moves` filtered by `game_id`; the mover applies optimistically and
  reconciles, which is exactly the loop the current code does *not* have (it
  applies locally and is always right).
- **Takebacks, resignation and draw offers become negotiations** with two
  parties and a timeout, not local dialogs. The hotseat flow already models
  agreement (`ConfirmDialog` on takeback and branch), which helps, but the state
  has to live somewhere shared.

**Honest cost:** this is not a session. It is a backend, an engine that runs in
two places, a realtime layer, and a rewrite of the turn loop from
"apply locally" to "propose, await, reconcile". The schema above is the cheap
part and is worth having early; the authority inversion is the project.

## What lines up today, and what does not

| Concept | Now | Would be | Aligned? |
| --- | --- | --- | --- |
| Game identity | `SavedGame.id`, minted per game | `games.id` | ✅ added by this work |
| Move list | `SavedMove[]` on the blob | `moves` rows | ✅ `toRecords` |
| Clock (live banks) | nested `SavedClock` | flat columns on `games` | ✅ `toRecords` |
| Clock (per position) | `SavedClock.line[]` | `moves.clock_after_*` | ✅ `toRecords` |
| OTB series | nested `Match` | `matches` + `match_games` | ✅ `toRecords` |
| Set length, names | on the game blob | `player_settings` | ✅ split out |
| Review cursor | on the game blob | not stored (client state) | ✅ argument, not column |
| Who plays which side | `playMode` enum | two seat columns | ⚠️ mapping documented, not implemented |
| Repetition hash | in memory only | `moves.hash_before` | ⚠️ recomputed on replay |
| Capture counts | recomputed on replay | `moves.captures` | ⚠️ column exists, filled as 0 unless supplied |
| Setup preferences | six loose `localStorage` keys | `player_settings.prefs` | ❌ still loose keys |
| Ratings, archive, analysis | do not exist | tables above | ❌ future sessions |
| Move legality | client-authoritative | server-side `play_move` | ❌ the project, not a session |

The three ⚠️ rows are deliberate: each is a column that exists in the schema and
is filled by whichever side of the wire has the replayed timeline to hand. None
of them changes the storage format when it lands.

## If this were staged as sessions

Roughly in value ÷ effort order, and each independently shippable:

1. **Consolidate the loose settings keys** into one versioned object — the last
   ❌ that costs nothing and removes six ad-hoc reads. *(S)*
2. **Local game archive** — keep finished games instead of clearing them, list
   them, replay one. Uses `games` + `moves` shapes against `localStorage`/
   IndexedDB, no server. Makes the archive real before it is remote. *(M)*
3. **Export/import** ([Session 3](../ROADMAP.md)) — already planned, and the
   text format is the interoperable sibling of these rows.
4. **Accounts + cloud saves** — the first thing that actually needs a backend,
   and the smallest such thing: read/write your own games, no realtime, no
   authority change. *(L)*
5. **Ratings** — needs 4, plus the per-side/per-set decision above. *(M)*
6. **Online multiplayer** — needs 4, the engine running server-side, realtime,
   and the turn-loop rewrite. *(XL, and it is the one that changes the app's
   character.)*

## Deliberately not decided here

- **Which backend.** The schema is plain Postgres; nothing above needs a specific
  vendor, and picking one before step 4 would be premature.
- **Whether the archive should be public.** `games.visibility` is a column with
  no policy behind it yet; a public archive is a moderation commitment, not just
  a boolean.
- **Move encoding at scale.** Four smallints per ply is fine for thousands of
  games and wasteful for millions; lila Huffman-codes SAN. If that day comes,
  `moves` becomes a blob column on `games` and the row shape survives as the
  read model.
- **Offline-first sync.** Two devices editing the same game while both offline is
  a CRDT problem. The current single-slot save sidesteps it, and the archive
  (step 2) should keep sidestepping it: append-only finished games do not merge.
