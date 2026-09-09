import { describe, expect, it } from "vitest";
import {
  DECISIVE,
  DEFAULT_WEIGHTS,
  DIFFICULTIES,
  FULL_CONFIG,
  LEGACY_CONFIG,
  WIN,
  chooseMove,
  chooseMoveDetailed,
  clearPathToCorner,
  evaluate,
  foldRootMoves,
  kingCornerMoves,
  kingRegionSize,
  pickMove,
  resetTT,
  stabilizer,
} from "./engine";
import { allMoves, applyMove, initialState, isGameOver, movesFrom, winnerOf } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import { VARIANTS } from "./variants";

const cph = VARIANTS.copenhagen;

const empty = (): Board =>
  Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));

const stateOf = (b: Board, turn: Side): GameState => ({
  board: b,
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
  sinceCapture: 0,
});

/** Whether some legal move for the side to move reaches `status`. */
const someMoveGives = (s: GameState, status: string, rules = cph): boolean =>
  allMoves(s.board, s.turn, rules).some((m) => applyMove(s, m, rules).status === status);

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

// ── What the board actually costs to search ───────────────────────────────────
// Recorded rather than asserted tightly. These numbers are the reason the depth
// ladder in DIFFICULTIES buys fewer plies here than on either smaller board, and
// a future reader changing the search wants to know them before wondering why.

describe("the size of the problem", () => {
  it("opens roughly twice as wide as Tablut and three times as wide as Brandubh", () => {
    const s = initialState(cph);
    const attackers = allMoves(s.board, "attackers", cph).length;
    const defenders = allMoves(s.board, "defenders", cph).length;
    // Measured: 116 and 60, against Tablut's 80/56 and Brandubh's ~40.
    expect(attackers).toBe(116);
    expect(defenders).toBe(60);
  });
});

// ── Evaluation ────────────────────────────────────────────────────────────────

