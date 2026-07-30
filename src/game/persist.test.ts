import { beforeEach, describe, expect, it } from "vitest";
import {
  GAME_STORAGE_KEY,
  MAX_SAVE_AGE_MS,
  clearSavedGame,
  loadResumableGame,
  loadSavedGame,
  parseSavedGame,
  restoreGame,
  rulesFor,
  saveGame,
  serializeGame,
  snapshotGame,
  type GameSnapshotInput,
  type SavedGame,
} from "./persist";
import { allMoves, applyMove, initialState } from "./engine";
import type { GameState, Move } from "./types";
import { newMatch, recordMatchGame } from "./matchSet";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, type CustomRuleSet } from "./variants";

const rules = VARIANTS.wtf;

/** Play `n` deterministic legal moves, returning the timeline they produce. */
function playTimeline(n: number): GameState[] {
  const states: GameState[] = [initialState()];
  for (let i = 0; i < n; i++) {
    const from = states[states.length - 1];
    const moves = allMoves(from.board, from.turn, rules);
    // A stable, arbitrary pick — the middle move — so the game wanders a little
    // rather than shuffling one piece back and forth into a repetition.
    const move: Move = moves[Math.floor(moves.length / 2)];
    states.push(applyMove(from, move, rules));
  }
  return states;
}

function snapshotInput(overrides: Partial<GameSnapshotInput> = {}): GameSnapshotInput {
  const states = overrides.states ?? playTimeline(6);
  return {
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
  };
}

const roundTrip = (input: GameSnapshotInput, now = Date.now()) => {
  const parsed = parseSavedGame(serializeGame(snapshotGame(input, now)), now);
  expect(parsed).not.toBeNull();
  return restoreGame(parsed as SavedGame);
};

// ── The core guarantee ───────────────────────────────────────────────────────

