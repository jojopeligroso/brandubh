import { describe, expect, it } from "vitest";
import {
  allMoves,
  applyMove,
  exitFort,
  hasAnyMove,
  initialBoard,
  initialState,
  isEdge,
  isEncircled,
  isEscapeSquare,
  isRestricted,
  kingIsCaptured,
  movesFrom,
  moveName,
  squareName,
  winnerOf,
} from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Side } from "./types";
import {
  CUSTOM_RULE_DEFAULTS,
  VARIANTS,
  rulesFor,
  type CopenhagenRuleSet,
} from "./variants";

const cph = VARIANTS.copenhagen;
const fetlar = VARIANTS["copenhagen-fetlar"];

/** A one-off ruleset for a rule no shipped preset turns on, or for the other
 *  side of a contested one. */
const withRules = (over: Partial<CopenhagenRuleSet>): CopenhagenRuleSet =>
  rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, ...over });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Board from 11 strings of 11 chars.
 *  '.' empty 'a' attacker 'd' defender 'k' king */
function board(rows: string[]): Board {
  expect(rows).toHaveLength(BOARD_SIZE);
  for (const row of rows) expect(row).toHaveLength(BOARD_SIZE);
  return rows.map((row) =>
    [...row].map((ch) =>
      ch === "a" ? "attacker" : ch === "d" ? "defender" : ch === "k" ? "king" : null,
    ),
  );
}

function state(b: Board, turn: Side = "defenders"): GameState {
  return {
    board: b,
    turn,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
  };
}

const has = (squares: Array<{ row: number; col: number }>, r: number, c: number) =>
  squares.some((s) => s.row === r && s.col === c);

const mv = (fr: number, fc: number, tr: number, tc: number) => ({
  from: { row: fr, col: fc },
  to: { row: tr, col: tc },
});

/** An otherwise empty board, for isolating one rule. */
const empty = (): Board =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)) as Board;

/** A board with a lone king, for the king-capture cases. */
const withKing = (r: number, c: number): Board => {
  const b = empty();
  b[r][c] = "king";
  return b;
};

// ── Setup (rule 1) ────────────────────────────────────────────────────────────

describe("initialState", () => {
  it("places the king on f6 inside a diamond of 12 defenders, with 24 attackers", () => {
    const b = initialBoard();
    let attackers = 0;
    let defenders = 0;
    let kings = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (b[r][c] === "attacker") attackers++;
        if (b[r][c] === "defender") defenders++;
        if (b[r][c] === "king") kings++;
      }
    expect(attackers).toBe(24);
    expect(defenders).toBe(12);
    expect(kings).toBe(1);
    expect(b[5][5]).toBe("king");
    expect(squareName({ row: 5, col: 5 })).toBe("f6");
    // twice as many attackers as defenders — rule 1, stated as a ratio
    expect(attackers).toBe(2 * defenders);
  });

  it("gives the defenders a diamond: four points, and no defender off the two centre lines by more than two", () => {
    const b = initialBoard();
    for (const [r, c] of [
      [3, 5],
      [7, 5],
      [5, 3],
      [5, 7],
    ] as const)
      expect(b[r][c]).toBe("defender");
    // The diamond's corners are empty — this is what distinguishes it from the
    // Tablut cross, which has no men off the centre lines at all.
    for (const [r, c] of [
      [3, 3],
      [3, 7],
      [7, 3],
      [7, 7],
      [4, 3],
      [4, 7],
    ] as const)
      expect(b[r][c]).toBeNull();
  });

  it("puts five attackers on the middle of each edge with a sixth stepped forward", () => {
    const b = initialBoard();
    for (const c of [3, 4, 5, 6, 7]) {
      expect(b[0][c]).toBe("attacker");
      expect(b[10][c]).toBe("attacker");
      expect(b[c][0]).toBe("attacker");
      expect(b[c][10]).toBe("attacker");
    }
    expect(b[1][5]).toBe("attacker");
    expect(b[9][5]).toBe("attacker");
    expect(b[5][1]).toBe("attacker");
    expect(b[5][9]).toBe("attacker");
    // The corners start empty, and are restricted anyway.
    for (const [r, c] of [
      [0, 0],
      [0, 10],
      [10, 0],
      [10, 10],
    ] as const)
      expect(b[r][c]).toBeNull();
  });

  it("has the full D4 symmetry group, so the opening folds eight ways", () => {
    const b = initialBoard();
    const N = BOARD_SIZE;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        expect(b[c][N - 1 - r]).toBe(b[r][c]); // quarter turn
        expect(b[r][N - 1 - c]).toBe(b[r][c]); // mirror
      }
  });

  it("gives the attackers the first move (rule 2), unlike Tablut", () => {
    expect(initialState(cph).turn).toBe("attackers");
    expect(initialState(withRules({ firstMove: "defenders" })).turn).toBe("defenders");
  });
});

