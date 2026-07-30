import { describe, expect, it } from "vitest";
import { allMoves, applyMove, isCorner, isThrone, movesFrom, sideOf, winnerOf } from "./engine";
import { isGameOver } from "./engine";
import type { RuleSet } from "./variants";
import type { GameState, Move, Side } from "./types";
import {
  TUTORIALS,
  explainMistake,
  isAcceptedMove,
  mv,
  parseTutorialProgress,
  rulesForScenario,
  sameMove,
  sq,
  stateFor,
  type TutorialMistake,
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

      // The bug this guards: a drill listing one answer while the position
      // offers two. The learner finds the unlisted one, is told "not that
      // one", and learns the wrong lesson. Every move that reaches the goal
      // must be accepted — if a position offers an unsound second route, fix
      // the position, don't teach the losing move.
      it("accepts every move that reaches its goal", () => {
        const deciding = sc.steps.length - 1;
        const s = stateBeforeStep(sc, deciding);
        const solving = allMoves(s.board, sc.side, rules).filter((m) =>
          sc.goal(applyMove(s, m, rules)),
        );
        expect(solving.length, `${sc.id} has at least one move reaching the goal`).toBeGreaterThan(
          0,
        );
        for (const m of solving) {
          expect(
            isAcceptedMove(sc, deciding, s, m, rules),
            `${sc.id}: ${describe_(m)} reaches the goal but is refused`,
          ).toBe(true);
        }
      });

      it("explains every refusal it can hand out", () => {
        const s = stateFor(sc);
        for (const m of allMoves(s.board, sc.side, rules)) {
          if (isAcceptedMove(sc, 0, s, m, rules)) continue;
          const why = explainMistake(sc, 0, s, m, rules);
          expect(MISTAKES, `${sc.id}: ${describe_(m)} → ${why}`).toContain(why);
        }
      });
    });
  }
});

const MISTAKES: TutorialMistake[] = [
  "roadOpen",
  "losesGame",
  "noCapture",
  "wrongCapture",
  "kingStands",
  "noEscape",
  "notForcing",
];

const squareName = (s: { row: number; col: number }): string =>
  String.fromCharCode(97 + s.col) + String(7 - s.row);
const describe_ = (m: Move): string => `${squareName(m.from)}–${squareName(m.to)}`;

/** The position the learner faces at `step`, having played the intended line so far. */
function stateBeforeStep(sc: (typeof TUTORIALS)[number], step: number): GameState {
  const rules = rulesForScenario(sc);
  let s = stateFor(sc);
  for (let i = 0; i < step; i++) {
    const move = sc.steps[i].solution?.[0] ?? canonicalPredicateMove(sc, s);
    s = applyMove(s, move, rules);
    const reply = sc.steps[i].reply;
    if (reply) s = applyMove(s, reply, rules);
  }
  return s;
}

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

// ── Soundness: the taught move must make sense in a real game ────────────────
// A capture drill is worthless if the opponent wins anyway ("no value in
// capturing a defender if the king is about to escape"), or if the learner is
// passing up an immediate win of their own. These checks prove neither is the
// case, with a 3-ply search over the real engine.

/** Can `side`, to move in `s`, force a win within two of their own moves —
 *  win at once, or make a move after which EVERY opposing reply leaves them a
 *  win-in-one? */
function forcedWinWithin2(s: GameState, side: Side, rules: RuleSet): boolean {
  const winsFor = (status: GameState["status"]): boolean => winnerOf(status) === side;
  const winInOne = (st: GameState): boolean =>
    allMoves(st.board, side, rules).some((m) => winsFor(applyMove(st, m, rules).status));
  for (const m1 of allMoves(s.board, side, rules)) {
    const s1 = applyMove(s, m1, rules);
    if (winsFor(s1.status)) return true;
    if (isGameOver(s1.status)) continue;
    const replies = allMoves(s1.board, s1.turn, rules);
    let forced = replies.length > 0;
    for (const r of replies) {
      const s2 = applyMove(s1, r, rules);
      if (isGameOver(s2.status)) {
        if (!winsFor(s2.status)) {
          forced = false;
          break;
        }
        continue;
      }
      if (!winInOne(s2)) {
        forced = false;
        break;
      }
    }
    if (forced) return true;
  }
  return false;
}

describe("capture drills are sound positions, not dressed-up blunders", () => {
  const byId = Object.fromEntries(TUTORIALS.map((s) => [s.id, s]));
  const opposite = (side: Side): Side => (side === "attackers" ? "defenders" : "attackers");

  // Drills whose solution leaves the game running: the opponent must have no
  // forced win within two moves afterwards — the capture/block genuinely helps.
  for (const id of ["pincer", "corner-anvil", "throne-anvil", "double-take", "kings-blade", "bar-the-door"]) {
    it(`${id}: the opponent has no forced win after the taught move`, () => {
      const sc = byId[id];
      const end = playLine(sc);
      expect(end.status).toBe("playing");
      expect(
        forcedWinWithin2(end, opposite(sc.side), rulesForScenario(sc)),
        `${id}: opponent forces a win within 2 — the taught move is futile`,
      ).toBe(false);
    });
  }

  // The learner must never be passing up a win of their own: if one existed,
  // that — not the taught capture — would be the lesson. Searched to the same
  // depth the opponent is searched to above; a shallower one-move-only check
  // let `double-take` ship a position the king won outright in two.
  for (const sc of TUTORIALS) {
    if (sc.id === "royal-fork") continue; // its step 1 deliberately sets up the win
    it(`${sc.id}: the taught move is not passing up a faster win`, () => {
      const rules = rulesForScenario(sc);
      const start = stateFor(sc);
      const solutionWins = sc.steps.length === 1 && isGameOver(playLine(sc).status);
      if (solutionWins) return; // the taught move IS the win
      expect(
        forcedWinWithin2(start, sc.side, rules),
        `${sc.id}: the learner can force a win within two moves and the drill ignores it`,
      ).toBe(false);
    });
  }
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
