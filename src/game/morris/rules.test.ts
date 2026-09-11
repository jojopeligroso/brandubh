import { describe, expect, it } from "vitest";
import {
  ADJ,
  MILLS,
  MILLS_OF,
  POINTS,
  allMoves,
  applyMove,
  flyingFor,
  formsMill,
  hasAnyMove,
  hashState,
  inMill,
  initialState,
  isGameOver,
  millsFormedAt,
  moveName,
  parseMoveName,
  phaseOf,
  pointIndex,
  pointName,
  removable,
  stonesOf,
  winnerOf,
} from "./rules";
import { perft } from "./perft";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor } from "./variants";
import { POINT_COUNT, type Board, type Cell, type GameState, type Side } from "./types";

const gasser = VARIANTS["morris-gasser-1"];

/** A ruleset differing from the shipped one in the named flags only. */
const variant = (flags: Partial<typeof CUSTOM_RULE_DEFAULTS>) =>
  rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, ...flags });

const p = pointIndex;

function boardOf(white: string[], black: string[]): Board {
  const b = Array<Cell>(POINT_COUNT).fill(0);
  for (const n of white) b[p(n)] = 1;
  for (const n of black) b[p(n)] = 2;
  return b;
}

/** A hand-built position. Hands default to empty — i.e. the moving phase. */
function stateOf(opts: {
  white?: string[];
  black?: string[];
  turn: Side;
  hands?: { white: number; black: number };
  sinceMill?: number;
}): GameState {
  return {
    board: boardOf(opts.white ?? [], opts.black ?? []),
    turn: opts.turn,
    inHand: opts.hands ?? { white: 0, black: 0 },
    status: "playing",
    history: [],
    sinceMill: opts.sinceMill ?? 0,
  };
}

const names = (moves: { from: number | null; to: number; remove: number | null; remove2?: number | null }[]) =>
  moves.map(moveName).sort();

// ── The board itself ──────────────────────────────────────────────────────────

describe("the 24 points", () => {
  it("names them a7–g1 in ring order", () => {
    expect(POINTS).toHaveLength(24);
    expect(pointName(0)).toBe("a7");
    expect(pointName(8)).toBe("b6");
    expect(pointName(16)).toBe("c5");
    expect(pointName(23)).toBe("c4");
  });

  it("round-trips every name through pointIndex", () => {
    for (let i = 0; i < POINT_COUNT; i++) expect(p(pointName(i))).toBe(i);
    expect(p("h9")).toBe(-1);
    expect(p("d4")).toBe(-1); // the centre of the lattice is not a point of the board
  });

  it("has 32 edges, symmetric, with the degrees the board's shape implies", () => {
    let edges = 0;
    for (let i = 0; i < POINT_COUNT; i++) {
      for (const j of ADJ[i]) {
        edges++;
        expect(ADJ[j]).toContain(i); // adjacency is symmetric
        expect(j).not.toBe(i);
      }
    }
    expect(edges / 2).toBe(32);
    // Corners (even k) have two neighbours, both midpoints; a midpoint has three,
    // or four on the middle ring where the spoke runs both ways.
    for (let i = 0; i < POINT_COUNT; i++) {
      const k = i % 8;
      const ring = Math.floor(i / 8);
      const expected = k % 2 === 0 ? 2 : ring === 1 ? 4 : 3;
      expect(ADJ[i], `degree of ${pointName(i)}`).toHaveLength(expected);
      if (k % 2 === 0) for (const j of ADJ[i]) expect(j % 2).toBe(1); // no corner–corner edge
    }
  });

  it("has 16 mills: twelve ring sides and four spokes", () => {
    expect(MILLS).toHaveLength(16);
    expect(MILLS.map((m) => m.map(pointName).join("-"))).toContain("a7-d7-g7");
    expect(MILLS.map((m) => m.map(pointName).join("-"))).toContain("d7-d6-d5");
    // Every mill's points are mutually adjacent in a line: a-b and b-c are edges.
    for (const [a, b, c] of MILLS) {
      expect(ADJ[a]).toContain(b);
      expect(ADJ[b]).toContain(c);
    }
    // MILLS_OF is the exact inverse index.
    for (let i = 0; i < POINT_COUNT; i++)
      for (const m of MILLS_OF[i]) expect(MILLS[m]).toContain(i);
    for (let m = 0; m < MILLS.length; m++)
      for (const i of MILLS[m]) expect(MILLS_OF[i]).toContain(m);
  });
});

// ── The opening ───────────────────────────────────────────────────────────────