// ── Special squares (rule 5) ──────────────────────────────────────────────────

describe("restricted and hostile squares", () => {
  it("restricts the throne and all four corners", () => {
    expect(isRestricted(5, 5, cph)).toBe(true);
    for (const [r, c] of [
      [0, 0],
      [0, 10],
      [10, 0],
      [10, 10],
    ] as const)
      expect(isRestricted(r, c, cph)).toBe(true);
    expect(isRestricted(0, 5, cph)).toBe(false); // an ordinary rim square
  });

  it("makes a corner the escape square, not the rim", () => {
    expect(isEscapeSquare(0, 0, cph)).toBe(true);
    expect(isEscapeSquare(0, 5, cph)).toBe(false);
    expect(isEdge(0, 5)).toBe(true); // …even though it is on the edge
  });
});

// ── Movement (rule 3) ─────────────────────────────────────────────────────────

describe("movesFrom", () => {
  it("slides a soldier like a rook until it is blocked", () => {
    const b = empty();
    b[5][2] = "attacker";
    b[5][8] = "defender";
    const dest = movesFrom(b, 5, 2, cph);
    expect(has(dest, 5, 7)).toBe(true);
    expect(has(dest, 5, 8)).toBe(false); // occupied
    expect(has(dest, 5, 9)).toBe(false); // beyond the blocker
    expect(has(dest, 0, 2)).toBe(true); // all the way to the rim
  });

  it("lets a soldier cross the empty throne but never stop on it", () => {
    const b = empty();
    b[5][2] = "attacker";
    const dest = movesFrom(b, 5, 2, cph);
    expect(has(dest, 5, 5)).toBe(false); // may not land
    expect(has(dest, 5, 8)).toBe(true); // but passes over it
  });

  it("stops a soldier dead at the throne when the ruleset blocks it", () => {
    const b = empty();
    b[5][2] = "attacker";
    const dest = movesFrom(b, 5, 2, withRules({ throneBlocks: "soldiers" }));
    expect(has(dest, 5, 4)).toBe(true);
    expect(has(dest, 5, 5)).toBe(false);
    expect(has(dest, 5, 8)).toBe(false);
  });

  it("lets a soldier pass a restricted corner without landing on it", () => {
    const b = empty();
    b[0][5] = "attacker";
    const dest = movesFrom(b, 0, 5, cph);
    expect(has(dest, 0, 1)).toBe(true);
    expect(has(dest, 0, 0)).toBe(false);
  });

  it("lets the king land on a corner and return to his throne", () => {
    const b = withKing(0, 5);
    expect(has(movesFrom(b, 0, 5, cph), 0, 0)).toBe(true);
    const b2 = withKing(5, 2);
    expect(has(movesFrom(b2, 5, 2, cph), 5, 5)).toBe(true);
    expect(has(movesFrom(b2, 5, 2, withRules({ kingMayReoccupyThrone: false })), 5, 5)).toBe(
      false,
    );
  });

  it("opens with a wider tree than either smaller board", () => {
    const s = initialState(cph);
    // Recorded rather than asserted to a hand-count: what matters is the order of
    // magnitude the search has to cope with. Tablut opens at 80/56.
    expect(allMoves(s.board, "attackers", cph).length).toBeGreaterThan(100);
    expect(allMoves(s.board, "defenders", cph).length).toBeGreaterThan(50);
    expect(hasAnyMove(s.board, "attackers", cph)).toBe(true);
  });
});

