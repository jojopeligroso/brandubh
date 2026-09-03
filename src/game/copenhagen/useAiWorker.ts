import { useCallback, useEffect, useRef } from "react";
import { analysePosition, chooseMoveDetailed, ANALYSIS_DEEP_LIMITS, type Difficulty } from "./engine";
import type { GameState } from "./types";
import type { CopenhagenRuleSet } from "./variants";
import type {
  AiAnalysisRequest,
  AiMoveRequest,
  AiRequest,
  AiResponse,
} from "./ai.worker";

/**
 * The Copenhagen side's worker hooks — play and analysis, in one file because
 * they are the same twenty lines twice over and the reason they are *separate
 * worker instances* is the only interesting thing about either of them.
 *
 * The analysis hook is built and exported here even though no Copenhagen screen
 * consumes it yet, for the same reason the Tablut one is: the surface ADR-0006
 * describes stops at play, and analysis is the shell feature both non-Brandubh
 * games are waiting on. Keeping the hook beside its twin is what makes wiring it
 * later a screen change rather than an engine change.
 *
 * The reason for separate instances, unchanged from `../useAiWorker.ts` /
 * `../useAnalysisWorker.ts`:
 * cancelling a search means *terminating its worker*, because the search inside
 * is synchronous and there is no other way to abort it. A shared instance would
 * mean every cursor step could kill the AI's in-flight move and every AI move
 * could kill the analysis. Separate instances also keep separate transposition
 * tables (the table is module state in `engine.ts`), which stops analysis's
 * different weights — `attackerRecognizer` on — from polluting the playing
 * engine's cache.
 *
 * Both fall back to a synchronous search where Workers are unavailable. That does
 * block briefly; the alternative in such an environment is no AI at all.
 */

/** What a request resolves to: the move, the score, and the search stats. */
export type AiMove = Omit<AiResponse, "id">;

/**
 * A request before the channel stamps its id on it.
 *
 * Written out per member rather than as `Omit<AiRequest, "id">`, because `Omit`
 * over a union is not distributive: it would collapse to the keys the two
 * requests share and silently reject `difficulty` and `deep`.
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

/** Runs Copenhagen move selection off the main thread. */
export function useAiWorker(): {
  requestMove: (state: GameState, difficulty: Difficulty, rules: CopenhagenRuleSet) => Promise<AiMove>;
  cancel: () => void;
} {
  const { send, cancel, supported } = useWorkerChannel();
  const requestMove = useCallback(
    (state: GameState, difficulty: Difficulty, rules: CopenhagenRuleSet): Promise<AiMove> =>
      supported
        ? send({ kind: "move", state, difficulty, rules })
        : Promise.resolve(chooseMoveDetailed(state, difficulty, rules)),
    [send, supported],
  );
  return { requestMove, cancel };
}

/** Runs the background analysis search behind the eval bar and the best-move
 *  arrow, on its own thread. */
export function useAnalysisWorker(): {
  requestAnalysis: (state: GameState, rules: CopenhagenRuleSet, deep?: boolean) => Promise<AiMove>;
  cancel: () => void;
} {
  const { send, cancel, supported } = useWorkerChannel();
  const requestAnalysis = useCallback(
    (state: GameState, rules: CopenhagenRuleSet, deep = false): Promise<AiMove> =>
      supported
        ? send({ kind: "analysis", state, rules, deep })
        : Promise.resolve(
            analysePosition(state, rules, deep ? ANALYSIS_DEEP_LIMITS : undefined),
          ),
    [send, supported],
  );
  return { requestAnalysis, cancel };
}
