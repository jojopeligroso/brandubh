/* Copenhagen adapter for the mirrored-pair gauntlet. 11×11, corner escape,
 * twenty-four raiders against a king and twelve defenders, plus shieldwall,
 * exit fort and encirclement — the largest and slowest of the three boards.
 *
 * As with Tablut: no opening book, so `book2`/`book4` cannot run here (use
 * `shallow2`, the default), and `FULL_CONFIG.usePVS` is `true` and unmeasured.
 * Expect this board to cost roughly an order of magnitude more per ply than
 * Brandubh at the same depth; the report's timing table is the measured
 * version of that sentence.
 */
import {
  DEFAULT_WEIGHTS,
  FULL_CONFIG,
  pickMove,
  resetTT,
  scoreRootMoves,
  type EvalWeights,
} from "../../src/game/copenhagen/engine";
import {
  allMoves,
  applyMove,
  hashBoard,
  initialState,
  isGameOver,
  winnerOf,
} from "../../src/game/copenhagen/rules";
import type { GameState, Side } from "../../src/game/types";
import { DEFAULT_VARIANT, VARIANTS } from "../../src/game/copenhagen/variants";
import type { GameAdapter } from "./adapter";
import { mergeOverrides } from "./overrides";

const rules = VARIANTS[DEFAULT_VARIANT];

/** Named candidates, in Copenhagen's own weight type. All three are parked at
 *  0 and none has been gauntleted on this board. */
const CANDIDATES: Record<string, EvalWeights> = {
  shield: { ...DEFAULT_WEIGHTS, shield: 20 },
  liberties: { ...DEFAULT_WEIGHTS, liberties: 12 },
  mobility: { ...DEFAULT_WEIGHTS, mobility: 3 },
};

export const copenhagenAdapter: GameAdapter = {
  game: "copenhagen",
  rulesId: rules.id,

  defaultWeights: DEFAULT_WEIGHTS,
  candidateTerms: () => Object.keys(CANDIDATES),
  candidate: (term) => CANDIDATES[term],
  weightsFromJson: (json) => mergeOverrides("copenhagen", DEFAULT_WEIGHTS, json),

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
