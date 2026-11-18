import { createRng } from "./random.js";
import { centralValue, validateDistribution } from "./distributions.js";
import { correlationMatrixFromPairs, sampleInputs } from "./sampling.js";
import {
  empiricalCdf,
  histogram,
  percentileSorted,
  proportionStandardError,
  sensitivity,
  summarize,
} from "./statistics.js";
import {
  FEASIBILITY_VARIABLES,
  createFeasibilityEvaluator,
} from "./feasibilityModel.js";

export const MIN_SIMULATIONS = 100;
export const MAX_SIMULATIONS = 20000;
const CONVERGENCE_CHECKPOINTS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

/**
 * Generic Monte Carlo loop - JS port of montecarlo_tecbooks.py
 * `run_montecarlo`. Model-agnostic: `evaluate(draw)` is the existing
 * financial model wrapped by an adapter (see feasibilityModel.js) and must
 * return `{ cashFlows: number[], npv, irr, trema, accepted }` or null when
 * that draw can't be evaluated.
 *
 * Runs synchronously - call it from a Web Worker (montecarlo.worker.js)
 * so the page stays responsive.
 */
export function runMonteCarlo({
  variables,
  evaluate,
  n = 2000,
  seed = 42,
  correlations = [],
  bins = 40,
  years = [],
  onProgress,
}) {
  const started = Date.now();
  const total = Math.round(n);
  if (!(total >= MIN_SIMULATIONS && total <= MAX_SIMULATIONS)) {
    throw new Error(`Number of simulations must be between ${MIN_SIMULATIONS} and ${MAX_SIMULATIONS}.`);
  }
  for (const variable of variables) {
    const error = validateDistribution(variable.dist, variable.params);
    if (error) throw new Error(`${variable.label ?? variable.name}: ${error}`);
  }

  const names = variables.map((variable) => variable.name);
  const correlation = correlationMatrixFromPairs(names, correlations);
  const rng = createRng(seed);
  const samples = sampleInputs(variables, total, rng, correlation);

  // Deterministic reference: every input at its central value. With the
  // default (mode = base) settings this is exactly today's single-number
  // VNA/TIR, so the UI can contrast f(E[X]) with E[f(X)] (PDF eq. 1).
  const centralDraw = Object.fromEntries(
    variables.map((variable) => [variable.name, centralValue(variable.dist, variable.params)]),
  );
  const deterministic = evaluate(centralDraw);
  if (!deterministic) {
    throw new Error("The financial model couldn't evaluate this project (missing cash flow data).");
  }

  const horizon = deterministic.cashFlows.length;
  const npv = new Float64Array(total).fill(NaN);
  const irr = new Float64Array(total).fill(NaN);
  const accepted = new Uint8Array(total);
  const cashFlowsByYear = Array.from({ length: horizon }, () => new Float64Array(total).fill(NaN));
  let failures = 0;
  const progressStep = Math.max(1, Math.floor(total / 20));

  for (let k = 0; k < total; k += 1) {
    const draw = {};
    for (const name of names) draw[name] = samples[name][k];
    const result = evaluate(draw);
    if (!result || !Number.isFinite(result.npv)) {
      failures += 1;
    } else {
      npv[k] = result.npv;
      irr[k] = result.irr === null ? NaN : result.irr;
      accepted[k] = result.accepted ? 1 : 0;
      for (let t = 0; t < horizon; t += 1) cashFlowsByYear[t][k] = result.cashFlows[t];
    }
    if (onProgress && (k + 1) % progressStep === 0) onProgress(k + 1, total);
  }

  const valid = total - failures;
  const feasibleCount = accepted.reduce((sum, value) => sum + value, 0);
  const probabilityFeasible = valid > 0 ? feasibleCount / valid : NaN;

  // Convergence of P(VNA < 0) with N (last chart of PDF Figure 6).
  const convergence = [];
  let negatives = 0;
  let seen = 0;
  const checkpoints = new Set([...CONVERGENCE_CHECKPOINTS.filter((c) => c < total), total]);
  for (let k = 0; k < total; k += 1) {
    if (Number.isFinite(npv[k])) {
      seen += 1;
      if (npv[k] < 0) negatives += 1;
    }
    if (checkpoints.has(k + 1) && seen > 0) {
      const p = negatives / seen;
      const halfWidth = 1.96 * proportionStandardError(p, seen);
      convergence.push({ n: k + 1, p, low: Math.max(0, p - halfWidth), high: Math.min(1, p + halfWidth) });
    }
  }

  const bands = cashFlowsByYear.map((column) => {
    const sorted = Array.from(column).filter(Number.isFinite).sort((a, b) => a - b);
    const mean = sorted.reduce((sum, v) => sum + v, 0) / (sorted.length || 1);
    return {
      mean,
      p5: percentileSorted(sorted, 5),
      p50: percentileSorted(sorted, 50),
      p95: percentileSorted(sorted, 95),
    };
  });

  const labels = Object.fromEntries(variables.map((v) => [v.name, v.label ?? v.name]));

  return {
    meta: {
      n: total,
      valid,
      failures,
      seed: rng.seed,
      correlated: correlation !== null,
      durationMs: Date.now() - started,
    },
    deterministic: {
      npv: deterministic.npv,
      irr: deterministic.irr,
      trema: deterministic.trema,
      accepted: deterministic.accepted,
    },
    probabilityFeasible,
    probabilityFeasibleSE: proportionStandardError(probabilityFeasible, valid),
    kpis: {
      npv: summarize(npv, 0),
      irr: summarize(irr, deterministic.trema),
    },
    histogramNpv: histogram(npv, bins),
    cdfNpv: empiricalCdf(npv),
    tornadoNpv: sensitivity(samples, npv).map((row) => ({ ...row, label: labels[row.variable] })),
    cashFlowBands: { years: deterministic.years ?? years, ...transpose(bands) },
    convergence,
  };
}

function transpose(bands) {
  return {
    mean: bands.map((b) => b.mean),
    p5: bands.map((b) => b.p5),
    p50: bands.map((b) => b.p50),
    p95: bands.map((b) => b.p95),
  };
}

/**
 * Project Feasibility entry point: the generic engine wired to the
 * existing TREMA/TIR/VNA model through the CBM adapter.
 */
export function runFeasibilityMonteCarlo({
  cbm,
  baseTrema,
  variables = FEASIBILITY_VARIABLES,
  ...options
}) {
  const evaluate = createFeasibilityEvaluator(cbm, baseTrema);
  return runMonteCarlo({ variables, evaluate, ...options });
}
