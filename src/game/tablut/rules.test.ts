import { describe, expect, it } from "vitest";
import {
  allMoves,
  applyMove,
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
import { CUSTOM_RULE_DEFAULTS, VARIANTS, rulesFor, type TablutRuleSet } from "./variants";

const baseline = VARIANTS.tablut;
const gulo = VARIANTS["tablut-gulo"];
const aage = VARIANTS["tablut-aage"];
const corners = VARIANTS["tablut-corners"];
const linnaeus = VARIANTS["tablut-linnaeus"];

/** A one-off ruleset for a rule that no shipped preset turns on. */
const withRules = (over: Partial<TablutRuleSet>): TablutRuleSet =>
  rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, ...over });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Board from 9 strings of 9 chars. '.' empty 'a' attacker 'd' defender 'k' king */
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

// ── Setup ─────────────────────────────────────────────────────────────────────

describe("initialState", () => {
  it("places the king on e5 with 8 defenders in the cross and 16 attackers in four groups", () => {
    const s = initialState(baseline);

    expect(s.board[4][4]).toBe("king");

    const defenders: Array<[number, number]> = [
      [2, 4],
      [3, 4],
      [5, 4],
      [6, 4],
      [4, 2],
      [4, 3],
      [4, 5],
      [4, 6],
    ];
    for (const [r, c] of defenders) expect(s.board[r][c]).toBe("defender");

    const attackers: Array<[number, number]> = [
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 4],
      [8, 3],
      [8, 4],
      [8, 5],
      [7, 4],
      [3, 0],
      [4, 0],
      [5, 0],
      [4, 1],
      [3, 8],
      [4, 8],
      [5, 8],
      [4, 7],
    ];
    for (const [r, c] of attackers) expect(s.board[r][c]).toBe("attacker");

    const flat = s.board.flat();
    expect(flat.filter((p) => p === "attacker")).toHaveLength(16);
    expect(flat.filter((p) => p === "defender")).toHaveLength(8);
    expect(flat.filter((p) => p === "king")).toHaveLength(1);
    expect(s.status).toBe("playing");
  });

  it("gives White the first move — baseline rule 2, the opposite of Brandubh", () => {
    expect(initialState(baseline).turn).toBe("defenders");
    for (const id of Object.keys(VARIANTS)) expect(VARIANTS[id].firstMove).toBe("defenders");
  });

  it("takes who-moves-first from the ruleset rather than assuming it", () => {
    expect(initialState(withRules({ firstMove: "attackers" })).turn).toBe("attackers");
  });

  it("is symmetric under a quarter turn", () => {
    const b = initialBoard();
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        expect(b[r][c]).toBe(b[c][BOARD_SIZE - 1 - r]);
  });
});

// ── Geometry ──────────────────────────────────────────────────────────────────

describe("the rim", () => {
  it("counts every square on the outside as an edge, and nothing inside", () => {
    let edges = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++) if (isEdge(r, c)) edges++;
    // 9x9: 81 squares, 7x7 = 49 interior.
    expect(edges).toBe(81 - 49);
  });

  it("makes all 32 rim squares winning under the baseline, and only 4 under corner escape", () => {
    const count = (rules: TablutRuleSet) => {
      let n = 0;
      for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) if (isEscapeSquare(r, c, rules)) n++;
      return n;
    };
    expect(count(baseline)).toBe(32);
    expect(count(corners)).toBe(4);
  });

  it("leaves a baseline corner an ordinary square, and restricts it under corner escape", () => {
    expect(isRestricted(0, 0, baseline)).toBe(false);
    expect(isRestricted(0, 0, corners)).toBe(true);
    // The throne is restricted either way.
    expect(isRestricted(4, 4, baseline)).toBe(true);
    expect(isRestricted(4, 4, corners)).toBe(true);
  });
});

// ── Move generation ───────────────────────────────────────────────────────────

