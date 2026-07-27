import { describe, expect, it } from "vitest";
import {
  GAMES_PER_SET,
  newSet,
  otherPlayer,
  recordGame,
  standing,
  type MatchSet,
} from "./matchSet";
import type { GameStatus } from "./types";

// Convenience: play out a whole set from a list of [status, moves] games.
function playSet(
  games: Array<[GameStatus, number]>,
  firstAttacker: "p1" | "p2" = "p1",
): MatchSet {
  let set = newSet(firstAttacker);
  for (const [status, moves] of games) set = recordGame(set, status, moves);
  return set;
}

describe("match set", () => {
  it("starts with Player 1 behind the raiders and no results", () => {
    const set = newSet();
    expect(set.attackersPlayer).toBe("p1");
    expect(set.defendersPlayer).toBe("p2");
    expect(set.results).toHaveLength(0);
    expect(standing(set).complete).toBe(false);
    expect(standing(set).winner).toBe(null);
  });

  it("swaps the side assignments after each game", () => {
    let set = newSet();
    set = recordGame(set, "defenders_win_escape", 20);
    expect(set.attackersPlayer).toBe("p2");
    expect(set.defendersPlayer).toBe("p1");
  });

  it("attributes a win to the player who held the winning side", () => {
    // Game 1: P1 = raiders, P2 = king. King escapes → P2 wins.
    const set = playSet([["defenders_win_escape", 18]]);
    const r = set.results[0];
    expect(r.winner).toBe("defenders");
    expect(r.winningPlayer).toBe("p2");
    expect(r.moves).toBe(18);
    const s = standing(set);
    expect(s.wins).toEqual({ p1: 0, p2: 1 });
    expect(s.sideWins).toEqual({ attackers: 0, defenders: 1 });
  });

  it("records a draw as nobody's win", () => {
    const set = playSet([["draw_repetition", 40]]);
    expect(set.results[0].winner).toBe("draw");
    expect(set.results[0].winningPlayer).toBe(null);
    expect(standing(set).wins).toEqual({ p1: 0, p2: 0 });
  });

  it("counts side wins across the set (king vs raiders counters)", () => {
    // Each player wins their king game (the strong side wins twice).
    const set = playSet([
      ["defenders_win_escape", 22], // g1: P2 (king) wins
      ["defenders_win_escape", 30], // g2 after swap: P1 (king) wins
    ]);
    const s = standing(set);
    expect(s.sideWins).toEqual({ attackers: 0, defenders: 2 });
    expect(s.wins).toEqual({ p1: 1, p2: 1 });
  });

  it("breaks a level set by fewest moves to victory", () => {
    // 1–1 on games; P2 won in 22, P1 won in 30 → P2 wins the set.
    const set = playSet([
      ["defenders_win_escape", 22], // P2 wins as king
      ["defenders_win_escape", 30], // P1 wins as king
    ]);
    const s = standing(set);
    expect(s.complete).toBe(true);
    expect(s.decidedByMoves).toBe(true);
    expect(s.winner).toBe("p2");
    expect(s.fastestWin).toEqual({ p1: 30, p2: 22 });
  });

  it("gives the set to a player who wins both games outright", () => {
    // P1 wins as raiders (g1), then wins as king (g2) → 2–0, no tiebreaker.
    const set = playSet([
      ["attackers_win_capture", 15], // P1 = raiders, wins
      ["defenders_win_escape", 25], // after swap P1 = king, wins
    ]);
    const s = standing(set);
    expect(s.winner).toBe("p1");
    expect(s.decidedByMoves).toBe(false);
    expect(s.wins).toEqual({ p1: 2, p2: 0 });
  });

  it("draws the set when neither player wins a game", () => {
    const s = standing(playSet([["draw_repetition", 40], ["draw_repetition", 44]]));
    expect(s.complete).toBe(true);
    expect(s.winner).toBe("draw");
    expect(s.decidedByMoves).toBe(false);
  });

  it("draws a level set when the winning move counts are equal", () => {
    const s = standing(playSet([
      ["defenders_win_escape", 24],
      ["defenders_win_escape", 24],
    ]));
    expect(s.winner).toBe("draw");
    expect(s.decidedByMoves).toBe(true);
  });

  it("awards the set to the single winner when the other game is drawn", () => {
    const s = standing(playSet([
      ["attackers_win_capture", 19], // P1 wins as raiders
      ["draw_repetition", 50], // drawn
    ]));
    expect(s.wins).toEqual({ p1: 1, p2: 0 });
    expect(s.winner).toBe("p1");
    expect(s.decidedByMoves).toBe(false);
  });

  it("only completes after a full set of games", () => {
    expect(standing(playSet([["defenders_win_escape", 20]])).complete).toBe(false);
    expect(standing(playSet([["defenders_win_escape", 20]])).winner).toBe(null);
    expect(GAMES_PER_SET).toBe(2);
  });

  it("otherPlayer flips the player id", () => {
    expect(otherPlayer("p1")).toBe("p2");
    expect(otherPlayer("p2")).toBe("p1");
  });
});