describe("the opening position", () => {
  it("is an empty board with nine stones in each hand, White to place", () => {
    const s = initialState(gasser);
    expect(s.board.every((c) => c === 0)).toBe(true);
    expect(s.inHand).toEqual({ white: 9, black: 9 });
    expect(s.turn).toBe("white");
    expect(s.status).toBe("playing");
    expect(s.history).toHaveLength(0);
    expect(s.sinceMill).toBe(0);
    expect(phaseOf(s)).toBe("placing");
    expect(stonesOf(s, "white")).toBe(9);
    expect(stonesOf(s, "black")).toBe(9);
  });

  it("offers exactly 24 placements at ply 0, one per point, none of them a capture", () => {
    const moves = allMoves(initialState(gasser), gasser);
    expect(moves).toHaveLength(24);
    expect(new Set(moves.map((m) => m.to)).size).toBe(24);
    expect(moves.every((m) => m.from === null && m.remove === null)).toBe(true);
  });

  it("follows the ruleset about who starts", () => {
    expect(initialState(variant({ firstMove: "black" })).turn).toBe("black");
  });
});

// ── Mills ─────────────────────────────────────────────────────────────────────

describe("forming a mill", () => {
  it("is recognised in the placing phase and takes a stone", () => {
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["a1", "g1"],
      turn: "white",
      hands: { white: 7, black: 7 },
    });
    expect(formsMill(s.board, p("g7"), "white")).toBe(true);
    const closing = allMoves(s, gasser).filter((m) => m.to === p("g7"));
    // One move per legal victim, and *no* move that declines to take one.
    expect(names(closing)).toEqual(["g7xa1", "g7xg1"]);

    const after = applyMove(s, { from: null, to: p("g7"), remove: p("a1") }, gasser);
    expect(after.board[p("g7")]).toBe(1);
    expect(after.board[p("a1")]).toBe(0);
    expect(after.inHand.white).toBe(6);
    expect(after.turn).toBe("black");
    expect(after.history[0].formedMill).toBe(true);
    expect(inMill(after.board, p("g7"))).toBe(true);
    expect(inMill(after.board, p("g1"))).toBe(false);
  });

  it("is read off the board *after* the stone moves, so leaving a line breaks it", () => {
    // White holds the whole top side. Sliding a7→a4 does not "re-form" a7-d7-g7:
    // the stone that left is one of the three.
    const s = stateOf({
      white: ["a7", "d7", "g7", "b6"],
      black: ["c5", "e5", "e3", "c3"],
      turn: "white",
    });
    const slide = allMoves(s, gasser).filter((m) => m.from === p("a7"));
    expect(names(slide)).toEqual(["a7-a4"]);
    expect(slide[0].remove).toBeNull();
  });

  it("counts two mills when a point completes two lines at once", () => {
    const s = stateOf({
      white: ["d7", "g7", "a1", "a4"],
      black: ["c5", "e5"],
      turn: "white",
      hands: { white: 5, black: 5 },
    });
    // a7 is the shared corner of a7-d7-g7 and a1-a4-a7.
    expect(millsFormedAt(boardOf(["a7", "d7", "g7", "a1", "a4"], []), p("a7"), "white")).toBe(2);
    // Under Gasser's reading it still takes exactly one stone.
    const closing = allMoves(s, gasser).filter((m) => m.to === p("a7"));
    expect(names(closing)).toEqual(["a7xc5", "a7xe5"]);
    expect(closing.every((m) => (m.remove2 ?? null) === null)).toBe(true);
  });

  it("takes two stones under the doubleMillRemoves: \"two\" reading", () => {
    const two = variant({ doubleMillRemoves: "two" });
    const s = stateOf({
      white: ["d7", "g7", "a1", "a4"],
      black: ["c5", "e5", "e3"],
      turn: "white",
      hands: { white: 5, black: 5 },
    });
    const closing = allMoves(s, two).filter((m) => m.to === p("a7"));
    // Unordered pairs of the three free black stones: three of them, not six.
    expect(names(closing)).toEqual(["a7xc5xe3", "a7xc5xe5", "a7xe5xe3"]);
    const after = applyMove(s, closing[0], two);
    expect(stonesOf(after, "black")).toBe(5 + 1); // five in hand, one left on the board
    // A *single* mill still takes one, even under this ruleset.
    const single = allMoves(s, two).filter((m) => m.to === p("g4"));
    expect(single.every((m) => (m.remove2 ?? null) === null)).toBe(true);
  });
});

