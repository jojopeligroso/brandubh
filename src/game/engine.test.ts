import { describe, expect, it } from "vitest";
import {
  applyMove,
  findKing,
  isEncircled,
  kingIsCaptured,
  initialState,
  movesFrom,
} from "./engine";
import { BOARD_SIZE, type Board, type GameState, type Side } from "./types";
import { VARIANTS } from "./variants";

const wtf = VARIANTS.wtf;
const walker = VARIANTS.walker;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Board from 7 strings of 7 chars. '.' empty 'a' attacker 'd' defender 'k' king */
function board(rows: string[]): Board {
  return rows.map((row) =>
    [...row].map((ch) =>
      ch === "a" ? "attacker" : ch === "d" ? "defender" : ch === "k" ? "king" : null,
    ),
  );
}

function state(b: Board, turn: Side = "attackers"): GameState {
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

// ── initialState ──────────────────────────────────────────────────────────────

describe("initialState", () => {
  it("places king on the throne and all 12 soldiers correctly", () => {
    const s = initialState();
    expect(s.board[3][3]).toBe("king");
    // four defenders
    expect(s.board[2][3]).toBe("defender");
    expect(s.board[4][3]).toBe("defender");
    expect(s.board[3][2]).toBe("defender");
    expect(s.board[3][4]).toBe("defender");
    // attackers in pairs at each arm
    expect(s.board[0][3]).toBe("attacker");
    expect(s.board[1][3]).toBe("attacker");
    expect(s.board[6][3]).toBe("attacker");
    expect(s.board[5][3]).toBe("attacker");
    expect(s.board[3][0]).toBe("attacker");
    expect(s.board[3][1]).toBe("attacker");
    expect(s.board[3][6]).toBe("attacker");
    expect(s.board[3][5]).toBe("attacker");
    expect(s.turn).toBe("attackers");
    expect(s.status).toBe("playing");
  });
});

// ── movesFrom ─────────────────────────────────────────────────────────────────

describe("movesFrom", () => {
  it("slides a piece in all 4 directions until blocked by a friendly", () => {
    const b = board([
      ".......",
      ".......",
      "...d...",
      "..dkd..",
      "...d...",
      ".......",
      ".......",
    ]);
    // King at (3,3) blocked on all 4 sides by defenders at distance 1
    const moves = movesFrom(b, 3, 3, wtf);
    expect(moves.length).toBe(0);
  });

  it("king can slide unobstructed to corners and edges", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      "...k...",
      ".......",
      ".......",
      ".......",
    ]);
    const moves = movesFrom(b, 3, 3, wtf);
    // All 4 corners are reachable: (0,3)→(0,0) not in one rook move, but edge squares are
    expect(has(moves, 0, 3)).toBe(true); // up to top edge
    expect(has(moves, 6, 3)).toBe(true); // down to bottom edge
    expect(has(moves, 3, 0)).toBe(true); // left to left edge
    expect(has(moves, 3, 6)).toBe(true); // right to right edge
    // all moves stay in bounds
    expect(moves.every((s) => s.row >= 0 && s.row < BOARD_SIZE && s.col >= 0 && s.col < BOARD_SIZE)).toBe(
      true,
    );
  });

  it("soldiers cannot land on the throne or corners", () => {
    const b = board([
      ".......",
      ".......",
      "...a...",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    // Attacker at (2,3) sliding down passes over throne at (3,3), then continues
    const moves = movesFrom(b, 2, 3, wtf);
    expect(has(moves, 3, 3)).toBe(false); // can't stop on throne
    expect(has(moves, 4, 3)).toBe(true); // can stop past throne (WTF passthrough)
  });

  it("soldiers are blocked by throne when soldiersPassThroughThrone is false", () => {
    const noPass = { ...wtf, soldiersPassThroughThrone: false };
    const b = board([
      ".......",
      ".......",
      "...a...",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    const moves = movesFrom(b, 2, 3, noPass);
    expect(has(moves, 3, 3)).toBe(false); // can't stop on throne
    expect(has(moves, 4, 3)).toBe(false); // blocked — can't pass through
    expect(has(moves, 6, 3)).toBe(false);
  });

  it("soldiers cannot land on corners", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      "a......",
      ".......",
      ".......",
      ".......",
    ]);
    // Attacker at (3,0) sliding up — corner at (0,0)
    const moves = movesFrom(b, 3, 0, wtf);
    expect(has(moves, 0, 0)).toBe(false); // corner
    expect(has(moves, 1, 0)).toBe(true); // adjacent to corner is fine
  });

  it("king may land on corners", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      ".....k.",
      ".......",
      ".......",
      ".......",
    ]);
    // King at (3,5): sliding right reaches (3,6), which is not a corner — sliding up reaches (0,5)
    const moves = movesFrom(b, 3, 5, wtf);
    expect(has(moves, 3, 6)).toBe(true); // right edge, not a corner
    expect(has(moves, 0, 5)).toBe(true); // top edge
    // Corner at (0,6) not reachable in a single rook move from (3,5)
    // But king at (3,6) can reach (0,6):
    const b2 = board([
      ".......",
      ".......",
      ".......",
      "......k",
      ".......",
      ".......",
      ".......",
    ]);
    const moves2 = movesFrom(b2, 3, 6, wtf);
    expect(has(moves2, 0, 6)).toBe(true); // corner reachable by king ✓
  });
});