describe("evaluate", () => {
  it("is attacker-positive at the terminals", () => {
    const s = initialState(cph);
    expect(evaluate({ ...s, status: "attackers_win_capture" }, DEFAULT_WEIGHTS, cph)).toBe(WIN);
    expect(evaluate({ ...s, status: "defenders_win_escape" }, DEFAULT_WEIGHTS, cph)).toBe(-WIN);
    expect(evaluate({ ...s, status: "defenders_win_fort" }, DEFAULT_WEIGHTS, cph)).toBe(-WIN);
    expect(
      evaluate({ ...s, status: "defenders_win_repetition" }, DEFAULT_WEIGHTS, cph),
    ).toBe(-WIN);
    expect(evaluate({ ...s, status: "draw_repetition" }, DEFAULT_WEIGHTS, cph)).toBe(0);
  });

  it("scores the opening near level, unlike Tablut's constant offset", () => {
    // Tablut's opening scores +120 and all of it is the king-depth term, because
    // under edge escape the king starts as far from a winning square as he can
    // be. Under corner escape `kingCornerMoves` reads 2 from the throne (an
    // L-path exists), so the same term contributes only a modest constant here
    // and the material balance is genuinely even. Worth knowing before reading
    // the score as an opinion about the position.
    const score = evaluate(initialState(cph), DEFAULT_WEIGHTS, cph);
    expect(Math.abs(score)).toBeLessThan(200);
  });

  it("prefers a king with open corner lanes, from the defenders' side", () => {
    const boxed = empty();
    boxed[5][5] = "king";
    const running = empty();
    running[0][5] = "king"; // two clear lanes along the top rank
    expect(clearPathToCorner(running, 0, 5)).toBe(2);
    // Lower is better for the defenders, and the lane term is quadratic.
    expect(evaluate(stateOf(running, "defenders"), DEFAULT_WEIGHTS, cph)).toBeLessThan(
      evaluate(stateOf(boxed, "defenders"), DEFAULT_WEIGHTS, cph),
    );
  });

  it("counts the king's breathing room, capped", () => {
    const open = empty();
    open[5][5] = "king";
    // The cap is *soft*, in all three engines: the loop tests it at the top and
    // then pushes up to four neighbours, so it can overshoot by three. That is
    // fine for an eval term and not worth diverging this fork over — but it is
    // worth pinning, so nobody later reads the constant as an exact ceiling.
    expect(kingRegionSize(open, 5, 5)).toBeGreaterThanOrEqual(30);
    expect(kingRegionSize(open, 5, 5)).toBeLessThanOrEqual(33);

    const boxed = empty();
    boxed[5][5] = "king";
    boxed[4][5] = "attacker";
    boxed[6][5] = "attacker";
    boxed[5][4] = "attacker";
    boxed[5][6] = "attacker";
    expect(kingRegionSize(boxed, 5, 5)).toBe(0);
  });

  it("reads the king's real distance to a corner, blockers included", () => {
    const b = empty();
    b[0][5] = "king";
    expect(kingCornerMoves(b, 0, 5, cph)).toBe(1); // straight down the rank
    b[0][1] = "attacker";
    b[0][9] = "attacker";
    expect(kingCornerMoves(b, 0, 5, cph)).toBe(2); // both lanes shut; an L-path remains
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe("pickMove", () => {
  it("returns a legal move from the opening at every difficulty's shape", () => {
    const s = initialState(cph);
    for (const depth of [1, 2, 3]) {
      const out = pickMove(s, cph, { maxDepth: depth, deadlineMs: 4000 }, FULL_CONFIG, () => 0.5);
      expect(out.move).not.toBeNull();
      const legal = allMoves(s.board, s.turn, cph);
      expect(
        legal.some(
          (m) =>
            m.from.row === out.move!.from.row &&
            m.from.col === out.move!.from.col &&
            m.to.row === out.move!.to.row &&
            m.to.col === out.move!.to.col,
        ),
      ).toBe(true);
      expect(out.nodes).toBeGreaterThan(0);
    }
  });

  it("takes the escape when the king has one in hand", () => {
    const b = empty();
    b[0][5] = "king";
    b[7][7] = "attacker";
    const out = pickMove(stateOf(b, "defenders"), cph, { maxDepth: 3 }, FULL_CONFIG, () => 0.5);
    expect(out.move).not.toBeNull();
    const after = applyMove(stateOf(b, "defenders"), out.move!, cph);
    expect(after.status).toBe("defenders_win_escape");
    expect(out.score).toBeLessThanOrEqual(-DECISIVE);
  });

  it("takes the king when the capture is there, against a strong king", () => {
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    b[3][9] = "attacker"; // slides west onto (3,4)
    const out = pickMove(stateOf(b, "attackers"), cph, { maxDepth: 3 }, FULL_CONFIG, () => 0.5);
    expect(out.move).not.toBeNull();
    const after = applyMove(stateOf(b, "attackers"), out.move!, cph);
    expect(after.status).toBe("attackers_win_capture");
  });

  it("never returns an illegal or null move over a full self-played game", () => {
    // The cheapest possible guard against a search that desynchronises from the
    // rules — an engine that plays a move the rules do not have is a crash in the
    // UI and a corrupt save on disk.
    let s = initialState(cph);
    const rng = mulberry32(20260904);
    for (let ply = 0; ply < 24 && !isGameOver(s.status); ply++) {
      const out = pickMove(s, cph, { maxDepth: 2, deadlineMs: 2000 }, FULL_CONFIG, rng);
      expect(out.move, `no move at ply ${ply}`).not.toBeNull();
      const from = s.board[out.move!.from.row][out.move!.from.col];
      expect(from).not.toBeNull();
      expect(
        movesFrom(s.board, out.move!.from.row, out.move!.from.col, cph).some(
          (d) => d.row === out.move!.to.row && d.col === out.move!.to.col,
        ),
        `illegal move at ply ${ply}`,
      ).toBe(true);
      s = applyMove(s, out.move!, cph);
    }
    expect(s.moveCount).toBeGreaterThan(0);
    if (isGameOver(s.status)) expect(winnerOf(s.status)).not.toBeNull();
  });

  it("keeps the difficulty ladder in the order the UI shows it", () => {
    expect(DIFFICULTIES).toEqual(["easy", "medium", "hard", "ollamh"]);
  });
});

// ── D4 root folding ───────────────────────────────────────────────────────────
// Copenhagen's opening has the same full D4 symmetry as the other two boards,
// and its branching factor is the widest of the three (see "the size of the
// problem" above), so folding root moves to one representative per orbit buys
// more here than it does on either smaller board.

describe("D4 root folding", () => {
  it("finds the full symmetry group at the opening", () => {
    expect(stabilizer(initialState(cph).board)).toHaveLength(8);
  });

  it("collapses the opening's legal moves to one representative per orbit", () => {
    const s = initialState(cph);
    const group = stabilizer(s.board);
    for (const side of ["defenders", "attackers"] as const) {
      const moves = allMoves(s.board, side, cph);
      const folded = foldRootMoves(moves, group);
      expect(folded.length).toBeLessThan(moves.length);
      // The group has order 8, so an orbit is at most 8 moves and the fold cannot
      // shrink the list by more than that factor.
      expect(folded.length).toBeGreaterThanOrEqual(Math.ceil(moves.length / 8));
    }
  });

  it("leaves an asymmetric position's moves alone", () => {
    const b = empty();
    b[5][5] = "king"; // the throne — the only square he may occupy off the setup
    b[1][2] = "attacker"; // breaks every reflection and rotation
    expect(stabilizer(b)).toHaveLength(1);
    const moves = allMoves(b, "attackers", cph);
    expect(foldRootMoves(moves, stabilizer(b))).toHaveLength(moves.length);
  });
});

// ── Legacy vs. full search ────────────────────────────────────────────────────

describe("the search finds what it should", () => {
  it("agrees with the legacy config about the value of a forced position", () => {
    // Different machinery, same game: a mate-in-one must score decisively either
    // way. This is the check that the TT, killers and move ordering have not
    // changed what the search *means* on this board.
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    b[3][9] = "attacker"; // slides west onto (3,4), completing all four hostile
    // sides a strong king needs (rule 7)
    const s = stateOf(b, "attackers");
    resetTT();
    const full = pickMove(s, cph, { maxDepth: 3 }, FULL_CONFIG, () => 0.5);
    resetTT();
    const legacy = pickMove(s, cph, { maxDepth: 3 }, LEGACY_CONFIG, () => 0.5);
    expect(full.score).toBeGreaterThanOrEqual(DECISIVE);
    expect(legacy.score).toBeGreaterThanOrEqual(DECISIVE);
  });
});

// ── Quiescence kills the horizon effect ───────────────────────────────────────

describe("quiescence kills the horizon effect", () => {
  // Defenders to move. The king already has three of the four hostile sides a
  // strong king needs (rule 7) — a raider to the north, south and west — and a
  // fourth raider is one straight slide away on the same rank. A material grab
  // far off on the board looks, to a search that never looks past its own move,
  // like the clear best available; only a search that also looks at the raiders'
  // reply sees that grabbing it lets the fourth raider slide in and complete the
  // capture next move.
  //
  // Weights here are pared down to material alone — recognizers off, and the
  // positional terms (kingCorner, escapeLane, hug, kingRegion) zeroed too.
  // Copenhagen's strong king carries heavier king-safety terms than either
  // other board's weaker capture rule, and left on they dominate a hand-built
  // fixture like this one on their own (a king already hemmed in on three sides
  // scores badly regardless of what happens next), which buries the very effect
  // this pair exists to isolate. The Brandubh and Tablut twins of this test
  // don't need the trim, because their king rule keeps those terms modest by
  // comparison — verified by hand against this fixture before writing it this
  // way, not assumed.
  const materialOnly = {
    ...DEFAULT_WEIGHTS,
    endgameRecognizers: false,
    attackerRecognizer: false,
    kingCorner: 0,
    escapeLane: 0,
    hug: 0,
    kingRegion: 0,
    shield: 0,
    liberties: 0,
    mobility: 0,
  };
  const build = (): GameState => {
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker"; // north flank
    b[4][3] = "attacker"; // south flank
    b[3][2] = "attacker"; // west flank
    b[3][9] = "attacker"; // the fourth flank, one slide from (3,4)
    b[8][4] = "attacker"; // the bait
    b[8][3] = "defender"; // anvil for the bait
    b[8][6] = "defender"; // can slide to (8,5) and grab the bait
    return stateOf(b, "defenders");
  };

  it("full search does not hang the king at depth 1", () => {
    const s = build();
    resetTT();
    const { move } = pickMove(s, cph, { maxDepth: 1 }, FULL_CONFIG, () => 0.5, materialOnly);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, cph);
    expect(someMoveGives(after, "attackers_win_capture")).toBe(false);
  });

  it("legacy (no quiescence) walks into the king capture at the same depth", () => {
    const s = build();
    resetTT();
    const { move } = pickMove(s, cph, { maxDepth: 1 }, LEGACY_CONFIG, () => 0.5, materialOnly);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, cph);
    // Demonstrates the horizon blunder the new search fixes.
    expect(someMoveGives(after, "attackers_win_capture")).toBe(true);
  });
});

// ── Copenhagen-only tactics ───────────────────────────────────────────────────
// Exit fort and shieldwall capture are read straight from applyMove's
// computeStatus (see rules.ts), not through any evaluation weight or
// quiescence entry — neither rule has one. So the search only ever sees either
// as a terminal once it is already inside the horizon; it gets no static nudge
// toward one from further out. Both fixtures below sit one move from the
// terminal, so a shallow search is enough to prove it takes what's already
// there — this says nothing about whether the search can steer *toward* one
// from further away, which is a question for Phase 2's strength measurement,
// not this suite.

describe("Copenhagen-only tactics", () => {
  it("completes an exit fort one move away, as defenders", () => {
    // The same pocket as rules.test.ts's `fortBoard`/`closing` fixtures,
    // verified there against `exitFort` directly: a sealed 2×2 pocket against
    // the top edge, one wall square left open, and a defender able to close it
    // in a single slide up the file.
    const b = empty();
    b[0][4] = "defender";
    b[0][5] = "king";
    b[0][7] = "defender";
    b[1][4] = "defender";
    b[1][7] = "defender";
    b[2][5] = "defender";
    b[4][6] = "defender"; // closes the pocket by sliding to (2,6)
    b[10][2] = "attacker"; // keeps the flood fill's "outside" a real exterior
    const s = stateOf(b, "defenders");
    resetTT();
    const { move } = pickMove(s, cph, { maxDepth: 1 }, FULL_CONFIG, () => 0.5);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, cph);
    expect(after.status).toBe("defenders_win_fort");
  });

  it("closes a shieldwall capture one move away, as raiders", () => {
    // rules.test.ts's "spares the king but takes the soldiers beside him": the
    // king stands in the row so the capture must spare him, leaving the two
    // flanking defenders as the only legitimate prey — which is exactly what
    // makes a plain material-seeking search choose to close it.
    const b = empty();
    b[0][4] = "defender";
    b[0][5] = "king";
    b[0][6] = "defender";
    b[0][3] = "attacker"; // bracket
    b[0][7] = "attacker"; // bracket
    b[1][4] = "attacker"; // front
    b[1][6] = "attacker"; // front
    b[4][5] = "attacker"; // slides to (1,5), fronting the king and closing the wall
    const s = stateOf(b, "attackers");
    resetTT();
    const { move } = pickMove(s, cph, { maxDepth: 1 }, FULL_CONFIG, () => 0.5);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, cph);
    expect(after.captured.defenders).toBe(2);
    expect(after.board[0][4]).toBeNull();
    expect(after.board[0][6]).toBeNull();
    expect(after.board[0][5]).toBe("king"); // the king survives a shieldwall
  });
});

