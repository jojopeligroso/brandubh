// ── Morris engine worker ──────────────────────────────────────────────────────
//
// Runs Morris engine searches off the main thread, so `hard`'s and `ollamh`'s
// budgets never freeze the board. Bundled into the static build by Vite
// (`new Worker(new URL(...))`), so it ships and runs 100% offline.
//
// A fourth separate worker *module*, not just a fourth instance, and for the same
// reason the other three are separate: the transposition table is module state in
// `engine.ts`, and four games' tables must never meet. Four modules means four
// tables, with nothing to reason about — and here the argument is stronger than
// elsewhere, because this engine's scores are mover-relative negamax values while
// the tafl engines' are attacker-positive, so a shared table would not merely be
// imprecise, it would be sign-confused.
//
// As in the other three games, the two *kinds* of request share this module but
// never one instance — see `useAiWorker` (play) and `useAnalysisWorker`
// (analysis) — because cancelling a search means terminating its worker, and a
// shared instance would let a cursor step kill the AI's move.
//
// ## The endgame-database hook
//
// `dbBaseUrl` is the one field the tafl workers have no analogue of. Gasser's
// retrograde tables are what make `ollamh` *perfect* once play reaches one, and
// they are files to be fetched rather than code to be bundled — so the probe is an
// argument to the engine rather than an import inside it, and a worker whose
// fetch fails (offline, an old deploy without the files, no gzip support) is a
// complete, working worker that plays on search alone.
//
// `probeFor` (db/probeFor.ts) owns the two decisions this file must not repeat:
// which tables the *current* stone counts can still reach (`tableKeysFor`, so a
// 9-v-9 opening does not pull the whole set — a side's stones only ever go down),
// and caching them in module state so a session pays for each file once. It is
// asked for `ollamh` only: the engine drops a probe on every other tier on
// purpose (`chooseMoveDetailed`), so fetching for them would be wasted bytes.
// Analysis requests get the same probe when a URL is supplied — a read-only
// evaluation of a solved position should say so.
//
// The handler is `async` because the fetch is; that is safe with `useAiWorker`'s
// protocol, which terminates a busy worker before sending a new request, so two
// replies can never race on one instance.
import { ANALYSIS_DEEP_LIMITS, analysePosition, chooseMoveDetailed, type Difficulty } from "./engine";
import type { GameState, Move } from "./types";
import type { MorrisRuleSet } from "./variants";
import { probeFor } from "./db/probeFor";

/** Pick the AI's move for the live game. */
export interface AiMoveRequest {
  kind: "move";
  id: number;
  state: GameState;
  difficulty: Difficulty;
  rules: MorrisRuleSet;
  /**
   * Where the endgame tables live — computed on the main thread as
   * `new URL("morris/db/", document.baseURI).href`, because a worker has no
   * `document` and guessing a path from `import.meta.url` would break under a
   * non-root base. Absent ⇒ play without tables.
   */
  dbBaseUrl?: string;
}
/** Evaluate the viewed position for the analysis UI (read-only — never played). */
export interface AiAnalysisRequest {
  kind: "analysis";
  id: number;
  state: GameState;
  rules: MorrisRuleSet;
  /** Spend the "think harder" budget rather than the background one. */
  deep?: boolean;
  dbBaseUrl?: string;
}
export type AiRequest = AiMoveRequest | AiAnalysisRequest;

export interface AiResponse {
  id: number;
  move: Move | null;
  /** Mover-relative position value — see `MoveInfo.score` in engine.ts. */
  score: number;
  /** The equal-best move set — see `SearchResult.bestMoves` in engine.ts. */
  bestMoves: Move[];
  /** Search stats for the on-screen readout. */
  depth: number;
  nodes: number;
  elapsedMs: number;
  /** True when the move came straight out of an endgame database, so the screen
   *  can say "perfect" rather than "best found". */
  fromDatabase?: boolean;
}

// Minimal typing for the worker global, so the project does not have to add the
// `webworker` TS lib (which conflicts with its `DOM` lib).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage: (message: AiResponse) => void;
};

ctx.onmessage = async (e) => {
  const req = e.data;
  // GameState / MorrisRuleSet / Move are plain data, so they cross the worker
  // boundary by structured clone with no special handling.
  const wantsTables = req.dbBaseUrl && (req.kind === "analysis" || req.difficulty === "ollamh");
  let probe = null;
  if (wantsTables && req.dbBaseUrl) {
    try {
      probe = await probeFor(req.dbBaseUrl, req.state);
    } catch {
      probe = null; // a broken fetch is "search it", never a lost move
    }
  }
  const info =
    req.kind === "analysis"
      ? analysePosition(
          req.state,
          req.rules,
          req.deep ? ANALYSIS_DEEP_LIMITS : undefined,
          undefined,
          probe ?? undefined,
        )
      : chooseMoveDetailed(req.state, req.difficulty, req.rules, Math.random, probe ?? undefined);
  ctx.postMessage({
    id: req.id,
    move: info.move,
    score: info.score,
    bestMoves: info.bestMoves,
    depth: info.depth,
    nodes: info.nodes,
    elapsedMs: info.elapsedMs,
    ...(info.fromDatabase ? { fromDatabase: true } : {}),
  });
};
