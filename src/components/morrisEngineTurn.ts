// ── When the Morris engine is asked for a move ─────────────────────────────────
//
// One decision, extracted from `MorrisScreen`'s engine-turn effect so it can be
// tested: *given what the screen last asked the worker about, should it ask now,
// and about what?* The effect around it keeps the React parts (a ref, `thinking`,
// the promise) and none of the reasoning.
//
// It exists because of a deadlock that shipped in this shape:
//
//   1. The engine is asked about the tip; `thinking` goes true.
//   2. The player steps the review cursor (◀ / a move-log ply), so `atTip` goes
//      false, the effect re-runs and its cleanup marks the reply to be **discarded**.
//   3. The reply arrives and is dropped — so the `setThinking(false)` inside the
//      promise never runs.
//   4. Back at the tip the position is unchanged, so the key is unchanged, so the
//      old code saw "already asked" and did not ask again. `thinking` stayed true
//      and the board was dead until Undo or Restart.
//
// Two rules come out of that, and they are what this module is:
//
//   • **A discarded reply must never leave `thinking` set.** Whatever abandons a
//     request owns clearing the flag — the promise cannot, because it is the thing
//     being abandoned.
//   • **An abandoned request is not an asked question.** Forgetting the key is what
//     lets the same position be asked again, and asking again is correct: the
//     answer was thrown away and the worker is terminated by the next request
//     anyway (see `useAiWorker`).
//
// `NOT_ASKED` is the value that says "nothing is outstanding", and the three places
// that restart a game (`startGame`, `rewindTo`, `loadImportedGame`) already reset to
// it for the same reason.
//
// What this deliberately does not do: it does not know about `thinking`, the
// worker, or the clock. It is a pure function over plain values, which is the whole
// reason it can be a unit test in a project with no jsdom.

import type { Side } from "../game/morris/types";

/** Nothing has been asked, or what was asked has been abandoned. */
export const NOT_ASKED = "";

/** Everything the decision depends on, as plain values. */
export interface EngineTurnGate {
  /** The live game's identity, so a fresh game can never inherit the previous
   *  one's answer. */
  gameId: string;
  /** `states.length` — the position's index, which is what makes the key change
   *  when a move is played and stay the same when only the cursor moves. */
  plies: number;
  /** Whose turn it is at the tip. */
  turn: Side;
  /** The seat the engine plays, or null in hotseat. */
  aiSide: Side | null;
  gameOver: boolean;
  showSetup: boolean;
  /** Whether the cursor is on the tip. The engine never plays under a reviewer. */
  atTip: boolean;
}

/** The identity of a question to the engine: this game, this position, this side. */
export function askKey(gameId: string, plies: number, turn: Side): string {
  return `${gameId}:${plies}:${turn}`;
}

/**
 * The key the engine should be asked about now, or `null` for "do not ask" —
 * either because it is not the engine's move (or not the engine's board to touch),
 * or because this exact question is already outstanding.
 *
 * `asked` is the last key asked about, or `NOT_ASKED`. Passing `NOT_ASKED` after a
 * reply has been discarded is what un-sticks the deadlock in the head comment: the
 * same position is asked again rather than waited on forever.
 */
export function nextAskKey(gate: EngineTurnGate, asked: string): string | null {
  if (gate.gameOver || gate.aiSide === null || gate.turn !== gate.aiSide) return null;
  if (gate.showSetup || !gate.atTip) return null;
  const key = askKey(gate.gameId, gate.plies, gate.turn);
  return asked === key ? null : key;
}
