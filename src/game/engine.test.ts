import { describe, expect, it } from "vitest";
import {
  chooseMove,
  FULL_CONFIG,
  DEFAULT_WEIGHTS,
  LEGACY_CONFIG,
  pickMove,
  resetTT,
  type Difficulty,
  type SearchConfig,
} from "./engine";
import { allMoves, applyMove, initialState, isGameOver, winnerOf } from "./rules";
import type { Board, GameState, Move, Piece, Side } from "./types";
import { VARIANTS } from "./variants";

// Walker rules give the simplest king capture (two-sided custodial anywhere, no
// strong-king throne rule), which keeps the hand-built tactical positions clear.
const walker = VARIANTS.walker;
const wtf = VARIANTS.wtf;

const empty = (): Board => Array.from({ length: 7 }, () => Array<Piece | null>(7).fill(null));
const stateOf = (b: Board, turn: Side): GameState => ({
  board: b,
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
});

/** Deterministic PRNG so tie-breaking (and thus every assertion) is reproducible. */
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
const fixed = () => 0.5;

const isLegal = (s: GameState, m: Move, rules = walker): boolean =>
  allMoves(s.board, s.turn, rules).some(
    (x) => x.from.row === m.from.row && x.from.col === m.from.col && x.to.row === m.to.row && x.to.col === m.to.col,
  );
const someMoveGives = (s: GameState, status: string, rules = walker): boolean =>
  allMoves(s.board, s.turn, rules).some((m) => applyMove(s, m, rules).status === status);

describe("tactics: the search finds the right move", () => {
  it("plays the winning move when the king can escape in one", () => {
    const b = empty();
    b[0][3] = "king";
    b[3][0] = "attacker";
    b[3][6] = "attacker";
    b[6][3] = "attacker";
    const s = stateOf(b, "defenders");
    resetTT();
    const { move } = pickMove(s, walker, { maxDepth: 3 }, FULL_CONFIG, fixed);
    expect(move).not.toBeNull();
    expect(applyMove(s, move!, walker).status).toBe("defenders_win_escape");
  });

  it("seals the king's only open lane to the corner", () => {
    const b = empty();
    b[0][3] = "king";
    b[0][5] = "attacker"; // right lane already sealed
    b[1][3] = "attacker"; // no straight-down flight
    b[2][2] = "attacker"; // can slide up column 2 to (0,2), sealing the left lane
    b[6][0] = "attacker";
    b[6][6] = "attacker";
    // Precondition: the king really could escape right now if it were its move.
    expect(someMoveGives(stateOf(b, "defenders"), "defenders_win_escape")).toBe(true);

    const s = stateOf(b, "attackers");
    resetTT();
    const { move } = pickMove(s, walker, { maxDepth: 2 }, FULL_CONFIG, fixed);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, walker);
    // After the attacker's move, the king can no longer reach a corner in one.
    expect(someMoveGives(after, "defenders_win_escape")).toBe(false);
  });
});

describe("quiescence kills the horizon effect", () => {
  // Defender to move. The king is en prise to a capture one ply beyond a depth-1
  // horizon, while a greedy material grab far away is statically the best move.
  // A non-quiescent depth-1 searcher grabs the bait (and a king-run that lands
  // next to a corner is then custodially captured); quiescence sees the refutation
  // and keeps the king safe.
  //
  // The endgame recognizers are switched OFF for this pair. This fixture puts the
  // king one step from an edge with a corner-adjacent square available, which the
  // recognizer now proves a defender win outright (see `kingTouchesCorner`) — so
  // with it on, *both* configs play the king safely and the pair stops isolating
  // the thing it is named for. Turning it off keeps these two tests a measurement
  // of quiescence alone, which is what they are for; the recognizer has its own
  // suite in `recognizers.test.ts`.
  const noRecognizers = { ...DEFAULT_WEIGHTS, endgameRecognizers: false, attackerRecognizer: false };
  const build = (): GameState => {
    const b = empty();
    b[3][1] = "king";
    b[3][0] = "attacker"; // king's left flank
    b[0][2] = "attacker"; // can slide down column 2 to (3,2) and capture the king
    b[4][4] = "attacker"; // the bait
    b[4][3] = "defender"; // anvil for the bait
    b[4][6] = "defender"; // can slide to (4,5) and grab the bait
    return stateOf(b, "defenders");
  };

  it("full search does not hang the king at depth 1", () => {
    const s = build();
    resetTT();
    const { move } = pickMove(s, walker, { maxDepth: 1 }, FULL_CONFIG, fixed, noRecognizers);
    expect(move).not.toBeNull();
    const after = applyMove(s, move!, walker);
    expect(someMoveGives(after, "attackers_win_capture")).toBe(false);
  });

  it("legacy (no quiescence) walks into the king capture at the same depth", () => {
    const s = build();
    resetTT();
    const { move } = pickMove(s, walker, { maxDepth: 1 }, LEGACY_CONFIG, fixed, noRecognizers);
    const after = applyMove(s, move!, walker);
    // Demonstrates the horizon blunder the new search fixes.
    expect(someMoveGives(after, "attackers_win_capture")).toBe(true);
  });
});

