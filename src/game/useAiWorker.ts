import { useCallback, useEffect, useRef } from "react";
import { chooseMoveDetailed, type Difficulty } from "./ai";
import type { GameState } from "./types";
import type { RuleSet } from "./variants";
import type { AiRequest, AiResponse } from "./ai.worker";

/** What a move request resolves to: the chosen move plus the search stats behind
 *  it (depth/nodes/elapsed), so the caller can both play the move and show what
 *  the engine actually reached on this device. */
export type AiMove = Omit<AiResponse, "id">;

/**
 * Runs AI move selection in a Web Worker so a long `hard` search never blocks the
 * board. Everything stays offline — Vite bundles the worker into the static build.
 *
 * `requestMove` hard-cancels any in-flight search (terminating the worker and
 * spinning up a fresh one) before starting the next, so a quick undo or a rapid
 * sequence of positions never waits behind a stale computation. Falls back to a
 * synchronous search if Workers are unavailable.
 */
export function useAiWorker(): {
  requestMove: (state: GameState, difficulty: Difficulty, rules: RuleSet) => Promise<AiMove>;
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

  const requestMove = useCallback(
    (state: GameState, difficulty: Difficulty, rules: RuleSet): Promise<AiMove> => {
      // No worker support (very old / non-DOM env): search synchronously.
      if (!supported) return Promise.resolve(chooseMoveDetailed(state, difficulty, rules));

      // Terminating mid-search is the only way to truly abort the synchronous
      // search inside the worker, so replace it with a fresh one each request.
      if (busyRef.current) kill();
      const worker = workerRef.current ?? spawn();
      busyRef.current = true;
      const id = ++reqId.current;

      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent<AiResponse>) => {
          if (e.data.id !== id) return; // ignore anything but this request
          worker.removeEventListener("message", onMessage);
          busyRef.current = false;
          const { id: _id, ...move } = e.data;
          resolve(move);
        };
        worker.addEventListener("message", onMessage);
        worker.postMessage({ id, state, difficulty, rules } satisfies AiRequest);
      });
    },
    [supported, kill, spawn],
  );

  // Tear the worker down with the component.
  useEffect(() => kill, [kill]);

  return { requestMove, cancel: kill };
}
