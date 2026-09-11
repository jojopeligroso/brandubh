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
import { applyMove, initialState, parseMoveName } from "./rules";
import { findLegalMove } from "./replay";
import type { GameState } from "./types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor } from "./variants";

const morris = VARIANTS["morris-gasser-1"];

/** Four quiet plies from the opening, White first — White starts the `d` spoke
 *  while Black takes the left outer edge. Verified legal by `play` below. */
const SHORT = ["d7", "a7", "d6", "a4"];
/** The same opening, with the fifth ply closing `d7`–`d6`–`d5` and taking `a7`.
 *  This is the sequence that exercises the third slot of `SavedMove`. */
const MILL = [...SHORT, "d5xa7"];

function play(tokens: string[], rules = morris): GameState[] {
  const states = [initialState(rules)];
  for (const token of tokens) {
    const parsed = parseMoveName(token);
    expect(parsed, `${token} should parse`).not.toBeNull();
    const move = findLegalMove(states[states.length - 1], parsed!, rules);
    expect(move, `${token} should be legal`).not.toBeNull();
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

/** The snapshot the screen would write for a game in progress. */
function snapshotOf(
  states: GameState[],
  variantId = "morris-gasser-1",
  customRules = CUSTOM_RULE_DEFAULTS,
) {
  return snapshotGame(
    {
      id: "test-game",
      createdAt: NOW,
      variantId,
      customRules,
      playMode: "white",
      difficulty: "medium",
      states,
      cursor: states.length - 1,
      recorded: false,
      clock: null,
      match: null,
      gamesPerSet: 2,
      names: { p1: "", p2: "" },
    },
    NOW,
  );
}

/** The suites are pure logic with no jsdom (see CLAUDE.md), so storage is a map.
 *  Same stand-in as `../copenhagen/persist.test.ts` uses, for the same reason. */
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
  it("is Morris's own, so no two games clobber each other", () => {
    // The reason there is a fourth key at all. A player mid-game in Brandubh who
    // opens Morris, plays, and comes back must still find their Brandubh game —
    // and the same for the two tafl games in the other drawer entries.
    expect(GAME_STORAGE_KEY).toBe("morris.game.v1");
    for (const other of [BRANDUBH_KEY, "tablut.game.v1", "copenhagen.game.v1"])
      expect(GAME_STORAGE_KEY).not.toBe(other);
  });

  it("leaves the other games' saves untouched when a Morris game is saved and cleared", () => {
    localStorage.setItem(BRANDUBH_KEY, "brandubh-save");
    localStorage.setItem("copenhagen.game.v1", "copenhagen-save");
    saveGame(snapshotOf(play(SHORT)));
    expect(localStorage.getItem(BRANDUBH_KEY)).toBe("brandubh-save");
    expect(localStorage.getItem("copenhagen.game.v1")).toBe("copenhagen-save");
    clearSavedGame();
    expect(localStorage.getItem(BRANDUBH_KEY)).toBe("brandubh-save");
    expect(localStorage.getItem("copenhagen.game.v1")).toBe("copenhagen-save");
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });
});

// ── The surface flag ──────────────────────────────────────────────────────────

