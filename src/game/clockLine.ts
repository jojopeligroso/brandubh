// ── Per-position clock times ─────────────────────────────────────────────────
//
// A chess clock is normally a single pair of banks that only ever counts down.
// That falls apart the moment the game timeline can be rewound: step back to an
// earlier position and the board returns, but the clocks stay where they were —
// including a bank that has already run out, which leaves the position on screen
// but unplayable.
//
// The fix is to treat the clocks as a property of the *position* rather than of
// the session. A **clock line** records, for every ply in the timeline, the two
// banks as they stood the moment that position was first put in front of the
// player to move — before any thinking time was spent on it. Returning to a
// position (takeback, branch, or resuming a game lost on time) restores exactly
// those times, so a position always plays out from the same clocks it was first
// offered with.
//
// The Fischer increment for the move that *reached* a position is already
// banked in that position's entry, since the snapshot is taken on arrival.
//
// This module is pure book-keeping over that array; the live ticking lives in
// `useGameClock` and the wiring in App.

import type { GameStatus, Side } from "./types";
import type { TimeControl } from "./clock";

/** Both sides' remaining thinking time, in milliseconds. */
export type ClockBanks = Record<Side, number>;

/**
 * `line[k]` is the pair of banks on arrival at ply k — index-aligned with the
 * app's `states[]` timeline. Entries may be missing (a control changed
 * mid-game); {@link banksAt} fills those in with a full bank.
 */
export type ClockLine = ClockBanks[];

/** Both banks at their starting time (zero when no clock is configured). */
export function fullBanks(tc: TimeControl | null): ClockBanks {
  const ms = (tc?.initialSeconds ?? 0) * 1000;
  return { attackers: ms, defenders: ms };
}

/** A line holding just the opening position, both banks full. */
export function initialClockLine(tc: TimeControl | null): ClockLine {
  return [fullBanks(tc)];
}

/** The banks to play ply `k` with, falling back to a full bank if unrecorded. */
export function banksAt(line: ClockLine, ply: number, tc: TimeControl | null): ClockBanks {
  return line[ply] ?? fullBanks(tc);
}

/**
 * Record the banks on arrival at `ply`, dropping anything that used to follow —
 * a move played from here supersedes whatever line was there before.
 */
export function recordArrival(line: ClockLine, ply: number, banks: ClockBanks): ClockLine {
  const next = line.slice(0, ply);
  next[ply] = banks;
  return next;
}

/** Cut the line back to `ply`, keeping that position's own entry. */
export function truncateTo(line: ClockLine, ply: number): ClockLine {
  return line.slice(0, ply + 1);
}

/**
 * A loss on time — the one game result that comes from the clock rather than the
 * board, and so the one that resuming an earlier position can undo.
 */
export function isTimeLoss(status: GameStatus): boolean {
  return status === "attackers_win_time" || status === "defenders_win_time";
}
