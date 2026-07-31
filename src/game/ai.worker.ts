// Runs engine searches off the main thread so `hard`'s ~1.5s budget never freezes
// the board. Bundled into the static build by Vite (`new Worker(new URL(...))`),
// so it ships and runs 100% offline — no network, no backend.
//
// Two kinds of request share this one worker *module*, but never one worker
// *instance* — see `useAiWorker` (play) and `useAnalysisWorker` (analysis):
//
//   • "move"     — pick the AI's move at the tip of the live game.
//   • "analysis" — evaluate the position the user is *looking at*, shallowly,
//                  for the eval bar and the best-move arrow.
//
// Keeping them on separate threads is not just about latency. The transposition
// table is module-global (see ai.ts), so two searches in one worker would share
// it — and analysis searches with different weights (`attackerRecognizer` on),
// which would put entries scored under one evaluation function in front of a
// search using the other. Separate instances mean separate module state and so
// separate tables, with no cross-contamination to reason about.
import { ANALYSIS_DEEP_LIMITS, analysePosition, chooseMoveDetailed, type Difficulty } from "./ai";
import type { GameState, Move } from "./types";
import type { RuleSet } from "./variants";

/** Pick the AI's move for the live game. */
export interface AiMoveRequest {
  kind: "move";
  id: number;
  state: GameState;
  difficulty: Difficulty;
  rules: RuleSet;
}
/** Evaluate the viewed position for the analysis UI (read-only — never played). */
export interface AiAnalysisRequest {
  kind: "analysis";
  id: number;
  state: GameState;
  rules: RuleSet;
  /** Spend the "think harder" budget rather than the background one. */
  deep?: boolean;
}
export type AiRequest = AiMoveRequest | AiAnalysisRequest;

export interface AiResponse {
  id: number;
  move: Move | null;
  /** Attacker-positive position value — see `MoveInfo.score` in ai.ts. */
  score: number;
  /** The equal-best move set — see `SearchResult.bestMoves` in ai.ts. */
  bestMoves: Move[];
  /** Search stats for the on-screen readout (see App: AiInfoLine). */
  depth: number;
  nodes: number;
  elapsedMs: number;
}

// Minimal typing for the worker global so we don't have to add the `webworker`
// TS lib (which conflicts with the project's `DOM` lib). MessageEvent comes from
// the DOM lib and is fine to use here.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage: (message: AiResponse) => void;
};

ctx.onmessage = (e) => {
  const req = e.data;
  // GameState / RuleSet / Move are plain data, so they cross the worker boundary
  // by structured clone with no special handling.
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