describe("surface persistence", () => {
  it("keeps its own key beside the game save", () => {
    expect(SURFACE_STORAGE_KEY).toBe("morris.surface.v1");
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
    const states = play(MILL);
    const parsed = parseAt(serializeGame(snapshotOf(states)));
    expect(parsed).not.toBeNull();
    const restored = restoreGame(parsed!);
    expect(restored).not.toBeNull();
    expect(restored!.states).toEqual(states);
    expect(restored!.rules).toEqual(morris);
  });

  it("stores moves rather than boards, as [from, to, remove] triples", () => {
    const text = serializeGame(snapshotOf(play(MILL)));
    const raw = JSON.parse(text) as SavedGame;
    expect(raw.v).toBe(GAME_SCHEMA_VERSION);
    expect(raw.moves).toHaveLength(MILL.length);
    for (const m of raw.moves) {
      expect(m).toHaveLength(3); // no shipped preset ever takes two stones
      for (const n of m) expect(Number.isInteger(n)).toBe(true);
    }
    // A placement leaves `from` absent and the mill's victim rides in the third
    // slot — the two things `−1` stands in for, and the shape ADR-0007 did not
    // anticipate (see the note in persist.ts).
    expect(raw.moves[0]).toEqual([-1, 1, -1]);
    expect(raw.moves[4]).toEqual([-1, 17, 0]);
    expect(Object.keys(raw)).not.toContain("board");
    expect(Object.keys(raw)).not.toContain("states");
  });

  it("restores a game played under a custom ruleset", () => {
    // `flying` and `doubleMillRemoves` are the two flags that change what a move
    // *is*, so a save that carries them is the real test that the format is
    // derived from this ruleset rather than inherited from another game's.
    const flags = {
      ...CUSTOM_RULE_DEFAULTS,
      flying: "none" as const,
      doubleMillRemoves: "two" as const,
      noMillDrawMoves: "none" as const,
    };
    const custom = rulesFor("custom", flags);
    const states = play(MILL, custom);
    const parsed = parseAt(serializeGame(snapshotOf(states, "custom", flags)));
    expect(parsed).not.toBeNull();
    const restored = restoreGame(parsed!);
    expect(restored).not.toBeNull();
    expect(restored!.rules.flying).toBe("none");
    expect(restored!.rules.doubleMillRemoves).toBe("two");
    expect(restored!.rules.noMillDrawMoves).toBe("none");
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

  it("treats an untouched opening as nothing worth resuming", () => {
    saveGame(snapshotOf([initialState(morris)]));
    expect(loadResumableGame(NOW + 100)).toBeNull();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });
});

// ── No tier cap on this board ─────────────────────────────────────────────────

describe("every difficulty survives a round trip", () => {
  it("restores ollamh as ollamh — unlike Copenhagen, nothing is clamped", () => {
    // Copenhagen clamps `hard`/`ollamh` down to Medium on load, because its
    // 11×11 search cannot run in a browser in time (its difficultyCap.ts). All
    // four levels are offered here, so a save comes back at the level it was
    // played at, and `RestoredGame` has no `difficultyClamped` field to report.
    for (const difficulty of ["easy", "medium", "hard", "ollamh"] as const) {
      const snap = { ...snapshotOf(play(SHORT)), difficulty };
      const restored = restoreGame(parseAt(serializeGame(snap))!);
      expect(restored!.difficulty).toBe(difficulty);
    }
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
    expect(parseAt(JSON.stringify({ ...raw, variantId: "copenhagen-2" }))).toBeNull();
  });

  it("refuses a malformed move list", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    for (const moves of [
      [[0]], // too short
      [["a", "b", "c"]], // not numbers
      [[-1, 99, -1]], // off the board
      [[-1, -1, -1]], // no destination: every turn puts a stone somewhere
      [[-1, 1, -1, -1, -1]], // too long
    ])
      expect(parseAt(JSON.stringify({ ...raw, moves })), JSON.stringify(moves)).toBeNull();
  });

  it("refuses a move list that will not replay", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(MILL)))) as SavedGame;
    // Structurally perfect, and the mill takes a stone that is not there.
    const lied = { ...raw, moves: [...raw.moves.slice(0, -1), [-1, 17, 4]] };
    const parsed = parseAt(JSON.stringify(lied));
    expect(parsed).not.toBeNull(); // structurally fine …
    expect(restoreGame(parsed!)).toBeNull(); // … but it will not replay
  });

  it("refuses a save whose stored status the moves do not produce", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    // A resignation is re-applied (no move list can imply one) …
    const resigned = parseAt(JSON.stringify({ ...raw, status: "black_win_resign" }));
    expect(restoreGame(resigned!)!.states.slice(-1)[0].status).toBe("black_win_resign");
    // … a claimed win on the board is not.
    const invented = parseAt(JSON.stringify({ ...raw, status: "black_win_stones" }));
    expect(restoreGame(invented!)).toBeNull();
  });

  it("refuses a cursor outside the timeline", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    expect(parseAt(JSON.stringify({ ...raw, cursor: 99 }))).toBeNull();
    expect(parseAt(JSON.stringify({ ...raw, cursor: -1 }))).toBeNull();
  });

  it("refuses a stale save and one stamped in the future", () => {
    const text = serializeGame(snapshotOf(play(SHORT)));
    expect(parseSavedGame(text, NOW + 15 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(parseSavedGame(text, NOW - 120_000)).toBeNull();
  });

  it("refuses a Copenhagen save, which is a different game", () => {
    // Both formats are JSON with a `variantId` and a move list, so what
    // separates them is that neither knows the other's variant ids — and, here,
    // that a tafl move is four numbers where a Morris move is three.
    const copenhagenish = JSON.stringify({
      v: GAME_SCHEMA_VERSION,
      id: "x",
      createdAt: NOW,
      savedAt: NOW,
      variantId: "copenhagen-2",
      customRules: CUSTOM_RULE_DEFAULTS,
      playMode: "attackers",
      difficulty: "medium",
      moves: [[10, 3, 8, 3, 0]],
      status: "playing",
      cursor: 1,
      recorded: false,
      clock: null,
      match: null,
      gamesPerSet: 2,
      names: { p1: "", p2: "" },
    });
    expect(parseAt(copenhagenish)).toBeNull();
  });

  it("refuses a play mode from another board", () => {
    const raw = JSON.parse(serializeGame(snapshotOf(play(SHORT)))) as SavedGame;
    expect(parseAt(JSON.stringify({ ...raw, playMode: "attackers" }))).toBeNull();
    expect(parseAt(JSON.stringify({ ...raw, playMode: "hotseat" }))).not.toBeNull();
  });
});

// ── The clock rides along ─────────────────────────────────────────────────────

describe("the clock", () => {
  it("round-trips the shared clock's banks, seats and line", () => {
    // The banks are keyed by the *shared* clock's seat names, not by white and
    // black: `useGameClock` and `clockLine` are shell furniture that predate
    // this board, and the screen maps its colours onto those two seats (see the
    // note on `ClockSeat` in persist.ts).
    const clock = {
      initialSeconds: 300,
      incrementSeconds: 2,
      remaining: { attackers: 290_000, defenders: 295_000 },
      active: "attackers" as const,
      started: true,
      flagged: null,
      line: [
        { attackers: 300_000, defenders: 300_000 },
        { attackers: 300_000, defenders: 295_000 },
      ],
    };
    const snap = { ...snapshotOf(play(SHORT)), clock };
    const parsed = parseAt(serializeGame(snap));
    expect(parsed!.clock).toEqual(clock);
  });

  it("drops a clock line it cannot read in full rather than part of it", () => {
    const raw = JSON.parse(
      serializeGame({
        ...snapshotOf(play(SHORT)),
        clock: {
          initialSeconds: 300,
          incrementSeconds: 0,
          remaining: { attackers: 1, defenders: 1 },
          active: null,
          started: false,
          flagged: null,
          line: [{ attackers: 1, defenders: 1 }],
        },
      }),
    ) as SavedGame;
    const broken = {
      ...raw,
      clock: { ...raw.clock, line: [{ attackers: 1, defenders: "nope" }] },
    };
    expect(parseAt(JSON.stringify(broken))!.clock!.line).toEqual([]);
  });
});
