/**
 * Input distributions for the Monte Carlo engine - JS port of
 * montecarlo_tecbooks.py `Variable.sample`. Same names and parameters so a
 * variable definition reads the same in both:
 *
 *   fixed      { value }
 *   uniform    { low, high }
 *   normal     { mean, std }
 *   lognormal  { mean, std }          (of the variable itself, not its log)
 *   triangular { low, mode, high }
 *   pert       { low, mode, high }    (Beta rescaled to [low, high], lambda = 4)
 */
export const DISTRIBUTIONS = {
  fixed: { label: "Fixed", params: ["value"] },
  uniform: { label: "Uniform", params: ["low", "high"] },
  normal: { label: "Normal", params: ["mean", "std"] },
  lognormal: { label: "Lognormal", params: ["mean", "std"] },
  triangular: { label: "Triangular", params: ["low", "mode", "high"] },
  pert: { label: "PERT", params: ["low", "mode", "high"] },
};

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Returns a human-readable error for invalid parameters, or null when OK.
 * Kept separate from sampling so the UI can validate before running.
 */
export function validateDistribution(dist, params = {}) {
  const spec = DISTRIBUTIONS[dist];
  if (!spec) return `Unsupported distribution: ${dist}`;
  const missing = spec.params.find((name) => !isNum(params[name]));
  if (missing) return `"${missing}" must be a number`;

  const { low, mode, high, std, mean } = params;
  switch (dist) {
    case "uniform":
      return high > low ? null : "high must be greater than low";
    case "normal":
      return std >= 0 ? null : "std must be >= 0";
    case "lognormal":
      if (mean <= 0) return "mean must be > 0 for a lognormal";
      return std >= 0 ? null : "std must be >= 0";
    case "triangular":
    case "pert":
      if (!(high > low)) return "high must be greater than low";
      return mode >= low && mode <= high ? null : "mode must be between low and high";
    default:
      return null;
  }
}

/**
 * Most likely / central value of a distribution - used to build the
 * deterministic reference run (every input at its "expected" setting).
 */
export function centralValue(dist, params) {
  switch (dist) {
    case "fixed":
      return params.value;
    case "uniform":
      return (params.low + params.high) / 2;
    case "normal":
    case "lognormal":
      return params.mean;
    default:
      return params.mode;
  }
}

/**
 * @param {{ name: string, dist: string, params: object }} variable
 * @param {number} n
 * @param {ReturnType<import('./random.js').createRng>} rng
 * @returns {Float64Array}
 */
export function sampleVariable(variable, n, rng) {
  const { dist, params } = variable;
  const error = validateDistribution(dist, params);
  if (error) throw new Error(`${variable.name}: ${error}`);

  const out = new Float64Array(n);
  switch (dist) {
    case "fixed":
      out.fill(params.value);
      return out;
    case "uniform": {
      const span = params.high - params.low;
      for (let i = 0; i < n; i += 1) out[i] = params.low + span * rng.uniform();
      return out;
    }
    case "normal":
      for (let i = 0; i < n; i += 1) out[i] = params.mean + params.std * rng.normal();
      return out;
    case "lognormal": {
      const { mean, std } = params;
      const sigma2 = Math.log(1 + (std / mean) ** 2);
      const mu = Math.log(mean) - sigma2 / 2;
      const sigma = Math.sqrt(sigma2);
      for (let i = 0; i < n; i += 1) out[i] = Math.exp(mu + sigma * rng.normal());
      return out;
    }
    case "triangular": {
      // Inverse CDF.
      const { low: a, mode: c, high: b } = params;
      const split = (c - a) / (b - a);
      for (let i = 0; i < n; i += 1) {
        const u = rng.uniform();
        out[i] =
          u < split
            ? a + Math.sqrt(u * (b - a) * (c - a))
            : b - Math.sqrt((1 - u) * (b - a) * (b - c));
      }
      return out;
    }
    case "pert": {
      const { low: a, mode: m, high: b } = params;
      const alpha = 1 + (4 * (m - a)) / (b - a);
      const beta = 1 + (4 * (b - m)) / (b - a);
      for (let i = 0; i < n; i += 1) out[i] = a + (b - a) * rng.beta(alpha, beta);
      return out;
    }
    default:
      throw new Error(`Unsupported distribution: ${dist}`);
  }
}
