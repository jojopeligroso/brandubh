import { describe, expect, it } from "vitest";
import { allMoves, applyMove, initialState, isGameOver } from "./rules";
import { findLegalMove, replayPlies, type PlyInput } from "./replay";
import type { GameState, Square } from "./types";
import { VARIANTS } from "./variants";

const cph = VARIANTS.copenhagen;

/** `f6` → `{row: 5, col: 5}`. Ranks count up from the bottom, files from `a`.
 *  Two-digit ranks are real here — `k11` is the top-right corner — so the slice
 *  takes everything after the file letter rather than one character. */
const sq = (name: string): Square => ({
  row: 11 - Number(name.slice(1)),
  col: name.charCodeAt(0) - 97,
});
const ply = (from: string, to: string, captures?: number | null): PlyInput => ({
  from: sq(from),
  to: sq(to),
  captures,
});

describe("replayPlies: rebuild a Copenhagen game from an untrusted move list", () => {
  it("returns the opening position for an empty list", () => {
    const r = replayPlies([], cph);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual([initialState(cph)]);
  });

  it("yields one state per ply, in order, starting with Black", () => {
    // The reverse of the Tablut twin of this test, and the same way round as
    // Brandubh: Copenhagen gives the attackers the first move (rule 2).
    const r = replayPlies([ply("d1", "d3"), ply("e7", "b7"), ply("e1", "e3")], cph);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.states).toHaveLength(4);
    expect(r.states.map((s) => s.moveCount)).toEqual([0, 1, 2, 3]);
    expect(r.states.map((s) => s.turn)).toEqual([
      "attackers",
      "defenders",
      "attackers",
      "defenders",
    ]);
  });

  it("reproduces exactly what applyMove would have built move by move", () => {
    // The point of replaying rather than restoring a board: the timeline is
    // engine output, so history, hashes, capture counts and status all agree.
    const expected: GameState[] = [initialState(cph)];
    const plies: PlyInput[] = [];
    let s = expected[0];
    for (let i = 0; i < 24 && !isGameOver(s.status); i++) {
      const move = allMoves(s.board, s.turn, cph)[i % 5];
      plies.push({ from: move.from, to: move.to });
      s = applyMove(s, move, cph);
      expected.push(s);
    }
    const r = replayPlies(plies, cph);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual(expected);
  });

  it("rejects the first illegal ply and says which one it was", () => {
    const r = replayPlies([ply("d1", "d3"), ply("d1", "d3")], cph);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("illegal_move");
    expect(r.error.index).toBe(1);
    expect(r.error.ply).toBe("d1-d3");
  });

  it("rejects a move that belongs to the other side", () => {
    // e7-b7 is a defender move offered as Black's opening ply.
    const r = replayPlies([ply("e7", "b7")], cph);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("illegal_move");
  });

  it("fails at ply 0 when replayed under a ruleset that moves the other side first", () => {
    // The opening position depends on the ruleset, because `firstMove` is a flag
    // the custom editor can turn round. A move list paired with the wrong first
    // mover is caught immediately rather than drifting.
    const wrongWayRound = { ...cph, firstMove: "defenders" as const };
    const r = replayPlies([ply("d1", "d3")], wrongWayRound);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.index).toBe(0);
  });

  it("rejects plies appended after the game has been decided", () => {
    // White opens the c-file, walks the king out of the diamond onto c6, up to
    // c11 and into the a11 corner, while Black marches four men up the board.
    // Twelve plies is about the shortest an 11×11 escape can be: the king starts
    // walled in by his own diamond, so three defenders have to move before he can
    // take a step at all.
    const escape = [
      "d1-d3",
      "e7-b7",
      "e1-e3",
      "d6-d8",
      "g1-g3",
      "e6-e8",
      "h1-h3",
      "f6-c6",
      "d3-d4",
      "c6-c11",
      "e3-e4",
      "c11-a11",
    ];
    const plies = escape.map((m) => ply(m.slice(0, m.indexOf("-")), m.slice(m.indexOf("-") + 1)));
    const won = replayPlies(plies, cph);
    expect(won.ok).toBe(true);
    if (won.ok) expect(won.states[won.states.length - 1].status).toBe("defenders_win_escape");

    const r = replayPlies([...plies, ply("e4", "e5")], cph);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("moves_after_end");
      expect(r.error.index).toBe(escape.length);
    }
  });

  it("cross-checks a claimed capture count and reports both numbers", () => {
    const r = replayPlies([ply("d1", "d3", 2)], cph);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("capture_mismatch");
    expect(r.error.claimedCaptures).toBe(2);
    expect(r.error.actualCaptures).toBe(0);
  });

  it("accepts a ply that makes no claim about captures", () => {
    expect(replayPlies([ply("d1", "d3", null)], cph).ok).toBe(true);
    expect(replayPlies([ply("d1", "d3")], cph).ok).toBe(true);
  });

  it("resolves the ruleset independently on every replay", () => {
    const plies = [ply("d1", "d3"), ply("e7", "b7")];
    for (const rules of Object.values(VARIANTS)) {
      const r = replayPlies(plies, rules);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.states[2].status).toBe("playing");
    }
  });

  it("never mutates the caller's input", () => {
    const plies = [ply("d1", "d3")];
    const before = JSON.stringify(plies);
    replayPlies(plies, cph);
    expect(JSON.stringify(plies)).toBe(before);
  });
});

describe("findLegalMove", () => {
  it("returns the engine's own Move rather than the pair it was handed", () => {
    const state = initialState(cph);
    const move = findLegalMove(state, sq("d1"), sq("d3"), cph);
    expect(move).not.toBeNull();
    expect(move).toEqual(
      allMoves(state.board, "attackers", cph).find(
        (m) => m.from.row === 10 && m.from.col === 3 && m.to.row === 8 && m.to.col === 3,
      ),
    );
  });

  it("returns null rather than fabricating a move the rules forbid", () => {
    const state = initialState(cph);
    expect(findLegalMove(state, sq("d1"), sq("f6"), cph)).toBeNull(); // the throne, occupied
    expect(findLegalMove(state, sq("d1"), sq("e2"), cph)).toBeNull(); // diagonal
    expect(findLegalMove(state, sq("b3"), sq("b4"), cph)).toBeNull(); // empty square
    expect(findLegalMove(state, sq("d1"), sq("a1"), cph)).toBeNull(); // a restricted corner
  });
});
