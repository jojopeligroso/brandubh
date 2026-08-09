import { describe, expect, it } from "vitest";
import { allMoves, applyMove, isGameOver, winnerOf } from "./rules";
import { mv, parseRows, sq } from "./tutorials";
import { VARIANTS, type RuleSet } from "./variants";
import type { GameState, Move, Side } from "./types";
import {
  computeTags,
  givesUpSoldier,
  GUILLOTINE_CYCLES,
  isCornerFight,
  isGuillotine,
  MOTIFS,
  MOTIF_PRIORITY,
  MOTIF_SET_THRESHOLD,
  namedSets,
  plies,
  primaryMotif,
  recogniseMotifs,
  type Motif,
} from "./motifs";

const wtf = VARIANTS.wtf;

/** A hand-built board, in the `tutorials.ts` idiom: `rows[0]` is rank 7. */
const stateOf = (rows: string[], turn: Side): GameState => ({
  board: parseRows(rows),
  turn,
  status: "playing",
  moveCount: 0,
  history: [],
  captured: { attackers: 0, defenders: 0 },
});

/** Play a hand-written sequence with the real engine and keep every state, which
 *  is what both recognisers read. Captures come from `applyMove`, never from the
 *  move literals, so a test cannot assert a capture the rules do not make. */
function playOut(start: GameState, moves: Move[], rules: RuleSet = wtf): GameState[] {
  const states = [start];
  let s = start;
  for (const m of moves) {
    s = applyMove(s, m, rules);
    states.push(s);
  }
  return states;
}

/**
 * Independent oracle, the same one `recognizers.test.ts` validates the endgame
 * recognisers with: can the side to move force a *defender* win within `plies`?
 * A plain AND-OR minimax on the raw rules, sharing no code with `motifs.ts`.
 */
function forcedDefenderWinWithin(state: GameState, rules: RuleSet, depth: number): boolean {
  if (isGameOver(state.status)) return winnerOf(state.status) === "defenders";
  if (depth === 0) return false;
  const moves = allMoves(state.board, state.turn, rules);
  if (!moves.length) return false;
  if (state.turn === "defenders")
    return moves.some((m) => forcedDefenderWinWithin(applyMove(state, m, rules), rules, depth - 1));
  return moves.every((m) => forcedDefenderWinWithin(applyMove(state, m, rules), rules, depth - 1));
}

// ── The shuttle, built by hand ────────────────────────────────────────────────
//
// Rank 1 is the lane. The King alternates between c1 and e1; each arrival crushes
// a raider against the corner behind it (b1 against a1, f1 against g1), and the
// raiders feed a fresh blocker in between executions because the alternative is
// letting him walk into the open corner. This is the shape no player can spot
// from the starting diagram, which is why it is built here rather than looked for.
const SHUTTLE_ROWS = [
  ".......",
  ".......",
  ".......",
  ".......",
  ".a...a.",
  ".a...a.",
  ".a.k.a.",
];

const SHUTTLE_LINE = [
  mv("d1", "c1"), // King takes b1 against a1 — but b1 stood there all along
  mv("b2", "b1"), // the raiders feed the a1 lane
  mv("c1", "e1"), // King takes f1 against g1 — likewise an original blocker
  mv("f2", "f1"), // they feed the g1 lane
  mv("e1", "c1"), // execution 1: the blocker fed in above
  mv("b3", "b1"), // fed again
  mv("c1", "e1"), // execution 2: the blade has now fallen twice on fed-in raiders
];

const shuttle = (): GameState[] => playOut(stateOf(SHUTTLE_ROWS, "defenders"), SHUTTLE_LINE);

describe("motifs: the vocabulary is the attested one", () => {
  it("is exactly the glossary's Named tactics, and holds no aliases", () => {
    expect([...MOTIFS]).toEqual([
      "guillotine",
      "snapTrap",
      "clamp",
      "spring",
      "balling",
      "cordon",
      "cornerFight",
      "twinTowers",
    ]);
    // `shuttle` and `svikmølle` are recorded in GLOSSARY.md as aliases of the
    // Guillotine. The whole point of the alias note is that they never become a
    // second entry, so the suite says so.
    for (const alias of ["shuttle", "svikmolle", "svikmølle", "mill", "millarGambit"])
      expect(MOTIFS as readonly string[]).not.toContain(alias);
  });

  it("the priority order ranks every motif exactly once", () => {
    expect([...MOTIF_PRIORITY].sort()).toEqual([...MOTIFS].sort());
    // Guillotine first: it is the only proven motif, and the only one a person
    // could not have checked by eye.
    expect(MOTIF_PRIORITY[0]).toBe("guillotine");
  });
});