describe("serialize → restore round trip", () => {
  it("rebuilds the whole state timeline, move for move", () => {
    const input = snapshotInput();
    const restored = roundTrip(input);
    expect(restored).not.toBeNull();
    // Every position — board, turn, status, move count, captures and the full
    // history including resolved captures — comes back identical.
    expect(restored!.states).toEqual(input.states);
    expect(restored!.cursor).toBe(input.cursor);
  });

  it("keeps the review cursor where it was left, mid-timeline", () => {
    const restored = roundTrip(snapshotInput({ cursor: 2 }));
    expect(restored!.cursor).toBe(2);
  });

  it("restores the setup the game was played under", () => {
    const custom: CustomRuleSet = { ...CUSTOM_RULE_DEFAULTS, armedKing: false };
    const customRuleSet = rulesFor("custom", custom);
    const states = (() => {
      // Play the timeline under the same custom rules it will be restored with.
      const out: GameState[] = [initialState()];
      for (let i = 0; i < 4; i++) {
        const from = out[out.length - 1];
        const moves = allMoves(from.board, from.turn, customRuleSet);
        out.push(applyMove(from, moves[Math.floor(moves.length / 2)], customRuleSet));
      }
      return out;
    })();
    const restored = roundTrip(
      snapshotInput({
        states,
        cursor: states.length - 1,
        variantId: "custom",
        customRules: custom,
        playMode: "attackers",
        difficulty: "ollamh",
      }),
    );
    expect(restored!.states).toEqual(states);
    expect(restored!.variantId).toBe("custom");
    expect(restored!.rules.armedKing).toBe(false);
    expect(restored!.playMode).toBe("attackers");
    expect(restored!.difficulty).toBe("ollamh");
  });

  it("restores the clock banks exactly as they stood", () => {
    const clock = {
      initialSeconds: 180,
      incrementSeconds: 2,
      remaining: { attackers: 91_300, defenders: 174_800 },
      active: "attackers" as const,
      started: true,
      flagged: null,
      line: [
        { attackers: 180_000, defenders: 180_000 },
        { attackers: 174_800, defenders: 180_000 },
      ],
    };
    const restored = roundTrip(snapshotInput({ clock }));
    expect(restored!.clock).toEqual(clock);
  });

  // The per-ply line is what lets a rewind hand back the time a move was first
  // presented with, so a reload has to keep it (see game/clockLine).
  it("keeps the per-position clock line across a reload", () => {
    const line = [
      { attackers: 180_000, defenders: 180_000 },
      { attackers: 172_000, defenders: 180_000 },
      { attackers: 172_000, defenders: 3_500 }, // the defenders are nearly out
    ];
    const restored = roundTrip(
      snapshotInput({
        states: playTimeline(2),
        cursor: 2,
        clock: {
          initialSeconds: 180,
          incrementSeconds: 2,
          remaining: { attackers: 172_000, defenders: 0 }, // ...and then they flagged
          active: "defenders" as const,
          started: true,
          flagged: "defenders" as const,
          line,
        },
      }),
    );
    // The live bank is spent, but the line still holds what ply 2 was offered
    // with — so rewinding to it after a reload is still playable.
    expect(restored!.clock!.remaining.defenders).toBe(0);
    expect(restored!.clock!.line).toEqual(line);
  });

  it("drops a malformed clock line rather than trusting part of it", () => {
    const bad = roundTrip(
      snapshotInput({
        clock: {
          initialSeconds: 180,
          incrementSeconds: 2,
          remaining: { attackers: 10_000, defenders: 10_000 },
          active: "attackers" as const,
          started: true,
          flagged: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          line: [{ attackers: 180_000, defenders: 180_000 }, { attackers: "soon" }] as any,
        },
      }),
    );
    expect(bad!.clock!.line).toEqual([]);
  });

  it("refuses a clock line longer than the move list", () => {
    const restored = roundTrip(
      snapshotInput({
        states: playTimeline(1),
        cursor: 1,
        clock: {
          initialSeconds: 180,
          incrementSeconds: 2,
          remaining: { attackers: 10_000, defenders: 10_000 },
          active: "defenders" as const,
          started: true,
          flagged: null,
          // One move played → at most two plies; five entries is not this game.
          line: Array.from({ length: 5 }, () => ({ attackers: 180_000, defenders: 180_000 })),
        },
      }),
    );
    expect(restored!.clock!.line).toEqual([]);
  });

  it("treats a save written before the line existed as simply having none", () => {
    const saved = snapshotGame(
      snapshotInput({
        clock: {
          initialSeconds: 180,
          incrementSeconds: 2,
          remaining: { attackers: 90_000, defenders: 90_000 },
          active: "attackers" as const,
          started: true,
          flagged: null,
          line: [],
        },
      }),
    );
    // Exactly what an older payload looks like: no `line` key at all.
    const legacy = JSON.parse(serializeGame(saved));
    delete legacy.clock.line;
    const parsed = parseSavedGame(JSON.stringify(legacy));
    expect(parsed).not.toBeNull();
    expect(parsed!.clock!.line).toEqual([]);
    expect(parsed!.clock!.remaining).toEqual({ attackers: 90_000, defenders: 90_000 });
  });

  it("restores the match score, names and set length", () => {
    const match = recordMatchGame(newMatch(4), "defenders_win_escape", 21);
    const restored = roundTrip(
      snapshotInput({
        match,
        gamesPerSet: 4,
        names: { p1: "Fionn", p2: "Oisín" },
        playMode: "hotseat",
        recorded: true,
      }),
    );
    expect(restored!.match).toEqual(match);
    expect(restored!.gamesPerSet).toBe(4);
    expect(restored!.names).toEqual({ p1: "Fionn", p2: "Oisín" });
    expect(restored!.recorded).toBe(true);
  });

  it("round-trips the opening position (nothing played yet)", () => {
    const restored = roundTrip(snapshotInput({ states: [initialState()], cursor: 0 }));
    expect(restored!.states).toEqual([initialState()]);
  });

  it("re-applies a resignation, which the move list cannot imply", () => {
    const states = playTimeline(3);
    const tip = states[states.length - 1];
    states[states.length - 1] = { ...tip, status: "attackers_win_resign" };
    const restored = roundTrip(snapshotInput({ states, cursor: states.length - 1 }));
    expect(restored!.states[restored!.states.length - 1].status).toBe("attackers_win_resign");
    expect(restored!.states).toEqual(states);
  });

  it("re-applies a loss on time", () => {
    const states = playTimeline(2);
    states[states.length - 1] = { ...states[states.length - 1], status: "defenders_win_time" };
    const restored = roundTrip(snapshotInput({ states, cursor: states.length - 1 }));
    expect(restored!.states[restored!.states.length - 1].status).toBe("defenders_win_time");
  });
});

