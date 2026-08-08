// ── Relational records (the shape a database would store) ────────────────────
//
// The app is a static, offline SPA: the only store is localStorage, and the save
// is one JSON blob (see persist.ts). This module is the seam between that blob
// and the *row* shapes a real backend would use — one flat record per table, no
// nesting, every child carrying its parent's id. See docs/design/database.md for
// the schema these mirror and the reasoning behind it.
//
// Nothing here talks to a network or a database. It exists so that:
//
//   • the storage format is already normalized — the day a backend appears, the
//     mapping is `INSERT`, not a rewrite;
//   • the awkward parts are found now, cheaply. Three came out of writing it:
//     a game needs a **stable id** (without one, every autosave looks like a new
//     row); the review `cursor` is **client state, not game state** — it says
//     what one viewer is looking at, so it can never be a column on a shared
//     game; and `gamesPerSet`/player names are **settings**, not properties of a
//     game or a match, so they get their own row;
//   • archive, rating and multiplayer work can be costed against real shapes.
//
// The converters are pure and total: `toRecords` loses nothing `fromRecords`
// cannot put back (records.test.ts asserts the round trip), so either
// representation can be treated as canonical.

import type { Difficulty } from "./engine";
import type { GameStatus, PlayMode, Side } from "./types";
import type { Match, MatchSet, PlayerId, SetGameResult } from "./matchSet";
import type { ClockBanks } from "./clockLine";
import { CUSTOM_RULE_DEFAULTS, type CustomRuleSet } from "./variants";
import { GAME_SCHEMA_VERSION, type SavedGame, type SavedMove } from "./persist";

/**
 * One row of the `games` table: everything true of the game as a whole. The
 * clock is flattened into columns rather than kept as a nested object — a
 * database would want to ask "which games ended on time?" without unpacking
 * JSON.
 */
export interface GameRecord {
  /** Primary key. Stable across every autosave of the same game. */
  id: string;
  /** When the game was started (ms since epoch). */
  createdAt: number;
  /** When this row was last written. */
  updatedAt: number;

  variantId: string;
  /** Only meaningful for the "custom" variant; null for a named one. */
  customRules: CustomRuleSet | null;

  /**
   * Who was behind each army. In a server schema this becomes two columns
   * (`attacker_player_id`, `defender_player_id`, either of which may be an
   * engine); here it stays the local play mode. See the design doc.
   */
  playMode: PlayMode;
  difficulty: Difficulty;
  status: GameStatus;
  /** Plies played — denormalized from the move rows, as an archive would. */
  plyCount: number;

  clockInitialSeconds: number | null;
  clockIncrementSeconds: number | null;
  clockRemainingAttackers: number | null;
  clockRemainingDefenders: number | null;
  clockActive: Side | null;
  clockStarted: boolean;
  clockFlagged: Side | null;
  /**
   * The banks the *opening* position was reached with — entry 0 of the clock
   * line. Every later entry belongs to the ply that reached it, so it lives on
   * the move row instead; see {@link MoveRecord.clockAfterAttackers}.
   */
  clockStartAttackers: number | null;
  clockStartDefenders: number | null;

  /** The over-the-board series this game belongs to, if any. */
  matchId: string | null;
  /** Whether the result was already banked into that series. */
  recorded: boolean;
}

/**
 * One row of the `moves` table — the game itself. Primary key is
 * `(gameId, ply)`, so moves are append-only and a replay is an ordered scan.
 * Squares are stored as row/col rather than algebraic text: notation is a
 * presentation concern (and the PGN-style export's business), not storage.
 */
export interface MoveRecord {
  gameId: string;
  /** 1-based ply number. Ply 1 is the raiders' opening move. */
  ply: number;
  side: Side;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  /**
   * How many pieces this move captured. Derived — a replay recomputes it — and
   * kept anyway so "games with a triple capture" needs a scan, not a replay.
   */
  captures: number;
  /**
   * The banks the position this move reached was first offered with, in ms
   * (`clockLine[ply]`). Clock time is a property of the position, not of the
   * session — which is why it belongs on the ply and not on the game, and why
   * lila stores a per-ply clock history too. Null when unrecorded: a save from
   * before the line existed, or one whose time control changed mid-game.
   */
  clockAfterAttackers: number | null;
  clockAfterDefenders: number | null;
}

