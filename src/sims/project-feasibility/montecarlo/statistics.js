/**
 * Summary statistics for Monte Carlo outputs - JS port of
 * montecarlo_tecbooks.py `summarize`, `sensitivity`, histogram and CDF.
 * Every function ignores non-finite values (null IRR, NaN), the same way
 * the Python code drops simulations without a sign change instead of
 * inventing a number.
 */

export function finiteValues(values) {
  const out = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

/** numpy-style percentile (linear interpolation) on an ascending-sorted array. */
export function percentileSorted(sorted, p) {
  if (sorted.length === 0) return NaN;
  const position = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Standard error of an estimated proportion: sqrt(p(1-p)/N) (PDF eq. 5). */
export function proportionStandardError(p, n) {
  return n > 0 ? Math.sqrt((p * (1 - p)) / n) : NaN;
}

/**
 * mean, std, P5/P50/P95, P(Y < threshold), VaR5 = P5, CVaR5 = E[Y | Y <= P5]
 * (PDF eq. 9) plus standard errors for the mean and the probability.
 */
export function summarize(values, threshold = 0) {
  const ok = finiteValues(values);
  const n = ok.length;
  if (n === 0) return { nValid: 0 };

  const sorted = [...ok].sort((a, b) => a - b);
  const mean = ok.reduce((sum, v) => sum + v, 0) / n;
  const variance = n > 1 ? ok.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const p5 = percentileSorted(sorted, 5);
  const tail = sorted.filter((v) => v <= p5);
  const probBelow = ok.filter((v) => v < threshold).length / n;

  return {
    nValid: n,
    mean,
    std,
    min: sorted[0],
    max: sorted[n - 1],
    p5,
    p50: percentileSorted(sorted, 50),
    p95: percentileSorted(sorted, 95),
    probBelowThreshold: probBelow,
    probBelowThresholdSE: proportionStandardError(probBelow, n),
    meanSE: std / Math.sqrt(n),
    var5: p5,
    cvar5: tail.reduce((sum, v) => sum + v, 0) / tail.length,
  };
}

export function histogram(values, bins = 40) {
  const ok = finiteValues(values);
  if (ok.length === 0) return { counts: [], edges: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const v of ok) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    // Degenerate (every simulation gave the same value) - one bar.
    return { counts: [ok.length], edges: [min - 0.5, max + 0.5] };
  }
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of ok) {
    const index = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[index] += 1;
  }
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
  return { counts, edges };
}

/** Empirical CDF resampled to `points` evenly spaced probabilities. */
export function empiricalCdf(values, points = 200) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (sorted.length === 0) return { x: [], p: [] };
  const p = Array.from({ length: points }, (_, i) => i / (points - 1));
  return { x: p.map((q) => percentileSorted(sorted, q * 100)), p };
}

/** Ordinal ranks 0..n-1 (same as numpy argsort(argsort(a))). */
function ranks(values) {
  const order = Array.from(values.keys()).sort((i, j) => values[i] - values[j]);
  const out = new Float64Array(values.length);
  order.forEach((index, rank) => {
    out[index] = rank;
  });
  return out;
}

function pearson(x, y) {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

export function spearman(x, y) {
  return pearson(ranks(x), ranks(y));
}

/**
 * Tornado: Spearman rank correlation of every input against the output,
 * contribution = rho² normalised to 100% (PDF eq. 13). Constant inputs
 * (fixed distribution) are skipped - they explain nothing.
 *
 * @param {Record<string, ArrayLike<number>>} samples
 * @param {ArrayLike<number>} output
 */
export function sensitivity(samples, output) {
  const keep = [];
  for (let i = 0; i < output.length; i += 1) {
    if (Number.isFinite(output[i])) keep.push(i);
  }
  if (keep.length < 3) return [];
  const y = keep.map((i) => output[i]);

  const rows = [];
  for (const [name, column] of Object.entries(samples)) {
    const x = keep.map((i) => column[i]);
    const spread = Math.max(...x) - Math.min(...x);
    if (!(spread > 0)) continue;
    const rho = spearman(x, y);
    rows.push({ variable: name, spearman: rho, contribution: rho * rho });
  }
  const total = rows.reduce((sum, row) => sum + row.contribution, 0) || 1;
  rows.forEach((row) => {
    row.contribution /= total;
  });
  return rows.sort((a, b) => Math.abs(b.spearman) - Math.abs(a.spearman));
}
