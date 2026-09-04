import { describe, expect, it } from "vitest";
import {
  clearPathToCorner,
  forcedAttackerWin,
  forcedDefenderWin,
  kingCornerMoves,
} from "./engine";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import {
  CUSTOM_RULE_DEFAULTS,
  VARIANTS,
  rulesFor,
  type CopenhagenRuleSet,
} from "./variants";

/**
 * Independent oracle: can the side to move force a win for `who` within `plies`?
 *
 * A plain AND-OR minimax on the raw rules — the winning side's turn is an OR node
 * (one winning move suffices), the other side's is an AND node (every reply must
 * still lose). It shares none of the recognizer's lane/fork logic, so agreement is
 * real cross-validation rather than a tautology, and it is exact (no heuristic)
 * over the shallow horizon used here.
 */
function forcedWinWithin(
  state: GameState,
  rules: CopenhagenRuleSet,
  plies: number,
  who: Side,
): boolean {
  if (isGameOver(state.status)) return winnerOf(state.status) === who;
  if (plies === 0) return false; // not proven within the horizon
  const moves = allMoves(state.board, state.turn, rules);
  if (moves.length === 0) return false;
  return state.turn === who
    ? moves.some((m) => forcedWinWithin(applyMove(state, m, rules), rules, plies - 1, who))
    : moves.every((m) => forcedWinWithin(applyMove(state, m, rules), rules, plies - 1, who));
}

/**
 * The deepest win either recognizer can claim, in plies — so the exact horizon the
 * oracle has to search, and no deeper.
 *
 * Three, by construction. `forcedDefenderWin` proves an escape in hand (1), a
 * two-lane fork with Black to move (2: the reply, then the escape), or a king
 * move that steps into such a fork (3). `forcedAttackerWin` proves a capture in
 * hand (1) or a net (2). Nothing either one does can reach four.
 *
 * The tight horizon is not only honest, it is what keeps this suite affordable.
 * On 121 mostly-empty squares a single rook-moving man has up to forty
 * destinations, so the oracle's AND nodes are *wider* here than on a crowded
 * board, not narrower — which is the opposite of the intuition, and the reason
 * the samplers below cap how many firings they verify.
 */
const RECOGNIZER_HORIZON = 3;

const cph = VARIANTS.copenhagen;
const fetlar = VARIANTS["copenhagen-fetlar"];

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

const isCornerSq = (r: number, c: number) =>
  (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1);
const isThroneSq = (r: number, c: number) => r === 5 && c === 5;

// ── The geometry the recognizers rest on ──────────────────────────────────────

describe("corner lane geometry", () => {
  it("gives a king alone in the centre no lanes at all", () => {
    const b = empty();
    b[5][5] = "king";
    // The whole difference from Tablut, where a centre king has four. Here a king
    // must share a rank or file with a corner even to have one, which on 11×11
    // means standing on rank/file 0 or 10.
    expect(clearPathToCorner(b, 5, 5)).toBe(0);
  });

  it("gives a king on an empty rim exactly two lanes", () => {
    const b = empty();
    b[0][5] = "king";
    expect(clearPathToCorner(b, 0, 5)).toBe(2); // a1-corner and k11-corner, along rank 11
  });

  it("counts a lane as open only when nothing stands between king and corner", () => {
    const b = empty();
    b[0][5] = "king";
    b[0][2] = "attacker"; // blocks the westward lane
    expect(clearPathToCorner(b, 0, 5)).toBe(1);
    b[0][8] = "attacker"; // …and the eastward one
    expect(clearPathToCorner(b, 0, 5)).toBe(0);
  });

  it("measures king distance in real moves, not in squares", () => {
    const b = empty();
    b[5][5] = "king";
    expect(kingCornerMoves(b, 5, 5, cph)).toBe(2); // centre: an L-path via a pivot

    const walled = empty();
    walled[5][5] = "king";
    // Seal every pivot on both rims. The king is still five squares from a corner
    // by any straight-line measure, and three moves away in fact.
    for (const i of [0, BOARD_SIZE - 1]) {
      walled[i][5] = "attacker";
      walled[5][i] = "attacker";
    }
    expect(kingCornerMoves(walled, 5, 5, cph)).toBe(3);
  });
});

// ── Defender recognizer ───────────────────────────────────────────────────────

