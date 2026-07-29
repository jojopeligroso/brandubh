// ── Who plays which side ─────────────────────────────────────────────────────
// The single place the play mode is turned into concrete sides. Everything that
// asks "which side am I?" — the side the computer searches for, the side the
// board lets you touch, which clock rides above the board — reads it from here,
// so choosing the raiders instead of the king flips all of them together.
//
// Board *orientation* is deliberately absent: Brandubh's opening position is
// D4-symmetric (two raiders at the head of each of the four arms, the king
// centred on the throne), so there is no near half and far half to swap. The
// board looks the same from either chair and never rotates with the side; only
// which pieces you may pick up changes (Board's `controllable`).

import type { PlayMode, Side } from "./types";

export const opposite = (s: Side): Side => (s === "attackers" ? "defenders" : "attackers");

/**
 * The side the person at the keyboard plays, or null over the board — there
 * they play both, so no side is "theirs".
 */
export function humanSideOf(mode: PlayMode): Side | null {
  return mode === "hotseat" ? null : mode;
}

/**
 * The side the computer plays: whatever the human did not take. Null over the
 * board, where there is no computer to move. This is what gates the AI's turn,
 * so it is the whole of "both sides drive the AI correctly".
 */
export function aiSideOf(mode: PlayMode): Side | null {
  const human = humanSideOf(mode);
  return human ? opposite(human) : null;
}

/**
 * Clock placement, Lichess-style: the away side rides above the board and the
 * near side below it. Vs the computer the human always sits on the bottom,
 * whichever side they took. Over the board the raiders take the top, since they
 * move first and the board is shared.
 */
export function clockPlacement(mode: PlayMode): { top: Side; bottom: Side } {
  const human = humanSideOf(mode);
  return human
    ? { top: opposite(human), bottom: human }
    : { top: "attackers", bottom: "defenders" };
}