describe("motifs: Named sets are earned, not assumed", () => {
  const counts = (m: Motif, n: number): Map<Motif, number> => new Map([[m, n]]);

  it("a recogniser-found motif needs the threshold", () => {
    expect(namedSets(counts("cornerFight", MOTIF_SET_THRESHOLD - 1), new Set())).toEqual([]);
    expect(namedSets(counts("cornerFight", MOTIF_SET_THRESHOLD), new Set())).toEqual(["cornerFight"]);
  });

  it("a hand-assigned motif earns a row at any size", () => {
    expect(namedSets(counts("clamp", 1), new Set<Motif>(["clamp"]))).toEqual(["clamp"]);
  });

  it("a motif nothing carries never earns a row, hand-label or not", () => {
    expect(namedSets(new Map(), new Set<Motif>(["twinTowers"]))).toEqual([]);
  });

  it("rows come out in priority order", () => {
    const many = new Map<Motif, number>([
      ["cornerFight", 10],
      ["guillotine", 10],
    ]);
    expect(namedSets(many, new Set())).toEqual(["guillotine", "cornerFight"]);
  });
});

describe("isGuillotine: fires on the shape it is named for", () => {
  it("recognises the King shuttling on rank 1, executing fed-in blockers", () => {
    const states = shuttle();
    // The engine, not the test, decides what was captured.
    const captures = plies(states).flatMap((p) => p.captures);
    expect(captures).toHaveLength(4);
    expect(isGuillotine(states, wtf)).toBe(true);
  });

  it("one swing is not a Guillotine — it is a capture", () => {
    // Through ply 5 the blade has fallen only once on a fed-in raider.
    expect(isGuillotine(shuttle().slice(0, 6), wtf)).toBe(false);
    expect(GUILLOTINE_CYCLES).toBe(2);
  });

  it("cross-check: where it fires, the King's side really is winning", () => {
    // The independent AND-OR oracle — no shared code with the recogniser — must
    // agree that the position the recognised run ends in is a forced defender
    // win. A recogniser that fired on a losing sequence would be labelling
    // puzzles with a tactic that does not work.
    const end = shuttle()[7];
    expect(forcedDefenderWinWithin(end, wtf, 4)).toBe(true);
  });
});

describe("isGuillotine: does not fire on what it is not", () => {
  it("nothing to look at: an empty or one-state proof", () => {
    expect(isGuillotine([], wtf)).toBe(false);
    expect(isGuillotine([stateOf(SHUTTLE_ROWS, "defenders")], wtf)).toBe(false);
  });

  it("a lane with no corner at the end of it is not an escape lane", () => {
    // The same shuttle, moved one rank in so the anvils are defenders on the
    // edge rather than the corners themselves.
    const rows = [
      ".......",
      ".......",
      ".......",
      ".......",
      ".a...a.",
      "da.k.ad",
      ".a...a.",
    ];
    const states = playOut(stateOf(rows, "defenders"), [
      mv("d2", "c2"),
      mv("b3", "b2"),
      mv("c2", "e2"),
      mv("f3", "f2"),
      mv("e2", "c2"),
      mv("b1", "b2"),
      mv("c2", "e2"),
    ]);
    // The captures happen; only the geometry is wrong.
    expect(plies(states).flatMap((p) => p.captures).length).toBeGreaterThan(0);
    expect(isGuillotine(states, wtf)).toBe(false);
  });

  it("blockers that stood there all along were never fed in", () => {
    // Two executions, both of raiders present from the first diagram: the
    // raiders were never forced to spend anything, so this is a mopping-up
    // sequence and not a Guillotine.
    const rows = [
      "...a...",
      ".......",
      ".......",
      ".......",
      ".......",
      ".......",
      ".a.k.a.",
    ];
    const states = playOut(stateOf(rows, "defenders"), [
      mv("d1", "c1"), // takes b1 against a1
      mv("d7", "d6"), // the raiders spend nothing; they had nothing to spend
      mv("c1", "e1"), // takes f1 against g1
    ]);
    expect(plies(states).flatMap((p) => p.captures)).toHaveLength(2);
    expect(isGuillotine(states, wtf)).toBe(false);
  });

  it("the raiders' own pieces cannot work a King's-side motif", () => {
    // Same lane, same anvils, but it is an attacker doing the shuttling and
    // defenders being crushed against the corners.
    const rows = [
      ".......",
      ".......",
      "...k...",
      ".......",
      ".d...d.",
      ".d...d.",
      ".d.a.d.",
    ];
    const states = playOut(stateOf(rows, "attackers"), [
      mv("d1", "c1"),
      mv("b2", "b1"),
      mv("c1", "e1"),
      mv("f2", "f1"),
      mv("e1", "c1"),
      mv("b3", "b1"),
      mv("c1", "e1"),
    ]);
    expect(plies(states).flatMap((p) => p.captures).length).toBeGreaterThan(0);
    expect(isGuillotine(states, wtf)).toBe(false);
  });

  it("without hostile corners there is no anvil and no motif", () => {
    const noCorners: RuleSet = { ...wtf, cornersHostile: false };
    // Not re-played under the altered rules: the point is that the predicate
    // refuses to call a corner an anvil when the ruleset does not.
    expect(isGuillotine(shuttle(), noCorners)).toBe(false);
  });
});

// ── Corner fight ──────────────────────────────────────────────────────────────

