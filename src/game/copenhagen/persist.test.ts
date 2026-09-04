import { beforeEach, describe, expect, it } from "vitest";
import {
  GAME_SCHEMA_VERSION,
  GAME_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  clearSavedGame,
  loadResumableGame,
  parseSavedGame,
  rememberSurfaceOpen,
  restoreGame,
  saveGame,
  serializeGame,
  snapshotGame,
  wasSurfaceOpen,
  type SavedGame,
} from "./persist";
import { GAME_STORAGE_KEY as BRANDUBH_KEY } from "../persist";
import { applyMove, initialState } from "./rules";
import { findLegalMove } from "./replay";
import type { GameState } from "./types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor } from "./variants";

const cph = VARIANTS.copenhagen;

const sq = (name: string) => ({
  row: 11 - Number(name.slice(1)),
  col: name.charCodeAt(0) - 97,
});

/** Four quiet plies from the opening, Black first — verified against the engine.
 *  `e7-b7` and `d6-d8` are the first two steps of opening the king's diamond, so
 *  this is the beginning of a real game rather than four arbitrary shuffles. */
const SHORT = ["d1-d3", "e7-b7", "e1-e3", "d6-d8"];

function play(moves: string[], rules = cph): GameState[] {
  const states = [initialState(rules)];
  for (const m of moves) {
    const [from, to] = m.split("-");
    const move = findLegalMove(states[states.length - 1], sq(from), sq(to), rules);
    expect(move, `${m} should be legal`).not.toBeNull();
    states.push(applyMove(states[states.length - 1], move!, rules));
  }
  return states;
}

/** A fixed "now" for every snapshot, so staleness and clock-skew checks are
 *  testable without stubbing the global clock. */
const NOW = 1_000_000;

/** `parseSavedGame` with the pinned clock, so a save stamped at NOW is neither
 *  stale (14 days) nor skewed into the future. */
const parseAt = (text: string) => parseSavedGame(text, NOW + 100);

/** The snapshot the app would write for a game in progress. */
function snapshotOf(
  states: GameState[],
  variantId = "copenhagen",
  customRules = CUSTOM_RULE_DEFAULTS,
) {
  return snapshotGame({
    id: "test-game",
    createdAt: NOW,
    variantId,
    customRules,
    playMode: "attackers",
    difficulty: "medium",
    states,
    cursor: states.length - 1,
    recorded: false,
    clock: null,
    match: null,
    gamesPerSet: 2,
    names: { p1: "", p2: "" },
  }, NOW);
}

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a
 *  map. Same stand-in as `../persist.test.ts` uses, for the same reason. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
  removeItem = (k: string): void => void this.data.delete(k);
  clear = (): void => this.data.clear();
  key = (i: number): string | null => [...this.data.keys()][i] ?? null;
  get length(): number {
    return this.data.size;
  }
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

// ── The key ───────────────────────────────────────────────────────────────────

describe("the storage key", () => {
  it("is Copenhagen's own, so no two games clobber each other", () => {
    // The reason there is a third key at all. A player mid-game in Brandubh who
    // opens Copenhagen, plays, and comes back must still find their Brandubh game
    // — and the same for a Tablut game in the other drawer entry.
    expect(GAME_STORAGE_KEY).not.toBe(BRANDUBH_KEY);
    expect(GAME_STORAGE_KEY).not.toBe("tablut.game.v1");
    expect(GAME_STORAGE_KEY).toBe("copenhagen.game.v1");
  });

  it("leaves a Brandubh save untouched when a Copenhagen game is saved and cleared", () => {
    localStorage.setItem(BRANDUBH_KEY, "brandubh-save");
    saveGame(snapshotOf(play(SHORT)));
    expect(localStorage.getItem(BRANDUBH_KEY)).toBe("brandubh-save");
    clearSavedGame();
    expect(localStorage.getItem(BRANDUBH_KEY)).toBe("brandubh-save");
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });
});

// ── The surface flag ──────────────────────────────────────────────────────────
// Which game the app is *in* survives a reload alongside the game itself: a
// refresh mid-Copenhagen must land back on the 11×11 board, and only the player's own
// back button clears the flag.

describe("surface persistence", () => {
  it("keeps its own key beside the game save", () => {
    expect(SURFACE_STORAGE_KEY).toBe("copenhagen.surface.v1");
    expect(SURFACE_STORAGE_KEY).not.toBe(GAME_STORAGE_KEY);
  });

  it("round-trips open and closed, and defaults to closed", () => {
    expect(wasSurfaceOpen()).toBe(false);
    rememberSurfaceOpen(true);
    expect(wasSurfaceOpen()).toBe(true);
    rememberSurfaceOpen(false);
    expect(wasSurfaceOpen()).toBe(false);
  });

  it("does not disturb the game save either way", () => {
    saveGame(snapshotOf(play(SHORT)));
    const saved = localStorage.getItem(GAME_STORAGE_KEY);
    rememberSurfaceOpen(true);
    rememberSurfaceOpen(false);
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBe(saved);
  });
});

// ── Round trip ────────────────────────────────────────────────────────────────

