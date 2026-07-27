// ── Over-the-board "set" scoring ─────────────────────────────────────────────
//
// Brandubh is asymmetric, so a single game is not a fair contest between two
// people: whichever side is stronger has the edge. Tournament play therefore
// bundles games into a **set** — each player takes one game with each side, so
// both sit behind the strong army once. Because the stronger side is expected
// to win both games, a set usually finishes level (1–1); the tiebreaker is the
// number of moves each player needed for their victory — the faster win takes
// the set.
//
// This module is pure state: it records finished games, swaps the side
// assignments for the next game, and derives the running standings. The engine
// and board are untouched — swapping "sides" is only a relabelling of which
// player is behind the raiders and which is behind the king.

import type { GameStatus, Side } from "./types";
import { winnerOf } from "./engine";

/** The two people sitting over the board. */
export type PlayerId = "p1" | "p2";

/** A full set: each player takes one game with each side. */
export const GAMES_PER_SET = 2;

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
}

/**
 * A fresh set. By convention Player 1 takes the raiders in the first game
 * (the attackers always move first), then the sides swap each game.
 */
export function newSet(firstAttacker: PlayerId = "p1"): MatchSet {
  return {
    results: [],
    attackersPlayer: firstAttacker,
    defendersPlayer: otherPlayer(firstAttacker),
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
    results: [...set.results, result],
    // Swap sides so the next game puts each player behind the other army.
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

  for (const r of set.results) {
    if (r.winner === "attackers") sideWins.attackers++;
    else if (r.winner === "defenders") sideWins.defenders++;
    if (r.winningPlayer) {
      wins[r.winningPlayer]++;
      const best = fastestWin[r.winningPlayer];
      if (best === null || r.moves < best) fastestWin[r.winningPlayer] = r.moves;
    }
  }

  const gamesPlayed = set.results.length;
  const complete = gamesPlayed >= GAMES_PER_SET;

  let winner: SetStanding["winner"] = null;
  let decidedByMoves = false;
  if (complete) {
    if (wins.p1 > wins.p2) winner = "p1";
    else if (wins.p2 > wins.p1) winner = "p2";
    else if (wins.p1 === 0) winner = "draw"; // neither player won a game
    else {
      // Level on games won (the expected 1–1): the faster victory takes the set.
      decidedByMoves = true;
      const m1 = fastestWin.p1 ?? Infinity;
      const m2 = fastestWin.p2 ?? Infinity;
      winner = m1 < m2 ? "p1" : m2 < m1 ? "p2" : "draw";
    }
  }

  return { wins, sideWins, fastestWin, gamesPlayed, complete, winner, decidedByMoves };
}