describe("the defender recognizer fires on the intended patterns", () => {
  it("two-lane fork — attackers to move and they cannot close both", () => {
    const b = empty();
    b[0][5] = "king"; // both lanes along rank 11 are clear
    b[7][2] = "attacker";
    b[7][8] = "attacker";
    const s = stateOf(b, "attackers");
    expect(clearPathToCorner(b, 0, 5)).toBe(2);
    expect(forcedDefenderWin(s, cph)).toBe(true);
    expect(forcedWinWithin(s, cph, 2, "defenders")).toBe(true);
  });

  it("an open lane with White to move is an escape in hand", () => {
    const b = empty();
    b[0][5] = "king";
    b[0][8] = "attacker"; // one lane sealed, one still open
    const s = stateOf(b, "defenders");
    expect(forcedDefenderWin(s, cph)).toBe(true);
    expect(forcedWinWithin(s, cph, 1, "defenders")).toBe(true);
  });

  it("accepts a single lane when the king already touches the corner", () => {
    // Brandubh's shortcut, and it is sound here for Brandubh's reason: there are
    // no squares between king and corner to block, and rule 5 forbids any soldier
    // from standing on the corner itself. ADR-0006 records this as the one thing
    // that looked portable to Tablut and was not — under edge escape an attacker
    // can occupy the escape square, so the same shape proves nothing there.
    const b = empty();
    b[0][1] = "king";
    b[0][6] = "attacker"; // seals the eastward lane; the a11 corner is one step west
    for (let r = 2; r <= 8; r++) b[r][1] = "attacker"; // and nothing else to do
    const s = stateOf(b, "attackers");
    expect(clearPathToCorner(b, 0, 1)).toBe(1);
    expect(forcedDefenderWin(s, cph)).toBe(true);
    expect(forcedWinWithin(s, cph, 2, "defenders")).toBe(true);
  });

  it("refuses that shortcut when the ruleset stops restricting corners", () => {
    // The precondition, made to fail. With corners open ground an attacker can
    // simply stand on a11, so the single-lane shape is no longer a proof — and a
    // recognizer that assumed `cornersRestricted` would be handing the search a
    // terminal that is not one.
    const open = rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, cornersRestricted: false });
    const b = empty();
    b[0][1] = "king";
    b[0][6] = "attacker";
    for (let r = 2; r <= 8; r++) b[r][1] = "attacker";
    b[5][0] = "attacker"; // …and one with a clear run up the a-file to a11
    expect(forcedDefenderWin(stateOf(b, "attackers"), open)).toBe(false);
    // …and here is the move that shows why: an attacker reaching the corner.
    expect(
      allMoves(b, "attackers", open).some((m) => m.to.row === 0 && m.to.col === 0),
    ).toBe(true);
  });

  it("declines under edge escape rather than guessing", () => {
    // Switched to Tablut's goal, "aligned with a corner" stops meaning anything,
    // so the recognizer refuses the question and leaves it to the search.
    const edges = rulesFor("custom", { ...CUSTOM_RULE_DEFAULTS, escape: "edges" });
    const b = empty();
    b[0][5] = "king";
    expect(forcedDefenderWin(stateOf(b, "defenders"), edges)).toBe(false);
  });

  it("declines on a deep-centre king in O(1)", () => {
    const b = empty();
    b[5][5] = "king";
    expect(forcedDefenderWin(stateOf(b, "defenders"), cph)).toBe(false);
  });
});

// ── Attacker recognizer ───────────────────────────────────────────────────────

describe("the attacker recognizer fires on the intended patterns", () => {
  it("a capture in hand with Black to move, against a strong king", () => {
    // Copenhagen's king needs all four sides, so a capture in hand means three
    // are already held and the fourth is one slide away. That is a much narrower
    // event than the two-sided ancestors of this recognizer assumed, which is
    // part of why `attackerRecognizer` ships off.
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    b[3][9] = "attacker"; // slides west onto (3,4) and closes the fourth side
    const s = stateOf(b, "attackers");
    expect(forcedAttackerWin(s, cph)).toBe(true);
    expect(forcedWinWithin(s, cph, 1, "attackers")).toBe(true);
  });

  it("declines against three sides when the fourth cannot be reached", () => {
    const b = empty();
    b[3][3] = "king";
    b[2][3] = "attacker";
    b[4][3] = "attacker";
    b[3][2] = "attacker";
    // Nothing bears on (3,4) at all.
    expect(forcedAttackerWin(stateOf(b, "attackers"), cph)).toBe(false);
  });

  it("declines when the king has room to run", () => {
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker";
    expect(forcedAttackerWin(stateOf(b, "attackers"), cph)).toBe(false);
  });
});

