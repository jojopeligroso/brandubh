// Where the databases meet the rest of the game.
//
// `db/` reimplements the board: the same 24 points, the same 16 mills, the same 16
// symmetries and the same moving-phase rules, in masks instead of objects, so that
// a retrograde sweep can visit 10⁸ positions without allocating. Duplication of the
// authority is a liability that has bitten this project before — ADR-0007 counts two
// bugs from constants that were right in the file they were copied from — so the
// duplication is held to the only standard that makes it safe: every piece of it is
// asserted equal to the thing it duplicates, here, in one file.
//
// If one of these fails, `rules.ts`, `symmetry.ts` and `variants.ts` are right and
// `db/` is wrong — and every shipped table has to be regenerated, because a table is
// only an answer about the game its generator was playing.

import { describe, expect, it } from "vitest";

import { ADJ as RULES_ADJ, MILLS as RULES_MILLS, POINTS as RULES_POINTS } from "../rules";
import { allMoves, applyMove, hasAnyMove, initialState, masksOf } from "../rules";
import { PERMS as RULES_PERMS, canonical as rulesCanonical } from "../symmetry";
import { VARIANTS } from "../variants";
import type { Board, Cell, GameState, Side } from "../types";
import { ADJ, MILLS, PERMS, POINTS } from "./geometry";
import { GASSER_DB_RULES, generateSuccessors, hasAnyStep, newSuccessorBuffer } from "./generate";
import { canonical, indexOf } from "./index";
import { makeProbe, masksOfBoard, probeMasks } from "./probe";

const RULES = VARIANTS["morris-gasser-1"];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A moving-phase `GameState` from two masks: `mover` belongs to `turn`. */
function stateOf(mover: number, opp: number, turn: Side): GameState {
  const board = new Array<Cell>(24).fill(0) as Cell[];
  const moverCell: Cell = turn === "white" ? 1 : 2;
  const oppCell: Cell = turn === "white" ? 2 : 1;
  for (let i = 0; i < 24; i++) {
    if (mover & (1 << i)) board[i] = moverCell;
    else if (opp & (1 << i)) board[i] = oppCell;
  }
  return {
    board: board as Board,
    turn,
    inHand: { white: 0, black: 0 },
    status: "playing",
    history: [],
    sinceMill: 0,
  };
}

/** Every successor of a state as `"moverMask:oppMask"` for the side that moves
 *  next, taken through the authority (`allMoves` + `applyMove`). */
function successorsViaRules(state: GameState): string[] {
  const nextSide: Side = state.turn === "white" ? "black" : "white";
  return allMoves(state, RULES).map((move) => {
    const next = applyMove(state, move, RULES);
    const masks = masksOf(next.board);
    const mover = nextSide === "white" ? masks.white : masks.black;
    const opp = nextSide === "white" ? masks.black : masks.white;
    return `${mover}:${opp}`;
  });
}

