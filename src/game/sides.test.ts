import { describe, expect, it } from "vitest";
import { aiSideOf, clockPlacement, humanSideOf, opposite } from "./sides";
import { allMoves, applyMove, initialState, sideOf } from "./rules";
import { chooseMove } from "./engine";
import { VARIANTS } from "./variants";
import {
  parseSavedGame,
  restoreGame,
  serializeGame,
  snapshotGame,
  type SavedGame,
} from "./persist";
import { CUSTOM_RULE_DEFAULTS } from "./variants";
import type { PlayMode, Side } from "./types";

const walker = VARIANTS.walker;
const SIDES: Side[] = ["attackers", "defenders"];

describe("play mode → sides", () => {
  it("gives the human the side they picked and the computer the other one", () => {
    expect(humanSideOf("attackers")).toBe("attackers");
    expect(aiSideOf("attackers")).toBe("defenders");
    expect(humanSideOf("defenders")).toBe("defenders");
    expect(aiSideOf("defenders")).toBe("attackers");
  });

  it("has no human or AI side over the board", () => {
    expect(humanSideOf("hotseat")).toBeNull();
    expect(aiSideOf("hotseat")).toBeNull();
  });

  it("never puts the human and the computer on the same side", () => {
    for (const s of SIDES) {
      expect(aiSideOf(s)).not.toBe(humanSideOf(s));
      expect(aiSideOf(s)).toBe(opposite(s));
    }
  });
});

describe("who moves first", () => {
  // The raiders always hold the initiative, so picking the king means watching
  // the computer open — the case that never happened while the overlay only
  // ever handed out the defenders.
  it("opens with the raiders whichever side the human took", () => {
    expect(initialState().turn).toBe("attackers");
  });

  it("has the computer move first when the human takes the king", () => {
    expect(initialState().turn).toBe(aiSideOf("defenders"));
    expect(initialState().turn).not.toBe(humanSideOf("defenders"));
  });

  it("has the human move first when the human takes the raiders", () => {
    expect(initialState().turn).toBe(humanSideOf("attackers"));
    expect(initialState().turn).not.toBe(aiSideOf("attackers"));
  });
});

describe("clock placement", () => {
  it("seats the human at the bottom whichever side they took", () => {
    for (const s of SIDES) {
      const { top, bottom } = clockPlacement(s);
      expect(bottom).toBe(humanSideOf(s));
      expect(top).toBe(aiSideOf(s));
    }
  });

  it("puts the raiders on top over the board (they move first)", () => {
    expect(clockPlacement("hotseat")).toEqual({ top: "attackers", bottom: "defenders" });
  });

  it("always shows two different sides", () => {
    for (const m of ["attackers", "defenders", "hotseat"] as PlayMode[]) {
      const { top, bottom } = clockPlacement(m);
      expect(top).not.toBe(bottom);
    }
  });
});

describe("both sides drive the AI", () => {
  // The AI's side is the whole of the wiring: `aiSideOf(playMode)` gates the
  // search, so a game is played out under each play mode and every AI reply is
  // checked to be a legal move by a piece the AI actually owns.
  for (const mode of SIDES) {
    it(`plays a legal ${aiSideOf(mode)} game when the human takes the ${mode}`, () => {
      const ai = aiSideOf(mode)!;
      const human = humanSideOf(mode)!;
      let state = initialState();
      let aiMoves = 0;

      for (let ply = 0; ply < 12 && state.status === "playing"; ply++) {
        const legal = allMoves(state.board, state.turn, walker);
        expect(legal.length).toBeGreaterThan(0);
        if (state.turn === ai) {
          const move = chooseMove(state, "easy", walker, () => 0.99); // above the blunder rate
          expect(move).not.toBeNull();
          // The move is legal, and the piece moved belongs to the AI's side.
          expect(
            legal.some(
              (m) =>
                m.from.row === move!.from.row &&
                m.from.col === move!.from.col &&
                m.to.row === move!.to.row &&
                m.to.col === move!.to.col,
            ),
          ).toBe(true);
          expect(sideOf(state.board[move!.from.row][move!.from.col])).toBe(ai);
          state = applyMove(state, move!, walker);
          aiMoves++;
        } else {
          // Stand in for the person: any legal move by their own pieces.
          const move = legal[0];
          expect(sideOf(state.board[move.from.row][move.from.col])).toBe(human);
          state = applyMove(state, move, walker);
        }
      }

      expect(aiMoves).toBeGreaterThan(0);
    });
  }
});

describe("the chosen side survives a refresh", () => {
  // Session 0 persists the setup and Session 1 folds it into the resumable
  // game; both must hold for the raiders now that they are reachable.
  for (const mode of SIDES) {
    it(`restores a game played as the ${mode}`, () => {
      const opening = initialState();
      const first = allMoves(opening.board, opening.turn, walker)[0];
      const states = [opening, applyMove(opening, first, walker)];
      const wire = serializeGame(
        snapshotGame({
          states,
          cursor: 1,
          variantId: "walker",
          customRules: CUSTOM_RULE_DEFAULTS,
          playMode: mode,
          difficulty: "medium",
          recorded: false,
          clock: null,
          match: null,
          gamesPerSet: 2,
          names: { p1: "", p2: "" },
        }),
      );
      const parsed = parseSavedGame(wire);
      expect(parsed).not.toBeNull();
      const restored = restoreGame(parsed as SavedGame);
      expect(restored).not.toBeNull();
      expect(restored!.playMode).toBe(mode);
      // …and the derived sides come back with it.
      expect(humanSideOf(restored!.playMode)).toBe(mode);
      expect(aiSideOf(restored!.playMode)).toBe(opposite(mode));
      expect(restored!.states).toHaveLength(2);
    });
  }
});
