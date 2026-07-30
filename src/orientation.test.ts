import { describe, expect, it } from "vitest";
import {
  fileLabel,
  fromView,
  isLabelledFileRow,
  isLabelledRankCol,
  rankLabel,
  squareName,
  toView,
  viewArrow,
  viewCenter,
  viewIndex,
} from "./orientation";
import { BOARD_SIZE, type Square } from "./game/types";

const ALL: Square[] = Array.from({ length: BOARD_SIZE }, (_, row) =>
  Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col })),
).flat();

describe("orientation — the mapping itself", () => {
  it("is the identity when the board is not flipped", () => {
    for (const sq of ALL) expect(toView(sq, false)).toEqual(sq);
  });

  it("reverses both axes together when flipped — a 180° rotation, not a mirror", () => {
    // A mirror would reverse one axis and leave the other; that would put the
    // board's own left/right the wrong way round relative to the ranks.
    expect(toView({ row: 0, col: 0 }, true)).toEqual({ row: 6, col: 6 });
    expect(toView({ row: 0, col: 6 }, true)).toEqual({ row: 6, col: 0 });
    expect(toView({ row: 6, col: 0 }, true)).toEqual({ row: 0, col: 6 });
    expect(toView({ row: 2, col: 5 }, true)).toEqual({ row: 4, col: 1 });
  });

  it("leaves the throne — the centre — exactly where it was", () => {
    expect(toView({ row: 3, col: 3 }, true)).toEqual({ row: 3, col: 3 });
  });

  it("round-trips: a drawn cell resolves back to the square it stands for", () => {
    for (const flipped of [false, true]) {
      for (const sq of ALL) expect(fromView(toView(sq, flipped), flipped)).toEqual(sq);
    }
  });

  it("is a bijection — no two squares are ever drawn in the same cell", () => {
    for (const flipped of [false, true]) {
      const drawn = new Set(ALL.map((sq) => `${toView(sq, flipped).row},${toView(sq, flipped).col}`));
      expect(drawn.size).toBe(BOARD_SIZE * BOARD_SIZE);
    }
  });

  it("keeps viewIndex within the board", () => {
    for (const flipped of [false, true]) {
      for (let i = 0; i < BOARD_SIZE; i++) {
        const v = viewIndex(i, flipped);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(BOARD_SIZE);
      }
    }
  });
});

describe("orientation — coordinate labels stay truthful", () => {
  it("names squares from the board, never from the view", () => {
    // The names are facts about the position: d4 is the throne from either
    // chair. Flipping must not rename anything.
    expect(squareName({ row: 6, col: 0 })).toBe("a1");
    expect(squareName({ row: 0, col: 6 })).toBe("g7");
    expect(squareName({ row: 3, col: 3 })).toBe("d4");
  });

  it("puts the files along whichever row is drawn at the bottom", () => {
    // Unflipped the bottom drawn row is board row 6 (rank 1); flipped it is
    // board row 0 (rank 7), because the board has turned over.
    expect(isLabelledFileRow(6, false)).toBe(true);
    expect(isLabelledFileRow(0, false)).toBe(false);
    expect(isLabelledFileRow(0, true)).toBe(true);
    expect(isLabelledFileRow(6, true)).toBe(false);
  });

  it("puts the ranks up whichever column is drawn at the left", () => {
    expect(isLabelledRankCol(0, false)).toBe(true);
    expect(isLabelledRankCol(6, false)).toBe(false);
    expect(isLabelledRankCol(6, true)).toBe(true);
    expect(isLabelledRankCol(0, true)).toBe(false);
  });

  it("labels exactly one row and one column, whichever way up it is", () => {
    for (const flipped of [false, true]) {
      const rows = ALL.filter((sq) => sq.col === 0 && isLabelledFileRow(sq.row, flipped));
      const cols = ALL.filter((sq) => sq.row === 0 && isLabelledRankCol(sq.col, flipped));
      expect(rows).toHaveLength(1);
      expect(cols).toHaveLength(1);
    }
  });

  it("reads the file letters right-to-left and the ranks top-down once flipped", () => {
    // Viewed from the other chair, the bottom edge runs g…a and the left edge
    // counts 7 at the bottom up to 1 at the top. Both are still the truth.
    const bottomRow = ALL.filter((sq) => isLabelledFileRow(sq.row, true) === true);
    const acrossFlipped = bottomRow
      .slice()
      .sort((a, b) => toView(a, true).col - toView(b, true).col)
      .map((sq) => fileLabel(sq.col))
      .join("");
    expect(acrossFlipped).toBe("gfedcba");

    const leftCol = ALL.filter((sq) => isLabelledRankCol(sq.col, true) === true);
    const downFlipped = leftCol
      .slice()
      .sort((a, b) => toView(a, true).row - toView(b, true).row)
      .map((sq) => rankLabel(sq.row))
      .join("");
    expect(downFlipped).toBe("1234567");
  });

  it("reads a–g and 7→1 unflipped", () => {
    const across = ALL.filter((sq) => sq.row === BOARD_SIZE - 1)
      .map((sq) => fileLabel(sq.col))
      .join("");
    expect(across).toBe("abcdefg");
    const down = ALL.filter((sq) => sq.col === 0)
      .map((sq) => rankLabel(sq.row))
      .join("");
    expect(down).toBe("7654321");
  });
});