describe("movesFrom", () => {
  it("slides a piece in all four directions until blocked by a friendly", () => {
    const b = empty();
    b[4][2] = "defender";
    b[4][6] = "defender"; // blocker to the east
    const moves = movesFrom(b, 4, 2, baseline);
    // West to the rim, north and south to the rim, east only as far as e5's
    // neighbour — but e5 is the throne, which a soldier may not stop on.
    expect(has(moves, 4, 0)).toBe(true);
    expect(has(moves, 0, 2)).toBe(true);
    expect(has(moves, 8, 2)).toBe(true);
    expect(has(moves, 4, 3)).toBe(true);
    expect(has(moves, 4, 4)).toBe(false); // the throne
    expect(has(moves, 4, 5)).toBe(true); // crossed the empty throne
    expect(has(moves, 4, 6)).toBe(false); // the friendly blocker
  });

  it("lets a soldier land on a baseline corner — it is not a special square", () => {
    const b = empty();
    b[0][4] = "attacker";
    expect(has(movesFrom(b, 0, 4, baseline), 0, 0)).toBe(true);
    expect(has(movesFrom(b, 0, 4, baseline), 0, 8)).toBe(true);
  });

  it("refuses a corner to a soldier under corner escape, but still lets the king in", () => {
    const b = empty();
    b[0][4] = "attacker";
    expect(has(movesFrom(b, 0, 4, corners), 0, 0)).toBe(false);
    const k = empty();
    k[0][4] = "king";
    expect(has(movesFrom(k, 0, 4, corners), 0, 0)).toBe(true);
  });

  it("never lets a soldier stop on the throne, under any preset", () => {
    for (const rules of [baseline, gulo, aage, corners]) {
      const b = empty();
      b[4][1] = "defender";
      expect(has(movesFrom(b, 4, 1, rules), 4, 4)).toBe(false);
    }
  });

  it("stops Black at the throne but lets White cross it — the gulo/Dimetr rule", () => {
    const b = empty();
    b[4][1] = "attacker";
    b[4][7] = "defender";

    // Baseline: either side crosses.
    expect(has(movesFrom(b, 4, 1, baseline), 4, 5)).toBe(true);
    expect(has(movesFrom(b, 4, 7, baseline), 4, 3)).toBe(true);

    // gulo: Black is stopped dead at the throne; White is not.
    const black = movesFrom(b, 4, 1, gulo);
    expect(has(black, 4, 3)).toBe(true); // up to the throne
    expect(has(black, 4, 5)).toBe(false); // but not past it
    expect(has(movesFrom(b, 4, 7, gulo), 4, 5)).toBe(true);
    expect(has(movesFrom(b, 4, 7, gulo), 4, 3)).toBe(true); // White crosses
  });

  it("stops both sides at the throne under throneBlocks: soldiers", () => {
    const rules = withRules({ throneBlocks: "soldiers" });
    const b = empty();
    b[4][1] = "attacker";
    b[4][7] = "defender";
    expect(has(movesFrom(b, 4, 1, rules), 4, 5)).toBe(false);
    expect(has(movesFrom(b, 4, 7, rules), 4, 3)).toBe(false);
  });

  it("lets the king slide the length of an empty board to the rim", () => {
    const b = empty();
    b[4][4] = "king";
    const moves = movesFrom(b, 4, 4, baseline);
    expect(has(moves, 0, 4)).toBe(true);
    expect(has(moves, 8, 4)).toBe(true);
    expect(has(moves, 4, 0)).toBe(true);
    expect(has(moves, 4, 8)).toBe(true);
    expect(moves).toHaveLength(4 * 4); // four rays, four squares each
  });

  it("keeps the king off his own throne when the variant forbids returning, but lets him cross it", () => {
    const rules = withRules({ kingMayReoccupyThrone: false });
    const b = empty();
    b[4][1] = "king";
    const moves = movesFrom(b, 4, 1, rules);
    expect(has(moves, 4, 4)).toBe(false);
    expect(has(moves, 4, 5)).toBe(true);
  });

  it("counts the opening position's legal moves for White", () => {
    const s = initialState(baseline);
    const moves = allMoves(s.board, "defenders", baseline);
    // The king is boxed in by his own cross; the eight defenders each have a
    // clear run out to the rim on one axis.
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => s.board[m.from.row][m.from.col] !== "attacker")).toBe(true);
    expect(hasAnyMove(s.board, "defenders", baseline)).toBe(true);
    expect(hasAnyMove(s.board, "attackers", baseline)).toBe(true);
  });
});