describe("isCornerFight: one corner, doing both its jobs", () => {
  it("fires when a capture uses the corner the King is playing for", () => {
    const rows = [".......", ".......", ".......", ".......", ".......", ".......", ".a.k..."];
    const states = playOut(stateOf(rows, "defenders"), [mv("d1", "c1")]);
    expect(isCornerFight(states, wtf)).toBe(true);
  });

  it("does not fire on a line with no captures — a fight needs a fight", () => {
    const rows = [".......", ".......", ".......", ".......", ".......", ".......", "...k..."];
    const states = playOut(stateOf(rows, "defenders"), [mv("d1", "d2")]);
    expect(isCornerFight(states, wtf)).toBe(false);
  });

  it("does not fire when the captures are spread over two corners", () => {
    // The opening three plies of the shuttle take a raider at each end of the
    // rank, so no single quadrant holds them all.
    expect(isCornerFight(shuttle().slice(0, 4), wtf)).toBe(false);
  });

  it("does not fire when the corner is only an anvil and not a goal", () => {
    // A textbook execution against a1 — but the King is up on rank 7 playing for
    // g7, so a1 is an anvil and nothing else. One corner has to do both jobs.
    const rows = ["....k..", ".......", ".......", ".......", ".......", ".......", ".a.d..."];
    const states = playOut(stateOf(rows, "defenders"), [mv("d1", "c1")]);
    expect(plies(states)[0].captures).toEqual([sq("b1")]);
    expect(isCornerFight(states, wtf)).toBe(false);
  });

  it("does not fire when the capture does not use the corner as its anvil", () => {
    // Raider on b2 crushed between two defenders — inside a1's quadrant, next to
    // the corner's own file, but the corner takes no part in it.
    const rows = [".......", ".......", ".......", ".......", ".d.....", ".a.....", "..k...."];
    const states = playOut(stateOf(rows, "defenders"), [mv("c1", "b1")]);
    expect(isCornerFight(states, wtf)).toBe(false);
  });
});

// ── Tags ──────────────────────────────────────────────────────────────────────

describe("tags: computed, cheap, board-only", () => {
  const quiet = (): GameState[] =>
    playOut(stateOf([".......", ".......", ".......", ".......", ".......", ".......", "...k..."], "defenders"), [
      mv("d1", "d2"),
    ]);

  it("records the side to move and the line length", () => {
    expect(computeTags({ side: "defenders", states: quiet(), motifs: [], primary: null })).toEqual([
      "defenders",
      "moves1",
    ]);
  });

  it("counts a line by its solver moves, not its plies", () => {
    const states = shuttle(); // 7 plies = 4 solver moves
    const tags = computeTags({ side: "defenders", states, motifs: [], primary: null });
    expect(tags).toContain("moves4");
  });

  it("notices a soldier given up to the scripted reply", () => {
    // The defender steps to b3, where the raider dropping to b4 crushes it
    // against the raider already on b2.
    const rows = [".a.....", ".......", ".....k.", ".......", "...d...", ".a.....", "......."];
    const states = playOut(stateOf(rows, "defenders"), [mv("d3", "b3"), mv("b7", "b4")]);
    expect(plies(states)[1].captures).toHaveLength(1);
    expect(givesUpSoldier(states)).toBe(true);
    expect(computeTags({ side: "defenders", states, motifs: [], primary: null })).toContain(
      "soldierGivenUp",
    );
  });

  it("does not count the King as a soldier given up", () => {
    expect(givesUpSoldier(quiet())).toBe(false);
  });

  it("carries every motif that is not the primary one", () => {
    const tags = computeTags({
      side: "attackers",
      states: quiet(),
      motifs: ["guillotine", "cornerFight"],
      primary: "guillotine",
    });
    expect(tags).toContain("cornerFight");
    expect(tags).not.toContain("guillotine");
  });
});

describe("primary motif: a fixed, reproducible choice", () => {
  it("picks by priority, not by the order they were found", () => {
    expect(primaryMotif(["cornerFight", "guillotine"])).toBe("guillotine");
    expect(primaryMotif(["cornerFight"])).toBe("cornerFight");
  });

  it("is null for the Pool, which is where most puzzles live", () => {
    expect(primaryMotif([])).toBeNull();
  });

  it("an evaluation has no proof, so it can never carry a Guillotine", () => {
    const states = shuttle();
    expect(recogniseMotifs({ states, proof: null }, wtf)).not.toContain("guillotine");
    expect(recogniseMotifs({ states, proof: states }, wtf)).toContain("guillotine");
  });
});

describe("motifs: the sequence readers agree with the engine", () => {
  it("plies() reads the moves, sides and captures the engine recorded", () => {
    const states = shuttle();
    const read = plies(states);
    expect(read).toHaveLength(SHUTTLE_LINE.length);
    expect(read.map((p) => p.side)).toEqual([
      "defenders",
      "attackers",
      "defenders",
      "attackers",
      "defenders",
      "attackers",
      "defenders",
    ]);
    expect(read[0].move.to).toEqual(sq("c1"));
    expect(read[0].captures).toEqual([sq("b1")]);
  });
});
