// Runs Copenhagen engine searches off the main thread so `hard`'s budget never
// freezes the board. Bundled into the static build by Vite
// (`new Worker(new URL(...))`), so it ships and runs 100% offline.
//
// A third separate worker *module*, not just a third instance, and it has to be:
// the transposition table is module state in `engine.ts`, and the three games'
// tables must never meet. They key positions by `hashBoard`, whose string is 50
// characters on a 7×7 board, 82 on a 9×9 one and 122 here, so a collision is not
// the hazard — sharing a table between three different evaluation functions is.
// Three modules means three tables, with nothing to reason about.
//
// As in both other games, the two *kinds* of request share this module but never
// one instance — see `useAiWorker` (play) and `useAnalysisWorker` (analysis) —
// because analysis searches with different weights (`attackerRecognizer` on) and
// would otherwise put entries scored under one evaluation function in front of a
// search using the other.
import {
  ANALYSIS_DEEP_LIMITS,
  analysePosition,
  chooseMoveDetailed,
  type Difficulty,
} from "./engine";
import type { GameState, Move } from "./types";
import type { CopenhagenRuleSet } from "./variants";

/** Pick the AI's move for the live game. */
export interface AiMoveRequest {
  kind: "move";
  id: number;
  state: GameState;
  difficulty: Difficulty;
  rules: CopenhagenRuleSet;
}
/** Evaluate the viewed position for the analysis UI (read-only — never played). */
export interface AiAnalysisRequest {
  kind: "analysis";
  id: number;
  state: GameState;
  rules: CopenhagenRuleSet;
  /** Spend the "think harder" budget rather than the background one. */
  deep?: boolean;
}
export type AiRequest = AiMoveRequest | AiAnalysisRequest;

export interface AiResponse {
  id: number;
  move: Move | null;
  /** Attacker-positive position value — see `MoveInfo.score` in engine.ts. */
  score: number;
  /** The equal-best move set — see `SearchResult.bestMoves` in engine.ts. */
  bestMoves: Move[];
  /** Search stats for the on-screen readout. */
  depth: number;
  nodes: number;
  elapsedMs: number;
}

// Minimal typing for the worker global, so the project does not have to add the
// `webworker` TS lib (which conflicts with its `DOM` lib).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage: (message: AiResponse) => void;
};

ctx.onmessage = (e) => {
  const req = e.data;
  // GameState / CopenhagenRuleSet / Move are plain data, so they cross the worker
  // boundary by structured clone with no special handling.
  const info =
    req.kind === "analysis"
      ? analysePosition(req.state, req.rules, req.deep ? ANALYSIS_DEEP_LIMITS : undefined)
      : chooseMoveDetailed(req.state, req.difficulty, req.rules);
  ctx.postMessage({
    id: req.id,
    move: info.move,
    score: info.score,
    bestMoves: info.bestMoves,
    depth: info.depth,
    nodes: info.nodes,
    elapsedMs: info.elapsedMs,
  });
};