describe("which stone a mill may take", () => {
  it("spares stones that are in a mill while a free one exists", () => {
    const board = boardOf(["a7", "d7"], ["b6", "d6", "f6", "a1"]);
    expect(removable(board, "black", gasser)).toEqual([p("a1")]);
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["b6", "d6", "f6", "a1"],
      turn: "white",
      hands: { white: 7, black: 5 },
    });
    expect(names(allMoves(s, gasser).filter((m) => m.to === p("g7")))).toEqual(["g7xa1"]);
  });

  it("allows any stone once every one of them is in a mill (Gasser)", () => {
    const board = boardOf(["a7", "d7"], ["b6", "d6", "f6"]);
    expect(removable(board, "black", gasser)).toEqual([p("b6"), p("d6"), p("f6")]);
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["b6", "d6", "f6"],
      turn: "white",
      hands: { white: 7, black: 6 },
    });
    expect(names(allMoves(s, gasser).filter((m) => m.to === p("g7")))).toEqual([
      "g7xb6",
      "g7xd6",
      "g7xf6",
    ]);
  });

  it("takes nothing at all under the stricter reading of the same position", () => {
    const strict = variant({ removeFromMillsWhenAllInMills: false });
    const board = boardOf(["a7", "d7"], ["b6", "d6", "f6"]);
    expect(removable(board, "black", strict)).toEqual([]);
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["b6", "d6", "f6"],
      turn: "white",
      hands: { white: 7, black: 6 },
    });
    const closing = allMoves(s, strict).filter((m) => m.to === p("g7"));
    expect(names(closing)).toEqual(["g7"]);
    const after = applyMove(s, closing[0], strict);
    expect(stonesOf(after, "black")).toBe(9);
    // The mill was still *formed* — which is what resets the fifty-move counter.
    expect(after.history[0].formedMill).toBe(true);
  });

  it("takes nothing when the opponent has no stone on the board at all", () => {
    const s = stateOf({
      white: ["a7", "d7"],
      black: [],
      turn: "white",
      hands: { white: 7, black: 9 },
    });
    expect(removable(s.board, "black", gasser)).toEqual([]);
    expect(names(allMoves(s, gasser).filter((m) => m.to === p("g7")))).toEqual(["g7"]);
  });
});

// ── The moving phase ──────────────────────────────────────────────────────────

describe("moving", () => {
  it("follows the lines, one step, to an empty point", () => {
    const s = stateOf({ white: ["d6"], black: ["c5", "e5", "e3", "c3"], turn: "white" });
    // d6's neighbours are d7, b6, f6 and d5 (the spoke) — all empty here.
    expect(names(allMoves(s, gasser).filter((m) => m.from === p("d6")))).toEqual([
      "d6-b6",
      "d6-d5",
      "d6-d7",
      "d6-f6",
    ]);
  });

  it("is blocked by occupied neighbours", () => {
    const s = stateOf({
      white: ["a7", "d6", "d5", "c4", "f4"],
      black: ["d7", "g7", "c5", "e3"],
      turn: "white",
    });
    // a7's only neighbours are d7 (black) and a4 (empty).
    expect(names(allMoves(s, gasser).filter((m) => m.from === p("a7")))).toEqual(["a7-a4"]);
  });

  it("flies anywhere at three stones, once the hand is empty", () => {
    // No two white stones share a line, so no flying move can close a mill and
    // none of them multiplies over victims — which is what makes the count exact.
    const s = stateOf({ white: ["a7", "f6", "e3"], black: ["c5", "d2", "b4", "g4"], turn: "white" });
    expect(flyingFor(s, "white", gasser)).toBe(true);
    const moves = allMoves(s, gasser);
    expect(moves).toHaveLength(3 * 17);
    expect(names(moves)).toContain("a7-f2"); // nowhere near a7's own lines
  });

  it("does not fly while stones remain in hand", () => {
    const s = stateOf({
      white: ["a7", "g7", "g1"],
      black: ["c5", "e5", "e3", "c3"],
      turn: "white",
      hands: { white: 1, black: 0 },
    });
    expect(flyingFor(s, "white", gasser)).toBe(false);
    // Still placing, in fact: the hand comes first.
    expect(allMoves(s, gasser).every((m) => m.from === null)).toBe(true);
  });

  it("does not fly at all under flying: \"none\"", () => {
    const none = variant({ flying: "none" });
    const s = stateOf({ white: ["a7", "g7", "g1"], black: ["c5", "e5", "e3", "c3"], turn: "white" });
    expect(flyingFor(s, "white", none)).toBe(false);
    expect(names(allMoves(s, none))).toEqual(["a7-a4", "a7-d7", "g1-d1", "g1-g4", "g7-d7", "g7-g4"]);
  });
});

