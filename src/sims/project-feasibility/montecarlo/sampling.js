import { sampleVariable } from "./distributions.js";

/**
 * Cholesky factor L (lower triangular, Σ = L·Lᵀ). Throws when the matrix
 * isn't positive definite - an impossible set of correlations (e.g. A~B
 * +0.9, B~C +0.9, A~C -0.9) - so the UI can say so instead of silently
 * producing garbage (PDF §5).
 */
export function cholesky(matrix) {
  const k = matrix.length;
  const L = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i][j];
      for (let p = 0; p < j; p += 1) sum -= L[i][p] * L[j][p];
      if (i === j) {
        if (!(sum > 1e-12)) {
          throw new Error(
            "The correlation matrix is not positive definite - these correlations can't all hold at once.",
          );
        }
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Builds a k×k correlation matrix from pairwise entries
 * `[{ a: 'demandVolume', b: 'salePrice', rho: -0.3 }]`. Pairs naming a
 * variable that isn't in `names`, or with rho = 0, are ignored.
 */
export function correlationMatrixFromPairs(names, pairs = []) {
  const k = names.length;
  const matrix = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)),
  );
  let used = 0;
  for (const { a, b, rho } of pairs) {
    const i = names.indexOf(a);
    const j = names.indexOf(b);
    if (i < 0 || j < 0 || i === j || !Number.isFinite(rho) || rho === 0) continue;
    if (Math.abs(rho) >= 1) throw new Error("Correlations must be strictly between -1 and 1.");
    matrix[i][j] = rho;
    matrix[j][i] = rho;
    used += 1;
  }
  return used > 0 ? matrix : null;
}

/**
 * Draws N values per variable. With a correlation matrix, applies the
 * rank-reordering method the Python reference uses (Iman-Conover): sample
 * correlated standard normals z = ε·Lᵀ, then reorder each variable's own
 * draws to follow z's rank order. Every marginal distribution stays
 * exactly as defined - only how values pair up across variables changes.
 *
 * @returns {Record<string, Float64Array>}
 */
export function sampleInputs(variables, n, rng, correlation = null) {
  const columns = variables.map((variable) => sampleVariable(variable, n, rng));

  if (correlation) {
    const k = variables.length;
    if (correlation.length !== k || correlation.some((row) => row.length !== k)) {
      throw new Error("The correlation matrix must be k x k.");
    }
    const L = cholesky(correlation);
    const z = Array.from({ length: k }, () => new Float64Array(n));
    const eps = new Float64Array(k);
    for (let row = 0; row < n; row += 1) {
      for (let j = 0; j < k; j += 1) eps[j] = rng.normal();
      for (let j = 0; j < k; j += 1) {
        let value = 0;
        for (let p = 0; p <= j; p += 1) value += L[j][p] * eps[p];
        z[j][row] = value;
      }
    }
    for (let j = 0; j < k; j += 1) {
      const order = Array.from(z[j].keys()).sort((a, b) => z[j][a] - z[j][b]);
      const sortedValues = Float64Array.from(columns[j]).sort();
      const out = new Float64Array(n);
      order.forEach((index, rank) => {
        out[index] = sortedValues[rank];
      });
      columns[j] = out;
    }
  }

  return Object.fromEntries(variables.map((variable, j) => [variable.name, columns[j]]));
}
