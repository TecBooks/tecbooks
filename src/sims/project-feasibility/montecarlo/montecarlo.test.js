import { describe, it, expect } from "vitest";
import { createRng } from "./random.js";
import { sampleVariable, validateDistribution } from "./distributions.js";
import { cholesky, correlationMatrixFromPairs, sampleInputs } from "./sampling.js";
import { percentileSorted, sensitivity, spearman, summarize } from "./statistics.js";
import {
  FEASIBILITY_VARIABLES,
  applyShocks,
  baseTremaInputs,
  computeBaseTrema,
  projectCashFlowSeries,
} from "./feasibilityModel.js";
import { runFeasibilityMonteCarlo } from "./runMonteCarlo.js";
import { computeIRR, computeNPV, decideProject } from "@/utils/dashboard/financialEvaluation";
import { computeCashBalanceByYear } from "../costTable/cashFlowCalculations.js";
import { buildInput2Cbm } from "@/test-fixtures/input2GoldenCbm.js";

const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const N = 20000;

describe("Monte Carlo - distributions (PDF §4)", () => {
  it("same seed -> identical draws (reproducible for grading)", () => {
    const v = { name: "x", dist: "pert", params: { low: 0, mode: 2, high: 10 } };
    const a = sampleVariable(v, 100, createRng(7));
    const b = sampleVariable(v, 100, createRng(7));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("uniform / normal / triangular / PERT / lognormal hit their theoretical means", () => {
    const rng = createRng(1);
    const m = (dist, params) => mean(Array.from(sampleVariable({ name: "x", dist, params }, N, rng)));
    expect(m("uniform", { low: 0.08, high: 0.14 })).toBeCloseTo(0.11, 2);
    expect(m("normal", { mean: 95000, std: 14000 }) / 95000).toBeCloseTo(1, 2);
    expect(m("triangular", { low: 0.45, mode: 0.55, high: 0.7 })).toBeCloseTo((0.45 + 0.55 + 0.7) / 3, 2);
    // PERT mean = (a + 4m + b) / 6 (PDF eq. 10)
    expect(m("pert", { low: -0.02, mode: 0.05, high: 0.1 })).toBeCloseTo((-0.02 + 0.2 + 0.1) / 6, 2);
    expect(m("lognormal", { mean: 50, std: 20 }) / 50).toBeCloseTo(1, 1);
  });

  it("triangular / PERT never leave [low, high]", () => {
    const rng = createRng(3);
    for (const dist of ["triangular", "pert"]) {
      const xs = sampleVariable({ name: "x", dist, params: { low: 0.9, mode: 1, high: 1.3 } }, 5000, rng);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.9);
      expect(Math.max(...xs)).toBeLessThanOrEqual(1.3);
    }
  });

  it("rejects invalid parameters with a readable message", () => {
    expect(validateDistribution("triangular", { low: 1, mode: 3, high: 2 })).toMatch(/mode/);
    expect(validateDistribution("uniform", { low: 2, high: 1 })).toMatch(/greater/);
    expect(validateDistribution("lognormal", { mean: 0, std: 1 })).toMatch(/> 0/);
    expect(validateDistribution("nope", {})).toMatch(/Unsupported/);
    expect(validateDistribution("pert", { low: 0, mode: 1, high: 2 })).toBeNull();
  });
});

describe("Monte Carlo - correlation (PDF §5, Iman-Conover)", () => {
  it("imposes the requested rank correlation and keeps every marginal intact", () => {
    const variables = [
      { name: "revenue", dist: "normal", params: { mean: 95000, std: 14000 } },
      { name: "growth", dist: "pert", params: { low: -0.02, mode: 0.05, high: 0.1 } },
    ];
    const independent = sampleInputs(variables, N, createRng(1));
    const corr = correlationMatrixFromPairs(["revenue", "growth"], [{ a: "revenue", b: "growth", rho: 0.4 }]);
    const correlated = sampleInputs(variables, N, createRng(1), corr);

    expect(Math.abs(spearman(independent.revenue, independent.growth))).toBeLessThan(0.05);
    expect(spearman(correlated.revenue, correlated.growth)).toBeCloseTo(0.4, 1);
    // Same values, only re-paired.
    const sorted = (xs) => Array.from(xs).sort((a, b) => a - b);
    expect(sorted(correlated.revenue)).toEqual(sorted(independent.revenue));
  });

  it("all-zero pairs -> null matrix (independence assumed)", () => {
    expect(correlationMatrixFromPairs(["a", "b"], [{ a: "a", b: "b", rho: 0 }])).toBeNull();
  });

  it("an impossible correlation set fails loudly", () => {
    const m = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    expect(() => cholesky(m)).toThrow(/positive definite/);
  });
});

describe("Monte Carlo - statistics (PDF eq. 4, 5, 9, 13)", () => {
  it("summarize: percentiles, P(Y<0), VaR5 / CVaR5, ignores nulls", () => {
    const values = [...Array.from({ length: 100 }, (_, i) => i - 20), NaN, null];
    const s = summarize(values, 0);
    expect(s.nValid).toBe(100);
    expect(s.probBelowThreshold).toBeCloseTo(0.2, 10);
    expect(s.p50).toBeCloseTo(29.5, 10);
    expect(s.var5).toBeCloseTo(percentileSorted(values.slice(0, 100), 5), 10);
    expect(s.cvar5).toBeLessThanOrEqual(s.var5);
    expect(s.probBelowThresholdSE).toBeCloseTo(Math.sqrt((0.2 * 0.8) / 100), 10);
  });

  it("sensitivity ranks the driving input first and skips fixed inputs", () => {
    const rng = createRng(5);
    const a = sampleVariable({ name: "a", dist: "normal", params: { mean: 0, std: 1 } }, 2000, rng);
    const b = sampleVariable({ name: "b", dist: "normal", params: { mean: 0, std: 1 } }, 2000, rng);
    const c = new Float64Array(2000).fill(1);
    const y = a.map((v, i) => 5 * v + b[i]);
    const rows = sensitivity({ a, b, c }, y);
    expect(rows.map((r) => r.variable)).toEqual(["a", "b"]);
    expect(rows[0].spearman).toBeGreaterThan(0.9);
    expect(rows.reduce((s, r) => s + r.contribution, 0)).toBeCloseTo(1, 10);
  });
});

describe("Monte Carlo - Project Feasibility adapter (Input_2 golden cbm)", () => {
  const cbm = buildInput2Cbm();
  const { marketRate, inflation } = baseTremaInputs(cbm);
  const trema = computeBaseTrema({ marketRate, inflation, riskPremium: 0.1 });

  it("neutral shocks reproduce the existing Cash Flows TREMA / TIR / VNA panel exactly", () => {
    const expectedSeries = Object.values(computeCashBalanceByYear(cbm).endingBalanceByYear);
    const neutral = applyShocks(cbm, {});
    expect(projectCashFlowSeries(neutral).cashFlows).toEqual(expectedSeries);

    const fixed = FEASIBILITY_VARIABLES.map((v) => ({
      ...v,
      dist: "fixed",
      params: { value: v.kind === "factor" ? 1 : 0 },
    }));
    const result = runFeasibilityMonteCarlo({ cbm, baseTrema: trema, variables: fixed, n: 100, seed: 1 });
    const npv = computeNPV(expectedSeries, trema);
    const irr = computeIRR(expectedSeries);
    expect(result.deterministic.npv).toBeCloseTo(npv, 6);
    expect(result.kpis.npv.mean).toBeCloseTo(npv, 6);
    expect(result.kpis.npv.std).toBeCloseTo(0, 6);
    expect(result.deterministic.accepted).toBe(decideProject(npv, irr, trema).accepted);
    expect(result.tornadoNpv).toEqual([]);
  });

  it("does not mutate the base project", () => {
    const before = JSON.stringify(cbm);
    runFeasibilityMonteCarlo({ cbm, baseTrema: trema, n: 200, seed: 2 });
    expect(JSON.stringify(cbm)).toBe(before);
  });

  it("shocks move the model the expected way", () => {
    const series = (draw) => projectCashFlowSeries(applyShocks(cbm, draw)).cashFlows;
    const npvOf = (draw) => computeNPV(series(draw), trema);
    const base = npvOf({});
    expect(npvOf({ salePrice: 1.1 })).toBeGreaterThan(base);
    expect(npvOf({ demandVolume: 1.1 })).toBeGreaterThan(base);
    expect(npvOf({ materialCost: 1.2 })).toBeLessThan(base);
    expect(npvOf({ laborCost: 1.2 })).toBeLessThan(base);
    expect(npvOf({ overhead: 1.5 })).toBeLessThan(base);
    expect(npvOf({ investment: 1.3 })).not.toBeCloseTo(base, 0);
  });

  it("full run: reproducible, probabilities in [0,1], bands cover every year", () => {
    const a = runFeasibilityMonteCarlo({ cbm, baseTrema: trema, n: 500, seed: 11 });
    const b = runFeasibilityMonteCarlo({ cbm, baseTrema: trema, n: 500, seed: 11 });
    expect(a.kpis.npv.mean).toBe(b.kpis.npv.mean);
    expect(a.probabilityFeasible).toBe(b.probabilityFeasible);

    expect(a.meta.valid).toBe(500);
    expect(a.probabilityFeasible).toBeGreaterThanOrEqual(0);
    expect(a.probabilityFeasible).toBeLessThanOrEqual(1);
    expect(a.kpis.npv.p5).toBeLessThanOrEqual(a.kpis.npv.p50);
    expect(a.kpis.npv.p50).toBeLessThanOrEqual(a.kpis.npv.p95);
    expect(a.cashFlowBands.years.length).toBe(a.cashFlowBands.mean.length);
    expect(a.histogramNpv.counts.reduce((s, c) => s + c, 0)).toBe(500);
    expect(a.convergence.at(-1).n).toBe(500);
    // Sale price and demand are the biggest levers of this project's VNA.
    expect(["salePrice", "demandVolume", "materialCost"]).toContain(a.tornadoNpv[0].variable);
  });

  it("rejects an out-of-range number of simulations", () => {
    expect(() => runFeasibilityMonteCarlo({ cbm, baseTrema: trema, n: 10 })).toThrow(/between/);
  });
});
