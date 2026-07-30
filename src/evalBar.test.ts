import { describe, expect, it } from "vitest";
import {
  EVAL_FILL_LIMIT,
  EVAL_SCALE,
  POINTS_PER_PIECE,
  decisiveWinner,
  evalAvailable,
  evalBarFill,
  formatEvalScore,
  scoreForBottom,
} from "./evalBar";
import {
  DECISIVE,
  DEFAULT_WEIGHTS,
  WIN,
  analysePosition,
  chooseMoveDetailed,
  evaluate,
  pickMove,
} from "./game/ai";
import { applyMove, initialState } from "./game/engine";
import { VARIANTS } from "./game/variants";

const RECOGNIZED_WIN = WIN - 2; // ai.ts's recognizer result, mirrored for the test

describe("decisive scores", () => {
  it("names the attackers at +WIN and the defenders at -WIN", () => {
    expect(decisiveWinner(WIN)).toBe("attackers");
    expect(decisiveWinner(-WIN)).toBe("defenders");
  });

  it("treats a recognizer's forced result as decisive too", () => {
    // RECOGNIZED_WIN (WIN - 2) sits above DECISIVE (WIN - 1000), so the same
    // test catches both kinds of proven result.
    expect(decisiveWinner(RECOGNIZED_WIN)).toBe("attackers");
    expect(decisiveWinner(-RECOGNIZED_WIN)).toBe("defenders");
  });

  it("leaves anything short of DECISIVE a matter of degree", () => {
    expect(decisiveWinner(DECISIVE - 1)).toBeNull();
    expect(decisiveWinner(-(DECISIVE - 1))).toBeNull();
    expect(decisiveWinner(0)).toBeNull();
    expect(decisiveWinner(5000)).toBeNull();
  });
});

describe("availability — a post-game tool only", () => {
  it("is unavailable while the game is still being played", () => {
    // The whole point: an eval bar and a best-move arrow beside a live game is
    // an engine telling a player what to do.
    expect(evalAvailable({ liveGameOver: false })).toBe(false);
  });

  it("becomes available once the game has concluded", () => {
    expect(evalAvailable({ liveGameOver: true })).toBe(true);
  });

  it("keys on the live game's result, not the position on screen", () => {
    // Two cases this covers, and they pull in opposite directions:
    //
    //  - reviewing an unfinished game shows early positions that are not
    //    themselves terminal, and must still get nothing;
    //  - analysing a finished game truncates the timeline, so the tip is an
    //    unfinished position again — but the real game is over and analysing
    //    it is the supported use, so the eval stays.
    //
    // Both fall out of the caller passing the LIVE result, which is what these
    // two assertions pin.
    const reviewingAnUnfinishedGame = { liveGameOver: false };
    const analysingAVariationOffAFinishedGame = { liveGameOver: true };
    expect(evalAvailable(reviewingAnUnfinishedGame)).toBe(false);
    expect(evalAvailable(analysingAVariationOffAFinishedGame)).toBe(true);
  });
});

describe("sign convention", () => {
  it("keeps an attacker-positive score positive for a bottom-seated attacker", () => {
    expect(scoreForBottom(120, "attackers")).toBe(120);
    expect(scoreForBottom(-120, "attackers")).toBe(-120);
  });

  it("flips it for a bottom-seated defender", () => {
    expect(scoreForBottom(120, "defenders")).toBe(-120);
    expect(scoreForBottom(-120, "defenders")).toBe(120);
  });

  it("fills toward whichever end the winning side is sitting at", () => {
    // One score, two seats: the same position must look won to the winner and
    // lost to the loser, never the same way to both.
    const attackersAhead = 200;
    expect(evalBarFill(attackersAhead, "attackers")).toBeGreaterThan(0.5);
    expect(evalBarFill(attackersAhead, "defenders")).toBeLessThan(0.5);
  });

  it("is symmetric about level: the two seats' fills sum to 1", () => {
    for (const score of [-400, -137, -40, 0, 40, 137, 400]) {
      expect(evalBarFill(score, "attackers") + evalBarFill(score, "defenders")).toBeCloseTo(1, 10);
    }
  });

  it("agrees with the number it is shown beside", () => {
    // The bar and the readout must never contradict each other.
    for (const score of [-900, -200, -40, 40, 200, 900]) {
      for (const seat of ["attackers", "defenders"] as const) {
        const aheadOnBar = evalBarFill(score, seat) > 0.5;
        const aheadInText = formatEvalScore(score, seat).startsWith("+");
        expect(aheadOnBar).toBe(aheadInText);
      }
    }
  });
});

