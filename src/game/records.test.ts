import { describe, expect, it } from "vitest";
import {
  fromRecords,
  matchIdFor,
  sideOfPly,
  toRecords,
  type GameRecords,
} from "./records";
import { snapshotGame, type GameSnapshotInput, type SavedGame } from "./persist";
import { allMoves, applyMove, initialState } from "./engine";
import { newMatch, recordMatchGame } from "./matchSet";
import { CUSTOM_RULE_DEFAULTS, VARIANTS } from "./variants";
import type { GameState, Move } from "./types";

const rules = VARIANTS.wtf;

/** Play `n` deterministic legal moves, returning the timeline they produce. */
function playTimeline(n: number): GameState[] {
  const states: GameState[] = [initialState()];
  for (let i = 0; i < n; i++) {
    const from = states[states.length - 1];
    const moves = allMoves(from.board, from.turn, rules);
    const move: Move = moves[Math.floor(moves.length / 2)];
    states.push(applyMove(from, move, rules));
  }
  return states;
}

function saveOf(overrides: Partial<GameSnapshotInput> = {}, now = 1_700_000_000_000): SavedGame {
  const states = overrides.states ?? playTimeline(6);
  return snapshotGame(
    {
      id: "game-under-test",
      createdAt: now - 60_000,
      states,
      cursor: states.length - 1,
      variantId: "wtf",
      customRules: CUSTOM_RULE_DEFAULTS,
      playMode: "defenders",
      difficulty: "hard",
      recorded: false,
      clock: null,
      match: null,
      gamesPerSet: 2,
      names: { p1: "", p2: "" },
      ...overrides,
    },
    now,
  );
}

describe("ply numbering", () => {
  it("gives the raiders the odd plies and the king's side the even ones", () => {
    expect(sideOfPly(1)).toBe("attackers");
    expect(sideOfPly(2)).toBe("defenders");
    expect(sideOfPly(11)).toBe("attackers");
    expect(sideOfPly(12)).toBe("defenders");
  });

  it("agrees with the side the engine says moved", () => {
    const states = playTimeline(8);
    const tip = states[states.length - 1];
    tip.history.forEach((h, i) => {
      expect(sideOfPly(i + 1)).toBe(h.sideThatMoved);
    });
  });
});

describe("rows ↔ save round trip", () => {
  it("survives a plain game vs the computer", () => {
    const saved = saveOf();
    const back = fromRecords(toRecords(saved), saved.cursor);
    expect(back).toEqual(saved);
  });

  it("survives a clocked game, per-ply clock line and all", () => {
    const states = playTimeline(3);
    const saved = saveOf({
      states,
      cursor: 3,
      clock: {
        initialSeconds: 180,
        incrementSeconds: 2,
        remaining: { attackers: 171_500, defenders: 168_250 },
        active: "attackers",
        started: true,
        flagged: null,
        line: [
          { attackers: 180_000, defenders: 180_000 },
          { attackers: 176_400, defenders: 180_000 },
          { attackers: 176_400, defenders: 174_100 },
          { attackers: 171_500, defenders: 174_100 },
        ],
      },
    });
    const records = toRecords(saved);
    // Entry 0 is the opening; every later entry rides the ply that reached it.
    expect(records.game.clockStartAttackers).toBe(180_000);
    expect(records.moves.map((m) => m.clockAfterAttackers)).toEqual([176_400, 176_400, 171_500]);
    expect(records.moves.map((m) => m.clockAfterDefenders)).toEqual([180_000, 174_100, 174_100]);
    expect(fromRecords(records, saved.cursor)).toEqual(saved);
  });

  it("survives a clocked game with no line (a save from before it existed)", () => {
    const saved = saveOf({
      clock: {
        initialSeconds: 600,
        incrementSeconds: 0,
        remaining: { attackers: 600_000, defenders: 600_000 },
        active: null,
        started: false,
        flagged: null,
        line: [],
      },
    });
    const records = toRecords(saved);
    expect(records.game.clockStartAttackers).toBeNull();
    expect(records.moves.every((m) => m.clockAfterAttackers === null)).toBe(true);
    expect(fromRecords(records, saved.cursor)).toEqual(saved);
  });

  it("keeps a short clock line short rather than inventing entries", () => {
    // A line recorded for only the first two positions of a six-ply game.
    const saved = saveOf({
      clock: {
        initialSeconds: 180,
        incrementSeconds: 2,
        remaining: { attackers: 170_000, defenders: 180_000 },
        active: "defenders",
        started: true,
        flagged: null,
        line: [
          { attackers: 180_000, defenders: 180_000 },
          { attackers: 170_000, defenders: 180_000 },
        ],
      },
    });
    const back = fromRecords(toRecords(saved), saved.cursor);
    expect(back.clock?.line).toHaveLength(2);
    expect(back).toEqual(saved);
  });

  it("survives an over-the-board match with a scored set", () => {
    const states = playTimeline(5);
    let match = newMatch(2);
    match = recordMatchGame(match, "defenders_win_escape", 21);
    const saved = saveOf({
      states,
      cursor: states.length - 1,
      playMode: "hotseat",
      match,
      gamesPerSet: 2,
      names: { p1: "Eoin", p2: "Aoife" },
      recorded: true,
    });
    const records = toRecords(saved);
    expect(records.setGames).toHaveLength(1);
    expect(records.match?.id).toBe(matchIdFor(saved.id));
    expect(records.game.matchId).toBe(matchIdFor(saved.id));
    const back = fromRecords(records, saved.cursor);
    expect(back).toEqual(saved);
  });

  it("survives a custom ruleset", () => {
    const saved = saveOf({
      variantId: "custom",
      customRules: { ...CUSTOM_RULE_DEFAULTS, armedKing: false, encirclementWin: false },
    });
    const records = toRecords(saved);
    expect(records.game.customRules).not.toBeNull();
    expect(records.game.customRules?.armedKing).toBe(false);
    const back = fromRecords(records, saved.cursor);
    expect(back).toEqual(saved);
  });

  it("survives the opening position (no moves yet)", () => {
    const states = [initialState()];
    const saved = saveOf({ states, cursor: 0 });
    const records = toRecords(saved);
    expect(records.moves).toHaveLength(0);
    expect(records.game.plyCount).toBe(0);
    expect(fromRecords(records, 0)).toEqual(saved);
  });
});

