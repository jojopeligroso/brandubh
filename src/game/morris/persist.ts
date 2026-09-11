// ── Live-game persistence (resumability, Morris) ──────────────────────────────
//
// The Morris twin of `../copenhagen/persist.ts`, keeping its design note because
// every word of it still applies — moves not positions, clock state alongside
// rather than derived, a versioned key that drops what it cannot read, and a
// refresh that must never lose a game in progress.
//
// Four things are this board's own:
//
//   • **Its own storage key.** `morris.game.v1` sits beside `brandubh.game.v1`,
//     `tablut.game.v1` and `copenhagen.game.v1` rather than replacing any of
//     them, so all four games keep their own resumable save and switching games
//     in the drawer never clobbers another one's game in progress.
//   • **`SavedMove` is a triple, not a pair of pairs.** A Morris move is
//     `[from, to, remove]` with `−1` for "none" — `from = −1` is a placement and
//     `remove = −1` is a turn that closed no mill — and grows a fourth element
//     only under the non-shipped `doubleMillRemoves: "two"` reading. ADR-0007
//     predicted a fourth near-copy of this module and noted it would differ by a
//     constant; this is the first one that differs in *shape*, which is recorded
//     in ADR-0008's accounting.
//   • **No capture count rides along.** The tafl saves store what a move took so
//     a replay can cross-check its own arithmetic and catch a save paired with
//     the wrong ruleset. Here the stone taken *is* part of the move, so a
//     mismatched ruleset shows up as an illegal move during the replay and there
//     is nothing left to claim separately (see `replay.ts`).
//   • **No difficulty clamp.** Copenhagen caps `hard`/`ollamh` on load because
//     its 11×11 search cannot run in a browser in time (see its
//     `difficultyCap.ts`). All four Morris levels are offered, so a save's
//     difficulty is restored exactly as written.
//
// As everywhere else in this family: **this is the storage format, not the export
// format.** The `.morris` text format (`gameFile.ts`) is a separate, human-facing
// serialization and the two are free to evolve independently.

import { DIFFICULTIES, type Difficulty } from "./engine";
import { POINT_COUNT, type GameState, type MorrisStatus, type PlayMode } from "./types";
import type { Match, PlayerId } from "../matchSet";
import type { ClockBanks } from "../clockLine";
import {
  CUSTOM_RULE_DEFAULTS,
  VARIANTS,
  rulesFor,
  type CustomRuleSet,
  type MorrisRuleSet as RuleSet,
} from "./variants";
import { isExternalStatus, replayPlies } from "./replay";

/** Versioned storage key. Bump the suffix on any incompatible schema change. */
export const GAME_STORAGE_KEY = "morris.game.v1";

/** Schema version carried inside the payload (belt and braces with the key). */
export const GAME_SCHEMA_VERSION = 1;

/**
 * How long a saved game stays resumable. Long enough to survive a weekend and a
 * phone restart; past that, offering to resume a half-forgotten game is noise,
 * and the save is treated as stale. Same fortnight the other three keep.
 */
export const MAX_SAVE_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * A move as stored: `[from, to, remove]`, with `−1` standing for "none" in the
 * two fields that can be absent — `from = −1` is a placement, `remove = −1` is a
 * turn that closed no mill. A fourth element appears only when a turn took a
 * second stone (`doubleMillRemoves: "two"`, off in every shipped preset), so the
 * common case stays three numbers.
 *
 * `−1` rather than `null` on purpose: the save is JSON, and a fixed-width array
 * of numbers is both smaller and simpler to validate than a tuple with nulls in
 * it — there is exactly one "absent" spelling to check for.
 *
 * The board is never stored. Every position is recomputed by replaying the moves
 * through the engine (see `restoreGame`), which is what stops a corrupt or
 * tampered save from putting an impossible board in front of the search.
 */
export type SavedMove = [number, number, number] | [number, number, number, number];

/**
 * The seats the *shared* clock is keyed by.
 *
 * Derived from `ClockBanks` rather than written out, and deliberately not from
 * anything in this directory: `useGameClock`/`clockLine` are shell furniture that
 * predate this board and speak the tafl vocabulary. Morris has white and black,
 * so the screen maps its colours onto these two seats at the one point where the
 * two meet — the mapping belongs there, not in the rules, and certainly not the
 * other way round (see ADR-0008, and `types.ts` on `PlayMode`).
 */
type ClockSeat = keyof ClockBanks;

/** The clock as stored: the banks, who holds them, and the flag. */
export interface SavedClock {
  /** The control the banks belong to — banks are only restored onto a match. */
  initialSeconds: number;
  incrementSeconds: number;
  remaining: ClockBanks;
  active: ClockSeat | null;
  started: boolean;
  flagged: ClockSeat | null;
  /**
   * The banks each position was reached with, index-aligned with the plies (see
   * `../clockLine`). This is what makes a rewind restore the time a move was
   * first presented with, so it has to survive a reload along with the moves.
   */
  line: ClockBanks[];
}

/** The full save payload. */
export interface SavedGame {
  v: number;
  /** Stable identity for this game, unchanged across every autosave of it. */
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
  status: MorrisStatus;
  /** Which position was on screen (0 = opening). */
  cursor: number;
  /** Whether the finished game was already banked into the match set. */
  recorded: boolean;
  clock: SavedClock | null;
  match: Match | null;
  gamesPerSet: number;
  names: { p1: string; p2: string };
}