describe("fill mapping", () => {
  it("is level at 0", () => {
    expect(evalBarFill(0, "attackers")).toBeCloseTo(0.5, 10);
    expect(evalBarFill(0, "defenders")).toBeCloseTo(0.5, 10);
  });

  it("does not peg on a one-piece edge — the point of the soft curve", () => {
    const onePiece = evalBarFill(DEFAULT_WEIGHTS.material, "attackers");
    expect(onePiece).toBeGreaterThan(0.5);
    expect(onePiece).toBeLessThan(0.62);
  });

  it("moves monotonically with the score", () => {
    const scores = [-800, -400, -200, -80, -40, 0, 40, 80, 200, 400, 800];
    const fills = scores.map((s) => evalBarFill(s, "attackers"));
    for (let i = 1; i < fills.length; i++) expect(fills[i]).toBeGreaterThan(fills[i - 1]);
  });

  it("reserves the very ends for proven wins", () => {
    // A huge but unproven advantage gets close, and stops short.
    const crushing = evalBarFill(DECISIVE - 1, "attackers");
    expect(crushing).toBe(EVAL_FILL_LIMIT);
    expect(crushing).toBeLessThan(1);
    // Only a decisive score fills it.
    expect(evalBarFill(WIN, "attackers")).toBe(1);
    expect(evalBarFill(-WIN, "attackers")).toBe(0);
  });

  it("puts the half-way points of the curve one scale-length out", () => {
    expect(evalBarFill(EVAL_SCALE, "attackers")).toBeCloseTo(1 / (1 + Math.exp(-1)), 10);
  });

  it("survives a non-finite score rather than drawing nothing", () => {
    expect(evalBarFill(Number.NaN, "attackers")).toBe(0.5);
  });
});

describe("numeric readout", () => {
  it("reports pieces, not raw engine points", () => {
    expect(formatEvalScore(POINTS_PER_PIECE, "attackers")).toBe("+1.0");
    expect(formatEvalScore(2 * POINTS_PER_PIECE, "attackers")).toBe("+2.0");
    expect(formatEvalScore(POINTS_PER_PIECE, "defenders")).toBe("−1.0");
  });

  it("marks a level position without a misleading sign", () => {
    expect(formatEvalScore(0, "attackers")).toBe("±0.0");
    // A rounding-to-zero score must not print as "-0.0" either.
    expect(formatEvalScore(-1, "attackers")).toBe("±0.0");
  });

  it("uses a real minus sign, not a hyphen", () => {
    expect(formatEvalScore(-200, "attackers")).toBe("−5.0");
  });
});

describe("score threading (the plumbing the bar is fed by)", () => {
  it("analysePosition returns a finite attacker-positive score with its move", () => {
    const info = analysePosition(initialState(), VARIANTS.walker);
    expect(info.move).not.toBeNull();
    expect(Number.isFinite(info.score)).toBe(true);
    expect(info.depth).toBeGreaterThan(0);
    // The opening is balanced by construction (D4-symmetric), so it must not
    // read as a won game for anybody.
    expect(decisiveWinner(info.score)).toBeNull();
  });

  it("is deterministic in the position ALONE, whatever was analysed before it", () => {
    // Not just "twice in a row": the transposition table survives between
    // searches and feeds move ordering, so analysing a different position in
    // between used to be enough to change which of several equally-best moves
    // came out first — the arrow appearing to change its mind on a position you
    // had merely stepped away from and back to. `analysePosition` clears the
    // table for exactly this reason; A → B → A is the case that proves it.
    const opening = initialState();
    const elsewhere = applyMove(opening, analysePosition(opening, VARIANTS.walker).move!, VARIANTS.walker);

    const first = analysePosition(opening, VARIANTS.walker);
    analysePosition(elsewhere, VARIANTS.walker);
    const again = analysePosition(opening, VARIANTS.walker);

    expect(again.move).toEqual(first.move);
    expect(again.score).toBe(first.score);
  });

  it("chooseMoveDetailed carries the searched score out with the move", () => {
    const info = chooseMoveDetailed(initialState(), "medium", VARIANTS.walker, () => 0);
    expect(info.move).not.toBeNull();
    expect(Number.isFinite(info.score)).toBe(true);
    expect(info.score).toBe(
      pickMove(initialState(), VARIANTS.walker, { maxDepth: 3 }, undefined, () => 0).score,
    );
  });

  it("a finished game evaluates to a verdict the bar can render", () => {
    // App feeds a terminal position straight to `evaluate` rather than
    // searching it (there is no best move to draw), so the two ends of that
    // path have to agree: ±WIN in, a full bar and a named winner out.
    for (const [status, winner] of [
      ["defenders_win_escape", "defenders"],
      ["attackers_win_capture", "attackers"],
    ] as const) {
      const score = evaluate({ ...initialState(), status }, DEFAULT_WEIGHTS, VARIANTS.walker);
      expect(decisiveWinner(score)).toBe(winner);
      expect(evalBarFill(score, winner)).toBe(1);
      expect(evalBarFill(score, winner === "attackers" ? "defenders" : "attackers")).toBe(0);
    }
  });

  it("reports a static score even on the paths that never search", () => {
    // `easy` blunders with rng below its 0.35 rate: no search, depth 0 — but a
    // caller with an eval to draw still gets a number rather than `undefined`.
    const blunder = chooseMoveDetailed(initialState(), "easy", VARIANTS.walker, () => 0);
    expect(blunder.depth).toBe(0);
    expect(Number.isFinite(blunder.score)).toBe(true);
    expect(blunder.score).toBe(evaluate(initialState(), DEFAULT_WEIGHTS, VARIANTS.walker));
  });
});