// ── Captures ──────────────────────────────────────────────────────────────────

describe("captures", () => {
  it("sandwiches a defender between two attackers (custodial)", () => {
    // Attacker at (1,2), defender at (1,3), attacker moves from (1,5) to (1,4)
    // Hammer (1,4) — victim (1,3) — anvil (1,2)
    const b = board([
      ".......",
      "..ad.a.",
      ".......",
      "...k...",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "attackers");
    const r = applyMove(s, mv(1, 5, 1, 4), wtf);
    expect(r.board[1][3]).toBeNull(); // defender captured
  });

  it("captures defender against empty throne (WTF: throneHostileToSoldiers)", () => {
    // Attacker at col 0, defender at col 2; attacker moves to col 1
    // Defender (col 2) sandwiched between attacker (col 1) and hostile empty throne (col 3)
    const b = board([
      ".......",
      ".......",
      ".......",
      "a.d....",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "attackers");
    const r = applyMove(s, mv(3, 0, 3, 1), wtf);
    expect(r.board[3][2]).toBeNull(); // captured via hostile throne
  });

  it("does NOT capture via throne when throneHostileToSoldiers is false (Walker)", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      "a.d....",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "attackers");
    const r = applyMove(s, mv(3, 0, 3, 1), walker);
    expect(r.board[3][2]).toBe("defender"); // not captured
  });

  it("captures defender against a corner (cornersHostile)", () => {
    // Defender at (1,0), attacker moves to (2,0); corner (0,0) acts as anvil
    const b = board([
      ".......",
      "d......",
      ".......",
      ".......",
      "a......",
      ".......",
      ".......",
    ]);
    const s = state(b, "attackers");
    const r = applyMove(s, mv(4, 0, 2, 0), wtf);
    expect(r.board[1][0]).toBeNull(); // captured between attacker (2,0) and corner (0,0)
  });

  it("armed king can participate in captures", () => {
    // King at (3,0) moves to (3,1); attacker at (3,2) sandwiched between king (3,1) and hostile empty throne (3,3)
    const b = board([
      ".......",
      ".......",
      ".......",
      "k.a....",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "defenders");
    const r = applyMove(s, mv(3, 0, 3, 1), wtf); // WTF: armedKing=true, throneHostileToSoldiers=true
    expect(r.board[3][2]).toBeNull(); // attacker captured by king + hostile throne
  });

  it("weaponless king cannot participate in captures", () => {
    const unarmed = { ...wtf, armedKing: false };
    const b = board([
      ".......",
      ".......",
      ".......",
      "k.a....",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "defenders");
    const r = applyMove(s, mv(3, 0, 3, 1), unarmed);
    expect(r.board[3][2]).toBe("attacker"); // NOT captured — king is unarmed
  });
});

// ── kingIsCaptured ────────────────────────────────────────────────────────────

describe("kingIsCaptured", () => {
  it("is captured by two attackers on opposite sides (off-throne)", () => {
    // King at (2,3) — off the throne — flanked by attackers at (1,3) and (3,3)
    const b = board([
      ".......",
      "...a...",
      "...k...",
      "...a...",
      ".......",
      ".......",
      ".......",
    ]);
    // Attacker at (3,3) just moved there — active capture
    expect(kingIsCaptured(b, wtf, { row: 3, col: 3 })).toBe(true);
    expect(kingIsCaptured(b, walker, { row: 3, col: 3 })).toBe(true);
    // Either flanking attacker counts
    expect(kingIsCaptured(b, wtf, { row: 1, col: 3 })).toBe(true);
  });

  it("is NOT captured when attacker move is not adjacent to king (passive)", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      "..aka..",
      ".......",
      ".....a.",
      ".......",
    ]);
    // Attacker moved to (5,5) — not adjacent to king at (3,3)
    expect(kingIsCaptured(b, wtf, { row: 5, col: 5 })).toBe(false);
  });

  it("is NOT captured when an adjacent move is perpendicular to a walked-into pair", () => {
    // Regression: king walked between two attackers on the horizontal axis
    // (2,3)/(2,5). An attacker then moves onto the perpendicular axis at (3,4)
    // while (1,4) is empty — no real sandwich is closed, so the pre-existing
    // horizontal pair must NOT be "reused" to declare a capture.
    const b = board([
      ".......",
      ".......", // (1,4) empty — vertical sandwich is open
      "...aka.", // king at (2,4) flanked by attackers at (2,3) and (2,5)
      "....a..", // attacker just slid here, to (3,4)
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, wtf, { row: 3, col: 4 })).toBe(false);
    // Mirror case: the adjacent move lands above the king at (1,4), (3,4) empty.
    const bAbove = board([
      ".......",
      "....a..", // attacker just slid here, to (1,4)
      "...aka.", // king at (2,4) flanked horizontally by (2,3)/(2,5)
      ".......", // (3,4) empty — vertical sandwich is open
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(bAbove, wtf, { row: 1, col: 4 })).toBe(false);
  });

  it("IS captured when the moved attacker actually closes the perpendicular pair", () => {
    // Same shape, but now (1,4) already holds an attacker: the move to (3,4)
    // genuinely closes the vertical sandwich, so the king is captured.
    const b = board([
      ".......",
      "....a..", // (1,4) attacker already present
      "...aka.", // king at (2,4)
      "....a..", // attacker just moved to (3,4), closing the vertical pair
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, wtf, { row: 3, col: 4 })).toBe(true);
  });

  it("is NOT captured with only one attacker", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      "..ak...",
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, wtf, { row: 3, col: 2 })).toBe(false);
  });

  it("requires all 4 sides when king is ON the throne (WTF)", () => {
    // 3 attackers around throne → not captured yet
    const b3 = board([
      ".......",
      ".......",
      "...a...",
      "..ak...",
      "...a...",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b3, wtf, { row: 3, col: 2 })).toBe(false);

    // All 4 → captured (last attacker moved to (3,4))
    const b4 = board([
      ".......",
      ".......",
      "...a...",
      "..aka..",
      "...a...",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b4, wtf, { row: 3, col: 4 })).toBe(true);
  });

  it("does NOT require all 4 on throne under Walker rules (strongKingOnThrone: false)", () => {
    // Two attackers on opposite sides of king on throne → captured in Walker
    const b = board([
      ".......",
      ".......",
      ".......",
      "..aka..",
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, walker, { row: 3, col: 4 })).toBe(true);
  });

  it("is captured via corner acting as hostile flank", () => {
    // King at (1,0): corner (0,0) above, attacker (2,0) below — opposite pair both hostile
    const b = board([
      ".......",
      "k......",
      "a......",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    // Attacker at (2,0) just moved there
    expect(kingIsCaptured(b, wtf, { row: 2, col: 0 })).toBe(true);
  });

  it("board edge is NOT hostile (Brandubh rule)", () => {
    // King at (3,0): left side is off-board (not hostile), attacker only below
    const b = board([
      ".......",
      ".......",
      ".......",
      "k......",
      "a......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, wtf, { row: 4, col: 0 })).toBe(false);
  });

  it("empty throne IS hostile to king when throneHostileToKing is true (custom rule)", () => {
    // King at (2,3) adjacent to empty throne. With throneHostileToKing=true,
    // single attacker at (1,3) + throne (3,3) form an opposite pair → captured.
    const customRules = { ...wtf, throneHostileToKing: true };
    const b = board([
      ".......",
      "...a...",
      "...k...",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, customRules, { row: 1, col: 3 })).toBe(true); // attacker + hostile throne
    expect(kingIsCaptured(b, wtf, { row: 1, col: 3 })).toBe(false); // throne NOT hostile by default
  });

  it("returns true when king is absent from the board", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    expect(kingIsCaptured(b, wtf, { row: 0, col: 0 })).toBe(true);
  });
});

// ── isEncircled ───────────────────────────────────────────────────────────────

describe("isEncircled", () => {
  it("detects a complete ring of attackers not touching board edges", () => {
    const b = board([
      ".......",
      ".aaaaa.",
      ".a...a.",
      ".a.k.a.",
      ".a...a.",
      ".aaaaa.",
      ".......",
    ]);
    expect(isEncircled(b)).toBe(true);
  });

  it("returns false when a gap in the ring allows escape to an edge", () => {
    // Right wall at row 3 is absent — king can reach col 6 (edge) through the gap
    const b = board([
      ".......",
      ".aaaaa.",
      ".a...a.",
      ".a.k...",
      ".a...a.",
      ".aaaaa.",
      ".......",
    ]);
    expect(isEncircled(b)).toBe(false);
  });

  it("returns false when king is on a board edge", () => {
    // King on top edge — immediately not encircled
    const b = board([
      "...k...",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    expect(isEncircled(b)).toBe(false);
  });

  it("defenders inside the ring do not break encirclement", () => {
    const b = board([
      ".......",
      ".aaaaa.",
      ".a.d.a.",
      ".a.k.a.",
      ".a...a.",
      ".aaaaa.",
      ".......",
    ]);
    expect(isEncircled(b)).toBe(true);
  });

  it("returns false when king is absent", () => {
    const b = board([
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    expect(isEncircled(b)).toBe(false);
  });
});

// ── applyMove — game status ───────────────────────────────────────────────────

describe("applyMove — game status", () => {
  it("defenders_win_escape when king reaches a corner", () => {
    // King at (0,1) — one move away from corner (0,0)
    const b = board([
      ".k.....",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "defenders");
    const r = applyMove(s, mv(0, 1, 0, 0), wtf);
    expect(r.status).toBe("defenders_win_escape");
  });

  it("attackers_win_capture when king is captured", () => {
    // King at (3,2), attacker at (3,1); attacker moves to (3,3) completing the sandwich
    const b = board([
      ".......",
      ".......",
      ".......",
      ".ak..a.",
      ".......",
      ".......",
      ".......",
    ]);
    const s = state(b, "attackers");
    // Attacker at (3,5) moves to (3,3): king at (3,2) between (3,1) and (3,3)
    const r = applyMove(s, mv(3, 5, 3, 3), wtf);
    expect(r.status).toBe("attackers_win_capture");
  });

  it("attackers_win_encirclement when ring is completed (WTF)", () => {
    // Ring complete except gap at (3,5); attacker at (3,6) moves to close it
    const b = board([
      ".......",
      ".aaaaa.",
      ".a...a.",
      ".a.k..a",
      ".a...a.",
      ".aaaaa.",
      ".......",
    ]);
    const s = state(b, "attackers");
    const r = applyMove(s, mv(3, 6, 3, 5), wtf);
    expect(r.status).toBe("attackers_win_encirclement");
  });

  it("encirclement does NOT trigger when disabled (Walker)", () => {
    const b = board([
      ".......",
      ".aaaaa.",
      ".a...a.",
      ".a.k..a",
      ".a...a.",
      ".aaaaa.",
      ".......",
    ]);
    const s = state(b, "attackers");
    const r = applyMove(s, mv(3, 6, 3, 5), walker);
    expect(r.status).not.toBe("attackers_win_encirclement");
  });

  it("draw_repetition after threefold repetition (Walker)", () => {
    // King at (0,1), lone attacker at (3,6). Oscillate 8 moves until position repeats 3 times.
    const b = board([
      ".k.....",
      ".......",
      ".......",
      "......a",
      ".......",
      ".......",
      ".......",
    ]);
    let s = state(b, "defenders");
    const oscillate = [
      mv(0, 1, 0, 2), // defenders: king right
      mv(3, 6, 3, 5), // attackers: attacker left
      mv(0, 2, 0, 1), // defenders: king back
      mv(3, 5, 3, 6), // attackers: attacker back (position seen 2nd time)
      mv(0, 1, 0, 2),
      mv(3, 6, 3, 5),
      mv(0, 2, 0, 1),
      mv(3, 5, 3, 6), // position seen 3rd time → repetition
    ];
    for (const m of oscillate) {
      if (s.status !== "playing") break;
      s = applyMove(s, m, walker);
    }
    expect(s.status).toBe("draw_repetition");
  });

  it("attackers_win_repetition after threefold repetition (WTF)", () => {
    const b = board([
      ".k.....",
      ".......",
      ".......",
      "......a",
      ".......",
      ".......",
      ".......",
    ]);
    let s = state(b, "defenders");
    const oscillate = [
      mv(0, 1, 0, 2),
      mv(3, 6, 3, 5),
      mv(0, 2, 0, 1),
      mv(3, 5, 3, 6),
      mv(0, 1, 0, 2),
      mv(3, 6, 3, 5),
      mv(0, 2, 0, 1),
      mv(3, 5, 3, 6),
    ];
    for (const m of oscillate) {
      if (s.status !== "playing") break;
      s = applyMove(s, m, wtf);
    }
    expect(s.status).toBe("attackers_win_repetition");
  });
});
