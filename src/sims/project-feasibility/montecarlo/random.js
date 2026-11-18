/**
 * Seeded pseudo-random generator for the Monte Carlo engine.
 *
 * Math.random() can't be seeded, and reproducibility is a requirement
 * (same inputs + same seed = same results, so a class can grade the same
 * exercise). mulberry32 is small, fast and good enough for simulation of
 * a few thousand draws - not for cryptography.
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} [seed] integer seed; omitted -> random seed (non-reproducible run)
 * @returns {{ uniform: () => number, normal: () => number, gamma: (shape: number) => number, beta: (a: number, b: number) => number }}
 */
export function createRng(seed) {
  const resolvedSeed = Number.isFinite(seed)
    ? Math.trunc(seed)
    : Math.floor(Math.random() * 2 ** 32);
  const next = mulberry32(resolvedSeed);
  let spareNormal = null;

  // (0, 1) - never exactly 0, so log(u) is always finite.
  const uniform = () => {
    let u = next();
    while (u === 0) u = next();
    return u;
  };

  // Box-Muller, caching the second value of each pair.
  const normal = () => {
    if (spareNormal !== null) {
      const value = spareNormal;
      spareNormal = null;
      return value;
    }
    const u1 = uniform();
    const u2 = uniform();
    const radius = Math.sqrt(-2 * Math.log(u1));
    spareNormal = radius * Math.sin(2 * Math.PI * u2);
    return radius * Math.cos(2 * Math.PI * u2);
  };

  // Marsaglia-Tsang. Shape < 1 uses the standard boost: G(a) = G(a+1)·U^(1/a).
  const gamma = (shape) => {
    if (shape < 1) return gamma(shape + 1) * uniform() ** (1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x;
      let v;
      do {
        x = normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = uniform();
      if (u < 1 - 0.0331 * x ** 4) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };

  const beta = (a, b) => {
    const x = gamma(a);
    const y = gamma(b);
    return x / (x + y);
  };

  return { seed: resolvedSeed, uniform, normal, gamma, beta };
}