/** The same, through the bitmask generator. */
function successorsViaDb(mover: number, opp: number): string[] {
  const buf = newSuccessorBuffer();
  generateSuccessors(mover, opp, GASSER_DB_RULES, buf);
  const out: string[] = [];
  for (let k = 0; k < buf.count; k++) out.push(`${buf.nextMover[k]}:${buf.nextOpp[k]}`);
  return out;
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe("db/geometry against rules.ts", () => {
  it("is the same 24 points, in the same order, with the same names", () => {
    expect(POINTS.map((p) => p.name)).toEqual(RULES_POINTS.map((p) => p.name));
    expect(POINTS.map((p) => [p.x, p.y])).toEqual(RULES_POINTS.map((p) => [p.x, p.y]));
  });

  it("is the same adjacency and the same 16 mills", () => {
    expect(ADJ.map((l) => [...l].sort((a, b) => a - b))).toEqual(
      RULES_ADJ.map((l) => [...l].sort((a, b) => a - b)),
    );
    const key = (m: readonly number[]): string => [...m].sort((a, b) => a - b).join(",");
    expect(new Set(MILLS.map(key))).toEqual(new Set(RULES_MILLS.map(key)));
  });

  it("is the same symmetry group, and agrees on the canonical form", () => {
    const key = (p: ArrayLike<number>): string => Array.from(p).join(",");
    expect(new Set(PERMS.map(key))).toEqual(new Set(RULES_PERMS.map(key)));
    const next = rng(7);
    for (let trial = 0; trial < 200; trial++) {
      let white = 0;
      let black = 0;
      for (let n = 0; n < 4; n++) white |= 1 << Math.floor(next() * 24);
      for (let n = 0; n < 4; n++) black |= 1 << Math.floor(next() * 24);
      black &= ~white;
      // `symmetry.ts` compares the white mask first; `db/index.ts` compares the
      // *mover's* first. Handed the same pair in the same order they must agree.
      const mine = canonical(white, black);
      const theirs = rulesCanonical(white, black);
      expect([mine.mover, mine.opp]).toEqual([theirs.white, theirs.black]);
    }
  });

  it("is generated under the flags the shipped preset plays under", () => {
    expect(GASSER_DB_RULES).toEqual({
      flying: RULES.flying,
      removeFromMillsWhenAllInMills: RULES.removeFromMillsWhenAllInMills,
      doubleMillRemoves: RULES.doubleMillRemoves,
    });
  });
});

describe("db/generate against rules.allMoves + applyMove", () => {
  it("produces the same successors for 2000 random moving-phase positions", () => {
    const next = rng(20260910);
    let checked = 0;
    let mills = 0;
    let flying = 0;
    const mismatches: string[] = [];
    while (checked < 2000) {
      const m = 3 + Math.floor(next() * 7);
      const o = 3 + Math.floor(next() * 7);
      const points = [...Array(24).keys()];
      for (let i = points.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
      let mover = 0;
      let opp = 0;
      for (let n = 0; n < m; n++) mover |= 1 << points[n];
      for (let n = m; n < m + o; n++) opp |= 1 << points[n];
      const turn: Side = next() < 0.5 ? "white" : "black";
      const state = stateOf(mover, opp, turn);
      const viaRules = sorted(successorsViaRules(state));
      const viaDb = sorted(successorsViaDb(mover, opp));
      if (viaRules.join("|") !== viaDb.join("|")) {
        if (mismatches.length < 3) {
          mismatches.push(
            `mover=0x${mover.toString(16)} opp=0x${opp.toString(16)} turn=${turn}: ` +
              `rules ${viaRules.length} vs db ${viaDb.length}`,
          );
        }
      }
      if (viaDb.length > m * 3) mills++;
      if (m === 3) flying++;
      // The blocked test must agree too, on every one of these positions.
      if (hasAnyStep(mover, opp, GASSER_DB_RULES) !== hasAnyMove(state, RULES)) {
        mismatches.push(`blocked disagreement at 0x${mover.toString(16)}/0x${opp.toString(16)}`);
      }
      checked++;
    }
    expect(mismatches).toEqual([]);
    expect(checked).toBe(2000);
    // The sample must actually contain the interesting cases, or it proves nothing.
    expect(flying).toBeGreaterThan(100);
    expect(mills).toBeGreaterThan(100);
  }, 60_000);

  it("produces the same successors along a played-out game", () => {
    // Random legal play from the opening, so the positions are *reachable* ones
    // rather than sprinkled stones: mills standing, stones clustered, hands empty
    // only in the second half.
    const next = rng(99);
    let state = initialState(RULES);
    const mismatches: string[] = [];
    let movingChecked = 0;
    for (let ply = 0; ply < 240 && state.status === "playing"; ply++) {
      if (state.inHand.white === 0 && state.inHand.black === 0) {
        const masks = masksOf(state.board);
        const mover = state.turn === "white" ? masks.white : masks.black;
        const opp = state.turn === "white" ? masks.black : masks.white;
        const viaRules = sorted(successorsViaRules(state));
        const viaDb = sorted(successorsViaDb(mover, opp));
        if (viaRules.join("|") !== viaDb.join("|")) {
          mismatches.push(`ply ${ply}: rules ${viaRules.length} vs db ${viaDb.length}`);
        }
        movingChecked++;
      }
      const moves = allMoves(state, RULES);
      if (moves.length === 0) break;
      state = applyMove(state, moves[Math.floor(next() * moves.length)], RULES);
    }
    expect(mismatches).toEqual([]);
    expect(movingChecked).toBeGreaterThan(20);
  }, 60_000);

  it("reads the same masks off a board as rules.masksOf", () => {
    const state = stateOf((1 << 0) | (1 << 9), (1 << 5) | (1 << 20), "black");
    expect(masksOfBoard(state)).toEqual(masksOf(state.board));
  });
});

describe("the probe's domain", () => {
  it("refuses the placing phase, a finished side, and an unloaded table", () => {
    const tables = new Map<string, Uint8Array>([["3-3", new Uint8Array(210_140)]]);
    const probe = makeProbe(tables);
    const opening = initialState(RULES);
    expect(probe(opening)).toBeNull(); // nine stones each still in hand
    const moving = stateOf((1 << 0) | (1 << 1) | (1 << 2), (1 << 8) | (1 << 9) | (1 << 10), "white");
    expect(probe(moving)).toEqual({ wdl: 0, depth: 0 }); // the all-zero table: draw
    const twoStones = stateOf((1 << 0) | (1 << 1), (1 << 8) | (1 << 9) | (1 << 10), "white");
    expect(probe(twoStones)).toBeNull();
    const fourStones = stateOf(
      (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3),
      (1 << 8) | (1 << 9) | (1 << 10),
      "white",
    );
    expect(probe(fourStones)).toBeNull(); // 4-3 not loaded
    expect(probeMasks(tables, 0, 0)).toBeNull();
  });

  it("can be told to distrust a win it cannot deliver before the no-mill draw", () => {
    const values = new Uint8Array(210_140);
    const mover = (1 << 0) | (1 << 1) | (1 << 2);
    const opp = (1 << 8) | (1 << 9) | (1 << 10);
    const state = stateOf(mover, opp, "white");
    const { white, black } = masksOfBoard(state);
    values[indexOf(white, black)] = (20 << 2) | 1; // a win for the mover in 20 plies
    const tables = new Map([["3-3", values]]);
    expect(makeProbe(tables)(state)).toEqual({ wdl: 1, depth: 20 });
    // With the shipped preset's 50-move draw in mind, a caller may ask for the
    // conservative reading instead. Off by default — see probe.ts's head comment.
    const strict = makeProbe(tables, { pessimisticNoMillPlies: 100 });
    expect(strict({ ...state, sinceMill: 95 })).toEqual({ wdl: 0, depth: 0 });
    expect(strict({ ...state, sinceMill: 10 })).toEqual({ wdl: 1, depth: 20 });
  });
});
