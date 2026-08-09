// ── Live-game persistence (resumability) ─────────────────────────────────────
//
// A refresh must never lose a game in progress. Match *setup* (difficulty,
// variant, side) already survives a reload; this module persists the game
// itself — the move list, the review cursor, the clock banks and the
// over-the-board match score — under a single versioned localStorage key.
//
// Design, and how it lines up with Lichess:
//
//   • **Moves, not positions.** Lila stores a game as its move list (Huffman-
//     encoded SAN for standard chess, a binary format for variants) and replays
//     it to rebuild every position; it never stores a position per ply. We do
//     the same: `moves` is a flat list of from/to squares and `restoreGame`
//     replays them through the very same `applyMove` the live game uses. The
//     save is small, and the replay doubles as validation — a corrupt or
//     illegal move list simply fails to replay and the save is dropped, so a
//     tampered file can never inject an impossible board into the engine.
//   • **Clock state alongside the moves, not derived from them.** Lila keeps a
//     separate clock history (compressed centis per ply) rather than
//     reconstructing time from the moves. We keep the far simpler version of
//     the same idea: the two banks, who is on the move, and the flag.
//   • **The clock does not run while the tab is closed.** Lichess's real-time
//     games are server-authoritative and keep ticking whether or not you are
//     watching. This app has no server, so a wall-clock charge for time away
//     would be both unverifiable and unfair; the banks are frozen at their last
//     saved value, matching how Lichess's *offline* play behaves.
//   • **Versioned key, discard on mismatch.** Lila's client storage bumps a
//     version suffix and drops what it cannot read. `brandubh.game.v1` does
//     exactly that: an unknown schema version, unparseable JSON, an out-of-range
//     cursor or a stale save is discarded rather than half-restored.
//   • **This is the storage format, not the export format.** Lichess's on-disk
//     encoding and its PGN export are separate concerns; likewise the
//     PGN-style text format (see docs/design/game-import-export.md) is a
//     separate, human-facing serialization, free to evolve independently.

import { DIFFICULTIES, type Difficulty } from "./engine";
import type { GameState, GameStatus, PlayMode, Side } from "./types";
import type { Match, PlayerId } from "./matchSet";
import type { ClockBanks } from "./clockLine";
import {
  CUSTOM_RULE_DEFAULTS,
  VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type RuleSet,
} from "./variants";
import { isExternalStatus, replayPlies } from "./replay";

/** Versioned storage key. Bump the suffix on any incompatible schema change. */
export const GAME_STORAGE_KEY = "brandubh.game.v1";

/** Schema version carried inside the payload (belt and braces with the key). */
export const GAME_SCHEMA_VERSION = 1;

/**
 * How long a saved game stays resumable. Long enough to survive a weekend and
 * a phone restart; past that, offering to resume a half-forgotten game is
 * noise, and the save is treated as stale.
 */
export const MAX_SAVE_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * A move as stored: `[fromRow, fromCol, toRow, toCol]`, optionally followed by
 * the number of pieces it captured.
 *
 * The board is never stored — captures are recomputed by replaying the move
 * through the engine (see `restoreGame`). The trailing count is not used to
 * *produce* the position; it is a claim the replay checks its own arithmetic
 * against, exactly as the export format does (see game/replay.ts,
 * `capture_mismatch`). That check is what catches a move list paired with a
 * ruleset it was not played under: swapping, say, `cornersHostile` leaves most
 * moves legal but changes what they take, so without the count the save would
 * replay "successfully" into a *different* game.
 *
 * The count is optional so saves written before it existed still restore; they
 * simply go unchecked, as they always were.
 */
export type SavedMove =
  | [number, number, number, number]
  | [number, number, number, number, number];

/** The clock as stored: the banks, who holds them, and the flag. */
export interface SavedClock {
  /** The control the banks belong to — banks are only restored onto a match. */
  initialSeconds: number;
  incrementSeconds: number;
  remaining: Record<Side, number>;
  active: Side | null;
  started: boolean;
  flagged: Side | null;
  /**
   * The banks each position was reached with, index-aligned with the plies (see
   * game/clockLine). This is what makes a rewind restore the time a move was
   * first presented with, so it has to survive a reload along with the moves —
   * the same reason Lichess persists a per-ply clock history rather than
   * recomputing time from the move list.
   *
   * Empty for a save written before the line existed; those rewind to a full
   * bank, which is generous but never blocks play. Old saves stay resumable
   * rather than being discarded over a field they could not have written.
   */
  line: ClockBanks[];
}

