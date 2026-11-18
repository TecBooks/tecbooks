import { useCallback, useEffect, useRef, useState } from "react";
import { runFeasibilityMonteCarlo } from "@/sims/project-feasibility/montecarlo/runMonteCarlo.js";

const IDLE = { status: "idle", progress: 0, result: null, error: null };

/**
 * Runs the Project Feasibility Monte Carlo in a Web Worker and exposes
 * { status, progress, result, error, run, cancel, reset }. Client-only compute
 * (no HTTP), so no TanStack query - the input is the same cached
 * `['feasibility-model', gameId]` CBM the other tabs already use.
 *
 * Falls back to running on the main thread when Worker isn't available.
 */
export default function useMonteCarlo() {
  const [state, setState] = useState(IDLE);
  const workerRef = useRef(null);

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => terminate, [terminate]);

  const run = useCallback(
    (params) => {
      terminate();
      setState({ status: "running", progress: 0, result: null, error: null });

      if (typeof Worker === "undefined") {
        setTimeout(() => {
          try {
            setState({ ...IDLE, status: "done", progress: 1, result: runFeasibilityMonteCarlo(params) });
          } catch (error) {
            setState({ ...IDLE, status: "error", error: error.message });
          }
        }, 0);
        return;
      }

      const worker = new Worker(
        new URL("../../../sims/project-feasibility/montecarlo/montecarlo.worker.js", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") {
          setState((prev) => ({ ...prev, progress: data.done / data.total }));
          return;
        }
        if (data.type === "result") {
          setState({ ...IDLE, status: "done", progress: 1, result: data.result });
        } else {
          setState({ ...IDLE, status: "error", error: data.message });
        }
        terminate();
      };
      worker.onerror = (event) => {
        setState({ ...IDLE, status: "error", error: event.message || "The simulation worker crashed." });
        terminate();
      };
      worker.postMessage(params);
    },
    [terminate],
  );

  const cancel = useCallback(() => {
    terminate();
    setState((prev) => (prev.status === "running" ? IDLE : prev));
  }, [terminate]);

  const reset = useCallback(() => {
    terminate();
    setState(IDLE);
  }, [terminate]);

  return { ...state, run, cancel, reset };
}
