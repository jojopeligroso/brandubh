import { describe, expect, it } from "vitest";
import {
  clearLanesToEdge,
  forcedAttackerWin,
  forcedDefenderWin,
  kingEdgeDistance,
  kingEscapeMoves,
  laneScan,
} from "./engine";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "./rules";
import { BOARD_SIZE, type Board, type GameState, type Piece, type Side } from "./types";
import { VARIANTS, type TablutRuleSet } from "./variants";

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
  rules: TablutRuleSet,
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
 * Three, by construction. `forcedDefenderWin` proves an escape in hand (1),
 * a two-lane fork with Black to move (2: the reply, then the escape), or a king
 * move that steps into such a fork (3). `forcedAttackerWin` proves a capture in
 * hand (1) or a net (2). Nothing either one does can reach four.
 *
 * The tight horizon is not only honest, it is what keeps this suite affordable:
 * the oracle's AND nodes enumerate every attacker reply, and on 81 squares that
 * is over a hundred of them, so a spare ply costs two orders of magnitude.
 */
const RECOGNIZER_HORIZON = 3;

const baseline = VARIANTS.tablut;
const gulo = VARIANTS["tablut-gulo"];

const empty = (): Board =>
  Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));

const stateOf = (b: Board, turn: Side): GameState => ({
  board: b,
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
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

// ── The geometry the recognizers rest on ──────────────────────────────────────

describe("lane geometry", () => {
  it("gives a king alone in the centre all four lanes", () => {
    const b = empty();
    b[4][4] = "king";
    expect(clearLanesToEdge(b, 4, 4)).toBe(4);
    // This is the whole difference from Brandubh, where a centre king has none:
    // every ray of an interior square ends on the rim.
  });

  it("counts a ray as open only when it is empty the whole way to the rim", () => {
    const b = empty();
    b[4][4] = "king";
    b[0][4] = "attacker"; // seals the north ray at its far end
    b[4][6] = "attacker"; // seals the east ray part-way
    const { open, blockers } = laneScan(b, 4, 4);
    expect(open).toBe(2); // south and west
    expect(blockers).toBe(2);
  });

  it("measures the king's depth as the distance to the nearest rim square", () => {
    expect(kingEdgeDistance(4, 4)).toBe(4); // the throne
    expect(kingEdgeDistance(0, 4)).toBe(0); // on the rim
    expect(kingEdgeDistance(2, 6)).toBe(2);
  });

  it("counts escape moves exactly at one and two", () => {
    const one = empty();
    one[4][4] = "king";
    expect(kingEscapeMoves(one, 4, 4, baseline)).toBe(1);

    // Boxed in on all four rays, but one L-path out remains.
    const two = empty();
    two[4][4] = "king";
    two[0][4] = "attacker";
    two[8][4] = "attacker";
    two[4][0] = "attacker";
    two[4][8] = "attacker";
    expect(clearLanesToEdge(two, 4, 4)).toBe(0);
    expect(kingEscapeMoves(two, 4, 4, baseline)).toBe(2);
  });
});

// ── Defender recognizer ───────────────────────────────────────────────────────

describe("the defender recognizer fires on the intended patterns", () => {
  it("two-lane fork — attackers to move and they cannot close both", () => {
    const b = empty();
    b[3][3] = "king"; // all four rays clear
    b[6][0] = "attacker";
    b[6][8] = "attacker";
    const s = stateOf(b, "attackers");
    expect(forcedDefenderWin(s, baseline)).toBe(true);
    expect(forcedWinWithin(s, baseline, 4, "defenders")).toBe(true);
  });

  it("an open lane with White to move is an escape in hand", () => {
    const b = empty();
    b[3][3] = "king";
    const s = stateOf(b, "defenders");
    expect(forcedDefenderWin(s, baseline)).toBe(true);
    expect(forcedWinWithin(s, baseline, 1, "defenders")).toBe(true);
  });

  it("declines on a single lane, because a Tablut rim square can be stood on", () => {
    // The king is one step below the top rim with exactly one open ray — north,
    // pointing at e9. In Brandubh the equivalent shape (king beside a corner, one
    // lane) is a *proven* win, and the recognizer there says so: no soldier may
    // ever stand on a corner, so that lane cannot be closed at all.
    //
    // Under edge escape the rim is ordinary ground, so the same shape is not a
    // proof — an attacker can simply occupy e9. Porting Brandubh's shortcut would
    // therefore have been unsound, and this is the position that shows why.
    const b = empty();
    b[1][4] = "king";
    b[1][0] = "attacker"; // seals west
    b[1][8] = "attacker"; // seals east
    b[5][4] = "attacker"; // seals south
    b[0][0] = "attacker"; // and can slide along the top rim onto e9, sealing north
    const s = stateOf(b, "attackers");
    expect(clearLanesToEdge(b, 1, 4)).toBe(1);
    expect(forcedDefenderWin(s, baseline)).toBe(false);

    // The reason, stated directly: a legal attacker move occupies the escape square.
    const seals = allMoves(b, "attackers", baseline).some(
      (m) => m.to.row === 0 && m.to.col === 4,
    );
    expect(seals).toBe(true);

    // Declining is allowed to be pessimistic — the recognizer is a sound *subset*,
    // so "not proven" is a permitted answer even where a win exists by some other
    // route. What is never allowed is the opposite, which the soundness tests below
    // are what actually check.
  });

  it("declines under corner escape rather than guessing", () => {
    // The lane geometry means nothing when the rim is not the goal, so the
    // recognizer refuses the question and leaves it to the search.
    const b = empty();
    b[3][3] = "king";
    expect(forcedDefenderWin(stateOf(b, "defenders"), VARIANTS["tablut-corners"])).toBe(false);
  });
});

// ── Attacker recognizer ───────────────────────────────────────────────────────

describe("the attacker recognizer fires on the intended patterns", () => {
  it("a capture in hand with Black to move", () => {
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker"; // one flank in place
    b[2][3] = "attacker"; // the other two neighbours are held, so the king has
    b[4][3] = "attacker"; // one liberty left and the O(1) pressure gate passes
    b[3][7] = "attacker"; // slides west onto (3,4), closing the horizontal pair
    const s = stateOf(b, "attackers");
    expect(forcedAttackerWin(s, baseline)).toBe(true);
    expect(forcedWinWithin(s, baseline, 1, "attackers")).toBe(true);
  });

  it("declines when the king has room to run", () => {
    const b = empty();
    b[3][3] = "king";
    b[3][2] = "attacker";
    expect(forcedAttackerWin(stateOf(b, "attackers"), baseline)).toBe(false);
  });
});

// ── Soundness ─────────────────────────────────────────────────────────────────
// The test that matters. A recognizer that claims an unforced win is worse than
// no recognizer: it hands the search a false terminal, and the search has no way
// to notice. So every firing over a broad random sample is checked against the
// independent AND-OR oracle above.

describe("recognizers: SOUND — never claim an unforced win (cross-validated)", () => {
  it("every defender-recognizer firing is an independently-forced defender win", () => {
    let fired = 0;
    const rng = mulberry32(20260810);
    for (const rules of [baseline, gulo]) {
      for (let game = 0; game < 14 && fired < 40; game++) {
        let s = initialState(rules);
        for (let ply = 0; ply < 50 && !isGameOver(s.status); ply++) {
          if (forcedDefenderWin(s, rules)) {
            fired++;
            expect(
              forcedWinWithin(s, rules, RECOGNIZER_HORIZON, "defenders"),
              "recognizer fired but no forced defender win within its own horizon",
            ).toBe(true);
          }
          const moves = allMoves(s.board, s.turn, rules);
          if (!moves.length) break;
          s = applyMove(s, moves[Math.floor(rng() * moves.length)], rules);
        }
      }
    }
    // The sampler must actually exercise the recognizer, or the test proves nothing.
    expect(fired).toBeGreaterThan(0);
  });

  it("every attacker-recognizer firing is an independently-forced attacker win", () => {
    let fired = 0;
    const rng = mulberry32(20260811);
    for (const rules of [baseline, gulo]) {
      for (let game = 0; game < 14 && fired < 40; game++) {
        let s = initialState(rules);
        for (let ply = 0; ply < 50 && !isGameOver(s.status); ply++) {
          if (forcedAttackerWin(s, rules)) {
            fired++;
            expect(
              forcedWinWithin(s, rules, RECOGNIZER_HORIZON, "attackers"),
              "recognizer fired but no forced attacker win within its own horizon",
            ).toBe(true);
          }
          const moves = allMoves(s.board, s.turn, rules);
          if (!moves.length) break;
          s = applyMove(s, moves[Math.floor(rng() * moves.length)], rules);
        }
      }
    }
    expect(fired).toBeGreaterThan(0);
  });

  it("never claims a win for both sides at once", () => {
    const rng = mulberry32(20260812);
    for (let game = 0; game < 10; game++) {
      let s = initialState(baseline);
      for (let ply = 0; ply < 50 && !isGameOver(s.status); ply++) {
        expect(forcedDefenderWin(s, baseline) && forcedAttackerWin(s, baseline)).toBe(false);
        const moves = allMoves(s.board, s.turn, baseline);
        if (!moves.length) break;
        s = applyMove(s, moves[Math.floor(rng() * moves.length)], baseline);
      }
    }
  });
});
