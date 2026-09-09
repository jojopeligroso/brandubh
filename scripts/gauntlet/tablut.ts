/* Tablut adapter for the mirrored-pair gauntlet. 9×9, EDGE escape, the
 * Linnaeus/WTF ruleset (`DEFAULT_VARIANT` in `src/game/tablut/variants.ts`).
 *
 * Two things differ from Brandubh beyond board size, and both matter to a
 * measurement:
 *   - There is NO opening book for this board, so `book2`/`book4` cannot run
 *     here. Use `shallow2` (the default) or `random4`.
 *   - `FULL_CONFIG.usePVS` is `true` here and `false` on Brandubh, and that
 *     flag has never been measured on either board. It is used as it ships,
 *     because what the instrument must measure is the engine that plays.
 *
 * Per ADR-0006 nothing here is derived from Brandubh's tuning: the weight type
 * has `kingEdge` where Brandubh has `kingCorner`, and none of Brandubh's
 * spatial terms exist at all.
 */
import {
  DEFAULT_WEIGHTS,
  FULL_CONFIG,
  pickMove,
  resetTT,
  scoreRootMoves,
  type EvalWeights,
} from "../../src/game/tablut/engine";
import {
  allMoves,
  applyMove,
  hashBoard,
  initialState,
  isGameOver,
  winnerOf,
} from "../../src/game/tablut/rules";
import type { GameState, Side } from "../../src/game/types";
import { DEFAULT_VARIANT, VARIANTS } from "../../src/game/tablut/variants";
import type { GameAdapter } from "./adapter";
import { mergeOverrides } from "./overrides";

const rules = VARIANTS[DEFAULT_VARIANT];

/** Named candidates. Only the terms Tablut's own weight type has: `liberties`,
 *  `shield` and `mobility` are all parked at 0 here and none has ever been
 *  gauntleted on this board (see the `liberties` comment in
 *  `src/game/tablut/engine.ts`). Weights match Brandubh's candidate values so
 *  the two boards are asking the same question, not because the answer is
 *  expected to transfer. */
const CANDIDATES: Record<string, EvalWeights> = {
  shield: { ...DEFAULT_WEIGHTS, shield: 20 },
  liberties: { ...DEFAULT_WEIGHTS, liberties: 12 },
  mobility: { ...DEFAULT_WEIGHTS, mobility: 3 },
};

export const tablutAdapter: GameAdapter = {
  game: "tablut",
  rulesId: rules.id,

  defaultWeights: DEFAULT_WEIGHTS,
  candidateTerms: () => Object.keys(CANDIDATES),
  candidate: (term) => CANDIDATES[term],
  weightsFromJson: (json) => mergeOverrides("tablut", DEFAULT_WEIGHTS, json),

  initialState: () => initialState(rules),
  legalMoves: (s) => allMoves(s.board, s.turn, rules),
  apply: (s, m) => applyMove(s, m, rules),
  isOver: (s) => isGameOver(s.status),
  winner: (s): Side | "draw" | null => (isGameOver(s.status) ? winnerOf(s.status) : null),
  positionKey: (s) => hashBoard(s.board, s.turn),

  resetSearch: () => resetTT(),
  defaultConfig: FULL_CONFIG,
  pvsConfig: (on) => ({ ...FULL_CONFIG, usePVS: on }),
  search: (s: GameState, maxDepth, rng, w, config) =>
    pickMove(s, rules, { maxDepth }, (config as typeof FULL_CONFIG) ?? FULL_CONFIG, rng, w as EvalWeights).move,
  nearBest: (s, depth, margin) =>
    scoreRootMoves(s, rules, depth, margin, FULL_CONFIG, DEFAULT_WEIGHTS).within.map((r) => r.move),

  hasBook: false,
  bookReplies: () => null,

  defaultOpening: "shallow2",
};
