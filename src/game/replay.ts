// ── Replay-and-validate ───────────────────────────────────────────────────────
// Rebuilding a game from a *list of moves* is the one operation every
// serialisation path needs: a saved game restored from storage, a game pasted in
// from a file, a game handed over by another tool. All of them share the same
// hazard — the move list is untrusted input, and a bad list must never be able
// to put an illegal position on the board.
//
// So none of them apply a stored board. They replay: start from `initialState()`
// and, for every ply, look the move up in `allMoves()` for the side to move. If
// it isn't there, the input is rejected at that ply with the reason why. Status,
// captures and repetition are always recomputed by `applyMove`, never trusted
// from the input — which is what keeps a hand-edited file from claiming a win it
// never earned.
//
// Kept deliberately free of any file/format knowledge so both the export format
// (gameFile.ts) and any storage format can sit on top of it without coupling to
// each other.

import { allMoves, applyMove, initialState, isGameOver } from "./rules";
import type { GameState, GameStatus, Move, Square } from "./types";
import type { RuleSet } from "./variants";

/**
 * The terminal statuses **no move list can imply**. Resigning and flagging on
 * time are decisions *about* a game rather than moves within it, so a replay
 * always leaves those games "playing" — every other ending (escape, capture,
 * encirclement, block, repetition) falls straight out of the moves.
 *
 * Both serializations need this same distinction, and for the same reason: it
 * is the only claim about a result they may take on trust, and then only onto a
 * game the replay left unfinished. A disagreement about any *other* status means
 * the input does not describe the position it claims to.
 */
export const EXTERNAL_STATUSES: ReadonlySet<GameStatus> = new Set<GameStatus>([
  "attackers_win_resign",
  "defenders_win_resign",
  "attackers_win_time",
  "defenders_win_time",
]);

export const isExternalStatus = (status: GameStatus): boolean =>
  EXTERNAL_STATUSES.has(status);

/**
 * One ply as it arrives from untrusted input: the two squares, plus whatever the
 * source *claimed* about captures. The claim is only ever used to cross-check
 * what the engine computes — it never influences the resulting position.
 */
export interface PlyInput {
  from: Square;
  to: Square;
  /** Capture count asserted by the source, or null when it said nothing. */
  captures?: number | null;
}

export type ReplayErrorCode =
  /** No such move for the side to move in this position. */
  | "illegal_move"
  /** More plies after the game had already ended. */
  | "moves_after_end"
  /** The source's capture count disagrees with the engine's — wrong ruleset. */
  | "capture_mismatch";

export interface ReplayError {
  code: ReplayErrorCode;
  /** 0-based index of the offending ply. */
  index: number;
  /** The ply as read, in board notation, for the error message. */
  ply: string;
  /** Engine-computed capture count, when `code` is "capture_mismatch". */
  actualCaptures?: number;
  /** Capture count the source claimed, when `code` is "capture_mismatch". */
  claimedCaptures?: number;
}

export type ReplayResult =
  /** `states[k]` is the position after k plies; `states[0]` is the opening. */
  | { ok: true; states: GameState[] }
  | { ok: false; error: ReplayError };

const FILES = "abcdefg";
const plyText = (p: PlyInput): string =>
  `${FILES[p.from.col] ?? "?"}${7 - p.from.row}-${FILES[p.to.col] ?? "?"}${7 - p.to.row}`;

/**
 * Find the legal move matching `from`→`to` for the side to move, or null.
 * Going through `allMoves` (rather than constructing a Move) is what makes the
 * replay rule-exact: the returned Move is the engine's own, so a caller can
 * never smuggle in a from/to pair the ruleset forbids.
 */
export function findLegalMove(state: GameState, from: Square, to: Square, rules: RuleSet): Move | null {
  return (
    allMoves(state.board, state.turn, rules).find(
      (m) =>
        m.from.row === from.row &&
        m.from.col === from.col &&
        m.to.row === to.row &&
        m.to.col === to.col,
    ) ?? null
  );
}

/**
 * Replay `plies` from the opening position under `rules`, returning the full
 * state timeline or the first ply that would not replay legally.
 *
 * A game that ends before the list does is an error rather than a truncation:
 * silently dropping the tail would import a *different* game from the one in
 * the file, which is worse than refusing it.
 */
export function replayPlies(plies: PlyInput[], rules: RuleSet): ReplayResult {
  const states: GameState[] = [initialState()];

  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i];
    const state = states[states.length - 1];

    if (isGameOver(state.status)) {
      return { ok: false, error: { code: "moves_after_end", index: i, ply: plyText(ply) } };
    }

    const move = findLegalMove(state, ply.from, ply.to, rules);
    if (!move) {
      return { ok: false, error: { code: "illegal_move", index: i, ply: plyText(ply) } };
    }

    const next = applyMove(state, move, rules);
    // The engine records what it actually captured; compare against the claim.
    const actual = next.history[next.history.length - 1].move.captures?.length ?? 0;
    if (ply.captures != null && ply.captures !== actual) {
      return {
        ok: false,
        error: {
          code: "capture_mismatch",
          index: i,
          ply: plyText(ply),
          actualCaptures: actual,
          claimedCaptures: ply.captures,
        },
      };
    }
    states.push(next);
  }

  return { ok: true, states };
}