// ── Soldier capture (rule 4) ──────────────────────────────────────────────────

describe("custodial capture", () => {
  it("takes a soldier pinned between two enemies", () => {
    const b = empty();
    b[5][3] = "attacker";
    b[5][4] = "defender";
    b[8][5] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(8, 5, 5, 5), cph);
    expect(s.board[5][4]).toBeNull();
    expect(s.captured.defenders).toBe(1);
  });

  it("does not capture a soldier that moves between two enemies itself", () => {
    const b = empty();
    b[5][3] = "attacker";
    b[5][5] = "attacker";
    b[8][4] = "defender";
    const s = applyMove(state(b, "defenders"), mv(8, 4, 5, 4), cph);
    expect(s.board[5][4]).toBe("defender");
    expect(s.captured.defenders).toBe(0);
  });

  it("pins a soldier against the empty throne from either side", () => {
    // Defender pinned by an attacker against the empty throne…
    const b = empty();
    b[5][4] = "defender";
    b[8][3] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(8, 3, 5, 3), cph);
    expect(s.board[5][4]).toBeNull();

    // …and an attacker pinned by a defender against it, which is the half of
    // `throneAnvil: "both"` a "friendly to white" reading would deny.
    const b2 = empty();
    b2[5][4] = "attacker";
    b2[8][3] = "defender";
    const s2 = applyMove(state(b2, "defenders"), mv(8, 3, 5, 3), cph);
    expect(s2.board[5][4]).toBeNull();
  });

  it("pins a soldier against a corner", () => {
    const b = empty();
    b[0][1] = "defender";
    b[4][2] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(4, 2, 0, 2), cph);
    expect(s.board[0][1]).toBeNull();
  });

  it("never captures against the bare board edge", () => {
    const b = empty();
    b[0][5] = "defender";
    b[4][5] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(4, 5, 1, 5), cph);
    expect(s.board[0][5]).toBe("defender");
  });
});

// ── Shieldwall (rule 4b) ──────────────────────────────────────────────────────

describe("shieldwall capture", () => {
  it("takes a bracketed, fronted row along the edge", () => {
    const b = empty();
    // Three defenders on the top edge, attackers bracketing and fronting them.
    b[0][4] = "defender";
    b[0][5] = "defender";
    b[0][6] = "defender";
    b[0][3] = "attacker"; // bracket
    b[0][7] = "attacker"; // bracket
    b[1][4] = "attacker";
    b[1][6] = "attacker";
    b[4][5] = "attacker"; // the man who closes it
    const s = applyMove(state(b, "attackers"), mv(4, 5, 1, 5), cph);
    expect(s.board[0][4]).toBeNull();
    expect(s.board[0][5]).toBeNull();
    expect(s.board[0][6]).toBeNull();
    expect(s.captured.defenders).toBe(3);
  });

  it("lets a corner stand in for one bracket", () => {
    const b = empty();
    b[0][1] = "defender";
    b[0][2] = "defender";
    b[0][3] = "attacker"; // the far bracket; the corner is the near one
    b[1][1] = "attacker";
    b[4][2] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(4, 2, 1, 2), cph);
    expect(s.board[0][1]).toBeNull();
    expect(s.board[0][2]).toBeNull();
  });

  it("spares the king but takes the soldiers beside him", () => {
    const b = empty();
    b[0][4] = "defender";
    b[0][5] = "king";
    b[0][6] = "defender";
    b[0][3] = "attacker";
    b[0][7] = "attacker";
    b[1][4] = "attacker";
    b[1][6] = "attacker";
    b[4][5] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(4, 5, 1, 5), cph);
    expect(s.board[0][5]).toBe("king");
    expect(s.board[0][4]).toBeNull();
    expect(s.board[0][6]).toBeNull();
    expect(s.status).toBe("playing");
  });

  it("needs a man in front of every member, not a hostile square", () => {
    const b = empty();
    b[0][1] = "defender";
    b[0][2] = "defender";
    b[0][3] = "attacker";
    b[4][2] = "attacker";
    // b[1][1] is left empty: the near member has no man in front of him.
    const s = applyMove(state(b, "attackers"), mv(4, 2, 1, 2), cph);
    expect(s.board[0][1]).toBe("defender");
    expect(s.board[0][2]).toBe("defender");
  });

  it("does not fire when the victims complete the wall themselves", () => {
    const b = empty();
    b[0][4] = "defender";
    b[0][3] = "attacker";
    b[0][6] = "attacker";
    b[1][4] = "attacker";
    b[1][5] = "attacker";
    b[4][5] = "defender"; // walks into the gap itself
    const s = applyMove(state(b, "defenders"), mv(4, 5, 0, 5), cph);
    expect(s.board[0][4]).toBe("defender");
    expect(s.board[0][5]).toBe("defender");
  });

  it("is off under Fetlar, which is the point of that preset", () => {
    const b = empty();
    b[0][4] = "defender";
    b[0][5] = "defender";
    b[0][3] = "attacker";
    b[0][6] = "attacker";
    b[1][4] = "attacker";
    b[4][5] = "attacker";
    const s = applyMove(state(b, "attackers"), mv(4, 5, 1, 5), fetlar);
    expect(s.board[0][4]).toBe("defender");
    expect(s.board[0][5]).toBe("defender");
  });
});