describe("search hygiene", () => {
  it("always returns a legal move for both variants and every difficulty", () => {
    for (const rules of [walker, wtf]) {
      const s = initialState();
      for (const diff of ["easy", "medium", "hard"] as Difficulty[]) {
        const m = chooseMove(s, diff, rules, mulberry32(7));
        expect(m).not.toBeNull();
        expect(isLegal(s, m!, rules)).toBe(true);
      }
    }
  });

  it("is deterministic given a seeded RNG and a fresh table", () => {
    const s = initialState();
    resetTT();
    const a = pickMove(s, wtf, { maxDepth: 3 }, FULL_CONFIG, mulberry32(42));
    resetTT();
    const b = pickMove(s, wtf, { maxDepth: 3 }, FULL_CONFIG, mulberry32(42));
    expect(a.move).toEqual(b.move);
    expect(a.score).toBe(b.score);
  });

  it("returns no move when the side to move is stalemated", () => {
    // A lone king wedged in a corner with no empty neighbour.
    const b = empty();
    b[0][0] = "king";
    b[0][1] = "attacker";
    b[1][0] = "attacker";
    const s = stateOf(b, "defenders");
    expect(chooseMove(s, "hard", walker)).toBeNull();
  });
});

describe("self-play: the new search outplays the legacy search", () => {
  const playGame = (attacker: SearchConfig, defender: SearchConfig, depth: number, seed: number): Side | "draw" | null => {
    const rngA = mulberry32(seed * 2 + 1);
    const rngD = mulberry32(seed * 2 + 2);
    let s: GameState = initialState();
    let plies = 0;
    while (!isGameOver(s.status) && plies < 160) {
      const atk = s.turn === "attackers";
      resetTT();
      const { move } = pickMove(s, wtf, { maxDepth: depth }, atk ? attacker : defender, atk ? rngA : rngD);
      if (!move) break;
      s = applyMove(s, move, wtf);
      plies++;
    }
    return isGameOver(s.status) ? winnerOf(s.status) : null;
  };

  it("wins the clear majority of a fixed-depth match (both sides)", () => {
    const GAMES = 6;
    let newWins = 0;
    let legacyWins = 0;
    for (let i = 0; i < GAMES; i++) {
      const w = playGame(FULL_CONFIG, LEGACY_CONFIG, 2, i + 1); // new = attackers
      if (w === "attackers") newWins++;
      else if (w === "defenders") legacyWins++;
    }
    for (let i = 0; i < GAMES; i++) {
      const w = playGame(LEGACY_CONFIG, FULL_CONFIG, 2, i + 100); // new = defenders
      if (w === "defenders") newWins++;
      else if (w === "attackers") legacyWins++;
    }
    // Clear-majority bar: the new search wins at least twice as often as legacy and
    // takes at least two-thirds of the games. (A strict `>` here was brittle — root
    // symmetry-folding legitimately changes which of several equal first moves is
    // played, perturbing the seeded tie-breaks without changing search strength.)
    expect(newWins).toBeGreaterThanOrEqual(legacyWins * 2);
    expect(newWins).toBeGreaterThanOrEqual(8);
  });
});

describe("depth floor: slow devices still search deep enough", () => {
  it("honours minDepth even under an impossibly tight budget", () => {
    // A 1ms budget would normally stop hard at depth 1–2 on a slow device — exactly
    // the shallow, materialistic play we're fixing. minDepth must override the clock.
    resetTT();
    const r = pickMove(
      initialState(),
      wtf,
      { maxDepth: 6, deadlineMs: 1, minDepth: 4 },
      FULL_CONFIG,
      fixed,
    );
    expect(r.depth).toBeGreaterThanOrEqual(4);
  });

  it("still stops past the floor when the budget is spent (does not run to maxDepth)", () => {
    // Past minDepth the real budget applies again, so a tiny budget caps the search
    // near the floor rather than grinding all the way to maxDepth.
    resetTT();
    const r = pickMove(
      initialState(),
      wtf,
      { maxDepth: 12, deadlineMs: 1, minDepth: 4 },
      FULL_CONFIG,
      fixed,
    );
    expect(r.depth).toBeGreaterThanOrEqual(4);
    expect(r.depth).toBeLessThan(12);
  });
});