// ── Captures ──────────────────────────────────────────────────────────────────

describe("captures", () => {
  it("sandwiches a defender between two attackers", () => {
    const b = empty();
    b[2][3] = "attacker";
    b[2][4] = "defender";
    b[2][6] = "attacker"; // moves to 2,5 to close the trap
    const next = applyMove(state(b, "attackers"), mv(2, 6, 2, 5), baseline);
    expect(next.board[2][4]).toBeNull();
    expect(next.captured.defenders).toBe(1);
  });

  it("does not capture a piece that moves in between two enemies itself — rule 4", () => {
    const b = empty();
    b[2][3] = "attacker";
    b[2][5] = "attacker";
    b[6][4] = "defender"; // walks into the gap at 2,4
    const next = applyMove(state(b, "defenders"), mv(6, 4, 2, 4), baseline);
    expect(next.board[2][4]).toBe("defender");
    expect(next.captured.defenders).toBe(0);
  });

  it("leaves the empty throne inert under the baseline", () => {
    const b = empty();
    b[4][3] = "defender"; // pinned against the empty throne at 4,4?
    b[4][1] = "attacker"; // moves to 4,2
    const next = applyMove(state(b, "attackers"), mv(4, 1, 4, 2), baseline);
    expect(next.board[4][3]).toBe("defender");
    expect(next.captured.defenders).toBe(0);
  });

  it("makes the throne friendly to White only — the second gulo/Dimetr change", () => {
    // White pins an attacker against the empty throne: allowed.
    const w = empty();
    w[4][3] = "attacker";
    w[4][1] = "defender"; // moves to 4,2
    const white = applyMove(state(w, "defenders"), mv(4, 1, 4, 2), gulo);
    expect(white.board[4][3]).toBeNull();
    expect(white.captured.attackers).toBe(1);

    // Black tries the same against White: refused, the throne is not his.
    const b = empty();
    b[4][3] = "defender";
    b[4][1] = "attacker"; // moves to 4,2
    const black = applyMove(state(b, "attackers"), mv(4, 1, 4, 2), gulo);
    expect(black.board[4][3]).toBe("defender");
    expect(black.captured.defenders).toBe(0);
  });

  it("lets either side pin against the empty throne under throneAnvil: both", () => {
    const b = empty();
    b[4][3] = "defender";
    b[4][1] = "attacker";
    const next = applyMove(state(b, "attackers"), mv(4, 1, 4, 2), aage);
    expect(next.board[4][3]).toBeNull();
  });

  it("backs whoever stands on the throne, needing no flag at all", () => {
    const b = empty();
    b[4][4] = "king"; // the king is on his throne
    b[4][3] = "attacker";
    b[4][1] = "defender"; // moves to 4,2, pinning the attacker against the king
    const next = applyMove(state(b, "defenders"), mv(4, 1, 4, 2), baseline);
    expect(next.board[4][3]).toBeNull();
    expect(next.captured.attackers).toBe(1);
  });

  it("does not capture against a baseline corner", () => {
    const b = empty();
    b[0][1] = "defender";
    b[0][4] = "attacker"; // moves to 0,2, pinning against the corner at 0,0
    const next = applyMove(state(b, "attackers"), mv(0, 4, 0, 2), baseline);
    expect(next.board[0][1]).toBe("defender");
  });

  it("captures against a corner under corner escape", () => {
    const b = empty();
    b[0][1] = "defender";
    b[0][4] = "attacker";
    const next = applyMove(state(b, "attackers"), mv(0, 4, 0, 2), corners);
    expect(next.board[0][1]).toBeNull();
  });

  it("does not capture against the rim under the baseline", () => {
    const b = empty();
    b[0][4] = "defender"; // on the rim, with nothing beyond it
    b[2][4] = "attacker"; // moves to 1,4
    const next = applyMove(state(b, "attackers"), mv(2, 4, 1, 4), baseline);
    expect(next.board[0][4]).toBe("defender");
  });

  it("captures against the rim under edgeHostileToSoldiers", () => {
    const rules = withRules({ edgeHostileToSoldiers: true });
    const b = empty();
    b[0][4] = "defender";
    b[2][4] = "attacker";
    const next = applyMove(state(b, "attackers"), mv(2, 4, 1, 4), rules);
    expect(next.board[0][4]).toBeNull();
  });

  it("lets an armed king flank, and a weaponless one not", () => {
    const b = empty();
    b[2][4] = "attacker";
    b[2][3] = "defender";
    b[6][5] = "king"; // moves to 2,5 to close on the attacker at 2,4

    const armed = applyMove(state(b, "defenders"), mv(6, 5, 2, 5), baseline);
    expect(armed.board[2][4]).toBeNull();

    const unarmed = applyMove(state(b, "defenders"), mv(6, 5, 2, 5), withRules({ armedKing: false }));
    expect(unarmed.board[2][4]).toBe("attacker");
  });

  it("takes two men at once when one move closes two traps", () => {
    const b = empty();
    b[7][7] = "king";
    b[3][2] = "defender";
    b[5][2] = "defender";
    b[2][2] = "attacker"; // anvil above
    b[6][2] = "attacker"; // anvil below
    b[4][8] = "attacker"; // slides the length of rank 4 — across the empty throne
    const next = applyMove(state(b, "attackers"), mv(4, 8, 4, 2), baseline);
    expect(next.board[3][2]).toBeNull();
    expect(next.board[5][2]).toBeNull();
    expect(next.captured.defenders).toBe(2);
  });
});