describe("the game row", () => {
  it("carries a stable id and both timestamps", () => {
    const saved = saveOf();
    const { game } = toRecords(saved);
    expect(game.id).toBe("game-under-test");
    expect(game.createdAt).toBe(saved.createdAt);
    expect(game.updatedAt).toBe(saved.savedAt);
    expect(game.createdAt).toBeLessThan(game.updatedAt);
  });

  it("keeps the same id across autosaves of one game, and changes it for a new game", () => {
    const first = saveOf({ states: playTimeline(2) });
    const later = saveOf({ states: playTimeline(4) }, 1_700_000_100_000);
    expect(toRecords(later).game.id).toBe(toRecords(first).game.id);
    // No id supplied → a brand-new game, which must not collide.
    const fresh = snapshotGame({
      states: playTimeline(1),
      cursor: 1,
      variantId: "wtf",
      customRules: CUSTOM_RULE_DEFAULTS,
      playMode: "defenders",
      difficulty: "hard",
      recorded: false,
      clock: null,
      match: null,
      gamesPerSet: 2,
      names: { p1: "", p2: "" },
    });
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.id.length).toBeGreaterThan(8);
  });

  it("leaves customRules null for a named variant", () => {
    expect(toRecords(saveOf({ variantId: "walker" })).game.customRules).toBeNull();
  });

  it("has no match id when there is no series", () => {
    const { game, match, setGames } = toRecords(saveOf());
    expect(game.matchId).toBeNull();
    expect(match).toBeNull();
    expect(setGames).toEqual([]);
  });
});

describe("the move rows", () => {
  it("number plies from 1 and stay in order", () => {
    const { moves } = toRecords(saveOf({ states: playTimeline(6) }));
    expect(moves.map((m) => m.ply)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(moves.every((m) => m.gameId === "game-under-test")).toBe(true);
  });

  it("replay in ply order even if the rows arrive shuffled", () => {
    const saved = saveOf();
    const records = toRecords(saved);
    const shuffled: GameRecords = { ...records, moves: [...records.moves].reverse() };
    expect(fromRecords(shuffled, saved.cursor).moves).toEqual(saved.moves);
  });

  it("record capture counts when the caller supplies them", () => {
    const saved = saveOf();
    const counts = saved.moves.map((_, i) => (i === 2 ? 2 : 0));
    const { moves } = toRecords(saved, counts);
    expect(moves.map((m) => m.captures)).toEqual(counts);
    // …and are absent-but-harmless when it does not (they are derived).
    expect(toRecords(saved).moves.every((m) => m.captures === 0)).toBe(true);
  });
});

describe("settings are not game state", () => {
  it("puts set length and player names on their own row", () => {
    const saved = saveOf({ gamesPerSet: 4, names: { p1: "Eoin", p2: "Aoife" } });
    const { settings, game } = toRecords(saved);
    expect(settings).toEqual({ playerId: null, gamesPerSet: 4, nameP1: "Eoin", nameP2: "Aoife" });
    expect(game).not.toHaveProperty("gamesPerSet");
    expect(game).not.toHaveProperty("names");
  });
});

describe("the cursor is the viewer's, not the game's", () => {
  it("is absent from every row", () => {
    const records = toRecords(saveOf({ cursor: 3 }));
    expect(records.game).not.toHaveProperty("cursor");
    expect(JSON.stringify(records)).not.toContain("cursor");
  });

  it("defaults to the tip when no viewer position is given", () => {
    const saved = saveOf({ states: playTimeline(6), cursor: 2 });
    expect(fromRecords(toRecords(saved)).cursor).toBe(6);
    expect(fromRecords(toRecords(saved), 2).cursor).toBe(2);
  });
});