describe("orientation — overlay geometry (the 7a arrow's endpoints)", () => {
  it("centres a square in its cell", () => {
    expect(viewCenter({ row: 0, col: 0 }, false)).toEqual({ x: 0.5 / 7, y: 0.5 / 7 });
    expect(viewCenter({ row: 3, col: 3 }, false)).toEqual({ x: 3.5 / 7, y: 3.5 / 7 });
  });

  it("keeps the throne's centre fixed under flip", () => {
    expect(viewCenter({ row: 3, col: 3 }, true)).toEqual(viewCenter({ row: 3, col: 3 }, false));
  });

  it("moves an endpoint to the point reflected through the centre when flipped", () => {
    const a = viewCenter({ row: 0, col: 0 }, false);
    const b = viewCenter({ row: 0, col: 0 }, true);
    expect(b.x).toBeCloseTo(1 - a.x, 12);
    expect(b.y).toBeCloseTo(1 - a.y, 12);
  });

  it("stays inside the board box for every square, either way up", () => {
    for (const flipped of [false, true]) {
      for (const sq of ALL) {
        const { x, y } = viewCenter(sq, flipped);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(1);
      }
    }
  });

  it("draws an arrow between the same two squares whichever way up it is", () => {
    // An arrow from d2 to d6 must connect the cells the board is actually
    // drawing for d2 and d6 — the whole point of routing 7a's overlay through
    // this module rather than through raw row/col.
    const move = { from: { row: 5, col: 3 }, to: { row: 1, col: 3 } };
    for (const flipped of [false, true]) {
      const arrow = viewArrow(move, flipped);
      expect(arrow.from).toEqual(viewCenter(move.from, flipped));
      expect(arrow.to).toEqual(viewCenter(move.to, flipped));
    }
  });

  it("reverses an arrow's on-screen direction when the board turns over", () => {
    const move = { from: { row: 5, col: 3 }, to: { row: 1, col: 3 } };
    const up = viewArrow(move, false);
    const down = viewArrow(move, true);
    expect(up.to.y).toBeLessThan(up.from.y); // points up the screen
    expect(down.to.y).toBeGreaterThan(down.from.y); // and down it, flipped
  });

  it("preserves the arrow's length — a flip rotates, it does not distort", () => {
    const move = { from: { row: 6, col: 0 }, to: { row: 2, col: 5 } };
    const len = (a: ReturnType<typeof viewArrow>) =>
      Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    expect(len(viewArrow(move, true))).toBeCloseTo(len(viewArrow(move, false)), 12);
  });
});