// ── King capture ──────────────────────────────────────────────────────────────

describe("kingIsCaptured", () => {
  it("is captured by two attackers on opposite sides, away from the throne", () => {
    const b = empty();
    b[2][2] = "king";
    b[2][1] = "attacker";
    b[2][3] = "attacker";
    expect(kingIsCaptured(b, baseline, { row: 2, col: 3 })).toBe(true);
  });

  it("is not captured when the closing move was not adjacent to him", () => {
    const b = empty();
    b[2][2] = "king";
    b[2][1] = "attacker";
    b[2][3] = "attacker";
    expect(kingIsCaptured(b, baseline, { row: 7, col: 7 })).toBe(false);
  });

  it("is not captured by a pair he walked into himself", () => {
    const b = empty();
    b[2][2] = "king";
    b[2][1] = "attacker";
    b[2][3] = "attacker";
    // An attacker arrives on the perpendicular axis; the existing pair is not his
    // doing, so it may not be reused.
    b[1][2] = "attacker";
    expect(kingIsCaptured(b, baseline, { row: 1, col: 2 })).toBe(false);
  });

  it("is not captured by one attacker", () => {
    const b = empty();
    b[2][2] = "king";
    b[2][3] = "attacker";
    expect(kingIsCaptured(b, baseline, { row: 2, col: 3 })).toBe(false);
  });

  it("is not captured against the rim — the outside is not hostile to him", () => {
    const b = empty();
    b[0][4] = "king";
    b[0][3] = "attacker";
    b[0][5] = "attacker";
    // Along the rank he is bracketed, so that pair works; the point is the
    // *column*, where the outside stands beyond him.
    expect(kingIsCaptured(b, baseline, { row: 0, col: 5 })).toBe(true);

    const c = empty();
    c[0][4] = "king";
    c[1][4] = "attacker"; // the only flank; beyond the king is off-board
    expect(kingIsCaptured(c, baseline, { row: 1, col: 4 })).toBe(false);
  });

  it("needs all four sides on the throne under the tournament preset, and two under the baseline", () => {
    const b = empty();
    b[4][4] = "king";
    b[3][4] = "attacker";
    b[5][4] = "attacker";
    expect(kingIsCaptured(b, baseline, { row: 5, col: 4 })).toBe(true);
    expect(kingIsCaptured(b, aage, { row: 5, col: 4 })).toBe(false);

    b[4][3] = "attacker";
    b[4][5] = "attacker";
    expect(kingIsCaptured(b, aage, { row: 4, col: 5 })).toBe(true);
  });

  it("uses the empty throne as the king's fourth wall, never as a custodial half", () => {
    // King beside his own empty throne, walled on the other three sides.
    const b = empty();
    b[4][3] = "king";
    b[3][3] = "attacker";
    b[5][3] = "attacker";
    b[4][2] = "attacker";
    expect(kingIsCaptured(b, aage, { row: 4, col: 2 })).toBe(true);

    // Only two sides, one of them the throne: not enough under the strong rule.
    const c = empty();
    c[4][3] = "king";
    c[4][2] = "attacker";
    expect(kingIsCaptured(c, aage, { row: 4, col: 2 })).toBe(false);
  });

  it("treats a missing king as captured", () => {
    expect(kingIsCaptured(empty(), baseline, { row: 0, col: 0 })).toBe(true);
  });

  // The three-tier rule under the default preset, spelled out as Linnaeus gives
  // it. This is the exact bug report that repointed the default: a king taken by
  // two soldiers on or beside his own throne is not Tablut.
  describe("under the default Linnaeus preset", () => {
    it("needs four attackers when the king is on his throne", () => {
      const b = empty();
      b[4][4] = "king";
      b[3][4] = "attacker";
      b[5][4] = "attacker";
      b[4][3] = "attacker";
      expect(kingIsCaptured(b, linnaeus, { row: 4, col: 3 })).toBe(false); // three is not enough

      b[4][5] = "attacker";
      expect(kingIsCaptured(b, linnaeus, { row: 4, col: 5 })).toBe(true);
    });

    it("needs three attackers and the empty throne when the king stands beside it", () => {
      const b = empty();
      b[3][4] = "king"; // one square above the throne
      b[3][3] = "attacker";
      b[3][5] = "attacker";
      // A true opposite pair — a capture anywhere else, and under the baseline
      // preset even here — is not enough beside the throne.
      expect(kingIsCaptured(b, baseline, { row: 3, col: 5 })).toBe(true);
      expect(kingIsCaptured(b, linnaeus, { row: 3, col: 5 })).toBe(false);

      b[2][4] = "attacker"; // third man; the throne at (4,4) is his fourth wall
      expect(kingIsCaptured(b, linnaeus, { row: 2, col: 4 })).toBe(true);
    });

    it("still falls to the ordinary two anywhere else", () => {
      const b = empty();
      b[2][2] = "king";
      b[2][1] = "attacker";
      b[2][3] = "attacker";
      expect(kingIsCaptured(b, linnaeus, { row: 2, col: 3 })).toBe(true);
    });
  });
});