/** One row of the `matches` table: an over-the-board series between two people. */
export interface MatchRecord {
  id: string;
  gamesPerSet: number;
  firstAttacker: PlayerId;
  /** Side assignments for the game in progress (or up next) in the live set. */
  setAttackersPlayer: PlayerId;
  setDefendersPlayer: PlayerId;
  setGamesPerSet: number;
  setsWonP1: number;
  setsWonP2: number;
  setsDrawn: number;
  gameWinsP1: number;
  gameWinsP2: number;
}

/**
 * One row of the `match_games` table: a finished game inside the live set.
 * Primary key `(matchId, seq)`. Deliberately independent of the `games` row — a
 * set can be scored from games played on a real board, and a game can exist with
 * no set at all.
 */
export interface SetGameRecord {
  matchId: string;
  /** 0-based position within the current set. */
  seq: number;
  winner: Side | "draw";
  status: GameStatus;
  moves: number;
  attackersPlayer: PlayerId;
  defendersPlayer: PlayerId;
  winningPlayer: PlayerId | null;
}

/**
 * One row of the `player_settings` table: what the *next* game defaults to, as
 * opposed to what a game was actually played under (that lives on the game row).
 * Names are per device, not per match — the same two people keep their names
 * across every series they play.
 */
export interface SettingsRecord {
  /** Whose settings these are. Null while play is anonymous and local. */
  playerId: string | null;
  gamesPerSet: number;
  nameP1: string;
  nameP2: string;
}

/** A whole save, in rows. */
export interface GameRecords {
  game: GameRecord;
  moves: MoveRecord[];
  match: MatchRecord | null;
  setGames: SetGameRecord[];
  settings: SettingsRecord;
}

/** The raiders open, so odd plies are theirs and even plies the king's side. */
export const sideOfPly = (ply: number): Side => (ply % 2 === 1 ? "attackers" : "defenders");

/** The match id a save's series takes: derived, since a save holds exactly one. */
export const matchIdFor = (gameId: string): string => `${gameId}:match`;

/**
 * Flatten a save into rows.
 *
 * `captures` comes off the saved move itself, which now carries the count the
 * replay checks itself against (see `SavedMove`). A save written before the
 * count existed has none, so a caller holding the replayed timeline may still
 * pass the per-ply counts; without either, the column reads 0 — which is why it
 * stays documented as derived, recoverable from the replay a backend already
 * runs to validate the move.
 */
export function toRecords(saved: SavedGame, capturesPerPly: number[] = []): GameRecords {
  const matchId = saved.match ? matchIdFor(saved.id) : null;

  const game: GameRecord = {
    id: saved.id,
    createdAt: saved.createdAt,
    updatedAt: saved.savedAt,
    variantId: saved.variantId,
    customRules: saved.variantId === "custom" ? saved.customRules : null,
    playMode: saved.playMode,
    difficulty: saved.difficulty,
    status: saved.status,
    plyCount: saved.moves.length,
    clockInitialSeconds: saved.clock?.initialSeconds ?? null,
    clockIncrementSeconds: saved.clock?.incrementSeconds ?? null,
    clockRemainingAttackers: saved.clock?.remaining.attackers ?? null,
    clockRemainingDefenders: saved.clock?.remaining.defenders ?? null,
    clockActive: saved.clock?.active ?? null,
    clockStarted: saved.clock?.started ?? false,
    clockFlagged: saved.clock?.flagged ?? null,
    clockStartAttackers: saved.clock?.line[0]?.attackers ?? null,
    clockStartDefenders: saved.clock?.line[0]?.defenders ?? null,
    matchId,
    recorded: saved.recorded,
  };

  const line = saved.clock?.line ?? [];
  const moves: MoveRecord[] = saved.moves.map(([fromRow, fromCol, toRow, toCol, captures], i) => ({
    gameId: saved.id,
    ply: i + 1,
    side: sideOfPly(i + 1),
    fromRow,
    fromCol,
    toRow,
    toCol,
    captures: captures ?? capturesPerPly[i] ?? 0,
    clockAfterAttackers: line[i + 1]?.attackers ?? null,
    clockAfterDefenders: line[i + 1]?.defenders ?? null,
  }));

  const match: MatchRecord | null =
    saved.match && matchId
      ? {
          id: matchId,
          gamesPerSet: saved.match.gamesPerSet,
          firstAttacker: saved.match.firstAttacker,
          setAttackersPlayer: saved.match.set.attackersPlayer,
          setDefendersPlayer: saved.match.set.defendersPlayer,
          setGamesPerSet: saved.match.set.gamesPerSet,
          setsWonP1: saved.match.setsWon.p1,
          setsWonP2: saved.match.setsWon.p2,
          setsDrawn: saved.match.setsDrawn,
          gameWinsP1: saved.match.gameWins.p1,
          gameWinsP2: saved.match.gameWins.p2,
        }
      : null;

  const setGames: SetGameRecord[] =
    saved.match && matchId
      ? saved.match.set.results.map((r, seq) => ({ matchId, seq, ...r }))
      : [];

  const settings: SettingsRecord = {
    playerId: null,
    gamesPerSet: saved.gamesPerSet,
    nameP1: saved.names.p1,
    nameP2: saved.names.p2,
  };

  return { game, moves, match, setGames, settings };
}

