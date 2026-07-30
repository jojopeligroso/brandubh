// ── Tutorial set plays ────────────────────────────────────────────────────────
// Twelve small "find the move" positions covering the game's core motifs:
// custodial captures (with the corner and the empty throne as anvils), the
// king's escape and how to bar it, and the four ways an attacker ends the game.
//
// Each scenario is a hand-built board played with the real engine
// (movesFrom / applyMove), but its state lives only in the tutorial player —
// it is never persisted or exported, so the replay-from-initialState()
// invariant (see game/replay.ts) is untouched.

import { allMoves, applyMove, isGameOver, winnerOf } from "./engine";
import {
  BOARD_SIZE,
  type Board,
  type GameState,
  type Move,
  type Piece,
  type Side,
  type Square,
} from "./types";
import { VARIANTS, type RuleSet } from "./variants";

/**
 * One learner move; non-final steps carry the opponent's scripted riposte.
 *
 * `solution` must list EVERY move that solves the position, not just the one
 * the author had in mind — a drill that refuses an equally good answer teaches
 * the learner that they were wrong when they were not. `tutorials.test.ts`
 * enforces this: for the deciding step it enumerates the legal moves, and any
 * move satisfying `goal` that is missing from `solution` fails the suite.
 * Where several moves reach the goal but only some are actually sound, the
 * position is rebuilt so the answer is unique rather than the extras listed.
 */
export interface TutorialStep {
  /** Accepted move(s) — all of them. Omitted → any legal move satisfying the goal. */
  solution?: Move[];
  /** Scripted opponent reply, played after a correct non-final step. */
  reply?: Move;
}

/** Which family of "what you did wrong" copy a drill draws its refusals from. */
export type TutorialLesson = "capture" | "escape" | "block" | "regicide";

export interface TutorialScenario {
  id: string;
  /** The side the learner plays; it is also the side to move at every step. */
  side: Side;
  /** Rules the scenario is built for (all current scenarios use "wtf"). */
  rulesId: string;
  /** What the drill teaches — picks the wording for a refused move. */
  lesson: TutorialLesson;
  /** Board as 7 strings of 7 chars: "." empty, "a" raider, "d" defender, "k" king. */
  rows: string[];
  steps: TutorialStep[];
  /** Success test on the state after the final accepted move. */
  goal: (s: GameState) => boolean;
  /** Representative wrong moves — legal, but failing the scenario. For tests. */
  foils?: Move[];
}

export function rulesForScenario(sc: TutorialScenario): RuleSet {
  return VARIANTS[sc.rulesId];
}

/** "c6" → {row, col} (files a–g left to right, ranks 1–7 bottom to top). */
export function sq(name: string): Square {
  const col = name.charCodeAt(0) - "a".charCodeAt(0);
  const row = BOARD_SIZE - Number(name.slice(1));
  return { row, col };
}

export const mv = (from: string, to: string): Move => ({ from: sq(from), to: sq(to) });

export const sameMove = (a: Move, b: Move): boolean =>
  a.from.row === b.from.row &&
  a.from.col === b.from.col &&
  a.to.row === b.to.row &&
  a.to.col === b.to.col;

/** rows[0] is rank 7 (top of the board), matching the on-screen orientation. */
export function parseRows(rows: string[]): Board {
  const glyph: Record<string, Piece> = { a: "attacker", d: "defender", k: "king" };
  return rows.map((row) => [...row].map((ch) => glyph[ch] ?? null));
}

export function stateFor(sc: TutorialScenario): GameState {
  return {
    board: parseRows(sc.rows),
    turn: sc.side,
    status: "playing",
    moveCount: 0,
    history: [],
    captured: { attackers: 0, defenders: 0 },
  };
}

/**
 * Is `move` the right answer for the step? Fixed-solution steps match by
 * squares; predicate steps (no solution listed) accept any legal move whose
 * outcome satisfies the scenario goal.
 */