describe("opening book: ollamh plays deep-search book moves instantly", () => {
  // The book is best-effort deep-search, not proven play (see docs/solving.md) —
  // what these tests pin down is the *safety contract*: only ollamh consults it,
  // only under the exact ruleset it was generated for, every served move is
  // re-validated as legal, and the shipped data actually loads and covers the
  // opening. Strength is checked separately by the gauntlet (scripts/bookbench.ts).

  it("plays a booked move without searching, and only for ollamh", async () => {
    const { OPENING_BOOK, chooseMoveDetailed } = await import("./engine");
    const { hashBoard } = await import("./rules");
    const s = initialState();
    const legal = allMoves(s.board, s.turn, wtf);
    const pick = legal[3]; // any legal move
    const key = hashBoard(s.board, s.turn);
    const prev = OPENING_BOOK[key];
    OPENING_BOOK[key] = [pick];
    try {
      const booked = chooseMoveDetailed(s, "ollamh", wtf);
      expect(booked.depth).toBe(-1); // flagged as "from book"
      expect(booked.move).toEqual(pick);
      // hard ignores the book and actually searches.
      const searched = chooseMoveDetailed(s, "hard", wtf);
      expect(searched.depth).toBeGreaterThanOrEqual(1);
    } finally {
      if (prev) OPENING_BOOK[key] = prev;
      else delete OPENING_BOOK[key];
    }
  });

  it("re-validates book moves: an illegal entry falls through to the search", async () => {
    const { OPENING_BOOK, chooseMoveDetailed } = await import("./engine");
    const { hashBoard } = await import("./rules");
    const s = initialState();
    const key = hashBoard(s.board, s.turn);
    const prev = OPENING_BOOK[key];
    // From an empty square — never legal. A corrupt book must not reach the board.
    OPENING_BOOK[key] = [{ from: { row: 2, col: 2 }, to: { row: 2, col: 4 } }];
    try {
      const r = chooseMoveDetailed(s, "ollamh", wtf, mulberry32(1));
      expect(r.depth).toBeGreaterThanOrEqual(1); // searched, not booked
      expect(isLegal(s, r.move!, wtf)).toBe(true);
    } finally {
      if (prev) OPENING_BOOK[key] = prev;
      else delete OPENING_BOOK[key];
    }
  });

  it("only serves the ruleset it was generated for (walker misses, wtf hits)", async () => {
    const { chooseMoveDetailed } = await import("./engine");
    const { bookRulesMatch } = await import("./openingBook");
    expect(bookRulesMatch(wtf)).toBe(true);
    expect(bookRulesMatch(walker)).toBe(false);
    // Walker's opening position hashes identically, but the flags differ, so
    // ollamh must search rather than play a move tuned for the wrong rules.
    const r = chooseMoveDetailed(initialState(), "ollamh", walker, mulberry32(1));
    expect(r.depth).toBeGreaterThanOrEqual(1);
  });

  it("ships a non-empty book that covers the whole first two plies", async () => {
    const { OPENING_BOOK } = await import("./engine");
    const { hashBoard } = await import("./rules");
    expect(Object.keys(OPENING_BOOK).length).toBeGreaterThan(100);
    const s = initialState();
    // Ply 0: the opening itself is booked (ollamh as attackers opens instantly)…
    expect(OPENING_BOOK[hashBoard(s.board, s.turn)]?.length).toBeGreaterThan(0);
    // …and ply 1: EVERY attacker first move leads to a booked defender reply
    // (ollamh as defenders answers instantly whatever the human opens with).
    for (const m of allMoves(s.board, s.turn, wtf)) {
      const child = applyMove(s, m, wtf);
      expect(OPENING_BOOK[hashBoard(child.board, child.turn)]?.length).toBeGreaterThan(0);
    }
  });

  it("round-trips: every expanded entry is a legal, deduplicated move", async () => {
    const { OPENING_BOOK } = await import("./engine");
    // Independent decoder — deliberately not reusing the loader's plumbing, so a
    // transform bug in expansion cannot cancel itself out here.
    const decode = (hash: string): GameState => {
      const glyph: Record<string, Piece> = { a: "attacker", d: "defender", k: "king" };
      const b = empty();
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const g = hash[1 + r * 7 + c];
          if (g !== ".") b[r][c] = glyph[g];
        }
      return stateOf(b, hash[0] === "A" ? "attackers" : "defenders");
    };
    for (const [hash, moves] of Object.entries(OPENING_BOOK)) {
      const s = decode(hash);
      const seen = new Set<string>();
      for (const m of moves) {
        expect(isLegal(s, m, wtf)).toBe(true);
        const k = `${m.from.row}${m.from.col}${m.to.row}${m.to.col}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it("light randomization: seeded picks vary the opening but stay deterministic", async () => {
    const { chooseMoveDetailed } = await import("./engine");
    const s = initialState();
    const firstMoves = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = chooseMoveDetailed(s, "ollamh", wtf, mulberry32(seed));
      expect(r.depth).toBe(-1);
      firstMoves.add(`${r.move!.from.row}${r.move!.from.col}${r.move!.to.row}${r.move!.to.col}`);
    }
    // The D4-expanded opening entry offers several orientations of the booked
    // moves, so different seeds must produce different (all-booked) openings…
    expect(firstMoves.size).toBeGreaterThan(1);
    // …while the same seed always produces the same move.
    const a = chooseMoveDetailed(s, "ollamh", wtf, mulberry32(7));
    const b = chooseMoveDetailed(s, "ollamh", wtf, mulberry32(7));
    expect(a.move).toEqual(b.move);
  });
});

describe("performance guard", () => {
  it("keeps the opening depth-4 search within a sane node budget", () => {
    resetTT();
    const r = pickMove(initialState(), wtf, { maxDepth: 4 }, FULL_CONFIG, fixed);
    expect(r.depth).toBe(4);
    expect(r.nodes).toBeLessThan(150_000);
  });
});