// ── King capture (rule 7) ─────────────────────────────────────────────────────

describe("kingIsCaptured", () => {
  it("needs four attackers in the open field, not two", () => {
    const b = withKing(5, 3);
    b[4][3] = "attacker";
    b[6][3] = "attacker";
    expect(kingIsCaptured(b, cph, { row: 6, col: 3 })).toBe(false);
    b[5][2] = "attacker";
    b[5][4] = "attacker";
    expect(kingIsCaptured(b, cph, { row: 5, col: 4 })).toBe(true);
  });

  it("accepts three attackers plus the empty throne beside it", () => {
    const b = withKing(4, 5); // directly above the throne at (5,5)
    b[3][5] = "attacker";
    b[4][4] = "attacker";
    b[4][6] = "attacker";
    expect(kingIsCaptured(b, cph, { row: 4, col: 6 })).toBe(true);
  });

  it("does not accept three plus a throne the king is standing on top of", () => {
    // The king ON the throne still needs all four attackers: the square under
    // him is his own, not a hostile wall.
    const b = withKing(5, 5);
    b[4][5] = "attacker";
    b[6][5] = "attacker";
    b[5][4] = "attacker";
    expect(kingIsCaptured(b, cph, { row: 5, col: 4 })).toBe(false);
    b[5][6] = "attacker";
    expect(kingIsCaptured(b, cph, { row: 5, col: 6 })).toBe(true);
  });

  it("requires the capturing move to touch the king", () => {
    const b = withKing(5, 3);
    b[4][3] = "attacker";
    b[6][3] = "attacker";
    b[5][2] = "attacker";
    b[5][4] = "attacker";
    expect(kingIsCaptured(b, cph, { row: 0, col: 0 })).toBe(false);
  });

  it("leaves the king safe on the rim under the shipped reading", () => {
    const b = withKing(0, 5);
    b[0][4] = "attacker";
    b[0][6] = "attacker";
    b[1][5] = "attacker";
    // Three of three available sides are hostile; the fourth is off the board.
    expect(kingIsCaptured(b, cph, { row: 1, col: 5 })).toBe(false);
  });

  it("takes the same king under the contested `available_sides` reading", () => {
    const edgy = withRules({ strongKingEdgeRule: "available_sides" });
    const b = withKing(0, 5);
    b[0][4] = "attacker";
    b[0][6] = "attacker";
    b[1][5] = "attacker";
    expect(kingIsCaptured(b, edgy, { row: 1, col: 5 })).toBe(true);
  });

  it("takes a king beside a corner with one attacker under `available_sides`", () => {
    // This is the exact position Cyningstan names when it says Copenhagen lets
    // the king be captured on the edge: the hostile corner is one wall, a single
    // attacker the other, and the third on-board side is the inward one.
    const edgy = withRules({ strongKingEdgeRule: "available_sides" });
    const b = withKing(0, 1);
    b[0][2] = "attacker";
    b[1][1] = "attacker";
    expect(kingIsCaptured(b, edgy, { row: 1, col: 1 })).toBe(true);
    expect(kingIsCaptured(b, cph, { row: 1, col: 1 })).toBe(false);
  });

  it("falls back to a two-sided capture when the king is weak", () => {
    const weak = withRules({ kingStrength: "weak" });
    const b = withKing(5, 3);
    b[5][2] = "attacker";
    b[5][4] = "attacker";
    expect(kingIsCaptured(b, weak, { row: 5, col: 4 })).toBe(true);
    expect(kingIsCaptured(b, cph, { row: 5, col: 4 })).toBe(false);
  });

  it("is strong only near the throne under `near_throne`", () => {
    const near = withRules({ kingStrength: "near_throne" });
    const far = withKing(2, 2);
    far[2][1] = "attacker";
    far[2][3] = "attacker";
    expect(kingIsCaptured(far, near, { row: 2, col: 3 })).toBe(true);

    const beside = withKing(4, 5);
    beside[4][4] = "attacker";
    beside[4][6] = "attacker";
    expect(kingIsCaptured(beside, near, { row: 4, col: 6 })).toBe(false);
  });
});