/** The full save payload. */
export interface SavedGame {
  v: number;
  /**
   * Stable identity for this game, unchanged across every autosave of it. The
   * blob does not need a key, but a row does, and the same id is what lets a
   * game be exported, archived or synced without becoming a duplicate. Saves
   * written before ids existed are given one on read.
   */
  id: string;
  /** When the game was started; `savedAt` is when it was last written. */
  createdAt: number;
  savedAt: number;
  variantId: string;
  customRules: CustomRuleSet;
  playMode: PlayMode;
  difficulty: Difficulty;
  moves: SavedMove[];
  /** Status at the tip — carries results the move list cannot imply. */
  status: GameStatus;
  /** Which position was on screen (0 = opening). */
  cursor: number;
  /** Whether the finished game was already banked into the match set. */
  recorded: boolean;
  clock: SavedClock | null;
  match: Match | null;
  gamesPerSet: number;
  names: { p1: string; p2: string };
}

/** What `restoreGame` hands back: everything App needs to pick up play. */
export interface RestoredGame {
  /** The resumed game keeps its identity — the same game, not a copy of it. */
  id: string;
  createdAt: number;
  states: GameState[];
  cursor: number;
  rules: RuleSet;
  variantId: string;
  customRules: CustomRuleSet;
  playMode: PlayMode;
  difficulty: Difficulty;
  recorded: boolean;
  clock: SavedClock | null;
  match: Match | null;
  gamesPerSet: number;
  names: { p1: string; p2: string };
}

/** Everything App knows about the live game, as handed to {@link snapshotGame}. */
export interface GameSnapshotInput {
  /** The game's stable id; omitted means "this is a new game, mint one". */
  id?: string;
  /** When the game started; omitted defaults to now. */
  createdAt?: number;
  states: GameState[];
  cursor: number;
  variantId: string;
  customRules: CustomRuleSet;
  playMode: PlayMode;
  difficulty: Difficulty;
  recorded: boolean;
  clock: SavedClock | null;
  match: Match | null;
  gamesPerSet: number;
  names: { p1: string; p2: string };
}

const PLAY_MODES: readonly PlayMode[] = ["attackers", "defenders", "hotseat"];

/**
 * A fresh game id. `crypto.randomUUID` where it exists (every browser this app
 * targets, and Node 19+); a random fallback otherwise, since an id that is
 * merely unique-enough-locally is still better than none.
 */
