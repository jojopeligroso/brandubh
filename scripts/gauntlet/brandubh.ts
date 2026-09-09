/* Brandubh adapter for the mirrored-pair gauntlet. 7×7, corner escape, WTF
 * ruleset — the board every number in `docs/reports/paired-gauntlet-
 * instrument.md` before 2026-09-09 was measured on.
 *
 * This is the only one of the three adapters with an opening book: the book in
 * `src/game/openingBook.ts` is generated for this board and this ruleset, so
 * `book2`/`book4` are Brandubh-only schemes. See the `shallowN` note in
 * `scripts/pairgauntlet.ts`.
 */
import {
  DEFAULT_WEIGHTS,
  FULL_CONFIG,
  pickMove,
  resetTT,
  scoreRootMoves,
  type EvalWeights,
} from "../../src/game/engine";
import {
  allMoves,
  applyMove,
  hashBoard,
  initialState,
  isGameOver,
  winnerOf,
} from "../../src/game/rules";
import type { GameState, Move, Side } from "../../src/game/types";
import { VARIANTS } from "../../src/game/variants";
import { bookRulesMatch, loadOpeningBook } from "../../src/game/openingBook";
import type { GameAdapter, Weights } from "./adapter";
import { mergeOverrides } from "./overrides";

/** WTF, as the instrument has always used. Not `walker`: the numbers on record
 *  are WTF numbers, and a ruleset change invalidates every one of them. */
const rules = VARIANTS.wtf;

/** Named candidate overrides. Brandubh's own weight type: `quadrantCoverage`
 *  and `blockerAwareKingDist` exist on no other board. */
const CANDIDATES: Record<string, EvalWeights> = {
  blockerAwareKingDist: { ...DEFAULT_WEIGHTS, blockerAwareKingDist: true },
  shield: { ...DEFAULT_WEIGHTS, shield: 20 },
  liberties: { ...DEFAULT_WEIGHTS, liberties: 12 },
  mobility: { ...DEFAULT_WEIGHTS, mobility: 3 },
  quadrantCoverage: { ...DEFAULT_WEIGHTS, quadrantCoverage: 10 },
};

let book: Record<string, Move[]> | null = null;
function getBook(): Record<string, Move[]> {
  if (book === null) {
    book = loadOpeningBook();
    if (!bookRulesMatch(rules)) {
      console.warn("WARNING: opening book fingerprint does not match VARIANTS.wtf — book openings will be empty/no-op.");
    }
  }
  return book;
}

export const brandubhAdapter: GameAdapter = {
  game: "brandubh",
  rulesId: rules.id,

  defaultWeights: DEFAULT_WEIGHTS,
  candidateTerms: () => Object.keys(CANDIDATES),
  candidate: (term) => CANDIDATES[term],
  weightsFromJson: (json) => mergeOverrides("brandubh", DEFAULT_WEIGHTS, json),

  initialState: () => initialState(),
  legalMoves: (s) => allMoves(s.board, s.turn, rules),
  apply: (s, m) => applyMove(s, m, rules),
  isOver: (s) => isGameOver(s.status),
  winner: (s): Side | "draw" | null => (isGameOver(s.status) ? winnerOf(s.status) : null),
  positionKey: (s) => hashBoard(s.board, s.turn),

  resetSearch: () => resetTT(),
  search: (s: GameState, maxDepth, rng, w) =>
    pickMove(s, rules, { maxDepth }, FULL_CONFIG, rng, w as EvalWeights).move,
  nearBest: (s, depth, margin) =>
    scoreRootMoves(s, rules, depth, margin, FULL_CONFIG, DEFAULT_WEIGHTS).within.map((r) => r.move),

  hasBook: true,
  bookReplies: (s) => getBook()[hashBoard(s.board, s.turn)] ?? [],

  defaultOpening: "book2",
};

/** Re-exported so the weights stay opaque at the call site while this module
 *  keeps its concrete type. */
export const brandubhDefaults: Weights = DEFAULT_WEIGHTS;
