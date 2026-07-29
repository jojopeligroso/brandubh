// ── Over-the-board "set" and "match" scoring ─────────────────────────────────
//
// Brandubh is asymmetric, so a single game is not a fair contest between two
// people: whichever side is stronger has the edge. Tournament play therefore
// bundles games into a **set** — each player takes an equal number of games
// with each side, so both sit behind the strong army the same number of times.
// Because the stronger side is expected to win, a set usually finishes level;
// the tiebreaker is the number of moves taken for victory — the faster wins
// take the set.
//
// A **match** is a running series of sets between the same two players: sets
// won accumulate across the series, and the first move of each set alternates
// between the players for fairness.
//
// This module is pure state. The engine and board are untouched — swapping
// "sides" is only a relabelling of which player is behind the raiders and which
// is behind the king.

import type { GameStatus, Side } from "./types";
import { winnerOf } from "./engine";

/** The two people sitting over the board. */
export type PlayerId = "p1" | "p2";

/** Default set length: each player takes one game with each side. */
export const GAMES_PER_SET = 2;

/** Selectable set lengths. Even so each player gets each side equally. */
export const SET_LENGTH_OPTIONS = [2, 4, 6] as const;

export const otherPlayer = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

export interface SetGameResult {
  /** Winning side, or "draw". */
  winner: Side | "draw";
  status: GameStatus;
  /** Plies played when the game ended — the moves taken to reach the result. */
  moves: number;
  /** Which player held each side in this game. */
  attackersPlayer: PlayerId;
  defendersPlayer: PlayerId;
  /** The player who won, or null for a draw. */
  winningPlayer: PlayerId | null;
}

export interface MatchSet {
  /** Finished games, in play order. */
  results: SetGameResult[];
  /** Side assignments for the game currently in progress (or up next). */
  attackersPlayer: PlayerId;
  defendersPlayer: PlayerId;
  /** How many games make up this set. */
  gamesPerSet: number;
}

/**
 * A fresh set. The `firstAttacker` takes the raiders in the first game (the
 * attackers always move first), then the sides swap each game.
 */
export function newSet(firstAttacker: PlayerId = "p1", gamesPerSet = GAMES_PER_SET): MatchSet {
  return {
    results: [],
    attackersPlayer: firstAttacker,
    defendersPlayer: otherPlayer(firstAttacker),
    gamesPerSet,
  };
}

/** Record a finished game and swap the side assignments for the next game. */
export function recordGame(set: MatchSet, status: GameStatus, moves: number): MatchSet {
  const w = winnerOf(status);
  const winner: SetGameResult["winner"] = w === null ? "draw" : w;
  const winningPlayer =
    winner === "attackers"
      ? set.attackersPlayer
      : winner === "defenders"
        ? set.defendersPlayer
        : null;

  const result: SetGameResult = {
    winner,
    status,
    moves,
    attackersPlayer: set.attackersPlayer,
    defendersPlayer: set.defendersPlayer,
    winningPlayer,
  };

  return {
    ...set,
    results: [...set.results, result],
    // Swap sides so the next game puts each player behind the other army.
    attackersPlayer: set.defendersPlayer,
    defendersPlayer: set.attackersPlayer,
  };
}

/**
 * Undo the most recent {@link recordGame} — the exact inverse, side assignments
 * included. Needed because a game lost on time can be resumed: stepping back to
 * an earlier position puts the clocks back to what that position was first
 * offered with, so the game is live again and its banked loss must come back out
 * of the set. An empty set is returned unchanged.
 */
export function unrecordLastGame(set: MatchSet): MatchSet {
  if (set.results.length === 0) return set;
  return {
    ...set,
    results: set.results.slice(0, -1),
    // recordGame swapped the assignments on the way in; swap them back.
    attackersPlayer: set.defendersPlayer,
    defendersPlayer: set.attackersPlayer,
  };
}

export interface SetStanding {
  /** Games won by each player. */
  wins: Record<PlayerId, number>;
  /** Games won by each side across the set — the "king vs raiders" counters. */
  sideWins: { attackers: number; defenders: number };
  /** Fewest moves each player needed for a win (null = they have no win yet). */
  fastestWin: Record<PlayerId, number | null>;
  /** Total moves each player spent across the games they won (tiebreak metric). */
  winMoves: Record<PlayerId, number>;
  gamesPlayed: number;
  complete: boolean;
  /** Set outcome once the set is complete: the winning player, a draw, or null. */
  winner: PlayerId | "draw" | null;
  /** True when a level set was decided on the move-count tiebreaker. */
  decidedByMoves: boolean;
}

