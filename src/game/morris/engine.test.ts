import { afterEach, describe, expect, it } from "vitest";
import {
  DECISIVE,
  DEFAULT_WEIGHTS,
  DIFFICULTIES,
  FULL_CONFIG,
  LEGACY_CONFIG,
  WIN,
  chooseMove,
  chooseMoveDetailed,
  evaluate,
  evaluateAtPly,
  foldRootMoves,
  pickMove,
  resetTT,
  setTtCeiling,
  stabilizerOf,
  ttKey,
  ttSize,
  type DbProbe,
} from "./engine";
import { allMoves, applyMove, initialState, masksOf, moveName, pointIndex } from "./rules";
import { POINT_COUNT, type Board, type Cell, type GameState, type Side } from "./types";
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor } from "./variants";

const gasser = VARIANTS["morris-gasser-1"];
const p = pointIndex;

function boardOf(white: string[], black: string[]): Board {
  const b = Array<Cell>(POINT_COUNT).fill(0);
  for (const n of white) b[p(n)] = 1;
  for (const n of black) b[p(n)] = 2;
  return b;
}

function stateOf(opts: {
  white?: string[];
  black?: string[];
  turn: Side;
  hands?: { white: number; black: number };
}): GameState {
  return {
    board: boardOf(opts.white ?? [], opts.black ?? []),
    turn: opts.turn,
    inHand: opts.hands ?? { white: 0, black: 0 },
    status: "playing",
    history: [],
    sinceMill: 0,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fixed = () => 0.5;

/** Plain negamax, no pruning and no table — the oracle for "the ties really do
 *  tie". Shares only `evaluateAtPly` with the engine. */
function plainNegamax(state: GameState, depth: number, ply: number): number {
  if (state.status !== "playing" || depth === 0) return evaluateAtPly(state, ply, DEFAULT_WEIGHTS, gasser);
  let best = -Infinity;
  for (const m of allMoves(state, gasser)) {
    const v = -plainNegamax(applyMove(state, m, gasser), depth - 1, ply + 1);
    if (v > best) best = v;
  }
  return best;
}

// ── The size of the problem ───────────────────────────────────────────────────
// Recorded rather than asserted tightly: these numbers are why the ladder in
// `DIFFICULTY` reaches deeper than any tafl tier of the same name.

describe("the size of the problem", () => {
  it("opens 24 moves wide — and four ideas wide, once symmetry is folded in", () => {
    const s = initialState(gasser);
    const moves = allMoves(s, gasser);
    expect(moves).toHaveLength(24);
    const folded = foldRootMoves(moves, stabilizerOf(s.board));
    // Outer/inner corner, outer/inner midpoint, middle-ring corner, middle-ring
    // midpoint. Every other placement is one of these four turned or turned inside
    // out, which is exactly what the 16-fold group says.
    expect(folded.map((m) => moveName(m))).toEqual(["a7", "d7", "b6", "d6"]);
  });

  it("narrows sharply in the moving phase", () => {
    const mid = stateOf({
      white: ["a7", "g7", "g1", "a1", "d6", "f4"],
      black: ["c5", "e5", "e3", "c3", "b4", "d2"],
      turn: "white",
    });
    // 26 turns for six stones, against Copenhagen's 116 at *its* opening. This is
    // the whole reason the ladder below reaches depth 8 and 24 where a tafl tier of
    // the same name stops at 6 and 12.
    expect(allMoves(mid, gasser)).toHaveLength(26);
  });
});

// ── Evaluation ────────────────────────────────────────────────────────────────

describe("evaluate", () => {
  it("is mover-relative at the terminals", () => {
    const s = stateOf({ white: ["a7"], black: ["c5"], turn: "black" });
    // Black to move, White has won: −WIN from Black's point of view.
    expect(evaluate({ ...s, status: "white_win_stones" }, DEFAULT_WEIGHTS, gasser)).toBe(-WIN);
    expect(evaluate({ ...s, status: "black_win_blocked" }, DEFAULT_WEIGHTS, gasser)).toBe(WIN);
    expect(evaluate({ ...s, status: "draw_repetition" }, DEFAULT_WEIGHTS, gasser)).toBe(0);
    expect(evaluate({ ...s, status: "draw_no_mill" }, DEFAULT_WEIGHTS, gasser)).toBe(0);
  });

  it("calls the empty board dead level, because it is", () => {
    expect(evaluate(initialState(gasser), DEFAULT_WEIGHTS, gasser)).toBe(0);
  });

  it("is mover-relative: the same board scores the negation for the other player", () => {
    const board = { white: ["a7", "d7", "b6"], black: ["c5", "e3"] };
    const asWhite = stateOf({ ...board, turn: "white" });
    const asBlack = stateOf({ ...board, turn: "black" });
    expect(evaluate(asWhite, DEFAULT_WEIGHTS, gasser)).toBe(
      -evaluate(asBlack, DEFAULT_WEIGHTS, gasser),
    );
    // And the game is colour-blind: swapping the stones *and* the player to move is
    // the same position by a different name, so the score is unchanged.
    const mirrored = stateOf({ white: board.black, black: board.white, turn: "black" });
    expect(evaluate(mirrored, DEFAULT_WEIGHTS, gasser)).toBe(
      evaluate(asWhite, DEFAULT_WEIGHTS, gasser),
    );
  });

  it("counts a stone in hand as a stone", () => {
    const even = stateOf({ white: ["a7"], black: ["c5"], turn: "white", hands: { white: 5, black: 5 } });
    const ahead = stateOf({ white: ["a7"], black: ["c5"], turn: "white", hands: { white: 5, black: 4 } });
    expect(evaluate(ahead, DEFAULT_WEIGHTS, gasser) - evaluate(even, DEFAULT_WEIGHTS, gasser)).toBe(
      DEFAULT_WEIGHTS.material,
    );
  });

  it("prices an open two, a mill and an unblockable fork against each other", () => {
    const hands = { white: 4, black: 4 };
    const e = (s: GameState) => evaluate(s, DEFAULT_WEIGHTS, gasser);
    // Every fixture here holds the material even, so only the structural terms move.
    const loose = stateOf({ white: ["a7", "f6"], black: ["c5", "e3"], turn: "white", hands });
    const openTwo = stateOf({ white: ["a7", "d7"], black: ["c5", "e3"], turn: "white", hands });
    expect(e(openTwo) - e(loose)).toBe(DEFAULT_WEIGHTS.openTwo);

    // A closed mill beats the open two it came from, and is worth its own weight
    // against three stones sharing no line at all.
    const millPos = stateOf({ white: ["a7", "d7", "g7"], black: ["c5", "e3"], turn: "white", hands });
    const spread = stateOf({ white: ["a7", "d7", "f6"], black: ["c5", "e3"], turn: "white", hands });
    const scattered = stateOf({ white: ["a7", "f6", "e4"], black: ["c5", "e3"], turn: "white", hands });
    expect(e(millPos)).toBeGreaterThan(e(spread));
    expect(e(millPos) - e(scattered)).toBe(DEFAULT_WEIGHTS.mill);

    // …and two open twos that share their empty point beat two that do not, by
    // exactly the fork term: d7-g7 and a1-a4 both need a7, and Black can only block
    // one point.
    const twoThreats = stateOf({ white: ["d7", "g7", "b2", "b6"], black: ["c5", "e3"], turn: "white", hands });
    const fork = stateOf({ white: ["d7", "g7", "a1", "a4"], black: ["c5", "e3"], turn: "white", hands });
    expect(e(fork) - e(twoThreats)).toBe(DEFAULT_WEIGHTS.doubleThreat);
  });

  it("decays a win by distance, so a faster mate scores higher", () => {
    const won: GameState = { ...stateOf({ turn: "black" }), status: "white_win_stones" };
    expect(evaluateAtPly(won, 0, DEFAULT_WEIGHTS, gasser)).toBe(-WIN);
    expect(evaluateAtPly(won, 3, DEFAULT_WEIGHTS, gasser)).toBe(-WIN + 3);
    const level = initialState(gasser);
    expect(evaluateAtPly(level, 5, DEFAULT_WEIGHTS, gasser)).toBe(evaluate(level, DEFAULT_WEIGHTS, gasser));
  });
});

// ── Tactics ───────────────────────────────────────────────────────────────────

describe("the search finds what it should", () => {
  it("closes a mill when one is there for free", () => {
    const s = stateOf({
      white: ["a7", "d7"],
      black: ["a1", "g1"],
      turn: "white",
      hands: { white: 7, black: 7 },
    });
    resetTT();
    const r = pickMove(s, gasser, { maxDepth: 2 }, FULL_CONFIG, fixed);
    expect(r.move).not.toBeNull();
    expect(r.move!.to).toBe(p("g7"));
    expect(r.move!.remove).not.toBeNull();
    expect(applyMove(s, r.move!, gasser).board.filter((c) => c === 2)).toHaveLength(1);
  });

  it("wins in one by taking the opponent's third stone", () => {
    const s = stateOf({ white: ["a7", "d7", "g4", "f4"], black: ["c5", "e5", "e3"], turn: "white" });
    resetTT();
    const r = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, fixed);
    expect(r.score).toBe(WIN - 1); // mate distance: one ply
    expect(r.score).toBeGreaterThanOrEqual(DECISIVE);
    expect(r.depth).toBe(1); // and it stops deepening once the result is forced
    expect(applyMove(s, r.move!, gasser).status).toBe("white_win_stones");
  });

  it("blocks the opponent's mill rather than lose a stone to it", () => {
    // Black threatens b2-b4-b6 and can execute it from c4; White's a4 stone is the
    // only piece that can take b4 first. White has no counter-threat, so the only
    // way not to lose a stone is to block.
    const s = stateOf({
      white: ["a4", "f4", "d3", "c3"],
      black: ["b2", "b6", "c4", "e3"],
      turn: "white",
    });
    // The threat is real: left alone, Black closes it and takes a White stone.
    const quiet = applyMove(s, { from: p("f4"), to: p("g4"), remove: null }, gasser);
    expect(allMoves(quiet, gasser).some((m) => m.remove !== null)).toBe(true);

    for (const depth of [2, 3, 4]) {
      resetTT();
      const r = pickMove(s, gasser, { maxDepth: depth }, FULL_CONFIG, fixed);
      expect(moveName(r.move!), `depth ${depth}`).toBe("a4-b4");
      const after = applyMove(s, r.move!, gasser);
      expect(allMoves(after, gasser).some((m) => m.remove !== null)).toBe(false);
    }
  });

  it("agrees with the stripped-down config about the value of a forced position", () => {
    const s = stateOf({ white: ["a7", "d7", "g4", "f4"], black: ["c5", "e5", "e3"], turn: "white" });
    resetTT();
    const full = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, fixed);
    resetTT();
    const legacy = pickMove(s, gasser, { maxDepth: 3 }, LEGACY_CONFIG, fixed);
    expect(full.score).toBeGreaterThanOrEqual(DECISIVE);
    expect(legacy.score).toBe(full.score);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("returns the identical result twice with no deadline and a seeded rng", () => {
    const positions = [
      initialState(gasser),
      stateOf({
        white: ["a7", "g7", "g1", "a1", "d6"],
        black: ["c5", "e5", "e3", "c3", "b4"],
        turn: "black",
      }),
    ];
    for (const s of positions) {
      resetTT();
      const a = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, mulberry32(7));
      resetTT();
      const b = pickMove(s, gasser, { maxDepth: 3 }, FULL_CONFIG, mulberry32(7));
      expect(a).toEqual(b);
    }
  });

  it("keys the table by the whole position and nothing else", () => {
    const s = stateOf({ white: ["a7"], black: ["c5"], turn: "white", hands: { white: 8, black: 8 } });
    expect(ttKey(s)).toBe(ttKey({ ...s, sinceMill: 17 })); // counters are not position
    expect(ttKey(s)).not.toBe(ttKey({ ...s, turn: "black" }));
    expect(ttKey(s)).not.toBe(ttKey({ ...s, inHand: { white: 7, black: 8 } }));
    const { white, black } = masksOf(s.board);
    expect(ttKey(s).startsWith(`${white.toString(36)}.${black.toString(36)}.`)).toBe(true);
  });
});

// ── Equal-best sets ───────────────────────────────────────────────────────────

describe("bestMoves", () => {
  it("contains only moves that really do score the reported value", () => {
    // Checked against a plain negamax, which shares no pruning, no table and no
    // ordering with the search — so a tie collected by accident fails here.
    const positions = [
      initialState(gasser),
      stateOf({ white: ["a7", "d7"], black: ["c5", "e5"], turn: "white", hands: { white: 7, black: 7 } }),
    ];
    for (const s of positions) {
      resetTT();
      const r = pickMove(s, gasser, { maxDepth: 2 }, LEGACY_CONFIG, fixed);
      expect(r.bestMoves.length).toBeGreaterThan(0);
      for (const m of r.bestMoves) {
        const v = -plainNegamax(applyMove(s, m, gasser), 1, 1);
        expect(v, moveName(m)).toBe(r.score);
      }
      // …and the chosen move is one of them.
      expect(r.bestMoves.map(moveName)).toContain(moveName(r.move!));
    }
  });

  it("folds symmetric root moves so the varied pick is varied between *ideas*", () => {
    resetTT();
    const r = pickMove(initialState(gasser), gasser, { maxDepth: 1 }, FULL_CONFIG, fixed);
    expect(r.bestMoves.length).toBeLessThanOrEqual(4);
  });
});

// ── Time management ───────────────────────────────────────────────────────────

describe("time management", () => {
  it("respects a deadline roughly, instead of running to maxDepth", () => {
    resetTT();
    const t0 = Date.now();
    const r = pickMove(initialState(gasser), gasser, { maxDepth: 24, deadlineMs: 150 }, FULL_CONFIG, fixed);
    const elapsed = Date.now() - t0;
    // Generous: the check is "the clock is consulted at all", not a benchmark.
    expect(elapsed).toBeLessThan(4000);
    expect(r.depth).toBeGreaterThanOrEqual(1);
    expect(r.depth).toBeLessThan(24);
    expect(r.move).not.toBeNull();
  });

  it("honours minDepth even under an impossibly tight budget", () => {
    resetTT();
    const r = pickMove(
      initialState(gasser),
      gasser,
      { maxDepth: 12, deadlineMs: 1, minDepth: 4 },
      FULL_CONFIG,
      fixed,
    );
    expect(r.depth).toBeGreaterThanOrEqual(4);
    expect(r.depth).toBeLessThan(12);
  });

  it("is driven by the clock it is given, not the wall clock", () => {
    // A fake `now` that jumps a second per call exhausts any budget immediately,
    // which is the only way to test the deadline without timing anything.
    let t = 0;
    const now = () => (t += 1000);
    resetTT();
    const r = pickMove(initialState(gasser), gasser, { maxDepth: 8, deadlineMs: 500 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS, now);
    expect(r.depth).toBeLessThanOrEqual(2);
    expect(r.move).not.toBeNull();
  });
});

// ── The difficulty ladder ─────────────────────────────────────────────────────

describe("the difficulty ladder", () => {
  const mid = stateOf({
    white: ["a7", "g7", "g1", "a1", "d6", "f4"],
    black: ["c5", "e5", "e3", "c3", "b4", "d2"],
    turn: "white",
  });

  it("plays a legal move at every tier, from the opening and from a midgame", () => {
    const rng = mulberry32(11);
    for (const d of DIFFICULTIES)
      for (const s of [initialState(gasser), mid, { ...mid, turn: "black" as Side }]) {
        const move = chooseMove(s, d, gasser, rng);
        expect(move, `${d}`).not.toBeNull();
        expect(allMoves(s, gasser).map(moveName), `${d}`).toContain(moveName(move!));
      }
  });

  it("reaches the depth the table promises on the fixed-depth tiers", () => {
    const info = chooseMoveDetailed(initialState(gasser), "medium", gasser, fixed);
    expect(info.depth).toBe(4);
    expect(info.nodes).toBeGreaterThan(0);
  });

  it("keeps the cheap tiers cheap enough for a phone", () => {
    // A guard, not a benchmark: a ceiling well above measured cost catches a
    // blow-up without failing on slow CI.
    for (const d of ["easy", "medium"] as const) {
      const info = chooseMoveDetailed(initialState(gasser), d, gasser, mulberry32(3));
      expect(info.elapsedMs, d).toBeLessThan(5000);
    }
  });

  it("blunders sometimes on easy and never above it", () => {
    // The blunder roll is the first thing `rng` is asked for, so a stream that
    // starts below 0.35 forces one.
    const low = () => 0.01;
    const easy = chooseMoveDetailed(initialState(gasser), "easy", gasser, low);
    expect(easy.depth).toBe(0); // a blunder reports no search
    const medium = chooseMoveDetailed(initialState(gasser), "medium", gasser, low);
    expect(medium.depth).toBeGreaterThan(0);
  });
});

// ── The endgame-database probe ────────────────────────────────────────────────

describe("the database probe", () => {
  const probePos = stateOf({
    white: ["a4", "f4", "d3", "c3"],
    black: ["d7", "g4", "c5", "e3"],
    turn: "white",
  });
  /** Two positions are the same for probing purposes iff stones and turn match. */
  const fingerprint = (s: GameState): string => {
    const m = masksOf(s.board);
    return `${m.white}.${m.black}.${s.turn}`;
  };

  it("avoids a child the tables call a loss", () => {
    resetTT();
    const base = pickMove(probePos, gasser, { maxDepth: 3 }, FULL_CONFIG, fixed);
    const poisoned = applyMove(probePos, base.move!, gasser);
    // From the poisoned child's point of view it is *Black* to move and Black wins
    // — i.e. a loss for White, who is choosing.
    const probe: DbProbe = (s) =>
      fingerprint(s) === fingerprint(poisoned) ? { wdl: 1, depth: 3 } : null;

    resetTT();
    const avoided = pickMove(
      probePos,
      gasser,
      { maxDepth: 3 },
      FULL_CONFIG,
      fixed,
      DEFAULT_WEIGHTS,
      undefined,
      probe,
    );
    expect(avoided.move).not.toBeNull();
    expect(moveName(avoided.move!)).not.toBe(moveName(base.move!));
    expect(avoided.score).toBeGreaterThan(-DECISIVE);
    expect(avoided.fromDatabase).toBeUndefined(); // the root was not covered
  });

  it("plays straight out of the table when the root itself is covered", () => {
    const moves = allMoves(probePos, gasser);
    const fast = applyMove(probePos, moves[3], gasser);
    const probe: DbProbe = (s) => {
      if (fingerprint(s) === fingerprint(probePos)) return { wdl: 1, depth: 6 };
      if (fingerprint(s) === fingerprint(fast)) return { wdl: -1, depth: 2 };
      return { wdl: 0, depth: 0 };
    };
    resetTT();
    const r = pickMove(
      probePos,
      gasser,
      { maxDepth: 24 },
      FULL_CONFIG,
      fixed,
      DEFAULT_WEIGHTS,
      undefined,
      probe,
    );
    expect(r.fromDatabase).toBe(true);
    expect(moveName(r.move!)).toBe(moveName(moves[3]));
    expect(r.score).toBe(WIN - 3); // the child's depth-2 loss, one ply further out
    expect(r.depth).toBe(0); // no search was run at all
    expect(r.nodes).toBe(moves.length); // exactly one probe per root move
  });

  it("prefers the shortest win and the longest loss among equals", () => {
    const moves = allMoves(probePos, gasser);
    const slow = applyMove(probePos, moves[0], gasser);
    const quick = applyMove(probePos, moves[1], gasser);
    const winning: DbProbe = (s) => {
      if (fingerprint(s) === fingerprint(probePos)) return { wdl: 1, depth: 9 };
      if (fingerprint(s) === fingerprint(slow)) return { wdl: -1, depth: 8 };
      if (fingerprint(s) === fingerprint(quick)) return { wdl: -1, depth: 4 };
      return { wdl: 1, depth: 1 }; // everything else loses for White
    };
    resetTT();
    expect(
      moveName(
        pickMove(probePos, gasser, { maxDepth: 2 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS, undefined, winning)
          .move!,
      ),
    ).toBe(moveName(moves[1]));

    // All lost: lose as slowly as the table allows.
    const losing: DbProbe = (s) => {
      if (fingerprint(s) === fingerprint(probePos)) return { wdl: -1, depth: 9 };
      if (fingerprint(s) === fingerprint(slow)) return { wdl: 1, depth: 20 };
      return { wdl: 1, depth: 2 };
    };
    resetTT();
    const r = pickMove(probePos, gasser, { maxDepth: 2 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS, undefined, losing);
    expect(moveName(r.move!)).toBe(moveName(moves[0]));
    expect(r.score).toBe(-(WIN - 21));
  });

  it("ignores the tables in the placing phase, where none can cover the position", () => {
    let asked = 0;
    const probe: DbProbe = () => {
      asked++;
      return null;
    };
    resetTT();
    pickMove(
      initialState(gasser),
      gasser,
      { maxDepth: 2 },
      FULL_CONFIG,
      fixed,
      DEFAULT_WEIGHTS,
      undefined,
      probe,
    );
    expect(asked).toBe(0);
  });

  it("reaches the search only through ollamh", () => {
    const calls: string[] = [];
    const probe: DbProbe = (s) => {
      calls.push(ttKey(s));
      return null;
    };
    for (const d of DIFFICULTIES) {
      calls.length = 0;
      chooseMoveDetailed(probePos, d, gasser, mulberry32(5), probe);
      if (d === "ollamh") expect(calls.length, d).toBeGreaterThan(0);
      else expect(calls.length, d).toBe(0);
    }
  });

  it("treats a probed draw as a draw, not as a score to improve on", () => {
    const drawn: DbProbe = () => ({ wdl: 0, depth: 0 });
    resetTT();
    const r = pickMove(
      probePos,
      gasser,
      { maxDepth: 4 },
      FULL_CONFIG,
      fixed,
      DEFAULT_WEIGHTS,
      undefined,
      drawn,
    );
    expect(r.score).toBe(0);
    expect(r.fromDatabase).toBe(true);
  });
});

// ── Rulesets other than the shipped one ───────────────────────────────────────

describe("the engine plays the ruleset it is handed", () => {
  it("searches a no-flying game without complaint", () => {
    const none = rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, flying: "none" });
    const s = stateOf({ white: ["a4", "d6", "d5", "c4", "b2"], black: ["a7", "d7", "c5"], turn: "black" });
    resetTT();
    const r = pickMove(s, none, { maxDepth: 3 }, FULL_CONFIG, fixed);
    expect(r.move).not.toBeNull();
    // Black's only legal move under this ruleset, and it loses: White closes
    // a4-b4-c4 next and takes Black's third stone.
    expect(moveName(r.move!)).toBe("d7-g7");
    expect(r.score).toBeLessThanOrEqual(-DECISIVE);
  });
});

// ── The transposition table's hard ceiling ────────────────────────────────────
// `TT_MAX` is checked when a search *starts*, which is a policy about what a new
// search inherits and no protection at all against one search outgrowing the
// table on its own. A deadline-free deep search does exactly that, and the way it
// failed was not a bad move but `RangeError: Map maximum size exceeded` — so
// `ttStore` now drops the table at a hard ceiling, and what matters is that a
// search survives having its table pulled out from under it mid-iteration.
//
// The ceiling is injected rather than reached: filling 1.6M entries honestly would
// cost the suite a gigabyte of heap to prove one `if`.
describe("the transposition table's ceiling", () => {
  afterEach(() => {
    setTtCeiling();
    resetTT();
  });

  it("drops the table instead of overflowing it, and the search carries on", () => {
    resetTT();
    setTtCeiling(64);
    const s = stateOf({ turn: "white", hands: { white: 9, black: 9 } });
    // No deadline at all — the shape that has no way back to the entry check.
    const r = pickMove(s, gasser, { maxDepth: 4 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS, () => 0);
    expect(r.move).not.toBeNull();
    expect(allMoves(s, gasser).map(moveName)).toContain(moveName(r.move!));
    // Many more than 64 positions were stored, and the table is still inside its
    // ceiling: the valve tripped repeatedly and nothing threw.
    expect(r.nodes).toBeGreaterThan(64);
    expect(ttSize()).toBeLessThanOrEqual(64);
  });

  it("keeps the ceiling a ceiling across searches", () => {
    resetTT();
    setTtCeiling(8);
    const s = stateOf({ white: ["a4", "d6", "d5"], black: ["a7", "d7", "g7"], turn: "white" });
    for (let i = 0; i < 3; i++) {
      expect(() => pickMove(s, gasser, { maxDepth: 5 }, FULL_CONFIG, fixed, DEFAULT_WEIGHTS, () => 0)).not.toThrow();
      expect(ttSize()).toBeLessThanOrEqual(8);
    }
  });
});
