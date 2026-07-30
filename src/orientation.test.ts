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
    for (const sq of ALL) expect(toView(sq, false, false)).toEqual(sq);
  });

  it("flipH mirrors columns only — rows stay put", () => {
    expect(toView({ row: 0, col: 0 }, true, false)).toEqual({ row: 0, col: 6 });
    expect(toView({ row: 2, col: 5 }, true, false)).toEqual({ row: 2, col: 1 });
  });

  it("flipV mirrors rows only — columns stay put", () => {
    expect(toView({ row: 0, col: 0 }, false, true)).toEqual({ row: 6, col: 0 });
    expect(toView({ row: 2, col: 5 }, false, true)).toEqual({ row: 4, col: 5 });
  });

  it("both together reverse both axes — the old 180° rotation", () => {
    expect(toView({ row: 0, col: 0 }, true, true)).toEqual({ row: 6, col: 6 });
    expect(toView({ row: 0, col: 6 }, true, true)).toEqual({ row: 6, col: 0 });
    expect(toView({ row: 6, col: 0 }, true, true)).toEqual({ row: 0, col: 6 });
    expect(toView({ row: 2, col: 5 }, true, true)).toEqual({ row: 4, col: 1 });
  });

  it("leaves the throne — the centre — exactly where it was, any combination", () => {
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        expect(toView({ row: 3, col: 3 }, flipH, flipV)).toEqual({ row: 3, col: 3 });
      }
    }
  });

  it("round-trips: a drawn cell resolves back to the square it stands for", () => {
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        for (const sq of ALL) expect(fromView(toView(sq, flipH, flipV), flipH, flipV)).toEqual(sq);
      }
    }
  });

  it("is a bijection — no two squares are ever drawn in the same cell", () => {
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        const drawn = new Set(
          ALL.map((sq) => {
            const v = toView(sq, flipH, flipV);
            return `${v.row},${v.col}`;
          }),
        );
        expect(drawn.size).toBe(BOARD_SIZE * BOARD_SIZE);
      }
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

  it("puts the files along whichever row is drawn at the bottom — flipV only", () => {
    // Unflipped the bottom drawn row is board row 6 (rank 1); north-south
    // flipped it is board row 0 (rank 7). An east-west-only flip never
    // touches this — it's a row question.
    expect(isLabelledFileRow(6, false)).toBe(true);
    expect(isLabelledFileRow(0, false)).toBe(false);
    expect(isLabelledFileRow(0, true)).toBe(true);
    expect(isLabelledFileRow(6, true)).toBe(false);
  });

  it("puts the ranks up whichever column is drawn at the left — flipH only", () => {
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

  it("reads the file letters right-to-left once east-west flipped", () => {
    // Mirrored left-right, the bottom edge (still board row 6 — flipH never
    // touches rows) now runs g…a.
    const bottomRow = ALL.filter((sq) => isLabelledFileRow(sq.row, false) === true);
    const acrossFlipped = bottomRow
      .slice()
      .sort((a, b) => toView(a, true, false).col - toView(b, true, false).col)
      .map((sq) => fileLabel(sq.col))
      .join("");
    expect(acrossFlipped).toBe("gfedcba");
  });

  it("reads the ranks top-down once north-south flipped", () => {
    // Mirrored top-bottom, the left edge (still board col 0 — flipV never
    // touches columns) now counts 7 at the top down to 1 at the bottom.
    const leftCol = ALL.filter((sq) => isLabelledRankCol(sq.col, false) === true);
    const downFlipped = leftCol
      .slice()
      .sort((a, b) => toView(a, false, true).row - toView(b, false, true).row)
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
    expect(viewCenter({ row: 0, col: 0 }, false, false)).toEqual({ x: 0.5 / 7, y: 0.5 / 7 });
    expect(viewCenter({ row: 3, col: 3 }, false, false)).toEqual({ x: 3.5 / 7, y: 3.5 / 7 });
  });

  it("keeps the throne's centre fixed under either flip", () => {
    expect(viewCenter({ row: 3, col: 3 }, true, true)).toEqual(viewCenter({ row: 3, col: 3 }, false, false));
  });

  it("moves an endpoint to the point reflected through the centre when both flipped", () => {
    const a = viewCenter({ row: 0, col: 0 }, false, false);
    const b = viewCenter({ row: 0, col: 0 }, true, true);
    expect(b.x).toBeCloseTo(1 - a.x, 12);
    expect(b.y).toBeCloseTo(1 - a.y, 12);
  });

  it("flipH only reflects x, flipV only reflects y", () => {
    const a = viewCenter({ row: 0, col: 0 }, false, false);
    const h = viewCenter({ row: 0, col: 0 }, true, false);
    const v = viewCenter({ row: 0, col: 0 }, false, true);
    expect(h.x).toBeCloseTo(1 - a.x, 12);
    expect(h.y).toBeCloseTo(a.y, 12);
    expect(v.x).toBeCloseTo(a.x, 12);
    expect(v.y).toBeCloseTo(1 - a.y, 12);
  });

  it("stays inside the board box for every square, any combination", () => {
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        for (const sq of ALL) {
          const { x, y } = viewCenter(sq, flipH, flipV);
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(1);
          expect(y).toBeGreaterThan(0);
          expect(y).toBeLessThan(1);
        }
      }
    }
  });

  it("draws an arrow between the same two squares whichever way up it is", () => {
    // An arrow from d2 to d6 must connect the cells the board is actually
    // drawing for d2 and d6 — the whole point of routing 7a's overlay through
    // this module rather than through raw row/col.
    const move = { from: { row: 5, col: 3 }, to: { row: 1, col: 3 } };
    for (const flipH of [false, true]) {
      for (const flipV of [false, true]) {
        const arrow = viewArrow(move, flipH, flipV);
        expect(arrow.from).toEqual(viewCenter(move.from, flipH, flipV));
        expect(arrow.to).toEqual(viewCenter(move.to, flipH, flipV));
      }
    }
  });

  it("reverses an arrow's on-screen vertical direction when north-south flipped", () => {
    const move = { from: { row: 5, col: 3 }, to: { row: 1, col: 3 } };
    const up = viewArrow(move, false, false);
    const down = viewArrow(move, false, true);
    expect(up.to.y).toBeLessThan(up.from.y); // points up the screen
    expect(down.to.y).toBeGreaterThan(down.from.y); // and down it, flipped
  });

  it("preserves the arrow's length under any combination — a flip mirrors, it does not distort", () => {
    const move = { from: { row: 6, col: 0 }, to: { row: 2, col: 5 } };
    const len = (a: ReturnType<typeof viewArrow>) =>
      Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    const base = len(viewArrow(move, false, false));
    expect(len(viewArrow(move, true, false))).toBeCloseTo(base, 12);
    expect(len(viewArrow(move, false, true))).toBeCloseTo(base, 12);
    expect(len(viewArrow(move, true, true))).toBeCloseTo(base, 12);
  });
});