/**
 * Rebuild a save from rows. `cursor` is not a column — it is which position one
 * viewer happens to be looking at — so it is passed in; a fresh load lands at
 * the tip.
 */
export function fromRecords(records: GameRecords, cursor?: number): SavedGame {
  const { game, moves, match, setGames, settings } = records;

  const ordered = [...moves].sort((a, b) => a.ply - b.ply);
  const savedMoves: SavedMove[] = ordered.map((m) => [
    m.fromRow,
    m.fromCol,
    m.toRow,
    m.toCol,
    m.captures,
  ]);

  // The clock line is a dense prefix: entry 0 from the game row, then one per ply
  // until the first unrecorded one. Stopping there rather than filling holes is
  // deliberate — a half-trusted line hands out full banks at the plies it could
  // not read, which is the free time the line exists to prevent.
  const line: ClockBanks[] = [];
  if (game.clockStartAttackers !== null && game.clockStartDefenders !== null) {
    line.push({ attackers: game.clockStartAttackers, defenders: game.clockStartDefenders });
    for (const m of ordered) {
      if (m.clockAfterAttackers === null || m.clockAfterDefenders === null) break;
      line.push({ attackers: m.clockAfterAttackers, defenders: m.clockAfterDefenders });
    }
  }

  const clock =
    game.clockInitialSeconds === null || game.clockIncrementSeconds === null
      ? null
      : {
          initialSeconds: game.clockInitialSeconds,
          incrementSeconds: game.clockIncrementSeconds,
          remaining: {
            attackers: game.clockRemainingAttackers ?? 0,
            defenders: game.clockRemainingDefenders ?? 0,
          },
          active: game.clockActive,
          started: game.clockStarted,
          flagged: game.clockFlagged,
          line,
        };

  const set: MatchSet | null = match
    ? {
        results: [...setGames]
          .sort((a, b) => a.seq - b.seq)
          .map(({ matchId: _matchId, seq: _seq, ...result }): SetGameResult => result),
        attackersPlayer: match.setAttackersPlayer,
        defendersPlayer: match.setDefendersPlayer,
        gamesPerSet: match.setGamesPerSet,
      }
    : null;

  const rebuiltMatch: Match | null =
    match && set
      ? {
          gamesPerSet: match.gamesPerSet,
          firstAttacker: match.firstAttacker,
          set,
          setsWon: { p1: match.setsWonP1, p2: match.setsWonP2 },
          setsDrawn: match.setsDrawn,
          gameWins: { p1: match.gameWinsP1, p2: match.gameWinsP2 },
        }
      : null;

  return {
    v: GAME_SCHEMA_VERSION,
    id: game.id,
    createdAt: game.createdAt,
    savedAt: game.updatedAt,
    variantId: game.variantId,
    // A named variant carries no custom rules; the defaults stand in, exactly as
    // a fresh save does (`rulesFor` ignores them unless variantId is "custom").
    customRules: game.customRules ?? CUSTOM_RULE_DEFAULTS,
    playMode: game.playMode,
    difficulty: game.difficulty,
    moves: savedMoves,
    status: game.status,
    cursor: cursor ?? savedMoves.length,
    recorded: game.recorded,
    clock,
    match: rebuiltMatch,
    gamesPerSet: settings.gamesPerSet,
    names: { p1: settings.nameP1, p2: settings.nameP2 },
  };
}