// ── Escape (rule 6) ───────────────────────────────────────────────────────────

describe("escape", () => {
  it("wins for the defenders when the king reaches a corner", () => {
    const b = withKing(0, 5);
    b[9][9] = "attacker"; // so the attackers still have a move
    const s = applyMove(state(b, "defenders"), mv(0, 5, 0, 0), cph);
    expect(s.status).toBe("defenders_win_escape");
    expect(winnerOf(s.status)).toBe("defenders");
  });

  it("does not win on an ordinary rim square", () => {
    const b = withKing(4, 5);
    b[9][9] = "attacker";
    const s = applyMove(state(b, "defenders"), mv(4, 5, 0, 5), cph);
    expect(s.status).toBe("playing");
  });
});

// ── Encirclement (rule 7b) ────────────────────────────────────────────────────

describe("isEncircled", () => {
  it("is false while the king can still reach the rim", () => {
    expect(isEncircled(initialBoard())).toBe(false);
  });

  it("is true for a king ringed in the centre with no defenders left", () => {
    const b = empty();
    b[5][5] = "king";
    for (const [r, c] of [
      [4, 4], [4, 5], [4, 6],
      [5, 4], [5, 6],
      [6, 4], [6, 5], [6, 6],
    ] as const)
      b[r][c] = "attacker";
    expect(isEncircled(b)).toBe(true);
  });

  it("is false when a defender is outside the ring", () => {
    const b = empty();
    b[5][5] = "king";
    for (const [r, c] of [
      [4, 4], [4, 5], [4, 6],
      [5, 4], [5, 6],
      [6, 4], [6, 5], [6, 6],
    ] as const)
      b[r][c] = "attacker";
    b[0][0 + 1] = "defender"; // free, on the far side of the ring
    expect(isEncircled(b)).toBe(false);
  });

  it("is off under Fetlar", () => {
    // A ring at arm's length, so the king still has moves inside it: a tight
    // eight-man box would end the game on rule 8's no-legal-move clause instead,
    // which would prove nothing about encirclement either way.
    const b = empty();
    b[5][5] = "king";
    for (let c = 3; c <= 7; c++) {
      b[3][c] = "attacker";
      b[7][c] = "attacker";
    }
    for (let r = 4; r <= 6; r++) {
      b[r][3] = "attacker";
      b[r][7] = "attacker";
    }
    b[0][2] = "attacker"; // somebody outside the ring with a move to make
    expect(isEncircled(b)).toBe(true);
    expect(movesFrom(b, 5, 5, cph).length).toBeGreaterThan(0);

    expect(applyMove(state(b, "attackers"), mv(0, 2, 0, 3), fetlar).status).toBe("playing");
    expect(applyMove(state(b, "attackers"), mv(0, 2, 0, 3), cph).status).toBe(
      "attackers_win_encirclement",
    );
  });
});

// ── Exit fort (rule 6b) ───────────────────────────────────────────────────────

