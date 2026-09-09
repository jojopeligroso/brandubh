/* The game adapter the mirrored-pair gauntlet measures through.
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/pairgauntlet.ts` used to import `../src/game/engine` and
 * `../src/game/rules` directly and hard-code `const rules = VARIANTS.wtf`, so
 * it could only ever measure Brandubh. Tablut and Copenhagen each fork the
 * rules, the engine, the D4 folding AND the evaluation weight *type* (ADR-0006,
 * ADR-0007) — Brandubh has `kingCorner`, `quadrantCoverage`, `anvilThreat` and
 * `blockerAwareKingDist`, Tablut has `kingEdge` and none of the spatial terms,
 * Copenhagen has a third shape again. There is deliberately no shared
 * `EvalWeights`.
 *
 * So the instrument talks to a per-game adapter instead. Each adapter module
 * (`brandubh.ts`, `tablut.ts`, `copenhagen.ts`) is the ONLY place its game's
 * engine, rules and variants are imported; the gauntlet itself imports nothing
 * from `src/game` except the shared vocabulary types (`GameState`, `Move`,
 * `Side` — identical on all three boards, see `src/game/tablut/types.ts`).
 *
 * Weights are opaque to the gauntlet. It receives a `Weights` from an adapter
 * and hands it back to the same adapter; it never reads a field, so the three
 * incompatible weight types never meet. `object` rather than `any`: a stray
 * property access on a `Weights` is a compile error, not a silent hole.
 */
import type { GameState, Move, Side } from "../../src/game/types";

/** The three tafl boardgames the instrument can measure. */
export const GAME_IDS = ["brandubh", "tablut", "copenhagen"] as const;
export type GameId = (typeof GAME_IDS)[number];

/**
 * One game's evaluation weights, opaque outside its own adapter. The gauntlet
 * only ever moves a `Weights` from one call on an adapter to another call on
 * the SAME adapter, so it needs no knowledge of the shape — and must not
 * acquire any, or the three forked weight types leak into the instrument.
 */
export type Weights = object;

/**
 * One game's `SearchConfig`, opaque outside its own adapter for the same
 * reason `Weights` is: the gauntlet moves a `Config` from an adapter call
 * (`defaultConfig`, `pvsConfig`) straight to another call on the SAME
 * adapter's `search`, and never reads a field.
 */
export type Config = object;

/**
 * Everything the mirrored-pair gauntlet needs from one boardgame. The ruleset
 * is baked in when the adapter is built, so it never appears in the
 * instrument's own signatures.
 */
export interface GameAdapter {
  /** Which boardgame this is. Echoed in every run label. */
  readonly game: GameId;
  /** The ruleset id the games are played under. Echoed in every run label,
   *  because nothing measured under one ruleset is valid under another. */
  readonly rulesId: string;

  /** This game's shipped `DEFAULT_WEIGHTS` — the gauntlet's baseline. */
  readonly defaultWeights: Weights;
  /** Named candidate overrides available for this game's `cand` mode. */
  candidateTerms(): string[];
  /** A named candidate's weights, or undefined if this game has no such term. */
  candidate(term: string): Weights | undefined;
  /** `defaultWeights` with a JSON object of overrides merged over it. Throws
   *  with a readable message on a key this game's weights do not have. */
  weightsFromJson(json: string): Weights;

  /** The standard opening position for this game's ruleset. */
  initialState(): GameState;
  legalMoves(s: GameState): Move[];
  apply(s: GameState, m: Move): GameState;
  isOver(s: GameState): boolean;
  /** The result of a finished game; `null` if it is still playing. */
  winner(s: GameState): Side | "draw" | null;
  /** Board + side-to-move key, as the opening book and the TT hash it. */
  positionKey(s: GameState): string;

  /** Clear this game's transposition table. */
  resetSearch(): void;
  /** This game's shipped `FULL_CONFIG` — the gauntlet's default search config. */
  readonly defaultConfig: Config;
  /** `defaultConfig` with `usePVS` forced to `on`. Exists so a caller can
   *  compare PVS on vs off through `search`'s optional config param without
   *  ever reading or constructing a `SearchConfig` itself — see WP-2.0
   *  (docs/reports/pvs-tablut-copenhagen.md) for what it was built to measure. */
  pvsConfig(on: boolean): Config;
  /** A fixed-depth search with no time budget: the move this config plays.
   *  `config` defaults to `defaultConfig` when omitted. */
  search(s: GameState, maxDepth: number, rng: () => number, w: Weights, config?: Config): Move | null;
  /** Every root move within `margin` of the best at a fixed depth, exact
   *  scores, no deadline (the multi-PV query `shallowN` openings use). */
  nearBest(s: GameState, depth: number, margin: number): Move[];

  /** Whether this game ships an opening book at all (Brandubh only). */
  readonly hasBook: boolean;
  /** The book's stored replies for a position: `[]` when the position is not
   *  in the book, `null` when this game has no book to consult. */
  bookReplies(s: GameState): Move[] | null;

  /** The opening scheme this game defaults to when none is named on the
   *  command line: `book2` where a book exists, `shallow2` where none does. */
  readonly defaultOpening: string;
}
