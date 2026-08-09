import { describe, expect, it } from "vitest";
import { BAND_CUTS, BANDS, GRADE_WEIGHTS, bandOf, gradeOf, type Salience } from "./grade";
import { DIFFICULTIES } from "./engine";

const bland: Salience = {
  capture: false,
  movesKing: false,
  towardCorner: false,
  onlyMoveOfPiece: false,
};

const m = (depthToFind: number, lineLength = 1, salience: Partial<Salience> = {}) => ({
  depthToFind,
  lineLength,
  salience: { ...bland, ...salience },
});

describe("gradeOf", () => {
  it("is dominated by how deep the engine had to look", () => {
    expect(gradeOf(m(1))).toBe(GRADE_WEIGHTS.depthToFind);
    expect(gradeOf(m(4))).toBe(4 * GRADE_WEIGHTS.depthToFind);
    expect(gradeOf(m(4))).toBeGreaterThan(gradeOf(m(1, 4)));
  });

  it("charges nothing for the first solver move and something for each after it", () => {
    expect(gradeOf(m(2, 1))).toBe(2 * GRADE_WEIGHTS.depthToFind);
    expect(gradeOf(m(2, 2))).toBe(2 * GRADE_WEIGHTS.depthToFind + GRADE_WEIGHTS.linePastFirst);
    expect(gradeOf(m(2, 4))).toBe(2 * GRADE_WEIGHTS.depthToFind + 3 * GRADE_WEIGHTS.linePastFirst);
  });

  it("makes a salient move easier, never harder", () => {
    // The whole reason salience is in the formula: depth-to-find alone
    // under-rates a move a person spots instantly and the engine justifies late.
    const plain = gradeOf(m(3));
    for (const flag of ["capture", "movesKing", "towardCorner", "onlyMoveOfPiece"] as const) {
      expect(gradeOf(m(3, 1, { [flag]: true }))).toBeLessThan(plain);
    }
  });

  it("applies every salience flag that is set, not just the first", () => {
    const all = gradeOf(m(4, 1, { capture: true, movesKing: true, towardCorner: true, onlyMoveOfPiece: true }));
    const w = GRADE_WEIGHTS.salience;
    expect(all).toBe(4 * GRADE_WEIGHTS.depthToFind - w.capture - w.movesKing - w.towardCorner - w.onlyMoveOfPiece);
  });

  it("never returns a negative grade", () => {
    // A shallow depth plus every correction can out-run the depth term. The
    // floor keeps the number readable and keeps the 8f fit from having to
    // explain a sign.
    expect(
      gradeOf(m(1, 1, { capture: true, movesKing: true, towardCorner: true, onlyMoveOfPiece: true })),
    ).toBe(0);
  });

  it("is a pure function of its measurements", () => {
    // The point of computing at import rather than baking the grade into the
    // data: the same record always grades the same way, so a refit in 8f needs
    // no regeneration.
    expect(gradeOf(m(3, 2, { capture: true }))).toBe(gradeOf(m(3, 2, { capture: true })));
  });
});

describe("bandOf", () => {
  it("puts a grade in the band its cuts describe", () => {
    expect(bandOf(0)).toBe("easy");
    expect(bandOf(BAND_CUTS.medium - 1)).toBe("easy");
    expect(bandOf(BAND_CUTS.medium)).toBe("medium");
    expect(bandOf(BAND_CUTS.hard - 1)).toBe("medium");
    expect(bandOf(BAND_CUTS.hard)).toBe("hard");
    expect(bandOf(BAND_CUTS.ollamh - 1)).toBe("hard");
    expect(bandOf(BAND_CUTS.ollamh)).toBe("ollamh");
  });

  it("is monotonic: a harder grade never lands in an easier band", () => {
    const rank = (b: string): number => BANDS.indexOf(b as (typeof BANDS)[number]);
    let last = -1;
    for (let g = 0; g <= BAND_CUTS.ollamh + 200; g += 10) {
      const r = rank(bandOf(g));
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it("shares the AI-level ladder, in order", () => {
    // One ladder, two things graded on it — deliberately, per the glossary.
    expect(BANDS).toEqual(DIFFICULTIES);
  });

  it("has three cuts in ascending order", () => {
    // Cuts out of order would silently make a band unreachable, which is the
    // same failure as an empty band and much harder to see.
    expect(BAND_CUTS.medium).toBeLessThan(BAND_CUTS.hard);
    expect(BAND_CUTS.hard).toBeLessThan(BAND_CUTS.ollamh);
  });
});