describe("exitFort", () => {
  /**
   * The canonical shape, and the one every other case in this block is a
   * one-square edit of: a 2x2 pocket sealed against the top edge, with the king
   * on the rim inside it.
   *
   *      col  0 1 2 3 4 5 6 7 8 9 10
   *   row 0   . . . . d K . d . . .
   *   row 1   . . . . d . . d . . .
   *   row 2   . . . . . d d . . . .
   *
   * Inside is {f11, g11, f10, g10}; the wall is the six defenders around it. The
   * lone attacker sits far away so that the squares *outside* the wall are a real
   * exterior — without one anywhere on the board the flood fill would swallow
   * every empty square and call the whole board an unbreakable fort, which is
   * true but says nothing.
   */
  const fortBoard = (): Board =>
    board([
      "....dk.d...",
      "....d..d...",
      ".....dd....",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "..a........",
    ]);

  it("declares a win for a sealed, unbreakable fort with the king on the rim", () => {
    expect(exitFort(fortBoard(), cph)).toBe(true);
  });

  it("refuses the same fort with one wall man missing", () => {
    const b = fortBoard();
    b[1][7] = null; // the pocket now leaks out to the right
    expect(exitFort(b, cph)).toBe(false);
  });

  it("refuses a fort whose king cannot move", () => {
    const b = fortBoard();
    b[0][6] = "defender"; // fills the pocket beside him…
    b[1][5] = "defender"; // …and below him
    expect(movesFrom(b, 0, 5, cph)).toHaveLength(0);
    expect(exitFort(b, cph)).toBe(false);
  });

  it("refuses a fort with the king off the rim", () => {
    const b = board([
      "...........",
      "....dk.d...",
      "....d..d...",
      ".....dd....",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "..a........",
    ]);
    // Structurally the same wall, one row down — but rule 6b wants the king in
    // contact with the edge, and the pocket now leaks along the top row anyway.
    expect(exitFort(b, cph)).toBe(false);
  });

  it("refuses a fort an attacker has already got inside", () => {
    const b = fortBoard();
    b[1][6] = "attacker";
    expect(exitFort(b, cph)).toBe(false);
  });

  it("refuses a wall man who can be pinned on either axis", () => {
    // Thin the fort to a single arch: both (1,4) and (1,6) now have open board
    // on both sides of their horizontal axis, so either can be taken.
    const b = board([
      "....d.d....",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "...........",
      "..a........",
    ]);
    b[0][5] = "king";
    expect(exitFort(b, cph)).toBe(false);
  });

  it("refuses a lone king on the rim with no wall at all", () => {
    const b = withKing(0, 5);
    b[10][2] = "attacker";
    expect(exitFort(b, cph)).toBe(false);
  });

  it("ends the game as defenders_win_fort when the last wall man arrives", () => {
    const closing = fortBoard();
    closing[2][6] = null;
    closing[4][6] = "defender"; // the man who will close it
    expect(exitFort(closing, cph)).toBe(false);

    const s = applyMove(state(closing, "defenders"), mv(4, 6, 2, 6), cph);
    expect(s.status).toBe("defenders_win_fort");
    expect(winnerOf(s.status)).toBe("defenders");
  });

  it("is off under Fetlar", () => {
    const closing = fortBoard();
    closing[2][6] = null;
    closing[4][6] = "defender";
    const s = applyMove(state(closing, "defenders"), mv(4, 6, 2, 6), fetlar);
    expect(s.status).toBe("playing");
  });

  it("counts the empty throne as hostile to the wall, even inside the fort", () => {
    // A corridor fort along rank 6 from the right edge, swallowing the throne.
    // The man capping it at (5,4) has the throne on one side of his horizontal
    // axis and open board on the other, so the attackers can take him — which
    // means this is not an unbreakable fort under Copenhagen.
    const b = empty();
    b[5][10] = "king";
    for (let c = 4; c <= 10; c++) {
      b[4][c] = "defender";
      b[6][c] = "defender";
    }
    b[5][4] = "defender";
    b[10][2] = "attacker";
    // (5,4) is the man under test, so his *vertical* axis has to be sound —
    // hence the wall turning the corner at (4,4) and (6,4). Otherwise he falls
    // to the open board above and below him and the throne never gets a say.

    expect(exitFort(b, cph)).toBe(false);
    // …and with an inert throne the very same wall holds, which is what pins the
    // difference on `throneAnvil` rather than on the shape of the fort.
    expect(exitFort(b, withRules({ throneAnvil: "none" }))).toBe(true);
  });
});