// ── Invalidation ─────────────────────────────────────────────────────────────

describe("invalidation", () => {
  const now = 1_700_000_000_000;
  const valid = () => snapshotGame(snapshotInput(), now);

  it("drops corrupt JSON", () => {
    expect(parseSavedGame("{not json", now)).toBeNull();
    expect(parseSavedGame("", now)).toBeNull();
    expect(parseSavedGame(null, now)).toBeNull();
    expect(parseSavedGame("[1,2,3]", now)).toBeNull();
  });

  it("drops a payload from another schema version", () => {
    const raw = JSON.stringify({ ...valid(), v: 0 });
    expect(parseSavedGame(raw, now)).toBeNull();
    expect(parseSavedGame(JSON.stringify({ ...valid(), v: 99 }), now)).toBeNull();
  });

  it("drops a stale save, and one stamped in the future", () => {
    const raw = serializeGame(valid());
    expect(parseSavedGame(raw, now + MAX_SAVE_AGE_MS - 1)).not.toBeNull();
    expect(parseSavedGame(raw, now + MAX_SAVE_AGE_MS + 1)).toBeNull();
    expect(parseSavedGame(raw, now - 60 * 60 * 1000)).toBeNull();
  });

  it("drops an unknown variant, play mode or malformed move list", () => {
    const bad = (patch: Record<string, unknown>) =>
      parseSavedGame(JSON.stringify({ ...valid(), ...patch }), now);
    expect(bad({ variantId: "tablut" })).toBeNull();
    expect(bad({ playMode: "spectator" })).toBeNull();
    expect(bad({ moves: "d4-d1" })).toBeNull();
    expect(bad({ moves: [[0, 3, 0]] })).toBeNull();
    expect(bad({ moves: [["a", 3, 0, 2]] })).toBeNull();
    expect(bad({ cursor: -1 })).toBeNull();
    expect(bad({ cursor: 99 })).toBeNull();
  });

  it("drops a move list that does not replay legally", () => {
    const tampered = {
      ...valid(),
      moves: [[0, 0, 6, 6] as [number, number, number, number]],
      cursor: 1,
    };
    // Parsing only checks shape; the replay is what catches an impossible game.
    const parsed = parseSavedGame(JSON.stringify(tampered), now);
    expect(parsed).not.toBeNull();
    expect(restoreGame(parsed as SavedGame)).toBeNull();
  });

  it("drops a save whose stored result contradicts the replay", () => {
    const raw = JSON.stringify({ ...valid(), status: "defenders_win_escape" });
    const parsed = parseSavedGame(raw, now);
    expect(restoreGame(parsed as SavedGame)).toBeNull();
  });

  it("drops moves that carry on past a finished game", () => {
    // Shuttle two pieces back and forth until threefold repetition ends it
    // (Walker rules: a draw), then claim one more move was played.
    const walker = VARIANTS.walker;
    const shuttle: [number, number, number, number][] = [
      [0, 3, 0, 2],
      [2, 3, 2, 2],
      [0, 2, 0, 3],
      [2, 2, 2, 3],
    ];
    const states: GameState[] = [initialState()];
    const played: [number, number, number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const from = states[states.length - 1];
      if (from.status !== "playing") break;
      const [fr, fc, tr, tc] = shuttle[i % shuttle.length];
      const move = allMoves(from.board, from.turn, walker).find(
        (m) => m.from.row === fr && m.from.col === fc && m.to.row === tr && m.to.col === tc,
      )!;
      states.push(applyMove(from, move, walker));
      played.push([fr, fc, tr, tc]);
    }
    const terminal = states[states.length - 1];
    expect(terminal.status).toBe("draw_repetition"); // the game really did end

    const saved = snapshotGame(
      snapshotInput({ states, cursor: states.length - 1, variantId: "walker" }),
      now,
    );
    expect(restoreGame(saved)).not.toBeNull(); // the honest save replays

    const ghost: SavedGame = {
      ...saved,
      moves: [...played, [0, 3, 0, 2]],
      status: "playing",
      cursor: played.length + 1,
    };
    expect(restoreGame(ghost)).toBeNull();
  });

  it("keeps a hostile save from smuggling a position past the engine", () => {
    // Every restored position is produced by applyMove, so the only positions
    // that can ever reach the board are ones the engine itself computed.
    const saved = valid();
    const restored = restoreGame(saved)!;
    for (let i = 1; i < restored.states.length; i++) {
      const prev = restored.states[i - 1];
      const move = restored.states[i].history[i - 1].move;
      expect(applyMove(prev, move, VARIANTS.wtf)).toEqual(restored.states[i]);
    }
  });
});