// ── Losing ────────────────────────────────────────────────────────────────────

describe("losing by blockade", () => {
  it("ends the game when the player to move has no legal turn", () => {
    // Black holds a7, d7, g7 and c5; every neighbour of every one of them is
    // occupied except a4, and White's b4 stone can take it. Four black stones, so
    // flying does not apply.
    const s = stateOf({
      white: ["g4", "d6", "d5", "c4", "b4"],
      black: ["a7", "d7", "g7", "c5"],
      turn: "white",
    });
    const after = applyMove(s, { from: p("b4"), to: p("a4"), remove: null }, gasser);
    expect(hasAnyMove(after, gasser)).toBe(false);
    expect(after.status).toBe("white_win_blocked");
    expect(winnerOf(after.status)).toBe("white");
    expect(isGameOver(after.status)).toBe(true);
    expect(allMoves(after, gasser)).toEqual([]);
  });

  it("cannot happen in the placing phase, where an empty point always exists", () => {
    const s = stateOf({
      white: ["g4", "d6", "d5", "c4", "b4"],
      black: ["a7", "d7", "g7", "c5"],
      turn: "white",
      hands: { white: 0, black: 1 },
    });
    const after = applyMove(s, { from: p("b4"), to: p("a4"), remove: null }, gasser);
    expect(after.status).toBe("playing");
    expect(hasAnyMove(after, gasser)).toBe(true); // black still has a stone to place
  });

  it("cannot happen to a flying player while any point is empty", () => {
    const s = stateOf({
      white: ["g4", "d6", "d5", "c4", "b4"],
      black: ["a7", "d7", "g7"],
      turn: "white",
    });
    const after = applyMove(s, { from: p("b4"), to: p("a4"), remove: null }, gasser);
    expect(after.status).toBe("playing");
    // …but it can under the no-flying reading of the same position.
    const none = variant({ flying: "none" });
    expect(applyMove(s, { from: p("b4"), to: p("a4"), remove: null }, none).status).toBe(
      "white_win_blocked",
    );
  });
});

describe("losing by attrition", () => {
  it("ends the game at two stones, once the hand is empty", () => {
    const s = stateOf({ white: ["a7", "d7", "g4", "f4"], black: ["c5", "e5", "e3"], turn: "white" });
    const after = applyMove(s, { from: p("g4"), to: p("g7"), remove: p("e5") }, gasser);
    expect(stonesOf(after, "black")).toBe(2);
    expect(after.status).toBe("white_win_stones");
    expect(winnerOf(after.status)).toBe("white");
  });

  it("does not end it while the loser still holds stones in hand", () => {
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["g4", "g1", "a1"],
      turn: "white",
      hands: { white: 1, black: 1 },
    });
    const after = applyMove(s, { from: null, to: p("g7"), remove: p("a1") }, gasser);
    expect(after.board.filter((c) => c === 2)).toHaveLength(2);
    expect(stonesOf(after, "black")).toBe(3); // two on the board, one still in hand
    expect(after.status).toBe("playing");
  });

  it("says which colour won, either way round", () => {
    const s = stateOf({ black: ["a7", "d7", "g4", "f4"], white: ["c5", "e5", "e3"], turn: "black" });
    const after = applyMove(s, { from: p("g4"), to: p("g7"), remove: p("e5") }, gasser);
    expect(after.status).toBe("black_win_stones");
    expect(winnerOf(after.status)).toBe("black");
  });
});

// ── Draws ─────────────────────────────────────────────────────────────────────

/** Four outer corners against four inner corners: no mill is reachable and both
 *  sides can shuffle a stone out and back forever. The fixture both draw rules
 *  are tested on. */
const shuffleStart = (turn: Side = "white"): GameState =>
  stateOf({ white: ["a7", "g7", "g1", "a1"], black: ["c5", "e5", "e3", "c3"], turn });

/** The four-ply cycle: White a7→d7, Black c5→d5, White d7→a7, Black d5→c5. */
const CYCLE = [
  { from: "a7", to: "d7" },
  { from: "c5", to: "d5" },
  { from: "d7", to: "a7" },
  { from: "d5", to: "c5" },
] as const;

