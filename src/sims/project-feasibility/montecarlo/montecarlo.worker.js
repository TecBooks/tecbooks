import { runFeasibilityMonteCarlo } from "./runMonteCarlo.js";

/**
 * Web Worker entry: runs the (synchronous) Monte Carlo loop off the main
 * thread so the dashboard never freezes. Message protocol:
 *   in:  { cbm, baseTrema, variables, n, seed, correlations }
 *   out: { type: 'progress', done, total } | { type: 'result', result } | { type: 'error', message }
 */
self.onmessage = (event) => {
  try {
    const result = runFeasibilityMonteCarlo({
      ...event.data,
      onProgress: (done, total) => self.postMessage({ type: "progress", done, total }),
    });
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message ?? String(error) });
  }
};