// ── Encirclement ──────────────────────────────────────────────────────────────

describe("isEncircled", () => {
  it("detects a ring that does not lean on the rim", () => {
    const b = board([
      ".........",
      ".........",
      "..aaa....",
      "..a.a....",
      "..aka....",
      "..aaa....",
      ".........",
      ".........",
      ".........",
    ]);
    expect(isEncircled(b)).toBe(true);
  });

  it("returns false when a gap lets the king out to the rim", () => {
    const b = board([
      ".........",
      ".........",
      "..aaa....",
      "..a.a....",
      "..ak.....",
      "..aaa....",
      ".........",
      ".........",
      ".........",
    ]);
    expect(isEncircled(b)).toBe(false);
  });

  it("returns false when the king already stands on the rim", () => {
    const b = empty();
    b[0][4] = "king";
    expect(isEncircled(b)).toBe(false);
  });

  it("does not count defenders inside the ring as breaking it", () => {
    const b = board([
      ".........",
      ".........",
      "..aaaa...",
      "..a.da...",
      "..akda...",
      "..aaaa...",
      ".........",
      ".........",
      ".........",
    ]);
    expect(isEncircled(b)).toBe(true);
  });

  it("returns false when a defender outside the ring has free access to the rim", () => {
    // Same sealed king ring as the "detects a ring" case above, plus a
    // defender sitting on the rim itself, disconnected from the king's
    // flood by the attacker wall. The king alone is enclosed, but not
    // "the king and all remaining defenders" per the documented contract,
    // so this must NOT be an encirclement.
    const b = board([
      "....d....",
      ".........",
      "..aaa....",
      "..a.a....",
      "..aka....",
      "..aaa....",
      ".........",
      ".........",
      ".........",
    ]);
    expect(isEncircled(b)).toBe(false);
  });

  it("returns false when there is no king", () => {
    expect(isEncircled(empty())).toBe(false);
  });
});