describe("the fifty-move draw", () => {
  it("counts plies since a mill and draws at a hundred of them", () => {
    // Repetition is switched off so the two rules are tested one at a time; this
    // fixture repeats its position every four plies and would otherwise end there.
    const rules = variant({ repetitionResult: "none" });
    let s = shuffleStart();
    for (let ply = 1; ply <= 100; ply++) {
      const step = CYCLE[(ply - 1) % 4];
      s = applyMove(s, { from: p(step.from), to: p(step.to), remove: null }, rules);
      expect(s.sinceMill).toBe(ply);
      if (ply < 100) expect(s.status).toBe("playing");
    }
    expect(s.status).toBe("draw_no_mill");
    expect(winnerOf(s.status)).toBe("draw");
  });

  it("does not run in the placing phase, and resets when a mill is closed", () => {
    const placing = applyMove(initialState(gasser), { from: null, to: p("a7"), remove: null }, gasser);
    expect(placing.sinceMill).toBe(0);

    const s = stateOf({
      white: ["a7", "d7", "g4", "f4"],
      black: ["c5", "e5", "e3", "c3"],
      turn: "white",
      sinceMill: 93,
    });
    const quiet = applyMove(s, { from: p("f4"), to: p("f2"), remove: null }, gasser);
    expect(quiet.sinceMill).toBe(94);
    const mill = applyMove(s, { from: p("g4"), to: p("g7"), remove: p("c5") }, gasser);
    expect(mill.sinceMill).toBe(0);
    expect(mill.status).toBe("playing");
  });

  it("is switchable off, and then the shuffle simply continues", () => {
    const rules = variant({ repetitionResult: "none", noMillDrawMoves: "none" });
    let s = shuffleStart();
    for (let ply = 1; ply <= 120; ply++) {
      const step = CYCLE[(ply - 1) % 4];
      s = applyMove(s, { from: p(step.from), to: p(step.to), remove: null }, rules);
    }
    expect(s.status).toBe("playing");
    expect(s.sinceMill).toBe(120);
  });
});

describe("the threefold-repetition draw", () => {
  it("draws on the third occurrence of a position, counting the current one", () => {
    let s = shuffleStart();
    const opening = hashState(s);
    // The cycle returns to the start position after every four plies, so the start
    // position occurs at plies 0, 4 and 8 — and the draw lands on the third.
    for (let ply = 1; ply <= 8; ply++) {
      const step = CYCLE[(ply - 1) % 4];
      s = applyMove(s, { from: p(step.from), to: p(step.to), remove: null }, gasser);
      if (ply === 4) {
        expect(hashState(s)).toBe(opening);
        expect(s.status).toBe("playing"); // only the second occurrence
      } else if (ply < 8) {
        expect(s.status).toBe("playing");
      }
    }
    expect(hashState(s)).toBe(opening);
    expect(s.status).toBe("draw_repetition");
    expect(winnerOf(s.status)).toBe("draw");
  });

  it("is switchable off", () => {
    const rules = variant({ repetitionResult: "none" });
    let s = shuffleStart();
    for (let ply = 1; ply <= 8; ply++) {
      const step = CYCLE[(ply - 1) % 4];
      s = applyMove(s, { from: p(step.from), to: p(step.to), remove: null }, rules);
    }
    expect(s.status).toBe("playing");
  });

  it("forgets everything before a removal, because stones never come back", () => {
    // A position identical to one seen before a capture is *not* a repetition of
    // it — and cannot be, since the stone count differs. This pins the backwards
    // scan's stopping rule rather than the arithmetic it saves.
    const s = stateOf({
      white: ["a7", "g7", "g1", "a1", "d6"],
      black: ["c5", "e5", "e3", "c3", "b6"],
      turn: "white",
    });
    let t = applyMove(s, { from: p("d6"), to: p("f6"), remove: null }, gasser);
    t = applyMove(t, { from: p("b6"), to: p("b4"), remove: null }, gasser);
    t = applyMove(t, { from: p("f6"), to: p("d6"), remove: null }, gasser);
    t = applyMove(t, { from: p("b4"), to: p("b6"), remove: null }, gasser);
    expect(t.status).toBe("playing");
    expect(t.history.filter((h) => h.hashBefore === hashState(s))).toHaveLength(1);
  });
});

// ── Hashing ───────────────────────────────────────────────────────────────────

