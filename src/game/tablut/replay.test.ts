import { describe, expect, it } from "vitest";
import { allMoves, applyMove, initialState, isGameOver } from "./rules";
import { findLegalMove, replayPlies, type PlyInput } from "./replay";
import type { GameState, Square } from "./types";
import { VARIANTS } from "./variants";

const baseline = VARIANTS.tablut;

/** `e5` → `{row: 4, col: 4}`. Ranks count up from the bottom, files from `a`. */
const sq = (name: string): Square => ({
  row: 9 - Number(name.slice(1)),
  col: name.charCodeAt(0) - 97,
});
const ply = (from: string, to: string, captures?: number | null): PlyInput => ({
  from: sq(from),
  to: sq(to),
  captures,
});

describe("replayPlies: rebuild a Tablut game from an untrusted move list", () => {
  it("returns the opening position for an empty list", () => {
    const r = replayPlies([], baseline);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual([initialState(baseline)]);
  });

  it("yields one state per ply, in order, starting with White", () => {
    const r = replayPlies([ply("e7", "b7"), ply("e8", "b8"), ply("e3", "b3")], baseline);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.states).toHaveLength(4);
    expect(r.states.map((s) => s.moveCount)).toEqual([0, 1, 2, 3]);
    expect(r.states.map((s) => s.turn)).toEqual([
      "defenders",
      "attackers",
      "defenders",
      "attackers",
    ]);
  });

  it("reproduces exactly what applyMove would have built move by move", () => {
    // The point of replaying rather than restoring a board: the timeline is
    // engine output, so history, hashes, capture counts and status all agree.
    const expected: GameState[] = [initialState(baseline)];
    const plies: PlyInput[] = [];
    let s = expected[0];
    for (let i = 0; i < 24 && !isGameOver(s.status); i++) {
      const move = allMoves(s.board, s.turn, baseline)[i % 5];
      plies.push({ from: move.from, to: move.to });
      s = applyMove(s, move, baseline);
      expected.push(s);
    }
    const r = replayPlies(plies, baseline);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual(expected);
  });

  it("rejects the first illegal ply and says which one it was", () => {
    const r = replayPlies([ply("e7", "b7"), ply("e7", "b7")], baseline);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("illegal_move");
    expect(r.error.index).toBe(1);
    expect(r.error.ply).toBe("e7-b7");
  });

  it("rejects a move that belongs to the other side", () => {
    // e8-b8 is an attacker move offered as White's opening ply.
    const r = replayPlies([ply("e8", "b8")], baseline);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("illegal_move");
  });

  it("fails at ply 0 when replayed under a ruleset that moves the other side first", () => {
    // The opening position depends on the ruleset here, which Brandubh's does
    // not. A move list paired with the wrong first mover is caught immediately
    // rather than drifting.
    const wrongWayRound = { ...baseline, firstMove: "attackers" as const };
    const r = replayPlies([ply("e7", "b7")], wrongWayRound);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.index).toBe(0);
  });

  it("rejects plies appended after the game has been decided", () => {
    // White clears the north column, walks the king up it and steps him onto the
    // rim at c9 — an ordinary edge square, which is the whole difference from
    // Brandubh's four corners.
    const escape = [
      "e7-b7",
      "a6-a7",
      "e6-h6",
      "a7-a8",
      "e5-e7",
      "a8-a9",
      "e7-c7",
      "a9-b9",
      "c7-c9",
    ];
    const plies = escape.map((m) => ply(m.slice(0, m.indexOf("-")), m.slice(m.indexOf("-") + 1)));
    const won = replayPlies(plies, baseline);
    expect(won.ok).toBe(true);
    if (won.ok) expect(won.states[won.states.length - 1].status).toBe("defenders_win_escape");

    const r = replayPlies([...plies, ply("b9", "c9")], baseline);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("moves_after_end");
      expect(r.error.index).toBe(escape.length);
    }
  });

  it("cross-checks a claimed capture count and reports both numbers", () => {
    const r = replayPlies([ply("e7", "b7", 2)], baseline);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("capture_mismatch");
    expect(r.error.claimedCaptures).toBe(2);
    expect(r.error.actualCaptures).toBe(0);
  });

  it("accepts a ply that makes no claim about captures", () => {
    expect(replayPlies([ply("e7", "b7", null)], baseline).ok).toBe(true);
    expect(replayPlies([ply("e7", "b7")], baseline).ok).toBe(true);
  });

  it("resolves the ruleset independently on every replay", () => {
    const plies = [ply("e7", "b7"), ply("e8", "b8")];
    for (const rules of Object.values(VARIANTS)) {
      const r = replayPlies(plies, rules);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.states[2].status).toBe("playing");
    }
  });

  it("never mutates the caller's input", () => {
    const plies = [ply("e7", "b7")];
    const before = JSON.stringify(plies);
    replayPlies(plies, baseline);
    expect(JSON.stringify(plies)).toBe(before);
  });
});

describe("findLegalMove", () => {
  it("returns the engine's own Move rather than the pair it was handed", () => {
    const state = initialState(baseline);
    const move = findLegalMove(state, sq("e7"), sq("b7"), baseline);
    expect(move).not.toBeNull();
    expect(move).toEqual(
      allMoves(state.board, "defenders", baseline).find(
        (m) => m.from.row === 2 && m.from.col === 4 && m.to.row === 2 && m.to.col === 1,
      ),
    );
  });

  it("returns null rather than fabricating a move the rules forbid", () => {
    const state = initialState(baseline);
    expect(findLegalMove(state, sq("e7"), sq("e5"), baseline)).toBeNull(); // the throne, occupied
    expect(findLegalMove(state, sq("e7"), sq("d6"), baseline)).toBeNull(); // diagonal
    expect(findLegalMove(state, sq("b7"), sq("b6"), baseline)).toBeNull(); // empty square
  });
});