/** What `restoreGame` hands back: everything the screen needs to pick up play. */
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

/** Everything the screen knows about the live game, as handed to {@link snapshotGame}. */
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

const PLAY_MODES: readonly PlayMode[] = ["white", "black", "hotseat"];

/**
 * A fresh game id. `crypto.randomUUID` where it exists (every browser this app
 * targets, and Node 19+); a random fallback otherwise, since an id that is merely
 * unique-enough-locally is still better than none.
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

/** `null` → `−1`, the one "absent" spelling the saved move list uses. */
const slot = (v: number | null | undefined): number => (v === null || v === undefined ? -1 : v);

/**
 * Build the save payload from the live game. The id and `createdAt` identify the
 * game across its whole life, so the screen keeps them for as long as the game
 * lasts and passes them back on every autosave; a snapshot without them is a new
 * game.
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
    moves: tip.history.map((h): SavedMove => {
      const triple: [number, number, number] = [slot(h.move.from), h.move.to, slot(h.move.remove)];
      // The fourth slot exists only when a turn really took two stones, so a
      // game under any shipped preset writes threes and nothing else.
      return (h.move.remove2 ?? null) === null
        ? triple
        : [triple[0], triple[1], triple[2], h.move.remove2 as number];
    }),
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

const isClockSeat = (v: unknown): v is ClockSeat => v === "attackers" || v === "defenders";

/** A stored point: a real index, or `−1` for "none". */
const isSlot = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= -1 && (v as number) < POINT_COUNT;

const isSavedMove = (v: unknown): v is SavedMove =>
  Array.isArray(v) &&
  (v.length === 3 || v.length === 4) &&
  v.every(isSlot) &&
  // The destination is the one field that may never be absent: every turn puts a
  // stone somewhere.
  (v[1] as number) >= 0;

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
  const active = v.active === null || isClockSeat(v.active) ? (v.active as ClockSeat | null) : undefined;
  const flagged = v.flagged === null || isClockSeat(v.flagged) ? (v.flagged as ClockSeat | null) : undefined;
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

/** Structural check on a persisted match — enough to keep the scoreboard sane.
 *  Kept even though this surface has no match sets yet, so the format is ready
 *  for the day the shell holds more than one game (see `snapshotGame`'s caller). */
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
    // Read tolerantly, write completely: an id and a start time are minted
    // rather than refused, the same way the other three saves handle them.
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
    status: data.status as MorrisStatus,
    cursor: data.cursor as number,
    recorded: data.recorded === true,
    clock: data.clock == null ? null : parseClock(data.clock, (data.moves as SavedMove[]).length),
    match: data.match == null ? null : parseMatch(data.match),
    gamesPerSet: data.gamesPerSet,
    names,
  };
}

// ── Restore ──────────────────────────────────────────────────────────────────

/** `−1` → `null`, the inverse of {@link slot}. */
const unslot = (v: number): number | null => (v < 0 ? null : v);

/**
 * Rebuild the state timeline by replaying the saved moves through the engine.
 * Any move that is not legal in the position it claims to be played from — the
 * signature of a corrupt, tampered or rule-mismatched save — aborts the whole
 * restore, and null is returned so the caller starts a fresh game instead.
 */
export function restoreGame(saved: SavedGame): RestoredGame | null {
  const rules = rulesFor(saved.variantId, saved.customRules);
  if (!rules) return null;

  // The replay itself is shared with the export format (see replay.ts): one
  // trust boundary, so a save and a pasted game are validated identically.
  const replayed = replayPlies(
    saved.moves.map(([from, to, remove, remove2]) => ({
      from: unslot(from),
      to,
      remove: unslot(remove),
      // Absent in a three-element move, which is every move under every shipped
      // preset — `undefined` reads as "no second stone", not as "point 0".
      ...(remove2 === undefined ? {} : { remove2: unslot(remove2) }),
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
    // No clamp here, unlike Copenhagen's: all four levels are offered on this
    // board, so a save resumes at exactly the level it was played at.
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
 * The one call the screen needs at mount: the resumable game, or null. Anything
 * that cannot be replayed is cleared, so the next save starts from a clean slate.
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

// ── Surface persistence ──────────────────────────────────────────────────────
// Which game the app is *in* survives a reload, exactly as the game itself does.
// Without this a refresh mid-Morris lands back on the Brandubh 7×7 board — the
// game space must only be left by the player's own choice, the back button.
//
// Note for anyone adding a board: this key is deliberately **absent** from the
// Ballinderry fallback list in `index.html`'s pre-paint script, because
// Ballinderry is *kept* on the Morris surface (ADR-0008). That list is not "the
// surfaces"; it is "the surfaces that fall Ballinderry back".

export const SURFACE_STORAGE_KEY = "morris.surface.v1";

export function rememberSurfaceOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(SURFACE_STORAGE_KEY, "1");
    else localStorage.removeItem(SURFACE_STORAGE_KEY);
  } catch {
    /* storage unavailable — the surface simply won't survive a reload */
  }
}

export function wasSurfaceOpen(): boolean {
  try {
    return localStorage.getItem(SURFACE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** True when a match carries a score worth keeping (games played or sets banked). */
export function hasMatchProgress(match: Match | null): boolean {
  if (!match) return false;
  return (
    match.set.results.length > 0 ||
    match.setsWon.p1 + match.setsWon.p2 + match.setsDrawn > 0
  );
}
