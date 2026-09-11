// ── Probing the endgame tables from a GameState ───────────────────────────────
//
// The one door between the engine and the databases: hand `makeProbe` the tables
// the worker has loaded and it gives back the function `engine.ts` takes as its
// `probe` hook (contract §6) — a `GameState` in, `{ wdl, depth }` from the side to
// move, or `null` meaning "not in a shipped table, search it".
//
// Everything it refuses to answer, and why:
//
//   • Placing phase (either hand non-empty). The databases are the moving phase
//     only; Gasser *searched* the placing phase with the endgame tables at the
//     leaves (⚠ UNVERIFIED (excerpt)), which is what the engine's own search does
//     here too.
//   • Either side below three stones. That is a finished game, not an endgame.
//   • A stone count pair whose table was not shipped or not loaded. A returned
//     `null` is the normal case, not an error: only the last few stone counts are
//     ever shipped.
//   • **Everything, when the rules do not match.** A table is an answer about the
//     game its generator played, so `ProbeOptions.rules` pairs the tables' flags
//     with the ones in force and a mismatch refuses every lookup. Without that
//     pairing a game played with `flying: "none"` reads "win in 1" off a flight no
//     player may make — and presents it as *perfect* play, which is the one way
//     these files can be worse than having no files at all.
//
// The one thing it answers *approximately*, stated rather than hidden: a table
// entry is addressed by position alone, so it knows nothing about `sinceMill` or
// repetition. A database WIN at depth d is a win in d plies under the rules
// Gasser's analysis used, and the shipped preset additionally draws a game after
// 100 plies without a mill. Since every win ends in captures the counter is
// normally reset long before that, and a depth is at most 63 plies anyway, so the
// two can only collide in a position already 37+ plies into a mill-less endgame.
// `pessimisticNoMillPlies` exists for a caller that wants the collision handled
// conservatively (report such a win as a draw) and is off by default, because
// turning it on trades a real lie for a different one in the other direction.
//
// What it deliberately does not do: it does not load anything (that is
// `loader.ts`), does not canonicalise the *turn* into the key (the key is the
// ordered stone-count pair — the side to move is the table's first number), and
// holds no state of its own beyond the map it was handed.

import { POINT_COUNT, type GameState } from "../types";
import { type Wdl, dbKey, entryDepth, entryValue, indexOf, wdlOf } from "./index";
import { popcount } from "./geometry";
import { type MoveGenRules, sameMoveGenRules } from "./generate";

/** What a probed position is worth to the side to move. */
export interface DbValue {
  wdl: Wdl;
  /** Plies to the end under perfect play; 0 for a draw. Capped at 63 by the file
   *  format, and `maxDepth` in the manifest says whether any table got near it. */
  depth: number;
}

/** The engine's database hook. */
export type Probe = (state: GameState) => DbValue | null;

/** Tuning for the one place a table's answer and the shipped preset's practical
 *  draw rules can disagree, and the rule pairing that decides whether the tables
 *  are about this game at all. */
export interface ProbeOptions {
  /** When set, a win that cannot be delivered inside this many plies — counting
   *  the position's own `sinceMill` — is reported as a draw instead. Off by
   *  default; see the head comment. */
  pessimisticNoMillPlies?: number;
  /**
   * The two rule sets that have to agree before a table's answer means anything:
   * `tables` is what the tables were generated under (a manifest's `rules`, or
   * `GASSER_DB_RULES` for the shipped set) and `game` is what is being played. If
   * the three moving-phase flags differ, every probe returns `null` — "search it"
   * — because the tables answer a different game. Given as one field rather than
   * two optional ones so it cannot be half-supplied.
   *
   * Omitted means unchecked, which is only right for a caller that has already
   * paired them (`probeFor` refuses a mismatched manifest before it fetches
   * anything) or for a test building both sides itself.
   */
  rules?: { tables: Partial<MoveGenRules>; game: Partial<MoveGenRules> };
}

/** The two occupancy masks of a board, white first. */
export function masksOfBoard(state: GameState): { white: number; black: number } {
  let white = 0;
  let black = 0;
  for (let i = 0; i < POINT_COUNT; i++) {
    const cell = state.board[i];
    if (cell === 1) white |= 1 << i;
    else if (cell === 2) black |= 1 << i;
  }
  return { white, black };
}

/**
 * Look a moving-phase position up directly by masks. `mover` is the side to move.
 * Returns null when that table is not loaded, or when either side is outside the
 * databases' domain (fewer than three stones).
 */
export function probeMasks(
  tables: ReadonlyMap<string, Uint8Array>,
  mover: number,
  opp: number,
): DbValue | null {
  const m = popcount(mover);
  const o = popcount(opp);
  if (m < 3 || o < 3) return null;
  const table = tables.get(dbKey(m, o));
  if (table === undefined) return null;
  const index = indexOf(mover, opp);
  // A truncated or mismatched file is the one way a wrong byte could be read as a
  // perfect answer, so the bound is checked rather than trusted.
  if (index < 0 || index >= table.length) return null;
  const byte = table[index];
  return { wdl: wdlOf(entryValue(byte)), depth: entryDepth(byte) };
}

/**
 * The engine's `probe` hook over a loaded table set. The returned function
 * allocates one small result object per *probed* node (not per node), and nothing
 * else.
 */
export function makeProbe(
  tables: ReadonlyMap<string, Uint8Array>,
  opts: ProbeOptions = {},
): Probe {
  const limit = opts.pessimisticNoMillPlies;
  // Refused whole rather than per position: tables built under other rules are not
  // *less* accurate here and there, they are about another game, and a probe that
  // answered sometimes would be the worst of both.
  if (opts.rules !== undefined && !sameMoveGenRules(opts.rules.tables, opts.rules.game))
    return () => null;
  return (state: GameState): DbValue | null => {
    if (state.inHand.white !== 0 || state.inHand.black !== 0) return null;
    const { white, black } = masksOfBoard(state);
    const mover = state.turn === "white" ? white : black;
    const opp = state.turn === "white" ? black : white;
    const hit = probeMasks(tables, mover, opp);
    if (hit === null) return null;
    if (limit !== undefined && hit.wdl === 1 && state.sinceMill + hit.depth > limit) {
      return { wdl: 0, depth: 0 };
    }
    return hit;
  };
}