describe("hashState", () => {
  it("separates the board, the side to move and the hands", () => {
    const base = stateOf({ white: ["a7"], black: ["c5"], turn: "white" });
    expect(hashState(base)).toBe(hashState(stateOf({ white: ["a7"], black: ["c5"], turn: "white" })));
    expect(hashState(base)).not.toBe(hashState({ ...base, turn: "black" }));
    expect(hashState(base)).not.toBe(hashState({ ...base, inHand: { white: 1, black: 0 } }));
    expect(hashState(base)).not.toBe(
      hashState(stateOf({ white: ["c5"], black: ["a7"], turn: "white" })),
    );
  });

  it("ignores what cannot affect the future — the move list and the counter", () => {
    const a = stateOf({ white: ["a7"], black: ["c5"], turn: "white" });
    expect(hashState({ ...a, sinceMill: 40 })).toBe(hashState(a));
  });
});

// ── Notation ──────────────────────────────────────────────────────────────────

describe("move names", () => {
  it("round-trips every legal move of several positions", () => {
    const positions: GameState[] = [
      initialState(gasser),
      // mid-placing, with mills available to both sides
      stateOf({
        white: ["a7", "d7", "b6"],
        black: ["c5", "e5", "a1"],
        turn: "white",
        hands: { white: 6, black: 6 },
      }),
      // moving phase, sliding only
      stateOf({ white: ["a7", "g7", "g1", "a1"], black: ["c5", "e5", "e3", "c3"], turn: "black" }),
      // flying, and a mill available
      stateOf({ white: ["a7", "d7", "b6"], black: ["c5", "e5", "e3", "c3"], turn: "white" }),
      // a double mill under the two-stone reading (parsed the same way)
      stateOf({
        white: ["d7", "g7", "a1", "a4"],
        black: ["c5", "e5", "e3"],
        turn: "white",
        hands: { white: 5, black: 5 },
      }),
    ];
    const rulesets = [gasser, variant({ doubleMillRemoves: "two" })];
    for (const rules of rulesets)
      for (const s of positions) {
        const moves = allMoves(s, rules);
        expect(moves.length).toBeGreaterThan(0);
        for (const m of moves) {
          const round = parseMoveName(moveName(m));
          expect(round, moveName(m)).not.toBeNull();
          expect(round!.from).toBe(m.from);
          expect(round!.to).toBe(m.to);
          expect(round!.remove).toBe(m.remove);
          expect(round!.remove2 ?? null).toBe(m.remove2 ?? null);
        }
      }
  });

  it("writes the four shapes the way the game file reads them", () => {
    expect(moveName({ from: null, to: p("d7"), remove: null })).toBe("d7");
    expect(moveName({ from: p("a7"), to: p("a4"), remove: null })).toBe("a7-a4");
    expect(moveName({ from: null, to: p("d7"), remove: p("d2") })).toBe("d7xd2");
    expect(moveName({ from: p("a7"), to: p("a4"), remove: p("b2") })).toBe("a7-a4xb2");
    expect(moveName({ from: p("a7"), to: p("a4"), remove: p("b2"), remove2: p("c4") })).toBe(
      "a7-a4xb2xc4",
    );
  });

  it("normalises a hand-written double removal into the canonical order", () => {
    // A file written by hand may name the two victims either way round; the move it
    // means is the same move, and the one order `applyMove` accepts is ascending, so
    // the sorting happens here — at the parse, where shape is the whole job — rather
    // than loosening the rules.
    const swapped = parseMoveName("a7-a4xc4xb2");
    expect(swapped).toEqual({ from: p("a7"), to: p("a4"), remove: p("b2"), remove2: p("c4") });
    expect(moveName(swapped!)).toBe("a7-a4xb2xc4");
    // Single removals and plain moves are untouched by it.
    expect(parseMoveName("d7xd2")).toEqual({ from: null, to: p("d7"), remove: p("d2") });
    expect(parseMoveName("a7-a4")).toEqual({ from: p("a7"), to: p("a4"), remove: null });
  });

  it("rejects what is not a move token", () => {
    for (const bad of ["", "a8", "h7", "d4", "a7-", "a7-a4x", "a7a4", "xd2", "a7-a4xb2xc4xd5"])
      expect(parseMoveName(bad), bad).toBeNull();
    expect(parseMoveName(" d7 ")).toEqual({ from: null, to: p("d7"), remove: null });
  });
});

// ── Rejecting illegal moves ───────────────────────────────────────────────────