// ── Game status ───────────────────────────────────────────────────────────────

describe("applyMove — game status", () => {
  it("wins for White when the king reaches any edge square — rule 5", () => {
    const b = empty();
    b[4][4] = "king";
    const next = applyMove(state(b, "defenders"), mv(4, 4, 4, 0), baseline);
    expect(next.status).toBe("defenders_win_escape");
    expect(winnerOf(next.status)).toBe("defenders");
  });

  it("wins on a mid-edge square, not only in a corner", () => {
    const b = empty();
    b[4][2] = "king";
    const next = applyMove(state(b, "defenders"), mv(4, 2, 0, 2), baseline);
    expect(next.status).toBe("defenders_win_escape");
  });

  it("does not win on a mid-edge square under corner escape", () => {
    const b = empty();
    b[4][2] = "king";
    b[8][8] = "attacker"; // so the attackers still have a move
    const next = applyMove(state(b, "defenders"), mv(4, 2, 0, 2), corners);
    expect(next.status).toBe("playing");
  });

  it("wins in a corner under corner escape", () => {
    const b = empty();
    b[0][4] = "king";
    const next = applyMove(state(b, "defenders"), mv(0, 4, 0, 0), corners);
    expect(next.status).toBe("defenders_win_escape");
  });

  it("wins for Black on capturing the king — rule 6", () => {
    const b = empty();
    b[2][2] = "king";
    b[2][1] = "attacker";
    b[2][5] = "attacker"; // slides to 2,3 to close
    const next = applyMove(state(b, "attackers"), mv(2, 5, 2, 3), baseline);
    expect(next.status).toBe("attackers_win_capture");
    expect(winnerOf(next.status)).toBe("attackers");
  });

  it("does not end the game by encirclement under the baseline, but does under corner escape", () => {
    // A box around the king missing one wall square, with the attacker who will
    // close it standing off to the east. He lands two squares from the king, so
    // this is an encirclement and nothing else.
    const rows = [
      ".........",
      ".aaaaa...",
      ".a...a...",
      ".a.k....a",
      ".a...a...",
      ".aaaaa...",
      ".........",
      ".........",
      ".........",
    ];
    const close = mv(3, 8, 3, 5);

    const baselineNext = applyMove(state(board(rows), "attackers"), close, baseline);
    expect(isEncircled(baselineNext.board)).toBe(true);
    expect(baselineNext.status).toBe("playing");

    const cornerNext = applyMove(state(board(rows), "attackers"), close, corners);
    expect(cornerNext.status).toBe("attackers_win_encirclement");
  });

  it("loses for the side with no legal move", () => {
    // Black has a single man, boxed into a corner by White.
    const b = empty();
    b[0][0] = "attacker";
    b[0][1] = "defender";
    b[1][0] = "defender";
    b[4][4] = "king";
    b[6][6] = "defender"; // the mover
    const next = applyMove(state(b, "defenders"), mv(6, 6, 6, 7), baseline);
    expect(next.status).toBe("defenders_win_no_moves");
  });

  it("draws on threefold repetition under the baseline", () => {
    // Two kings' men shuffling on an otherwise empty board, with an attacker
    // shuffling opposite. Nothing is ever captured, so the repetition counter
    // climbs uninterrupted.
    const b = empty();
    b[4][4] = "king";
    b[0][0] = "defender";
    b[8][8] = "attacker";
    let s = state(b, "defenders");
    const cycle = [
      mv(0, 0, 0, 1),
      mv(8, 8, 8, 7),
      mv(0, 1, 0, 0),
      mv(8, 7, 8, 8),
    ];
    for (let i = 0; i < 3 && s.status === "playing"; i++)
      for (const m of cycle) {
        if (s.status !== "playing") break;
        s = applyMove(s, m, baseline);
      }
    expect(s.status).toBe("draw_repetition");
  });

  it("gives the repetition to Black under the tournament preset", () => {
    const b = empty();
    b[4][4] = "king";
    b[0][0] = "defender";
    b[8][8] = "attacker";
    let s = state(b, "defenders");
    const cycle = [
      mv(0, 0, 0, 1),
      mv(8, 8, 8, 7),
      mv(0, 1, 0, 0),
      mv(8, 7, 8, 8),
    ];
    for (let i = 0; i < 3 && s.status === "playing"; i++)
      for (const m of cycle) {
        if (s.status !== "playing") break;
        s = applyMove(s, m, aage);
      }
    expect(s.status).toBe("attackers_win_repetition");
  });

  it("never reports a repetition when the rule is off", () => {
    const rules = withRules({ repetitionResult: "none" });
    const b = empty();
    b[4][4] = "king";
    b[0][0] = "defender";
    b[8][8] = "attacker";
    let s = state(b, "defenders");
    const cycle = [mv(0, 0, 0, 1), mv(8, 8, 8, 7), mv(0, 1, 0, 0), mv(8, 7, 8, 8)];
    for (let i = 0; i < 4; i++) for (const m of cycle) s = applyMove(s, m, rules);
    expect(s.status).toBe("playing");
  });
});

