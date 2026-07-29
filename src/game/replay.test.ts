import { describe, expect, it } from "vitest";
import { allMoves, applyMove, initialState, isGameOver } from "./engine";
import { findLegalMove, replayPlies, type PlyInput } from "./replay";
import type { GameState, Square } from "./types";
import { VARIANTS } from "./variants";

const sq = (name: string): Square => ({
  row: 7 - Number(name[1]),
  col: name.charCodeAt(0) - 97,
});
const ply = (from: string, to: string, captures?: number | null): PlyInput => ({
  from: sq(from),
  to: sq(to),
  captures,
});

describe("replayPlies: rebuild a game from an untrusted move list", () => {
  it("returns the opening position for an empty list", () => {
    const r = replayPlies([], VARIANTS.wtf);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual([initialState()]);
  });

  it("yields one state per ply, in order", () => {
    const r = replayPlies([ply("d1", "c1"), ply("d3", "c3"), ply("d7", "e7")], VARIANTS.wtf);
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
    const rules = VARIANTS.walker;
    const expected: GameState[] = [initialState()];
    const plies: PlyInput[] = [];
    let s = expected[0];
    for (let i = 0; i < 24 && !isGameOver(s.status); i++) {
      const move = allMoves(s.board, s.turn, rules)[i % 5];
      plies.push({ from: move.from, to: move.to });
      s = applyMove(s, move, rules);
      expected.push(s);
    }
    const r = replayPlies(plies, rules);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual(expected);
  });

  it("rejects the first illegal ply and says which one it was", () => {
    const r = replayPlies([ply("d1", "c1"), ply("d1", "c1")], VARIANTS.wtf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("illegal_move");
    expect(r.error.index).toBe(1);
    expect(r.error.ply).toBe("d1-c1");
  });

  it("rejects a move that belongs to the other side", () => {
    // d3-c3 is a defender move offered as the attackers' opening ply.
    const r = replayPlies([ply("d3", "c3")], VARIANTS.wtf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("illegal_move");
  });

  it("rejects plies appended after the game has been decided", () => {
    const escape = ["a4-a3", "d5-c5", "a3-a2", "d4-d5", "a2-b2", "d5-g5", "b2-c2", "g5-g7"];
    const plies = escape.map((m) => ply(m.slice(0, 2), m.slice(3)));
    const won = replayPlies(plies, VARIANTS.wtf);
    expect(won.ok).toBe(true);
    if (won.ok) expect(won.states[won.states.length - 1].status).toBe("defenders_win_escape");

    const r = replayPlies([...plies, ply("c2", "c3")], VARIANTS.wtf);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("moves_after_end");
      expect(r.error.index).toBe(8);
    }
  });

  it("cross-checks a claimed capture count and reports both numbers", () => {
    const r = replayPlies([ply("d1", "c1", 2)], VARIANTS.wtf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("capture_mismatch");
    expect(r.error.claimedCaptures).toBe(2);
    expect(r.error.actualCaptures).toBe(0);
  });

  it("accepts a ply that makes no claim about captures", () => {
    expect(replayPlies([ply("d1", "c1", null)], VARIANTS.wtf).ok).toBe(true);
    expect(replayPlies([ply("d1", "c1")], VARIANTS.wtf).ok).toBe(true);
  });

  it("recomputes status from the ruleset, so the same list can differ by variant", () => {
    // A move list is only meaningful together with its rules: a soldier sliding
    // through the empty throne is legal in both presets here, but the two
    // rulesets are still resolved independently on every replay.
    const plies = [ply("d1", "c1"), ply("d3", "c3")];
    for (const rules of Object.values(VARIANTS)) {
      const r = replayPlies(plies, rules);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.states[2].status).toBe("playing");
    }
  });

  it("never mutates the caller's input", () => {
    const plies = [ply("d1", "c1")];
    const before = JSON.stringify(plies);
    replayPlies(plies, VARIANTS.wtf);
    expect(JSON.stringify(plies)).toBe(before);
  });
});

describe("findLegalMove", () => {
  it("returns the engine's own Move, captures attached", () => {
    const state = initialState();
    const move = findLegalMove(state, sq("d1"), sq("c1"), VARIANTS.wtf);
    expect(move).not.toBeNull();
    expect(move).toEqual(allMoves(state.board, "attackers", VARIANTS.wtf).find(
      (m) => m.from.row === 6 && m.from.col === 3 && m.to.row === 6 && m.to.col === 2,
    ));
  });

  it("returns null rather than fabricating a move the rules forbid", () => {
    const state = initialState();
    expect(findLegalMove(state, sq("d1"), sq("a1"), VARIANTS.wtf)).toBeNull(); // corner
    expect(findLegalMove(state, sq("d1"), sq("c2"), VARIANTS.wtf)).toBeNull(); // diagonal
    expect(findLegalMove(state, sq("c1"), sq("c2"), VARIANTS.wtf)).toBeNull(); // empty square
  });
});
