import { useCallback, useEffect, useRef } from "react";
import { ANALYSIS_DEEP_LIMITS, analysePosition } from "./engine";
import type { GameState } from "./types";
import type { RuleSet } from "./variants";
import type { AiRequest, AiResponse } from "./ai.worker";
import type { AiMove } from "./useAiWorker";

/**
 * The background analysis search behind the eval bar and the best-move arrow.
 *
 * **It runs in its own Worker instance**, deliberately, and that is the whole
 * point of this file existing beside `useAiWorker` rather than inside it. The
 * live game's search cancels by *terminating its worker* — the only way to
 * abort a synchronous search — so a shared instance would mean every cursor
 * step could kill the AI's in-flight move, and every AI move could kill the
 * analysis. Two instances make the two searches independent by construction:
 * they run on separate threads, cancel separately, and (since engine.ts's
 * transposition table is module-global) keep separate tables, which also stops
 * analysis's different weights from polluting the playing engine's cache.
 *
 * Stale analysis is hard-cancelled the same way `useAiWorker` cancels: the
 * worker is terminated and replaced. Stepping quickly through a game therefore
 * abandons the search for each position it passes through instead of queueing
 * them all up behind each other.
 *
 * Falls back to a synchronous search where Workers are unavailable — the same
 * fallback play uses. That does block, briefly; it is a depth-3 search, and the
 * alternative for such an environment is no analysis at all.
 */
export function useAnalysisWorker(): {
  requestAnalysis: (state: GameState, rules: RuleSet, deep?: boolean) => Promise<AiMove>;
  cancel: () => void;
} {
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const reqId = useRef(0);
  const supported = typeof Worker !== "undefined";

  const spawn = useCallback((): Worker => {
    const w = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return w;
  }, []);

  const kill = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    busyRef.current = false;
  }, []);

  const requestAnalysis = useCallback(
    (state: GameState, rules: RuleSet, deep = false): Promise<AiMove> => {
      if (!supported)
        return Promise.resolve(analysePosition(state, rules, deep ? ANALYSIS_DEEP_LIMITS : undefined));

      if (busyRef.current) kill();
      const worker = workerRef.current ?? spawn();
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
        worker.postMessage({ kind: "analysis", id, state, rules, deep } satisfies AiRequest);
      });
    },
    [supported, kill, spawn],
  );

  // Tear the worker down with the component. Analysis is a view feature, so a
  // hidden bar should not leave a thread searching behind it — App also calls
  // `cancel` when the feature is switched off.
  useEffect(() => kill, [kill]);

  return { requestAnalysis, cancel: kill };
}