describe("applyMove throws on an illegal move", () => {
  const placing = stateOf({
    white: ["a7", "d7"],
    black: ["a1", "g1"],
    turn: "white",
    hands: { white: 7, black: 7 },
  });
  const moving = stateOf({
    white: ["a7", "d7", "g4", "f4"],
    black: ["c5", "e5", "e3", "c3"],
    turn: "white",
  });

  it("rejects a destination that is occupied or off the board", () => {
    expect(() => applyMove(placing, { from: null, to: p("a7"), remove: null }, gasser)).toThrow(
      /occupied/,
    );
    expect(() => applyMove(placing, { from: null, to: 24, remove: null }, gasser)).toThrow(/no such point/);
    expect(() => applyMove(placing, { from: null, to: -1, remove: null }, gasser)).toThrow(/no such point/);
  });

  it("rejects moving a stone while a hand still holds one, and placing when none is left", () => {
    expect(() => applyMove(placing, { from: p("a7"), to: p("a4"), remove: null }, gasser)).toThrow(
      /must be placed/,
    );
    expect(() => applyMove(moving, { from: null, to: p("a4"), remove: null }, gasser)).toThrow(
      /no stones left in hand/,
    );
  });

  it("rejects moving someone else's stone, or an empty point", () => {
    expect(() => applyMove(moving, { from: p("c5"), to: p("c4"), remove: null }, gasser)).toThrow(
      /holds no white stone/,
    );
    expect(() => applyMove(moving, { from: p("b6"), to: p("b4"), remove: null }, gasser)).toThrow(
      /holds no white stone/,
    );
  });

  it("rejects a jump along no line, unless the mover is flying", () => {
    expect(() => applyMove(moving, { from: p("a7"), to: p("f2"), remove: null }, gasser)).toThrow(
      /is not a line/,
    );
    const flying = stateOf({ white: ["a7", "g7", "g1"], black: ["c5", "e5", "e3", "c3"], turn: "white" });
    expect(() => applyMove(flying, { from: p("a7"), to: p("f2"), remove: null }, gasser)).not.toThrow();
    expect(() =>
      applyMove(flying, { from: p("a7"), to: p("f2"), remove: null }, variant({ flying: "none" })),
    ).toThrow(/is not a line/);
  });

  it("rejects taking a stone when no mill was closed, and not taking one when it was", () => {
    expect(() => applyMove(placing, { from: null, to: p("g4"), remove: p("a1") }, gasser)).toThrow(
      /no mill was closed/,
    );
    expect(() => applyMove(placing, { from: null, to: p("g7"), remove: null }, gasser)).toThrow(
      /must take a stone/,
    );
  });

  it("rejects a victim that is not a point at all", () => {
    // What a malformed save file or game file looks like from in here.
    expect(() => applyMove(placing, { from: null, to: p("g7"), remove: 99 }, gasser)).toThrow(
      /no such point/,
    );
    expect(() =>
      applyMove(placing, { from: null, to: p("g7"), remove: p("a1"), remove2: -3 }, gasser),
    ).toThrow(/no such point/);
  });

  it("rejects taking a protected stone", () => {
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["b6", "d6", "f6", "a1"],
      turn: "white",
      hands: { white: 7, black: 5 },
    });
    expect(() => applyMove(s, { from: null, to: p("g7"), remove: p("d6") }, gasser)).toThrow(
      /may not be taken/,
    );
    expect(() => applyMove(s, { from: null, to: p("g7"), remove: p("a1") }, gasser)).not.toThrow();
  });

  it("rejects a second victim unless the ruleset and the position both allow one", () => {
    const double = stateOf({
      white: ["d7", "g7", "a1", "a4"],
      black: ["c5", "e5", "e3"],
      turn: "white",
      hands: { white: 5, black: 5 },
    });
    expect(() =>
      applyMove(double, { from: null, to: p("a7"), remove: p("c5"), remove2: p("e5") }, gasser),
    ).toThrow(/only one stone/);
    const two = variant({ doubleMillRemoves: "two" });
    expect(() => applyMove(double, { from: null, to: p("a7"), remove: p("c5") }, two)).toThrow(
      /must take two stones/,
    );
    expect(() =>
      applyMove(double, { from: null, to: p("a7"), remove: p("c5"), remove2: p("c5") }, two),
    ).toThrow(/two different stones/);
  });

  it("rejects a double removal named in descending order", () => {
    // `allMoves` emits each victim *pair* once, ascending (rules.ts), so the swapped
    // spelling is a move it never generates — and `applyMove`'s header promises
    // "throws ⇔ not in allMoves", which is what lets `findLegalMove` validate an
    // import by construction. Accepting the swap broke that equivalence silently.
    const two = variant({ doubleMillRemoves: "two" });
    const double = stateOf({
      white: ["d7", "g7", "a1", "a4"],
      black: ["c5", "e5", "e3"],
      turn: "white",
      hands: { white: 5, black: 5 },
    });
    expect(p("c5")).toBeLessThan(p("e5")); // the canonical order is by point index
    expect(() =>
      applyMove(double, { from: null, to: p("a7"), remove: p("c5"), remove2: p("e5") }, two),
    ).not.toThrow();
    expect(() =>
      applyMove(double, { from: null, to: p("a7"), remove: p("e5"), remove2: p("c5") }, two),
    ).toThrow(/ascending/);
    const generated = allMoves(double, two).map(moveName);
    expect(generated).toContain("a7xc5xe5");
    expect(generated).not.toContain("a7xe5xc5");
  });

  it("rejects any move at all once the game is over", () => {
    const done: GameState = { ...placing, status: "white_win_stones" };
    expect(() => applyMove(done, { from: null, to: p("g4"), remove: null }, gasser)).toThrow(
      /game is over/,
    );
    expect(allMoves(done, gasser)).toEqual([]);
  });
});

