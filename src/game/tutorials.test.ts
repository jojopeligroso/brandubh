import { describe, expect, it } from "vitest";
import { allMoves, applyMove, isCorner, isThrone, movesFrom, sideOf } from "./engine";
import type { GameState, Move } from "./types";
import {
  TUTORIALS,
  isAcceptedMove,
  mv,
  parseTutorialProgress,
  rulesForScenario,
  sameMove,
  sq,
  stateFor,
} from "./tutorials";

const isLegal = (s: GameState, m: Move, sc: (typeof TUTORIALS)[number]): boolean =>
  sideOf(s.board[m.from.row][m.from.col]) === s.turn &&
  movesFrom(s.board, m.from.row, m.from.col, rulesForScenario(sc)).some(
    (to) => to.row === m.to.row && to.col === m.to.col,
  );

/** Play the scenario's intended line: first solution of each step + scripted replies. */
function playLine(sc: (typeof TUTORIALS)[number]): GameState {
  const rules = rulesForScenario(sc);
  let s = stateFor(sc);
  sc.steps.forEach((step, i) => {
    const move = step.solution?.[0] ?? canonicalPredicateMove(sc, s);
    expect(isLegal(s, move, sc), `${sc.id} step ${i} solution is legal`).toBe(true);
    expect(isAcceptedMove(sc, i, s, move, rules), `${sc.id} step ${i} solution accepted`).toBe(
      true,
    );
    s = applyMove(s, move, rules);
    if (step.reply) {
      expect(isLegal(s, step.reply, sc), `${sc.id} step ${i} reply is legal`).toBe(true);
      s = applyMove(s, step.reply, rules);
    }
  });
  return s;
}

/** The known answer for predicate-only steps (currently just bar-the-door). */
function canonicalPredicateMove(sc: (typeof TUTORIALS)[number], _s: GameState): Move {
  if (sc.id === "bar-the-door") return mv("f4", "f7");
  throw new Error(`no canonical move for ${sc.id}`);
}

describe("tutorial scenarios", () => {
  it("has twelve scenarios with unique ids", () => {
    expect(TUTORIALS.length).toBe(12);
    expect(new Set(TUTORIALS.map((s) => s.id)).size).toBe(12);
  });

  for (const sc of TUTORIALS) {
    describe(sc.id, () => {
      const rules = rulesForScenario(sc);

      it("has a well-formed board", () => {
        expect(rules).toBeDefined();
        expect(sc.rows.length).toBe(7);
        for (const row of sc.rows) expect(row).toMatch(/^[.adk]{7}$/);
        const s = stateFor(sc);
        let kings = 0;
        let attackers = 0;
        let defenders = 0;
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            const p = s.board[r][c];
            if (p === "king") kings++;
            if (p === "attacker") attackers++;
            if (p === "defender") defenders++;
            // Restricted squares start empty: a king already in a corner has
            // escaped, and soldiers can never legally stand on throne/corner.
            if (p && isCorner(r, c)) throw new Error(`piece on corner at ${r},${c}`);
            if (p && p !== "king" && isThrone(r, c))
              throw new Error(`soldier on throne at ${r},${c}`);
          }
        }
        expect(kings).toBe(1);
        expect(attackers).toBeLessThanOrEqual(8);
        expect(defenders).toBeLessThanOrEqual(4);
        expect(s.turn).toBe(sc.side);
      });

      it("its solution line reaches the goal", () => {
        const end = playLine(sc);
        expect(sc.goal(end), `${sc.id} goal holds after the line`).toBe(true);
      });

      it("rejects its foil moves", () => {
        const s = stateFor(sc);
        for (const foil of sc.foils ?? []) {
          expect(isLegal(s, foil, sc), `${sc.id} foil is at least legal`).toBe(true);
          expect(isAcceptedMove(sc, 0, s, foil, rules), `${sc.id} foil rejected`).toBe(false);
        }
      });
    });
  }
});

describe("scenario-specific outcomes", () => {
  const byId = Object.fromEntries(TUTORIALS.map((s) => [s.id, s]));

  it("capture drills end with the game still live", () => {
    for (const id of ["pincer", "corner-anvil", "throne-anvil", "double-take", "kings-blade"]) {
      expect(playLine(byId[id]).status).toBe("playing");
    }
  });

  it("escape drills end in defenders_win_escape", () => {
    expect(playLine(byId["road-to-corner"]).status).toBe("defenders_win_escape");
    expect(playLine(byId["royal-fork"]).status).toBe("defenders_win_escape");
  });

  it("king-capture drills end in attackers_win_capture", () => {
    for (const id of ["take-the-king", "wall-of-four", "fourth-wall"]) {
      expect(playLine(byId[id]).status).toBe("attackers_win_capture");
    }
  });

  it("close-the-ring ends in attackers_win_encirclement", () => {
    expect(playLine(byId["close-the-ring"]).status).toBe("attackers_win_encirclement");
  });

  it("double-take captures exactly two raiders in one move", () => {
    const end = playLine(byId["double-take"]);
    expect(end.captured.attackers).toBe(2);
    expect(end.history[0].move.captures?.length).toBe(2);
  });

  it("bar-the-door: the king threatens escape until the door is shut", () => {
    const sc = byId["bar-the-door"];
    const rules = rulesForScenario(sc);
    const start = stateFor(sc);
    // Before the raiders move, the king can escape via g7.
    const kingRun = mv("e7", "g7");
    const afterPass = applyMove(start, mv("f4", "e4"), rules); // an idle raider move
    expect(applyMove(afterPass, kingRun, rules).status).toBe("defenders_win_escape");
    // f4–f7 is the (only) accepted answer among plausible candidates.
    expect(isAcceptedMove(sc, 0, start, mv("f4", "f7"), rules)).toBe(true);
    for (const m of allMoves(start.board, "attackers", rules)) {
      if (isAcceptedMove(sc, 0, start, m, rules)) {
        expect(sameMove(m, mv("f4", "f7"))).toBe(true);
      }
    }
  });

  it("royal-fork: after the fork, no single raider reply saves the game", () => {
    const sc = byId["royal-fork"];
    const rules = rulesForScenario(sc);
    const afterFork = applyMove(stateFor(sc), mv("d6", "d7"), rules);
    for (const reply of allMoves(afterFork.board, "attackers", rules)) {
      const s = applyMove(afterFork, reply, rules);
      // The raiders never take the king outright on their reply...
      expect(s.status).not.toBe("attackers_win_capture");
      // ...and the king still escapes in one move whatever they play.
      const escapes = allMoves(s.board, "defenders", rules).some(
        (m) => applyMove(s, m, rules).status === "defenders_win_escape",
      );
      expect(escapes, `king escapes after ${JSON.stringify(reply)}`).toBe(true);
    }
  });
});

describe("helpers", () => {
  it("sq parses algebraic squares", () => {
    expect(sq("a7")).toEqual({ row: 0, col: 0 });
    expect(sq("g7")).toEqual({ row: 0, col: 6 });
    expect(sq("a1")).toEqual({ row: 6, col: 0 });
    expect(sq("d4")).toEqual({ row: 3, col: 3 });
  });

  it("parses tutorial progress defensively", () => {
    expect(parseTutorialProgress(null).size).toBe(0);
    expect(parseTutorialProgress("not json").size).toBe(0);
    expect(parseTutorialProgress('{"a":1}').size).toBe(0);
    expect([...parseTutorialProgress('["pincer","nope",3]')]).toEqual(["pincer"]);
  });
});
