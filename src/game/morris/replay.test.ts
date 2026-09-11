import { describe, expect, it } from "vitest";
import { allMoves, applyMove, initialState, isGameOver, parseMoveName } from "./rules";
import { EXTERNAL_STATUSES, findLegalMove, replayPlies, type PlyInput } from "./replay";
import type { GameState } from "./types";
import { VARIANTS } from "./variants";

const morris = VARIANTS["morris-gasser-1"];

/** A move token (`d7`, `a7-a4`, `d7xa7`) as an untrusted ply — the same grammar
 *  the file format uses, so the fixtures read like the files do. */
const ply = (token: string): PlyInput => {
  const m = parseMoveName(token);
  expect(m, `${token} should parse`).not.toBeNull();
  return m!;
};

/**
 * Five legal plies from the opening, White first, ending in a mill that takes a
 * stone: White builds the `d7`–`d6`–`d5` spoke while Black occupies the left
 * outer edge. The fifth ply is the shape this board adds to the family — a turn
 * that carries its own removal.
 */
const MILL = ["d7", "a7", "d6", "a4", "d5xa7"];

describe("replayPlies: rebuild a Morris game from an untrusted move list", () => {
  it("returns the opening position for an empty list", () => {
    const r = replayPlies([], morris);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual([initialState(morris)]);
  });

  it("yields one state per ply, in order, starting with White", () => {
    const r = replayPlies(["d7", "a7", "d6"].map(ply), morris);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.states).toHaveLength(4);
    expect(r.states.map((s) => s.turn)).toEqual(["white", "black", "white", "black"]);
    // Placements spend the hand; nothing else in this game does.
    expect(r.states.map((s) => s.inHand.white)).toEqual([9, 8, 8, 7]);
    expect(r.states.map((s) => s.inHand.black)).toEqual([9, 9, 8, 8]);
  });

  it("replays a mill's removal as part of the move that closed it", () => {
    const r = replayPlies(MILL.map(ply), morris);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tip = r.states[r.states.length - 1];
    // a7 is gone, and Black is a stone down on the board while its hand is
    // untouched — the removal is the move's, not a second half-turn.
    expect(tip.board[0]).toBe(0);
    expect(tip.history[4].formedMill).toBe(true);
    expect(tip.history[4].move.remove).toBe(0);
    expect(tip.sinceMill).toBe(0);
  });

  it("reproduces exactly what applyMove would have built move by move", () => {
    // The point of replaying rather than restoring a board: the timeline is
    // engine output, so history, hashes, removals and status all agree.
    const expected: GameState[] = [initialState(morris)];
    const plies: PlyInput[] = [];
    let s = expected[0];
    for (let i = 0; i < 40 && !isGameOver(s.status); i++) {
      const moves = allMoves(s, morris);
      const move = moves[i % moves.length];
      plies.push({ from: move.from, to: move.to, remove: move.remove });
      s = applyMove(s, move, morris);
      expected.push(s);
    }
    const r = replayPlies(plies, morris);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.states).toEqual(expected);
  });

  it("rejects the first illegal ply and says which one it was", () => {
    const r = replayPlies([ply("d7"), ply("d7")], morris);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("illegal_move");
    expect(r.error.index).toBe(1);
    expect(r.error.ply).toBe("d7");
  });

  it("rejects a removal the rules do not allow", () => {
    // The mill is real and `a7` is a legal victim; `g1` holds nothing at all, so
    // the turn is a different turn and not the same turn mis-annotated. This is
    // the check that replaces the tafl format's capture-count cross-check.
    const r = replayPlies(["d7", "a7", "d6", "a4", "d5xg1"].map(ply), morris);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("illegal_move");
      expect(r.error.index).toBe(4);
      expect(r.error.ply).toBe("d5xg1");
    }
  });

  it("rejects a mill-closing move that takes nothing", () => {
    const r = replayPlies(["d7", "a7", "d6", "a4", "d5"].map(ply), morris);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("illegal_move");
  });

  it("rejects a step in the placing phase", () => {
    // `a7-a4` is a move, and no stone may move while a hand holds any.
    const r = replayPlies([ply("d7"), ply("a7"), ply("d7-d6")], morris);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.index).toBe(2);
  });

  it("replays the colours the other way round under the other first mover", () => {
    // Worth pinning because it is the one place this board is *weaker* than the
    // three tafl ones. There, a move list paired with the wrong `firstMove`
    // fails at ply 0: the opening position is asymmetric, so White's opening
    // move is not a move Black has. A Morris placement names a point and
    // nothing else, and an empty board is colour-blind — so the same list
    // replays legally either way and produces the mirrored game.
    //
    // It is not a hole in the format: the ruleset travels with the file
    // (`[Variant]`, or `[Rules]` for a custom one), so nothing infers it from
    // the moves. But it does mean the *replay* cannot be the thing that catches
    // a hand-edited `firstMove`, which is why this is a test and not a comment.
    const blackFirst = { ...morris, firstMove: "black" as const };
    const tokens = ["d7", "a7", "d6", "a4", "d5xa7"];
    const asWhite = replayPlies(tokens.map(ply), morris);
    const asBlack = replayPlies(tokens.map(ply), blackFirst);
    expect(asWhite.ok && asBlack.ok).toBe(true);
    if (!asWhite.ok || !asBlack.ok) return;
    const w = asWhite.states[5];
    const b = asBlack.states[5];
    expect(b.board).toEqual(w.board.map((c) => (c === 1 ? 2 : c === 2 ? 1 : 0)));
    expect(b.turn).toBe("white");
    expect(w.turn).toBe("black");
  });

  it("rejects plies appended after the game has been decided", () => {
    // Played out rather than hand-written: a Morris game needs eighteen
    // placements before anything can even be blocked, so the shortest honest
    // route to a terminal position is to let the engine's own move list run.
    // A first-legal-move walk always terminates — a mill removes a stone and
    // stones never come back, and the fifty-move rule catches the rest.
    const plies: PlyInput[] = [];
    let s = initialState(morris);
    for (let i = 0; i < 4000 && !isGameOver(s.status); i++) {
      const move = allMoves(s, morris)[0];
      plies.push({ from: move.from, to: move.to, remove: move.remove });
      s = applyMove(s, move, morris);
    }
    expect(isGameOver(s.status)).toBe(true);

    const won = replayPlies(plies, morris);
    expect(won.ok).toBe(true);
    if (won.ok) expect(won.states[won.states.length - 1].status).toBe(s.status);

    const r = replayPlies([...plies, ply("a7")], morris);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("moves_after_end");
      expect(r.error.index).toBe(plies.length);
    }
  });

  it("resolves the ruleset independently on every replay", () => {
    const plies = MILL.map(ply);
    for (const rules of Object.values(VARIANTS)) {
      const r = replayPlies(plies, rules);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.states[5].status).toBe("playing");
    }
  });

  it("never mutates the caller's input", () => {
    const plies = MILL.map(ply);
    const before = JSON.stringify(plies);
    replayPlies(plies, morris);
    expect(JSON.stringify(plies)).toBe(before);
  });
});