// ── Move generation, in bulk ──────────────────────────────────────────────────

describe("allMoves", () => {
  const positions: Array<[string, GameState]> = [
    ["opening", initialState(gasser)],
    [
      "placing with mills for both sides",
      stateOf({
        white: ["a7", "d7", "b6"],
        black: ["c5", "e5", "a1"],
        turn: "white",
        hands: { white: 6, black: 6 },
      }),
    ],
    [
      "moving, crowded",
      stateOf({
        white: ["a7", "g7", "g1", "a1", "d6", "f4"],
        black: ["c5", "e5", "e3", "c3", "b4", "d2"],
        turn: "black",
      }),
    ],
    ["flying", stateOf({ white: ["a7", "d7", "b6"], black: ["c5", "e5", "e3", "c3"], turn: "white" })],
  ];

  it.each(positions)("contains no duplicate turn (%s)", (_label, s) => {
    for (const rules of [gasser, variant({ doubleMillRemoves: "two" })]) {
      const moves = allMoves(s, rules);
      const keys = moves.map(moveName);
      expect(new Set(keys).size).toBe(moves.length);
    }
  });

  it.each(positions)("generates only moves applyMove accepts, and all of them (%s)", (_label, s) => {
    for (const m of allMoves(s, gasser)) expect(() => applyMove(s, m, gasser)).not.toThrow();
    // The converse: every (from, to) pair applyMove accepts appears in the list.
    const generated = new Set(allMoves(s, gasser).map((m) => `${m.from}>${m.to}`));
    for (let i = -1; i < POINT_COUNT; i++) {
      const from = i === -1 ? null : i;
      for (let to = 0; to < POINT_COUNT; to++) {
        let accepted = true;
        try {
          // The victim is not enumerated here — `remove: null` is legal exactly
          // when the move closes no mill, which is what makes this a check of the
          // (from, to) geometry and nothing else.
          applyMove(s, { from, to, remove: null }, gasser);
        } catch {
          accepted = false;
        }
        if (accepted) expect(generated, `${from}>${to}`).toContain(`${from}>${to}`);
      }
    }
  });

  it("agrees with hasAnyMove about whether anything is legal", () => {
    for (const [, s] of positions) expect(hasAnyMove(s, gasser)).toBe(allMoves(s, gasser).length > 0);
  });
});

// ── Perft ─────────────────────────────────────────────────────────────────────
//
// Leaf counts of the full legal-move tree. The opening numbers have a closed form,
// which is why they are pinned here and argued rather than merely recorded:
//
//   Nobody can close a mill before their *third* stone is down, and White's third
//   stone lands on ply 5. So for the first four plies every turn is "place on any
//   empty point" and nothing multiplies over victims:
//
//     d1 = 24                       d3 = 24·23·22 = 12,144
//     d2 = 24·23 = 552              d4 = 24·23·22·21 = 255,024
//
// Depth 5 is where the game's own structure first shows up, and it is pinned in
// `searchInvariants.test.ts` together with the excess term's derivation.

describe("perft from the opening", () => {
  it("counts the mill-free opening plies exactly", () => {
    const s = initialState(gasser);
    expect(perft(s, gasser, 1)).toBe(24);
    expect(perft(s, gasser, 2)).toBe(552);
    expect(perft(s, gasser, 3)).toBe(12_144);
    expect(24 * 23).toBe(552);
    expect(24 * 23 * 22).toBe(12_144);
  });
});