// ── Soundness ─────────────────────────────────────────────────────────────────
// The test that matters. A recognizer that claims an unforced win is worse than
// no recognizer: it hands the search a false terminal, and the search has no way
// to notice. So every firing over a broad sample is checked against the
// independent AND-OR oracle above.
//
// The sample is *not* drawn from random playouts, as it is for the other two
// games. On 121 squares a random game almost never walks the king to the rim, so
// playouts would fire the recognizer a handful of times in minutes of work.
// Thinned positions with the king placed in the zone the recognizer actually
// gates on exercise it far harder per second of test time, and a soundness test
// wants adversarial inputs rather than typical ones.

/** A sparse board with the king somewhere the recognizer will look at him. */
function thinPosition(rng: () => number, attackers: number, defenders: number): Board {
  const b = empty();
  const nearRim = (): number => {
    const zone = Math.floor(rng() * 4); // 0,1,9,10 — the gate's own zone
    return zone < 2 ? zone : BOARD_SIZE - 1 - (zone - 2);
  };
  // One coordinate in the gate's zone, the other anywhere.
  const kr = rng() < 0.5 ? nearRim() : Math.floor(rng() * BOARD_SIZE);
  const kc = kr <= 1 || kr >= BOARD_SIZE - 2 ? Math.floor(rng() * BOARD_SIZE) : nearRim();
  if (isCornerSq(kr, kc)) return thinPosition(rng, attackers, defenders); // already won
  b[kr][kc] = "king";

  const place = (n: number, p: Piece): void => {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const r = Math.floor(rng() * BOARD_SIZE);
        const c = Math.floor(rng() * BOARD_SIZE);
        if (b[r][c] !== null || isCornerSq(r, c) || isThroneSq(r, c)) continue;
        b[r][c] = p;
        break;
      }
    }
  };
  place(attackers, "attacker");
  place(defenders, "defender");
  return b;
}

describe("recognizers: SOUND — never claim an unforced win (cross-validated)", () => {
  it("every defender-recognizer firing is an independently-forced defender win", () => {
    let fired = 0;
    const rng = mulberry32(20260901);
    for (const rules of [cph, fetlar]) {
      for (let i = 0; i < 600 && fired < 24; i++) {
        const b = thinPosition(rng, 3 + Math.floor(rng() * 5), Math.floor(rng() * 3));
        const s = stateOf(b, rng() < 0.5 ? "attackers" : "defenders");
        if (isGameOver(applyMove(s, allMoves(b, s.turn, rules)[0], rules).status)) {
          // fine — the oracle handles terminals; this is only a cheap guard against
          // a generated board with no legal move at all.
        }
        if (!forcedDefenderWin(s, rules)) continue;
        fired++;
        expect(
          forcedWinWithin(s, rules, RECOGNIZER_HORIZON, "defenders"),
          "recognizer fired but no forced defender win within its own horizon",
        ).toBe(true);
      }
    }
    // The sampler must actually exercise the recognizer, or the test proves nothing.
    expect(fired).toBeGreaterThan(0);
  });

  it("every attacker-recognizer firing is an independently-forced attacker win", () => {
    let fired = 0;
    const rng = mulberry32(20260902);
    for (let i = 0; i < 900 && fired < 20; i++) {
      // Seeded towards the shape the recognizer is about: three sides of the king
      // already held. Random placement alone would essentially never build one
      // against a strong king.
      const b = thinPosition(rng, 2 + Math.floor(rng() * 3), Math.floor(rng() * 2));
      let kr = -1;
      let kc = -1;
      for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++) if (b[r][c] === "king") [kr, kc] = [r, c];
      const dirs: Array<[number, number]> = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        if (rng() < 0.7) continue;
        const r = kr + dr;
        const c = kc + dc;
        if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) continue;
        if (b[r][c] !== null || isCornerSq(r, c) || isThroneSq(r, c)) continue;
        b[r][c] = "attacker";
      }
      const s = stateOf(b, rng() < 0.5 ? "attackers" : "defenders");
      if (!forcedAttackerWin(s, cph)) continue;
      fired++;
      expect(
        forcedWinWithin(s, cph, RECOGNIZER_HORIZON, "attackers"),
        "recognizer fired but no forced attacker win within its own horizon",
      ).toBe(true);
    }
    expect(fired).toBeGreaterThan(0);
  });

  it("never claims a win for both sides at once, over real games", () => {
    const rng = mulberry32(20260903);
    for (let game = 0; game < 6; game++) {
      let s = initialState(cph);
      for (let ply = 0; ply < 60 && !isGameOver(s.status); ply++) {
        expect(forcedDefenderWin(s, cph) && forcedAttackerWin(s, cph)).toBe(false);
        const moves = allMoves(s.board, s.turn, cph);
        if (!moves.length) break;
        s = applyMove(s, moves[Math.floor(rng() * moves.length)], cph);
      }
    }
  });
});