// ── A move list may never be reinterpreted under different rules ─────────────
//
// The dangerous case is not the save that fails to replay — that one is already
// caught. It is the save that replays *perfectly well* under the wrong ruleset
// and quietly yields a different game. The stored per-ply capture count is what
// closes it: the counts are the one thing a rules swap changes even when every
// move stays legal.

describe("a save cannot be replayed under rules it was not played under", () => {
  // Five plies, chosen so that every move is legal under either setting of
  // `throneHostileToSoldiers`, but the last one takes a defender against the
  // emptied throne only when the flag is on. Legality alone cannot tell the two
  // games apart; the capture count can.
  const LINE: [number, number, number, number][] = [
    [3, 1, 2, 1], // a raider steps off the king's rank…
    [2, 3, 2, 2], // …a defender clears the square above the throne…
    [0, 3, 0, 2],
    [3, 3, 2, 3], // …the king leaves the throne, which is now empty…
    [2, 1, 3, 1], // …and the raider steps back, flanking d4 against the throne.
  ];

  const play = (throneHostileToSoldiers: boolean) => {
    const ruleSet = rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, throneHostileToSoldiers });
    const states: GameState[] = [initialState()];
    for (const [fr, fc, tr, tc] of LINE) {
      const from = states[states.length - 1];
      const move = allMoves(from.board, from.turn, ruleSet).find(
        (m) => m.from.row === fr && m.from.col === fc && m.to.row === tr && m.to.col === tc,
      );
      expect(move).toBeDefined();
      states.push(applyMove(from, move as Move, ruleSet));
    }
    return states;
  };

  const capturesIn = (states: GameState[]) =>
    states[states.length - 1].history.map((h) => h.move.captures?.length ?? 0);

  it("the line really is legal either way, and only the captures differ", () => {
    expect(capturesIn(play(true))).toEqual([0, 0, 0, 0, 1]);
    expect(capturesIn(play(false))).toEqual([0, 0, 0, 0, 0]);
  });

  it("rejects a save whose ruleset was swapped under an intact move list", () => {
    const states = play(true);
    const saved = snapshotGame(
      snapshotInput({
        states,
        cursor: states.length - 1,
        variantId: "custom",
        customRules: { ...CUSTOM_RULE_DEFAULTS, throneHostileToSoldiers: true },
      }),
    );
    expect(restoreGame(saved)).not.toBeNull(); // honest save, honest rules

    // What a mid-game rule toggle used to leave behind: the same moves, now
    // paired with the rules the player has just switched to.
    const swapped: SavedGame = {
      ...saved,
      customRules: { ...CUSTOM_RULE_DEFAULTS, throneHostileToSoldiers: false },
    };
    expect(restoreGame(swapped)).toBeNull();
  });

  it("would otherwise have restored a different game in silence", () => {
    // Same swap, but with the capture counts stripped — the pre-check schema.
    // It restores, and the board it produces is not the board that was saved:
    // proof that the counts are doing the work, not the legality check.
    const states = play(true);
    const saved = snapshotGame(
      snapshotInput({
        states,
        cursor: states.length - 1,
        variantId: "custom",
        customRules: { ...CUSTOM_RULE_DEFAULTS, throneHostileToSoldiers: false },
      }),
    );
    const uncounted: SavedGame = {
      ...saved,
      moves: saved.moves.map(([a, b, c, d]) => [a, b, c, d] as [number, number, number, number]),
    };
    const restored = restoreGame(uncounted);
    expect(restored).not.toBeNull();
    expect(restored!.states[5].board).not.toEqual(states[5].board);
  });

  it("rejects a save whose stored capture count is simply wrong", () => {
    const saved = snapshotGame(snapshotInput());
    const [a, b, c, d] = saved.moves[0];
    const lying: SavedGame = { ...saved, moves: [[a, b, c, d, 3], ...saved.moves.slice(1)] };
    expect(restoreGame(lying)).toBeNull();
  });

  it("still restores a save written before capture counts existed", () => {
    const saved = snapshotGame(snapshotInput());
    const old: SavedGame = {
      ...saved,
      moves: saved.moves.map(([a, b, c, d]) => [a, b, c, d] as [number, number, number, number]),
    };
    const restored = restoreGame(old);
    expect(restored).not.toBeNull();
    expect(restored!.states).toHaveLength(saved.moves.length + 1);
  });

  it("accepts the counts through a full parse, and rejects a malformed one", () => {
    const now = Date.now();
    const raw = serializeGame(snapshotGame(snapshotInput(), now));
    expect(parseSavedGame(raw, now)!.moves[0]).toHaveLength(5);
    const bad = (moves: unknown) =>
      parseSavedGame(JSON.stringify({ ...JSON.parse(raw), moves, cursor: 1 }), now);
    expect(bad([[0, 3, 0, 2, 9]])).toBeNull(); // more captures than a move can make
    expect(bad([[0, 3, 0, 2, -1]])).toBeNull();
    expect(bad([[0, 3, 0, 2, 1, 1]])).toBeNull();
    expect(bad([[0, 3, 0, 2, 1]])).not.toBeNull();
  });
});