// ── Plies-since-capture ───────────────────────────────────────────────────────

describe("plies-since-capture", () => {
  it("resets to zero on a capture and climbs by one otherwise", () => {
    const b = empty();
    b[4][4] = "king";
    b[2][3] = "attacker";
    b[2][4] = "defender";
    b[2][6] = "attacker";
    let s = state(b, "attackers");
    s = applyMove(s, mv(2, 6, 2, 5), baseline); // captures
    expect(s.sinceCapture).toBe(0);
    s = applyMove(s, mv(4, 4, 4, 1), baseline); // no capture
    expect(s.sinceCapture).toBe(1);
  });
});

// ── Notation ──────────────────────────────────────────────────────────────────

describe("notation", () => {
  it("names the throne e5 and the corners a9/i9/a1/i1", () => {
    expect(squareName({ row: 4, col: 4 })).toBe("e5");
    expect(squareName({ row: 0, col: 0 })).toBe("a9");
    expect(squareName({ row: 0, col: 8 })).toBe("i9");
    expect(squareName({ row: 8, col: 0 })).toBe("a1");
    expect(squareName({ row: 8, col: 8 })).toBe("i1");
  });

  it("spells a move, with a capture count when there was one", () => {
    expect(moveName(mv(4, 4, 4, 0))).toBe("e5-a5");
    expect(moveName({ ...mv(4, 4, 4, 0), captures: [{ row: 0, col: 0 }] })).toBe("e5-a5x1");
  });
});
