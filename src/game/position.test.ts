import { describe, expect, it } from "vitest";
import {
  encodePosition,
  kingIsHome,
  parsePosition,
  stateFromBoard,
  validateBoard,
} from "./position";
import { allMoves, applyMove, initialState } from "./engine";
import { DEFAULT_VARIANT, VARIANTS } from "./variants";
import { BOARD_SIZE, type Board, type Piece } from "./types";

const rules = VARIANTS[DEFAULT_VARIANT];

const empty = (): Board =>
  Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));

const withKing = (row = 3, col = 3): Board => {
  const b = empty();
  b[row][col] = "king";
  return b;
};

const ok = (text: string) => {
  const r = parsePosition(text);
  if (!r.ok) throw new Error(`expected a position, got ${r.error.code}: ${r.error.detail}`);
  return r.state;
};
const err = (text: string) => {
  const r = parsePosition(text);
  if (r.ok) throw new Error("expected a rejection");
  return r.error;
};

describe("writing a position out", () => {
  it("encodes the opening", () => {
    const text = encodePosition(initialState());
    expect(text).toBe("3A3/3A3/3D3/AADKDAA/3D3/3A3/3A3 a");
  });

  it("names the side to move", () => {
    const state = initialState();
    expect(encodePosition(state).endsWith(" a")).toBe(true);
    expect(encodePosition({ ...state, turn: "defenders" }).endsWith(" d")).toBe(true);
  });

  it("runs empty squares together rather than writing them out", () => {
    expect(encodePosition(stateFromBoard(withKing(), "attackers")).split(" ")[0]).toBe(
      "7/7/7/3K3/7/7/7",
    );
  });
});

describe("round-tripping", () => {
  it("returns the opening unchanged", () => {
    const state = ok(encodePosition(initialState()));
    expect(state.board).toEqual(initialState().board);
    expect(state.turn).toBe("attackers");
  });

  it("survives a real game's worth of positions", () => {
    // The encoding has to hold for boards with captures and scattered pieces,
    // not just the tidy opening.
    let state = initialState();
    for (let i = 0; i < 20; i++) {
      const legal = allMoves(state.board, state.turn, rules);
      if (!legal.length) break;
      state = applyMove(state, legal[i % legal.length], rules);
      const back = ok(encodePosition(state));
      expect(back.board).toEqual(state.board);
      expect(back.turn).toBe(state.turn);
    }
  });

  it("does not invent a history for a position that has none", () => {
    // A pasted position genuinely has no past; claiming one would be a lie the
    // importer then has to believe, and repetition counting would be wrong.
    const state = ok(encodePosition(initialState()));
    expect(state.history).toEqual([]);
    expect(state.moveCount).toBe(0);
    expect(state.captured).toEqual({ attackers: 0, defenders: 0 });
    expect(state.status).toBe("playing");
  });
});

describe("reading a position leniently", () => {
  it("ignores surrounding whitespace", () => {
    expect(ok("  7/7/7/3K3/7/7/7   a  ").turn).toBe("attackers");
  });

  it("accepts either case for the piece letters", () => {
    expect(ok("7/7/7/3k3/7/7/7 A").board[3][3]).toBe("king");
  });

  it("accepts the long side names as well as the letters", () => {
    expect(ok("7/7/7/3K3/7/7/7 defenders").turn).toBe("defenders");
    expect(ok("7/7/7/3K3/7/7/7 attackers").turn).toBe("attackers");
  });
});

describe("refusing a position that could not be played", () => {
  it("rejects an empty string", () => {
    expect(err("").code).toBe("empty");
  });

  it("rejects the wrong number of ranks", () => {
    expect(err("7/7/7 a").code).toBe("bad_rank_count");
    expect(err("7/7/7/7/7/7/7/7 a").code).toBe("bad_rank_count");
  });

  it("rejects a rank that does not add up to seven squares", () => {
    const e = err("7/7/7/3K2/7/7/7 a");
    expect(e.code).toBe("bad_rank_width");
    expect(e.rank).toBe(4); // ranks are written 7 first, so index 3 is rank 4
  });

  it("rejects a rank that overflows", () => {
    expect(err("7/7/7/3K5/7/7/7 a").code).toBe("bad_rank_width");
  });

  it("rejects an unknown symbol, and quotes it back", () => {
    const e = err("7/7/7/3X3/7/7/7 a");
    expect(e.code).toBe("bad_symbol");
    expect(e.token).toBe("X");
  });

  it("rejects a missing or unreadable side to move", () => {
    expect(err("7/7/7/3K3/7/7/7").code).toBe("bad_side");
    expect(err("7/7/7/3K3/7/7/7 z").code).toBe("bad_side");
  });

  it("rejects a board with no king", () => {
    // findKing returns null and every king-related invariant in the engine is
    // false from move one.
    expect(err("7/7/7/7/7/7/7 a").code).toBe("king_count");
  });

  it("rejects a board with two kings", () => {
    expect(err("7/7/7/3K3/7/K6/7 a").code).toBe("king_count");
  });

  it("rejects a soldier standing on a corner", () => {
    // No sequence of legal moves could have put it there.
    const e = err("A6/7/7/3K3/7/7/7 a");
    expect(e.code).toBe("restricted_square");
  });

  it("rejects a soldier standing on the throne", () => {
    const e = err("7/7/3K3/3D3/7/7/7 a");
    expect(e.code).toBe("restricted_square");
    expect(e.detail).toContain("throne");
  });

  it("leads with the missing king when a board is wrong in two ways at once", () => {
    // A fact about the whole position outranks a fact about one square.
    expect(err("7/7/7/3D3/7/7/7 a").code).toBe("king_count");
  });

  it("lets the king stand on a corner or the throne", () => {
    expect(ok("K6/7/7/7/7/7/7 a").board[0][0]).toBe("king");
    expect(ok("7/7/7/3K3/7/7/7 a").board[3][3]).toBe("king");
  });

  it("always says which rank the problem is on, where that is knowable", () => {
    expect(err("7/7/7/3X3/7/7/7 a").rank).toBe(4);
    expect(err("7/3K2/7/3K3/7/7/7 a").rank).toBe(6);
  });
});

describe("validating a board directly", () => {
  it("passes a sound board", () => {
    expect(validateBoard(withKing())).toBeNull();
  });

  it("catches the same problems the parser does", () => {
    expect(validateBoard(empty())?.code).toBe("king_count");
    const b = withKing();
    b[0][0] = "attacker";
    expect(validateBoard(b)?.code).toBe("restricted_square");
  });
});

describe("a position the king has already won from", () => {
  it("is recognised, but not rejected — it is still legal to look at", () => {
    expect(kingIsHome(ok("K6/7/7/7/7/7/7 a").board)).toBe(true);
    expect(kingIsHome(initialState().board)).toBe(false);
  });
});

describe("a parsed position is playable by the engine", () => {
  it("produces legal moves from the side to move", () => {
    const state = ok("3A3/7/7/3K3/7/7/7 a");
    const moves = allMoves(state.board, state.turn, rules);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(state.board[m.from.row][m.from.col]).toBe("attacker");
  });

  it("can be moved on without the engine complaining", () => {
    const state = ok(encodePosition(initialState()));
    const move = allMoves(state.board, state.turn, rules)[0];
    const next = applyMove(state, move, rules);
    expect(next.history).toHaveLength(1);
    expect(next.turn).toBe("defenders");
  });
});