/** Derive the running standings of a set. */
export function standing(set: MatchSet): SetStanding {
  const wins: Record<PlayerId, number> = { p1: 0, p2: 0 };
  const sideWins = { attackers: 0, defenders: 0 };
  const fastestWin: Record<PlayerId, number | null> = { p1: null, p2: null };
  const winMoves: Record<PlayerId, number> = { p1: 0, p2: 0 };

  for (const r of set.results) {
    if (r.winner === "attackers") sideWins.attackers++;
    else if (r.winner === "defenders") sideWins.defenders++;
    if (r.winningPlayer) {
      wins[r.winningPlayer]++;
      winMoves[r.winningPlayer] += r.moves;
      const best = fastestWin[r.winningPlayer];
      if (best === null || r.moves < best) fastestWin[r.winningPlayer] = r.moves;
    }
  }

  const gamesPlayed = set.results.length;
  const complete = gamesPlayed >= set.gamesPerSet;

  let winner: SetStanding["winner"] = null;
  let decidedByMoves = false;
  if (complete) {
    if (wins.p1 > wins.p2) winner = "p1";
    else if (wins.p2 > wins.p1) winner = "p2";
    else if (wins.p1 === 0) winner = "draw"; // neither player won a game
    else {
      // Level on games won (the expected outcome): fewer moves to victory wins.
      decidedByMoves = true;
      winner = winMoves.p1 < winMoves.p2 ? "p1" : winMoves.p2 < winMoves.p1 ? "p2" : "draw";
    }
  }

  return { wins, sideWins, fastestWin, winMoves, gamesPlayed, complete, winner, decidedByMoves };
}

// ── Match: a running series of sets ──────────────────────────────────────────

export interface Match {
  gamesPerSet: number;
  /** Who takes the raiders in game 1 of the current set (alternates each set). */
  firstAttacker: PlayerId;
  /** The set currently in progress. */
  set: MatchSet;
  /** Sets won by each player across the series. */
  setsWon: Record<PlayerId, number>;
  /** Sets that finished level. */
  setsDrawn: number;
  /** Decisive game wins banked from *completed* sets. */
  gameWins: Record<PlayerId, number>;
}

export function newMatch(
  gamesPerSet: number = GAMES_PER_SET,
  firstAttacker: PlayerId = "p1",
): Match {
  return {
    gamesPerSet,
    firstAttacker,
    set: newSet(firstAttacker, gamesPerSet),
    setsWon: { p1: 0, p2: 0 },
    setsDrawn: 0,
    gameWins: { p1: 0, p2: 0 },
  };
}

/** Record a finished game into the match's current set. */
export function recordMatchGame(match: Match, status: GameStatus, moves: number): Match {
  return { ...match, set: recordGame(match.set, status, moves) };
}

/** Take the most recently recorded game back out of the match's current set. */
export function unrecordLastMatchGame(match: Match): Match {
  return { ...match, set: unrecordLastGame(match.set) };
}

/**
 * Bank the current (completed) set into the match totals and start a fresh set,
 * alternating who leads. Continues the running count between the same players.
 */
export function startNextSet(match: Match): Match {
  const s = standing(match.set);
  const setsWon = { ...match.setsWon };
  let setsDrawn = match.setsDrawn;
  if (s.winner === "p1") setsWon.p1++;
  else if (s.winner === "p2") setsWon.p2++;
  else if (s.complete) setsDrawn++;

  const gameWins = {
    p1: match.gameWins.p1 + s.wins.p1,
    p2: match.gameWins.p2 + s.wins.p2,
  };
  const firstAttacker = otherPlayer(match.firstAttacker);

  return {
    ...match,
    set: newSet(firstAttacker, match.gamesPerSet),
    firstAttacker,
    setsWon,
    setsDrawn,
    gameWins,
  };
}

export interface MatchTotals {
  /** Sets won by each player so far. */
  setsWon: Record<PlayerId, number>;
  setsDrawn: number;
  /** Total decisive game wins, including the current set in progress. */
  gameWins: Record<PlayerId, number>;
  /** Sets fully completed in the series (excludes the one in progress). */
  setsCompleted: number;
}

/** Running match totals, folding in the current set's progress. */
export function matchTotals(match: Match): MatchTotals {
  const s = standing(match.set);
  return {
    setsWon: match.setsWon,
    setsDrawn: match.setsDrawn,
    gameWins: {
      p1: match.gameWins.p1 + s.wins.p1,
      p2: match.gameWins.p2 + s.wins.p2,
    },
    setsCompleted: match.setsWon.p1 + match.setsWon.p2 + match.setsDrawn,
  };
}