export function isAcceptedMove(
  sc: TutorialScenario,
  stepIndex: number,
  state: GameState,
  move: Move,
  rules: RuleSet,
): boolean {
  const step = sc.steps[stepIndex];
  if (step.solution) return step.solution.some((s) => sameMove(s, move));
  return sc.goal(applyMove(state, move, rules));
}

/**
 * Why a refused move was refused. The tutorial player turns this into a
 * full-screen explanation, so a beginner is never left guessing what the game
 * objected to — every value here names a concrete consequence on the board.
 */
export type TutorialMistake =
  | "roadOpen" // block drill: the King still reaches a corner next move
  | "losesGame" // the opponent wins outright, now or on their reply
  | "noCapture" // capture drill: the move takes nothing
  | "wrongCapture" // capture drill: it takes something, but not what was asked
  | "kingStands" // king-hunt drill: the King is still free
  | "noEscape" // escape drill, deciding move: the King is not in a corner
  | "notForcing"; // escape drill, setup move: the threat can be answered

const opposing = (side: Side): Side => (side === "attackers" ? "defenders" : "attackers");

/** Can `side`, to move, win with its very next move? */
const winsInOne = (s: GameState, side: Side, rules: RuleSet): boolean =>
  allMoves(s.board, side, rules).some((m) => winnerOf(applyMove(s, m, rules).status) === side);

/**
 * Diagnose a legal-but-refused move. Called only for moves `isAcceptedMove`
 * has already turned down, so it never has to explain a correct answer.
 */
export function explainMistake(
  sc: TutorialScenario,
  stepIndex: number,
  state: GameState,
  move: Move,
  rules: RuleSet,
): TutorialMistake {
  // The blocking drill is a special case: there the opponent's escape-in-one is
  // the whole point, so name the open road rather than the looming loss.
  if (sc.lesson === "block") return "roadOpen";

  const foe = opposing(sc.side);
  const after = applyMove(state, move, rules);
  // Handing the game straight to the other side outranks every other note.
  if (winnerOf(after.status) === foe) return "losesGame";
  if (!isGameOver(after.status) && winsInOne(after, foe, rules)) return "losesGame";

  switch (sc.lesson) {
    case "capture": {
      const taken = sc.side === "attackers" ? after.captured.defenders : after.captured.attackers;
      return taken === 0 ? "noCapture" : "wrongCapture";
    }
    case "regicide":
      return "kingStands";
    case "escape":
      return stepIndex === sc.steps.length - 1 ? "noEscape" : "notForcing";
  }
}

const wtf = VARIANTS.wtf;

/** After this state, can the defenders reach an escape in a single move? */
const escapeInOne = (s: GameState): boolean =>
  allMoves(s.board, "defenders", wtf).some(
    (m) => applyMove(s, m, wtf).status === "defenders_win_escape",
  );