export function newGameId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `g-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** Resolve the ruleset a save was played under. Shared with the export format
 *  (see variants.ts) so the two serializations cannot disagree about "custom". */
export { rulesFor };

// ── Serialize ────────────────────────────────────────────────────────────────

/**
 * Build the save payload from the live game. The id and `createdAt` identify the
 * game across its whole life, so App keeps them for as long as the game lasts
 * and passes them back on every autosave; a snapshot without them is a new game.
 */
export function snapshotGame(input: GameSnapshotInput, now: number = Date.now()): SavedGame {
  const tip = input.states[input.states.length - 1];
  return {
    v: GAME_SCHEMA_VERSION,
    id: input.id ?? newGameId(),
    createdAt: input.createdAt ?? now,
    savedAt: now,
    variantId: input.variantId,
    customRules: input.customRules,
    playMode: input.playMode,
    difficulty: input.difficulty,
    moves: tip.history.map(
      (h): SavedMove => [
        h.move.from.row,
        h.move.from.col,
        h.move.to.row,
        h.move.to.col,
        h.move.captures?.length ?? 0,
      ],
    ),
    status: tip.status,
    cursor: input.cursor,
    recorded: input.recorded,
    clock: input.clock,
    match: input.match,
    gamesPerSet: input.gamesPerSet,
    names: input.names,
  };
}

export const serializeGame = (saved: SavedGame): string => JSON.stringify(saved);

// ── Parse + validate ─────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isSide = (v: unknown): v is Side => v === "attackers" || v === "defenders";

/** No single move can take more than the four squares around its destination. */
const MAX_CAPTURES_PER_MOVE = 4;

const isSavedMove = (v: unknown): v is SavedMove =>
  Array.isArray(v) &&
  (v.length === 4 || v.length === 5) &&
  v.slice(0, 4).every((n) => Number.isInteger(n) && n >= 0 && n < 16) &&
  (v.length === 4 ||
    (Number.isInteger(v[4]) && v[4] >= 0 && v[4] <= MAX_CAPTURES_PER_MOVE));

const parseBanks = (v: unknown): ClockBanks | null => {
  if (!isObject(v)) return null;
  const { attackers, defenders } = v;
  if (typeof attackers !== "number" || !Number.isFinite(attackers) || attackers < 0) return null;
  if (typeof defenders !== "number" || !Number.isFinite(defenders) || defenders < 0) return null;
  return { attackers, defenders };
};

/**
 * The per-ply clock line, dropped wholesale if any entry is malformed — a partly
 * trusted line would hand out full banks at the plies it failed to read, which is
 * exactly the free time the line exists to prevent. `maxPlies` bounds it to the
 * move list so a bloated save cannot grow the array without bound.
 */
function parseClockLine(v: unknown, maxPlies: number): ClockBanks[] {
  if (!Array.isArray(v)) return [];
  if (v.length > maxPlies + 1) return [];
  const line: ClockBanks[] = [];
  for (const entry of v) {
    const banks = parseBanks(entry);
    if (!banks) return [];
    line.push(banks);
  }
  return line;
}

function parseClock(v: unknown, maxPlies: number): SavedClock | null {
  if (!isObject(v)) return null;
  const remaining = parseBanks(v.remaining);
  if (!remaining) return null;
  if (typeof v.initialSeconds !== "number" || typeof v.incrementSeconds !== "number") return null;
  const active = v.active === null || isSide(v.active) ? (v.active as Side | null) : undefined;
  const flagged = v.flagged === null || isSide(v.flagged) ? (v.flagged as Side | null) : undefined;
  if (active === undefined || flagged === undefined) return null;
  return {
    initialSeconds: v.initialSeconds,
    incrementSeconds: v.incrementSeconds,
    remaining,
    active,
    started: v.started === true,
    flagged,
    line: parseClockLine(v.line, maxPlies),
  };
}

/** Structural check on a persisted match — enough to keep the scoreboard sane. */
function parseMatch(v: unknown): Match | null {
  if (!isObject(v)) return null;
  const set = v.set;
  if (!isObject(set) || !Array.isArray(set.results)) return null;
  if (typeof set.gamesPerSet !== "number" || set.gamesPerSet <= 0) return null;
  const isPlayer = (p: unknown): p is PlayerId => p === "p1" || p === "p2";
  if (!isPlayer(set.attackersPlayer) || !isPlayer(set.defendersPlayer)) return null;
  if (!isPlayer(v.firstAttacker)) return null;
  const counts = (c: unknown): boolean =>
    isObject(c) && typeof c.p1 === "number" && typeof c.p2 === "number";
  if (!counts(v.setsWon) || !counts(v.gameWins)) return null;
  if (typeof v.setsDrawn !== "number" || typeof v.gamesPerSet !== "number") return null;
  return v as unknown as Match;
}

/**
 * Parse a raw payload, rejecting anything unreadable, out of schema or stale.
 * Returns null (never throws) so a bad save is simply forgotten.
 */
export function parseSavedGame(raw: string | null, now: number = Date.now()): SavedGame | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // corrupt JSON
  }
  if (!isObject(data)) return null;
  if (data.v !== GAME_SCHEMA_VERSION) return null; // older/newer schema
  if (typeof data.savedAt !== "number" || !Number.isFinite(data.savedAt)) return null;
  if (now - data.savedAt > MAX_SAVE_AGE_MS || data.savedAt > now + 60_000) return null; // stale / clock-skewed
  if (typeof data.variantId !== "string") return null;
  if (data.variantId !== "custom" && !VARIANTS[data.variantId]) return null;
  if (!PLAY_MODES.includes(data.playMode as PlayMode)) return null;
  if (!(DIFFICULTIES as readonly string[]).includes(data.difficulty as string)) return null;
  if (!Array.isArray(data.moves) || !data.moves.every(isSavedMove)) return null;
  if (typeof data.status !== "string") return null;
  if (!Number.isInteger(data.cursor) || (data.cursor as number) < 0) return null;
  if ((data.cursor as number) > data.moves.length) return null;
  if (typeof data.gamesPerSet !== "number" || data.gamesPerSet <= 0) return null;

  const customRules = isObject(data.customRules)
    ? ({ ...CUSTOM_RULE_DEFAULTS, ...(data.customRules as CustomRuleSet) } as CustomRuleSet)
    : CUSTOM_RULE_DEFAULTS;
  const names = isObject(data.names)
    ? {
        p1: typeof data.names.p1 === "string" ? data.names.p1 : "",
        p2: typeof data.names.p2 === "string" ? data.names.p2 : "",
      }
    : { p1: "", p2: "" };

  return {
    v: GAME_SCHEMA_VERSION,
    // Ids and start times arrived after the first saves did. Rather than reject a
    // game in progress over a missing key, mint one and treat the save time as
    // the start: read tolerantly, write completely.
    id: typeof data.id === "string" && data.id !== "" ? data.id : newGameId(),
    createdAt:
      typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
        ? data.createdAt
        : data.savedAt,
    savedAt: data.savedAt,
    variantId: data.variantId,
    customRules,
    playMode: data.playMode as PlayMode,
    difficulty: data.difficulty as Difficulty,
    moves: data.moves as SavedMove[],
    status: data.status as GameStatus,
    cursor: data.cursor as number,
    recorded: data.recorded === true,
    clock: data.clock == null ? null : parseClock(data.clock, (data.moves as SavedMove[]).length),
    match: data.match == null ? null : parseMatch(data.match),
    gamesPerSet: data.gamesPerSet,
    names,
  };
}

// ── Restore ──────────────────────────────────────────────────────────────────

/**
 * Rebuild the state timeline by replaying the saved moves through the engine.
 * Any move that is not legal in the position it claims to be played from, or
 * that captures a different number of pieces than the save recorded — the
 * signatures of a corrupt, tampered or rule-mismatched save — aborts the whole
 * restore, and null is returned so the caller starts a fresh game instead.
 */
export function restoreGame(saved: SavedGame): RestoredGame | null {
  const rules = rulesFor(saved.variantId, saved.customRules);
  if (!rules) return null;

  // The replay itself is shared with the export format (see game/replay.ts):
  // one trust boundary, so a save and a pasted game are validated identically.
  // Anything that will not replay legally — a corrupt, tampered or
  // rule-mismatched save — aborts the restore rather than being half-applied.
  const replayed = replayPlies(
    saved.moves.map(([fr, fc, tr, tc, captures]) => ({
      from: { row: fr, col: fc },
      to: { row: tr, col: tc },
      // Undefined on a save written before capture counts were stored, which
      // `replayPlies` reads as "the source said nothing" and leaves unchecked.
      captures: captures ?? null,
    })),
    rules,
  );
  if (!replayed.ok) return null;
  const states = replayed.states;
  if (saved.cursor >= states.length) return null;

  // Reconcile the stored result with the replayed one. A resignation or a flag
  // leaves no trace in the move list, so it is re-applied to the tip; any other
  // disagreement means the save does not describe this position and is dropped.
  const tip = states[states.length - 1];
  if (tip.status !== saved.status) {
    if (tip.status === "playing" && isExternalStatus(saved.status)) {
      states[states.length - 1] = { ...tip, status: saved.status };
    } else {
      return null;
    }
  }

  return {
    id: saved.id,
    createdAt: saved.createdAt,
    states,
    cursor: saved.cursor,
    rules,
    variantId: saved.variantId,
    customRules: saved.customRules,
    playMode: saved.playMode,
    difficulty: saved.difficulty,
    recorded: saved.recorded,
    clock: saved.clock,
    match: saved.match,
    gamesPerSet: saved.gamesPerSet,
    names: saved.names,
  };
}

// ── localStorage wrappers (never throw — private mode, quota, etc.) ──────────

export function saveGame(saved: SavedGame): void {
  try {
    localStorage.setItem(GAME_STORAGE_KEY, serializeGame(saved));
  } catch {
    /* storage unavailable or full — the game simply won't be resumable */
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(GAME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read + validate the save. A save that fails to parse is cleared on sight. */
export function loadSavedGame(now: number = Date.now()): SavedGame | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(GAME_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parsed = parseSavedGame(raw, now);
  if (!parsed) {
    clearSavedGame();
    return null;
  }
  return parsed;
}

/**
 * The one call App needs at startup: the resumable game, or null. Anything that
 * cannot be replayed is cleared, so the next save starts from a clean slate.
 *
 * A save with no moves and no match progress is *not* worth resuming — there is
 * nothing to lose in starting over — so it is treated as absent.
 */
export function loadResumableGame(now: number = Date.now()): RestoredGame | null {
  const saved = loadSavedGame(now);
  if (!saved) return null;
  const restored = restoreGame(saved);
  if (!restored) {
    clearSavedGame();
    return null;
  }
  if (restored.states.length <= 1 && !hasMatchProgress(restored.match)) {
    clearSavedGame();
    return null;
  }
  return restored;
}

/** True when a match carries a score worth keeping (games played or sets banked). */
export function hasMatchProgress(match: Match | null): boolean {
  if (!match) return false;
  return (
    match.set.results.length > 0 ||
    match.setsWon.p1 + match.setsWon.p2 + match.setsDrawn > 0
  );
}