// ── localStorage wrappers ────────────────────────────────────────────────────

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

describe("storage wrappers", () => {
  beforeEach(() => {
    (globalThis as { localStorage: Storage }).localStorage =
      new MemoryStorage() as unknown as Storage;
  });

  it("saves and loads under the versioned key", () => {
    const saved = snapshotGame(snapshotInput());
    saveGame(saved);
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeTruthy();
    expect(loadSavedGame()).toEqual(saved);
    expect(loadResumableGame()!.states).toHaveLength(saved.moves.length + 1);
  });

  it("clears a corrupt save on sight rather than leaving it to rot", () => {
    localStorage.setItem(GAME_STORAGE_KEY, "{ half a game");
    expect(loadSavedGame()).toBeNull();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });

  it("clears a save that parses but cannot be replayed", () => {
    const saved = snapshotGame(snapshotInput());
    saveGame({ ...saved, moves: [[0, 0, 6, 6]] });
    expect(loadResumableGame()).toBeNull();
    expect(localStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });

  it("does not offer a fresh board with nothing played as resumable", () => {
    saveGame(snapshotGame(snapshotInput({ states: [initialState()], cursor: 0 })));
    expect(loadResumableGame()).toBeNull();
  });

  it("does offer a fresh board when a match score is riding on it", () => {
    const match = recordMatchGame(newMatch(2), "attackers_win_capture", 30);
    saveGame(
      snapshotGame(
        snapshotInput({ states: [initialState()], cursor: 0, match, playMode: "hotseat" }),
      ),
    );
    expect(loadResumableGame()!.match).toEqual(match);
  });

  it("clearSavedGame removes the key", () => {
    saveGame(snapshotGame(snapshotInput()));
    clearSavedGame();
    expect(loadSavedGame()).toBeNull();
  });

  it("survives localStorage being unavailable", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked in private mode");
      },
    });
    expect(() => saveGame(snapshotGame(snapshotInput()))).not.toThrow();
    expect(loadSavedGame()).toBeNull();
    expect(() => clearSavedGame()).not.toThrow();
  });
});