describe("findLegalMove", () => {
  it("returns the engine's own Move rather than the triple it was handed", () => {
    const state = initialState(morris);
    const move = findLegalMove(state, { from: null, to: 1, remove: null }, morris);
    expect(move).not.toBeNull();
    expect(move).toEqual(allMoves(state, morris).find((m) => m.from === null && m.to === 1));
  });

  it("returns null rather than fabricating a move the rules forbid", () => {
    const state = initialState(morris);
    // A step while the hand is full, a removal with no mill, and a point that
    // does not exist.
    expect(findLegalMove(state, { from: 0, to: 1, remove: null }, morris)).toBeNull();
    expect(findLegalMove(state, { from: null, to: 1, remove: 0 }, morris)).toBeNull();
    expect(findLegalMove(state, { from: null, to: 99, remove: null }, morris)).toBeNull();
  });

  it("matches the removal as strictly as the two points", () => {
    const four = replayPlies(["d7", "a7", "d6", "a4"].map(ply), morris);
    expect(four.ok).toBe(true);
    if (!four.ok) return;
    const state = four.states[4];
    // The mill is d5; both black stones are legal victims, and the move that
    // takes a4 is not the move that takes a7.
    const takesA7 = findLegalMove(state, { from: null, to: 17, remove: 0 }, morris);
    const takesA4 = findLegalMove(state, { from: null, to: 17, remove: 7 }, morris);
    expect(takesA7?.remove).toBe(0);
    expect(takesA4?.remove).toBe(7);
    expect(findLegalMove(state, { from: null, to: 17, remove: 4 }, morris)).toBeNull();
  });
});

describe("EXTERNAL_STATUSES", () => {
  it("names exactly the endings a move list cannot imply", () => {
    expect([...EXTERNAL_STATUSES].sort()).toEqual([
      "black_win_resign",
      "black_win_time",
      "white_win_resign",
      "white_win_time",
    ]);
  });

  it("leaves every ending the moves *do* imply out of the set", () => {
    // A stone count, a block, a repetition and the fifty-move rule are all
    // recomputed by `applyMove`, so restoring them from a file would be
    // trusting input over the engine.
    for (const status of [
      "white_win_stones",
      "black_win_stones",
      "white_win_blocked",
      "black_win_blocked",
      "draw_repetition",
      "draw_no_mill",
      "playing",
    ] as const) {
      expect(EXTERNAL_STATUSES.has(status)).toBe(false);
    }
  });
});
