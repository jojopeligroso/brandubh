// Runs the AI search off the main thread so `hard`'s ~1.5s budget never freezes
// the board. Bundled into the static build by Vite (`new Worker(new URL(...))`),
// so it ships and runs 100% offline — no network, no backend.
import { chooseMoveDetailed, type Difficulty } from "./ai";
import type { GameState, Move } from "./types";
import type { RuleSet } from "./variants";

export interface AiRequest {
  id: number;
  state: GameState;
  difficulty: Difficulty;
  rules: RuleSet;
}
export interface AiResponse {
  id: number;
  move: Move | null;
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
  const { id, state, difficulty, rules } = e.data;
  // GameState / RuleSet / Move are plain data, so they cross the worker boundary
  // by structured clone with no special handling.
  const info = chooseMoveDetailed(state, difficulty, rules);
  ctx.postMessage({ id, move: info.move, depth: info.depth, nodes: info.nodes, elapsedMs: info.elapsedMs });
};