describe("save then restore", () => {
  it("rebuilds the timeline move for move", () => {
    const states = play(SHORT);
    const parsed = parseAt(serializeGame(snapshotOf(states)));
    expect(parsed).not.toBeNull();
    const restored = restoreGame(parsed!);
    expect(restored).not.toBeNull();
    expect(restored!.states).toEqual(states);
    expect(restored!.rules).toEqual(cph);
  });

  it("stores moves rather than boards", () => {
    const text = serializeGame(snapshotOf(play(SHORT)));
    const raw = JSON.parse(text) as SavedGame;
    expect(raw.v).toBe(GAME_SCHEMA_VERSION);
    expect(raw.moves).toHaveLength(SHORT.length);
    // Every stored move is coordinates, optionally plus a capture count — never a
    // position. The board is always recomputed by replaying, which is what stops a
    // tampered save from putting an impossible board into the engine.
    for (const m of raw.moves) {
      expect(m.length === 4 || m.length === 5).toBe(true);
      for (const n of m) expect(typeof n).toBe("number");
    }
    expect(Object.keys(raw)).not.toContain("board");
    expect(Object.keys(raw)).not.toContain("states");
  });

  it("restores a game played under a custom ruleset", () => {
    // `exitFort` and `strongKingEdgeRule` are the two flags no other game has, so
    // a save that carries them is the real test that the format is derived from
    // this ruleset rather than inherited from a smaller one.
    const flags = {
      ...CUSTOM_RULE_DEFAULTS,
      throneBlocks: "attackers" as const,
      exitFort: false,
      strongKingEdgeRule: "available_sides" as const,
    };
    const custom = rulesFor("custom", flags);
    const states = play(SHORT, custom);
    const parsed = parseAt(serializeGame(snapshotOf(states, "custom", flags)));
    expect(parsed).not.toBeNull();
    const restored = restoreGame(parsed!);
    expect(restored).not.toBeNull();
    expect(restored!.rules.throneBlocks).toBe("attackers");
    expect(restored!.rules.exitFort).toBe(false);
    expect(restored!.rules.strongKingEdgeRule).toBe("available_sides");
    expect(restored!.states).toEqual(states);
  });

  it("offers a fresh save back as resumable", () => {
    saveGame(snapshotOf(play(SHORT)));
    // "now" is injected rather than stubbed at both ends: `snapshotGame` stamps
    // `savedAt` from its own clock, so a real Date.now here would read as an
    // enormous skew and the save would be discarded as unreadable.
    const resumed = loadResumableGame(NOW + 100);
    expect(resumed).not.toBeNull();
    expect(resumed!.states).toHaveLength(SHORT.length + 1);
  });
});

// ── Refusals ──────────────────────────────────────────────────────────────────

describe("a save that cannot be trusted is dropped, not half-restored", () => {
  it("refuses an unknown schema version", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    expect(parseAt(JSON.stringify({ ...raw, v: raw.v + 1 }))).toBeNull();
  });

  it("refuses unparseable text and an unknown variant", () => {
    expect(parseAt("not json")).toBeNull();
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    expect(parseAt(JSON.stringify({ ...raw, variantId: "tablut-linnaeus" }))).toBeNull();
  });

  it("refuses a malformed move list", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    for (const moves of [[[0]], [["a", "b", "c", "d"]], [[0, 0, 99, 0]]])
      expect(parseAt(JSON.stringify({ ...raw, moves }))).toBeNull();
  });

  it("refuses a game replayed under a ruleset it was not played under", () => {
    // The check that earns the stored capture count: swapping the ruleset leaves
    // most moves legal but changes what they take, so a save that claimed a
    // capture the new rules do not produce must be refused rather than replayed
    // into a different game.
    const capture = ["d11-d10", "f8-f9", "a8-f8"]; // a8-f8 takes one
    const states = play(capture);
    const raw = JSON.parse(serializeGame(snapshotOf(states))) as SavedGame;
    const last = raw.moves[raw.moves.length - 1];
    expect(last).toHaveLength(5); // the count rode along …
    expect(last[4]).toBe(1);

    // … and a doctored count is caught by the replay's own arithmetic.
    const lied = { ...raw, moves: [...raw.moves.slice(0, -1), [last[0], last[1], last[2], last[3], 0]] };
    const parsed = parseAt(JSON.stringify(lied));
    expect(parsed).not.toBeNull(); // structurally fine …
    expect(restoreGame(parsed!)).toBeNull(); // … but it will not replay
  });

  it("refuses a cursor outside the timeline", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    expect(parseAt(JSON.stringify({ ...raw, cursor: 99 }))).toBeNull();
    expect(parseAt(JSON.stringify({ ...raw, cursor: -1 }))).toBeNull();
  });

  it("refuses a Brandubh save, which is a different game", () => {
    // Both formats are JSON with a `variantId`, so the thing that separates them
    // is that neither knows the other's variant ids.
    const brandubhish = JSON.stringify({
      v: GAME_SCHEMA_VERSION,
      id: "x",
      createdAt: NOW,
      savedAt: NOW,
      variantId: "wtf",
      customRules: CUSTOM_RULE_DEFAULTS,
      playMode: "attackers",
      difficulty: "medium",
      moves: [[6, 3, 6, 2]],  // a legal Brandubh ply, off the edge of nothing here
      status: "playing",
      cursor: 1,
      recorded: false,
      clock: null,
      match: null,
      gamesPerSet: 2,
      names: { p1: "", p2: "" },
    });
    expect(parseAt(brandubhish)).toBeNull();
  });
});
