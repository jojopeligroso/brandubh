import { useCallback, useEffect, useRef } from "react";
import { ANALYSIS_DEEP_LIMITS, analysePosition, chooseMoveDetailed, type Difficulty } from "./engine";
import type { GameState } from "./types";
import type { MorrisRuleSet } from "./variants";
import type { AiAnalysisRequest, AiMoveRequest, AiRequest, AiResponse } from "./ai.worker";

/**
 * The Morris side's worker hooks — play and analysis, in one file because they are
 * the same twenty lines twice over and the reason they are *separate worker
 * instances* is the only interesting thing about either of them.
 *
 * The reason, unchanged from the three tafl games: cancelling a search means
 * *terminating its worker*, because the search inside is synchronous and there is
 * no other way to abort it. A shared instance would mean every cursor step could
 * kill the AI's in-flight move and every AI move could kill the analysis.
 * Separate instances also keep separate transposition tables (the table is module
 * state in `engine.ts`).
 *
 * The analysis hook is built and exported here even though no Morris screen
 * consumes it yet, for the same reason the Tablut and Copenhagen ones are: keeping
 * it beside its twin is what makes wiring it later a screen change rather than an
 * engine change.
 *
 * Both fall back to a synchronous search where Workers are unavailable. That does
 * block briefly; the alternative in such an environment is no AI at all. The
 * fallback deliberately plays *without* endgame tables even when a `dbBaseUrl` was
 * given — loading them is asynchronous, and a synchronous fallback that awaited a
 * fetch would be a frozen board rather than a quick move.
 */

/** What a request resolves to: the move, the score, and the search stats. */
export type AiMove = Omit<AiResponse, "id">;

/**
 * A request before the channel stamps its id on it.
 *
 * Written out per member rather than as `Omit<AiRequest, "id">`, because `Omit`
 * over a union is not distributive: it would collapse to the keys the two requests
 * share and silently reject `difficulty` and `deep`.
 */
type PendingRequest = Omit<AiMoveRequest, "id"> | Omit<AiAnalysisRequest, "id">;

/** One worker instance, spawned lazily and replaced rather than reused, plus the
 *  request/response plumbing both hooks below need. */
function useWorkerChannel(): {
  send: (req: PendingRequest) => Promise<AiMove>;
  cancel: () => void;
  supported: boolean;
} {
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const reqId = useRef(0);
  const supported = typeof Worker !== "undefined";

  const kill = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    busyRef.current = false;
  }, []);

  const send = useCallback(
    (req: PendingRequest): Promise<AiMove> => {
      // Terminating mid-search is the only way to truly abort the synchronous
      // search inside the worker, so replace it with a fresh one each request.
      if (busyRef.current) kill();
      const worker =
        workerRef.current ??
        (workerRef.current = new Worker(new URL("./ai.worker.ts", import.meta.url), {
          type: "module",
        }));
      busyRef.current = true;
      const id = ++reqId.current;

      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent<AiResponse>) => {
          if (e.data.id !== id) return; // ignore anything but this request
          worker.removeEventListener("message", onMessage);
          busyRef.current = false;
          const { id: _id, ...result } = e.data;
          resolve(result);
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ ...req, id } as AiRequest);
      });
    },
    [kill],
  );

  // Tear the worker down with the component.
  useEffect(() => kill, [kill]);

  return { send, cancel: kill, supported };
}

/** Runs Morris move selection off the main thread. `dbBaseUrl` is where the
 *  endgame tables live; omit it to play on search alone. */
export function useAiWorker(): {
  requestMove: (
    state: GameState,
    difficulty: Difficulty,
    rules: MorrisRuleSet,
    dbBaseUrl?: string,
  ) => Promise<AiMove>;
  cancel: () => void;
} {
  const { send, cancel, supported } = useWorkerChannel();
  const requestMove = useCallback(
    (
      state: GameState,
      difficulty: Difficulty,
      rules: MorrisRuleSet,
      dbBaseUrl?: string,
    ): Promise<AiMove> =>
      supported
        ? send({ kind: "move", state, difficulty, rules, ...(dbBaseUrl ? { dbBaseUrl } : {}) })
        : Promise.resolve(chooseMoveDetailed(state, difficulty, rules)),
    [send, supported],
  );
  return { requestMove, cancel };
}

/** Runs the background analysis search behind an eval bar and a best-move arrow,
 *  on its own thread. */
export function useAnalysisWorker(): {
  requestAnalysis: (
    state: GameState,
    rules: MorrisRuleSet,
    deep?: boolean,
    dbBaseUrl?: string,
  ) => Promise<AiMove>;
  cancel: () => void;
} {
  const { send, cancel, supported } = useWorkerChannel();
  const requestAnalysis = useCallback(
    (
      state: GameState,
      rules: MorrisRuleSet,
      deep = false,
      dbBaseUrl?: string,
    ): Promise<AiMove> =>
      supported
        ? send({ kind: "analysis", state, rules, deep, ...(dbBaseUrl ? { dbBaseUrl } : {}) })
        : Promise.resolve(analysePosition(state, rules, deep ? ANALYSIS_DEEP_LIMITS : undefined)),
    [send, supported],
  );
  return { requestAnalysis, cancel };
}
