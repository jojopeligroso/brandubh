import { describe, expect, it } from "vitest";
import {
  DECISIVE,
  DEFAULT_WEIGHTS,
  FULL_CONFIG,
  LEGACY_CONFIG,
  WIN,
  chooseMove,
  chooseMoveDetailed,
  evaluate,
  foldRootMoves,
  pickMove,
  resetTT,
  stabilizer,
} from "./engine";
import { allMoves, applyMove, initialState, isEscapeSquare, isGameOver, winnerOf } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import { VARIANTS } from "./variants";

const baseline = VARIANTS.tablut;
const corners = VARIANTS["tablut-corners"];

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

/** A seeded RNG, so every search in here is deterministic. */
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

// ── Evaluation ────────────────────────────────────────────────────────────────

describe("evaluate", () => {
  it("is attacker-positive at terminals", () => {
    const escaped = { ...stateOf(empty(), "attackers"), status: "defenders_win_escape" as const };
    const captured = { ...stateOf(empty(), "defenders"), status: "attackers_win_capture" as const };
    const drawn = { ...stateOf(empty(), "defenders"), status: "draw_repetition" as const };
    expect(evaluate(escaped, DEFAULT_WEIGHTS, baseline)).toBe(-WIN);
    expect(evaluate(captured, DEFAULT_WEIGHTS, baseline)).toBe(WIN);
    expect(evaluate(drawn, DEFAULT_WEIGHTS, baseline)).toBe(0);
  });

  it("scores the opening as a constant offset, not an opinion", () => {
    // Material is level (16 − 2×8 = 0) and the king has no lanes, so the whole
    // score is the king-depth term: 4 squares from the rim × 30. Pinned here
    // because it is easy to mistake for "Black is three soldiers up" — see the
    // note on DEFAULT_WEIGHTS.
    expect(evaluate(initialState(baseline), DEFAULT_WEIGHTS, baseline)).toBeCloseTo(120, 5);
  });

  it("prefers a king nearer the rim, from the defenders' point of view", () => {
    const deep = empty();
    deep[4][4] = "king";
    const shallow = empty();
    shallow[1][4] = "king";
    // Both have open lanes, so compare with the recognizers off to isolate the
    // positional terms from the proof.
    const w = { ...DEFAULT_WEIGHTS, endgameRecognizers: false };
    expect(evaluate(stateOf(shallow, "attackers"), w, baseline)).toBeLessThan(
      evaluate(stateOf(deep, "attackers"), w, baseline),
    );
  });

  it("counts a defender as worth about two attackers", () => {
    const withDefender = empty();
    withDefender[4][4] = "king";
    withDefender[2][2] = "defender";
    const withTwoAttackers = empty();
    withTwoAttackers[4][4] = "king";
    withTwoAttackers[2][2] = "attacker";
    withTwoAttackers[2][3] = "attacker";
    const w = { ...DEFAULT_WEIGHTS, endgameRecognizers: false, kingRegion: 0 };
    // −2 defenders' worth against +2 attackers: a four-soldier swing.
    expect(
      evaluate(stateOf(withTwoAttackers, "attackers"), w, baseline) -
        evaluate(stateOf(withDefender, "attackers"), w, baseline),
    ).toBeCloseTo(4 * DEFAULT_WEIGHTS.material, 5);
  });

  it("returns a decisive score for a proven two-lane fork", () => {
    const b = empty();
    b[3][3] = "king";
    b[6][0] = "attacker";
    b[6][8] = "attacker";
    const score = evaluate(stateOf(b, "attackers"), DEFAULT_WEIGHTS, baseline);
    expect(score).toBeLessThanOrEqual(-DECISIVE);
    expect(score).toBeGreaterThan(-WIN); // but below a literal escape, so the
    // search still prefers winning *now* over winning next move
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe("the search finds what it should", () => {
  it("takes an escape that is one move away", () => {
    const b = empty();
    b[4][4] = "king";
    b[8][8] = "attacker";
    const r = pickMove(stateOf(b, "defenders"), baseline, { maxDepth: 2 }, FULL_CONFIG, () => 0);
    expect(r.move).not.toBeNull();
    expect(isEscapeSquare(r.move!.to.row, r.move!.to.col, baseline)).toBe(true);
    expect(r.score).toBeLessThanOrEqual(-DECISIVE);
  });

  it("takes a king capture that is one move away", () => {
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][7] = "attacker"; // (3,7) → (3,4) captures
    const r = pickMove(stateOf(b, "attackers"), baseline, { maxDepth: 2 }, FULL_CONFIG, () => 0);
    expect(r.move).toEqual({ from: { row: 3, col: 7 }, to: { row: 3, col: 4 } });
    expect(r.score).toBeGreaterThanOrEqual(DECISIVE);
  });

  it("does not walk the king into a capture when it has a safe move", () => {
    // The king can step east onto (3,4), where the waiting attackers would take
    // him, or west to safety.
    const b = empty();
    b[3][3] = "king";
    b[2][4] = "attacker";
    b[4][4] = "attacker";
    b[0][5] = "attacker"; // slides to (3,5) after the king steps to (3,4)
    const r = pickMove(stateOf(b, "defenders"), baseline, { maxDepth: 3 }, FULL_CONFIG, () => 0);
    expect(r.move).not.toBeNull();
    const child = applyMove(stateOf(b, "defenders"), r.move!, baseline);
    expect(child.status).not.toBe("attackers_win_capture");
  });

  it("is deterministic at fixed depth with a pinned tie-break", () => {
    const s = initialState(baseline);
    resetTT();
    const a = pickMove(s, baseline, { maxDepth: 3 }, FULL_CONFIG, () => 0);
    resetTT();
    const b = pickMove(s, baseline, { maxDepth: 3 }, FULL_CONFIG, () => 0);
    expect(a.move).toEqual(b.move);
    expect(a.score).toBe(b.score);
    expect(a.nodes).toBe(b.nodes);
  });

  it("agrees with the legacy config about the value of a forced position", () => {
    // Different machinery, same game: a mate-in-one must score decisively either
    // way. This is the check that the TT, killers, LMR and PVS have not changed
    // what the search *means*.
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][7] = "attacker";
    const s = stateOf(b, "attackers");
    resetTT();
    const full = pickMove(s, baseline, { maxDepth: 3 }, FULL_CONFIG, () => 0);
    resetTT();
    const legacy = pickMove(s, baseline, { maxDepth: 3 }, LEGACY_CONFIG, () => 0);
    expect(full.score).toBeGreaterThanOrEqual(DECISIVE);
    expect(legacy.score).toBeGreaterThanOrEqual(DECISIVE);
  });

  it("returns no move when the side to move is blocked", () => {
    const b = empty();
    b[4][4] = "king";
    const r = pickMove(stateOf(b, "attackers"), baseline, { maxDepth: 2 }, FULL_CONFIG, () => 0);
    expect(r.move).toBeNull();
    expect(r.bestMoves).toEqual([]);
  });

  it("reports an exact equal-best set", () => {
    // A lone king in the centre of an empty board: all four escapes are the same
    // move by symmetry, so after D4 folding the tie set is one representative and
    // every member is genuinely equal-best.
    const b = empty();
    b[4][4] = "king";
    b[8][8] = "attacker";
    const r = pickMove(stateOf(b, "defenders"), baseline, { maxDepth: 2 }, FULL_CONFIG, () => 0);
    expect(r.bestMoves.length).toBeGreaterThan(0);
    expect(r.bestMoves).toContainEqual(r.move);
  });
});

// ── D4 folding ────────────────────────────────────────────────────────────────

describe("D4 root folding", () => {
  it("finds the full symmetry group at the opening", () => {
    expect(stabilizer(initialState(baseline).board)).toHaveLength(8);
  });

  it("collapses the opening's legal moves to one representative per orbit", () => {
    const s = initialState(baseline);
    const group = stabilizer(s.board);
    for (const side of ["defenders", "attackers"] as const) {
      const moves = allMoves(s.board, side, baseline);
      const folded = foldRootMoves(moves, group);
      expect(folded.length).toBeLessThan(moves.length);
      // The group has order 8, so an orbit is at most 8 moves and the fold cannot
      // shrink the list by more than that factor.
      expect(folded.length).toBeGreaterThanOrEqual(Math.ceil(moves.length / 8));
    }
  });

  it("leaves an asymmetric position's moves alone", () => {
    const b = empty();
    b[4][4] = "king";
    b[1][2] = "attacker"; // breaks every reflection and rotation
    expect(stabilizer(b)).toHaveLength(1);
    const moves = allMoves(b, "attackers", baseline);
    expect(foldRootMoves(moves, stabilizer(b))).toHaveLength(moves.length);
  });
});

// ── The difficulty ladder ─────────────────────────────────────────────────────

describe("the difficulty ladder", () => {
  it("plays a legal move at every tier, for both sides", () => {
    const rng = mulberry32(7);
    for (const d of ["easy", "medium", "hard", "ollamh"] as const) {
      for (const turn of ["defenders", "attackers"] as const) {
        const s = { ...initialState(baseline), turn };
        const move = chooseMove(s, d, baseline, rng);
        expect(move).not.toBeNull();
        const legal = allMoves(s.board, turn, baseline);
        expect(legal).toContainEqual({ from: move!.from, to: move!.to });
      }
    }
  });

  it("keeps the cheap tiers cheap enough for a phone", () => {
    // Not a benchmark — a guard. Depth 3 on 81 squares measured ~400ms in a
    // midgame position on this machine, so a ceiling well above that catches a
    // real blow-up (a broken cap, a runaway recognizer) without failing on slow
    // CI. `hard` and `ollamh` are excluded: they are budgeted by design and run
    // in a worker.
    for (const d of ["easy", "medium"] as const) {
      const info = chooseMoveDetailed(initialState(baseline), d, baseline, mulberry32(1));
      expect(info.elapsedMs).toBeLessThan(5000);
    }
  });

  it("reports the depth and node count it actually reached", () => {
    const info = chooseMoveDetailed(initialState(baseline), "medium", baseline, () => 0);
    expect(info.depth).toBe(3);
    expect(info.nodes).toBeGreaterThan(0);
  });
});

// ── Playing whole games ───────────────────────────────────────────────────────

describe("self-play", () => {
  it("plays a full game to a legal conclusion without stalling", () => {
    // The end-to-end check that the rules and the engine agree: every move the
    // engine picks must be legal, and the game must either finish or still be
    // running after the cap — never throw and never offer an illegal move.
    const rng = mulberry32(20260810);
    let s = initialState(baseline);
    let plies = 0;
    while (!isGameOver(s.status) && plies < 60) {
      const move = chooseMove(s, "easy", baseline, rng);
      expect(move).not.toBeNull();
      expect(allMoves(s.board, s.turn, baseline)).toContainEqual({
        from: move!.from,
        to: move!.to,
      });
      s = applyMove(s, move!, baseline);
      plies++;
    }
    if (isGameOver(s.status)) expect(winnerOf(s.status)).not.toBeNull();
  });

  it("plays the corner-escape variant too, where the recognizers stand down", () => {
    const rng = mulberry32(4242);
    let s = initialState(corners);
    for (let ply = 0; ply < 40 && !isGameOver(s.status); ply++) {
      const move = chooseMove(s, "easy", corners, rng);
      expect(move).not.toBeNull();
      s = applyMove(s, move!, corners);
    }
    expect(s.moveCount).toBeGreaterThan(0);
  });
});