export const TUTORIALS: TutorialScenario[] = [
  // Every non-terminal drill below is engine-checked for soundness in
  // tutorials.test.ts: after the taught move the opponent has no forced win
  // within two of their moves, and the taught move never passes up an
  // immediate win of the learner's own — so each capture is genuinely the
  // right idea in the position, not a blunder dressed up as a lesson.
  //
  // The same suite also checks the converse: no legal move reaches a drill's
  // goal without being listed as a solution. Positions are built so that the
  // moves reaching the goal are exactly the sound ones — where a second, losing
  // route to the same goal existed, the board was changed to remove it rather
  // than the drill taught to accept it.

  // ── Captures ────────────────────────────────────────────────────────────────
  {
    // The basic custodial capture: the raiders' ring presses the cross and a
    // guard on c3 has strayed one square too far, with a raider at his back.
    id: "pincer",
    side: "attackers",
    rulesId: "wtf",
    lesson: "capture",
    rows: [
      "...a...",
      "..a....",
      "...d.a.",
      "...kd..",
      "..d..a.",
      "..a....",
      "...a...",
    ],
    steps: [{ solution: [mv("c6", "c4")] }],
    goal: (s) => s.captured.defenders === 1,
    foils: [mv("c6", "e6"), mv("c2", "b2")],
  },
  {
    // A hostile corner is a second raider: the guard posted at b7 to watch
    // the corner is exactly what the corner helps capture. Two raiders can
    // close it — c3 up the file, or d7 along the rank — and both are equally
    // sound, so both are answers.
    id: "corner-anvil",
    side: "attackers",
    rulesId: "wtf",
    lesson: "capture",
    rows: [
      ".d.a...",
      ".......",
      "...d.a.",
      "aa.kd..",
      "..a....",
      "....a..",
      "....a..",
    ],
    steps: [{ solution: [mv("c3", "c7"), mv("d7", "c7")] }],
    goal: (s) => s.captured.defenders === 1,
    foils: [mv("c3", "c5"), mv("c3", "a3")],
  },
  {
    // The king has left his throne — and the empty throne turns hostile:
    // the guard at c4 beside it can be pinned flat against it.
    //
    // Only b1 can reach b4: c7 and a5 bar the king's roads but are cut off
    // from the b-file, and the second guard stands on e6 where the throne
    // cannot be used against him. That keeps the answer single — an earlier
    // build of this position let three other raiders make the same capture
    // while opening a road the king wins on.
    id: "throne-anvil",
    side: "attackers",
    rulesId: "wtf",
    lesson: "capture",
    rows: [
      "..a..a.",
      "....d..",
      "a..k.a.",
      "..d....",
      ".......",
      ".......",
      ".a..a..",
    ],
    steps: [{ solution: [mv("b1", "b4")] }],
    goal: (s) => s.captured.defenders === 1,
    foils: [mv("b1", "b3"), mv("b1", "d1")],
  },
  {
    // One slide across the empty throne takes two raiders at a stroke — the
    // f-file raiders have pressed too deep between the king's guards.
    id: "double-take",
    side: "defenders",
    rulesId: "wtf",
    lesson: "capture",
    rows: [
      "...a...",
      "a....d.",
      "...k.a.",
      ".d.....",
      ".....a.",
      "a....d.",
      "...a...",
    ],
    steps: [{ solution: [mv("b4", "f4")] }],
    goal: (s) => s.captured.attackers === 2,
    foils: [mv("b4", "b2"), mv("f6", "e6")],
  },
  {
    // The armed king fights too: one step off his throne closes the trap on
    // the raider pressing his flank guard.
    id: "kings-blade",
    side: "defenders",
    rulesId: "wtf",
    lesson: "capture",
    rows: [
      "...a...",
      ".......",
      "...d...",
      ".a.k.ad",
      "..a....",
      ".......",
      "....a..",
    ],
    steps: [{ solution: [mv("d4", "e4")] }],
    goal: (s) => s.captured.attackers === 1,
    foils: [mv("d4", "d3"), mv("g4", "g5")],
  },
  // ── Escape and defence ──────────────────────────────────────────────────────
  {
    // One road is barred — run the open rank to the corner.
    id: "road-to-corner",
    side: "defenders",
    rulesId: "wtf",
    lesson: "escape",
    rows: [
      "...k.a.",
      ".a.....",
      ".......",
      ".......",
      ".......",
      ".....a.",
      ".......",
    ],
    steps: [{ solution: [mv("d7", "a7")] }],
    goal: (s) => s.status === "defenders_win_escape",
    foils: [mv("d7", "d4"), mv("d7", "e7")],
  },
  {
    // The royal fork: threaten both corners at once; no single raider can
    // shut both roads, so whichever is blocked, the other wins next move.
    id: "royal-fork",
    side: "defenders",
    rulesId: "wtf",
    lesson: "escape",
    rows: [
      ".......",
      "...k...",
      "....a..",
      ".a....a",
      ".......",
      ".......",
      "..a....",
    ],
    steps: [
      { solution: [mv("d6", "d7")], reply: mv("b4", "b7") },
      { solution: [mv("d7", "g7")] },
    ],
    goal: (s) => s.status === "defenders_win_escape",
    // a6 looks like the same fork, but e5–a5 then takes the king against
    // the hostile corner a7.
    foils: [mv("d6", "a6"), mv("d6", "d3")],
  },
  {
    // Defence for the raiders: the king is one move from g7 — bar the door.
    id: "bar-the-door",
    side: "attackers",
    rulesId: "wtf",
    lesson: "block",
    rows: [
      "..a.k..",
      ".......",
      ".......",
      ".....a.",
      ".......",
      "....ad.",
      ".......",
    ],
    // Predicate step: any move that leaves the king with no escape-in-one.
    steps: [{}],
    goal: (s) => s.status === "playing" && !escapeInOne(s),
    foils: [mv("c7", "d7"), mv("f4", "f6")],
  },
  // ── Taking the king ─────────────────────────────────────────────────────────
  {
    // Away from the throne two raiders suffice — and the capture must be
    // active: the closing raider makes the move.
    id: "take-the-king",
    side: "attackers",
    rulesId: "wtf",
    lesson: "regicide",
    rows: [
      ".......",
      "....a..",
      ".......",
      ".......",
      ".d.....",
      "..ak...",
      ".......",
    ],
    steps: [{ solution: [mv("e6", "e2")] }],
    goal: (s) => s.status === "attackers_win_capture",
    foils: [mv("e6", "e3"), mv("c2", "c1")],
  },
  {
    // On his throne the king is strong: all four sides must be taken. His
    // last guard watches from g6, too far away to help.
    id: "wall-of-four",
    side: "attackers",
    rulesId: "wtf",
    lesson: "regicide",
    rows: [
      ".......",
      "......d",
      "...a...",
      "..ak..a",
      "...a...",
      ".......",
      ".......",
    ],
    steps: [{ solution: [mv("g4", "e4")] }],
    goal: (s) => s.status === "attackers_win_capture",
    foils: [mv("g4", "g5"), mv("g4", "f4")],
  },
  {
    // Beside the throne, the empty throne itself is the fourth wall. The
    // last guard at b6 is a file too far to interpose.
    id: "fourth-wall",
    side: "attackers",
    rulesId: "wtf",
    lesson: "regicide",
    rows: [
      ".....a.",
      ".d.....",
      "....a..",
      "....k..",
      "....a..",
      ".......",
      ".......",
    ],
    steps: [{ solution: [mv("f7", "f4")] }],
    goal: (s) => s.status === "attackers_win_capture",
    foils: [mv("f7", "b7"), mv("e5", "e6")],
  },
  {
    // Encirclement: one square closes an unbroken ring around king and guard.
    id: "close-the-ring",
    side: "attackers",
    rulesId: "wtf",
    lesson: "regicide",
    rows: [
      ".....a.",
      ".......",
      "...aa..",
      "..akd..",
      "...aa..",
      ".......",
      ".......",
    ],
    steps: [{ solution: [mv("f7", "f4")] }],
    goal: (s) => s.status === "attackers_win_encirclement",
    foils: [mv("f7", "f6"), mv("f7", "f5")],
  },
];

// ── Progress ──────────────────────────────────────────────────────────────────
const PROGRESS_KEY = "brandubh.tutorials.v1";

export function parseTutorialProgress(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    const known = new Set(TUTORIALS.map((s) => s.id));
    return new Set(arr.filter((x): x is string => typeof x === "string" && known.has(x)));
  } catch {
    return new Set();
  }
}

export function loadTutorialProgress(): Set<string> {
  try {
    return parseTutorialProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return new Set();
  }
}

export function saveTutorialProgress(done: Set<string>): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
  } catch {
    /* ignore persistence failures */
  }
}