// ── Repetition (rule 8) ───────────────────────────────────────────────────────

describe("repetition", () => {
  const shuffleBoard = (): Board => {
    const b = empty();
    b[0][5] = "attacker";
    b[10][5] = "king";
    return b;
  };

  /**
   * Shuffle an attacker and the king back and forth until a position has
   * occurred three times, and return the final state.
   *
   * `first` decides who *starts* the cycle, and under `loss_for_repeater` that
   * is the whole experiment: the third occurrence lands on the eighth ply, so
   * whichever side opens the shuffle is the side still to move when the game
   * ends — and therefore the side that did *not* break off.
   */
  const shuffle = (rules: CopenhagenRuleSet, first: Side): GameState => {
    const attacker = [mv(0, 5, 0, 6), mv(0, 6, 0, 5)];
    const king = [mv(10, 5, 10, 6), mv(10, 6, 10, 5)];
    let cur: GameState = { ...state(shuffleBoard(), first), sinceCapture: 20 };
    for (let i = 0; i < 8; i++) {
      const half = Math.floor(i / 2) % 2;
      const mine = cur.turn === "attackers" ? attacker : king;
      cur = applyMove(cur, mine[half], rules);
      if (cur.status !== "playing") break;
    }
    return cur;
  };

  it("loses for the attackers when the attackers are the ones repeating", () => {
    const out = shuffle(cph, "defenders");
    expect(out.status).toBe("defenders_win_repetition");
    expect(winnerOf(out.status)).toBe("defenders");
  });

  it("loses for the defenders when the defenders are the ones repeating", () => {
    const out = shuffle(cph, "attackers");
    expect(out.status).toBe("attackers_win_repetition");
    expect(winnerOf(out.status)).toBe("attackers");
  });

  it("always falls on the defenders under the Fetlar-style rule, whoever repeats", () => {
    expect(shuffle(fetlar, "defenders").status).toBe("attackers_win_repetition");
    expect(shuffle(fetlar, "attackers").status).toBe("attackers_win_repetition");
  });

  it("draws when the ruleset says so", () => {
    const out = shuffle(withRules({ repetitionResult: "draw" }), "attackers");
    expect(out.status).toBe("draw_repetition");
    expect(winnerOf(out.status)).toBe("draw");
  });

  it("ignores repetition entirely when the ruleset says none", () => {
    expect(shuffle(withRules({ repetitionResult: "none" }), "attackers").status).toBe("playing");
  });
});

// ── Blocked side (rule 8, second half) ────────────────────────────────────────

describe("no legal move", () => {
  it("loses for the side that cannot move", () => {
    const b = empty();
    b[0][1] = "king";
    b[1][1] = "defender";
    b[0][2] = "attacker"; // boxed against the corner it may not enter
    b[0][3] = "defender";
    const s = applyMove(state(b, "defenders"), mv(1, 1, 1, 2), cph);
    expect(s.status).toBe("defenders_win_no_moves");
  });
});

// ── Notation ──────────────────────────────────────────────────────────────────

describe("notation", () => {
  it("runs a–k and 1–11, with i included", () => {
    expect(squareName({ row: 10, col: 0 })).toBe("a1");
    expect(squareName({ row: 0, col: 10 })).toBe("k11");
    expect(squareName({ row: 5, col: 5 })).toBe("f6");
    expect(squareName({ row: 3, col: 8 })).toBe("i8");
  });

  it("names a move, with a capture count when there is one", () => {
    expect(moveName(mv(10, 0, 10, 3))).toBe("a1-d1");
    expect(moveName({ ...mv(10, 0, 10, 3), captures: [{ row: 9, col: 3 }] })).toBe("a1-d1x1");
  });
});