// ── Depth floor: slow devices still search deep enough ────────────────────────

describe("depth floor: slow devices still search deep enough", () => {
  it("honours minDepth even under an impossibly tight budget", () => {
    // A 1ms budget would normally stop hard at depth 1 on a slow device — exactly
    // the shallow, materialistic play we're fixing. minDepth must override the
    // clock.
    resetTT();
    const r = pickMove(
      initialState(cph),
      cph,
      { maxDepth: 6, deadlineMs: 1, minDepth: 4 },
      FULL_CONFIG,
      () => 0.5,
    );
    expect(r.depth).toBeGreaterThanOrEqual(4);
  });

  it("still stops past the floor when the budget is spent (does not run to maxDepth)", () => {
    // Past minDepth the real budget applies again, so a tiny budget caps the
    // search near the floor rather than grinding all the way to maxDepth.
    resetTT();
    const r = pickMove(
      initialState(cph),
      cph,
      { maxDepth: 12, deadlineMs: 1, minDepth: 4 },
      FULL_CONFIG,
      () => 0.5,
    );
    expect(r.depth).toBeGreaterThanOrEqual(4);
    expect(r.depth).toBeLessThan(12);
  });
});

// ── The difficulty ladder actually plays ──────────────────────────────────────

describe("the difficulty ladder", () => {
  it("plays a legal move at every tier, for both sides", () => {
    const rng = mulberry32(7);
    for (const d of DIFFICULTIES) {
      for (const turn of ["defenders", "attackers"] as const) {
        const s = { ...initialState(cph), turn };
        const move = chooseMove(s, d, cph, rng);
        expect(move).not.toBeNull();
        const legal = allMoves(s.board, turn, cph);
        expect(legal).toContainEqual({ from: move!.from, to: move!.to });
      }
    }
  });

  it("keeps the cheap tiers cheap enough for a phone", () => {
    // Not a benchmark — a guard. Copenhagen's branching is the widest of the
    // three boards (~116/60 at the opening, against Tablut's ~80/56 and
    // Brandubh's ~40), so a ceiling well above measured cost catches a real
    // blow-up without failing on slow CI. `hard` and `ollamh` are excluded:
    // they are budgeted by design (multi-second deadlines) and run in a worker.
    for (const d of ["easy", "medium"] as const) {
      const info = chooseMoveDetailed(initialState(cph), d, cph, mulberry32(1));
      expect(info.elapsedMs).toBeLessThan(5000);
    }
  });

  it("reports the depth and node count it actually reached", () => {
    const info = chooseMoveDetailed(initialState(cph), "medium", cph, () => 0.5);
    expect(info.depth).toBe(3);
    expect(info.nodes).toBeGreaterThan(0);
  });
});
