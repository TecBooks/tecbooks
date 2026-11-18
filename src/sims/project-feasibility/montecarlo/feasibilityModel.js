import { computeCashBalanceByYear } from "../costTable/cashFlowCalculations.js";
import {
  computeIRR,
  computeNPV,
  computeTrema,
  decideProject,
} from "@/utils/dashboard/financialEvaluation";
import { yearMapFromSeries } from "../costTable/cbmToCostTableInputs.js";

/**
 * Monte Carlo <-> Project Feasibility adapter. The ONLY file of the Monte
 * Carlo feature that knows the CBM shape. The engine (runMonteCarlo.js)
 * only sees `evaluate(draw) -> { cashFlows, npv, irr, accepted }`.
 *
 * Technical debt note: this reuses the fat CBM from
 * `GET /api/feasibility/:gameId` (see .agents/technical-debt.md) because
 * that is what the existing VNA/TIR calculation runs on. When the Cash
 * Flow tab moves to its own `['cash-flow', gameId]` payload, only
 * `applyShocks` + `projectCashFlowSeries` here need to change.
 *
 * Every uncertain input is a shock RELATIVE to the uploaded project, so
 * the student only answers "how wrong could this number be?":
 *   - kind 'factor': multiplier on the base value (1 = as uploaded)
 *   - kind 'delta':  additive shift, in rate units (0 = as uploaded)
 */
export const FEASIBILITY_VARIABLES = [
  {
    name: "demandVolume",
    label: "Demand volume (COs)",
    kind: "factor",
    description: "Purchase orders per year - year zero, history and every projected/real yearly total.",
    dist: "triangular",
    params: { low: 0.85, mode: 1, high: 1.1 },
  },
  {
    name: "demandGrowth",
    label: "Demand growth",
    kind: "delta",
    description:
      "Shift on Premisas demand growth. Only moves years the COs sheet doesn't already give as real totals.",
    dist: "pert",
    params: { low: -0.03, mode: 0, high: 0.02 },
  },
  {
    name: "salePrice",
    label: "Sale price",
    kind: "factor",
    description: "BOM sale price per unit (still grown by national inflation every year).",
    dist: "triangular",
    params: { low: 0.92, mode: 1, high: 1.05 },
  },
  {
    name: "materialCost",
    label: "Raw material cost",
    kind: "factor",
    description: "BOM material cost per unit.",
    dist: "triangular",
    params: { low: 0.95, mode: 1, high: 1.2 },
  },
  {
    name: "laborCost",
    label: "Labor cost",
    kind: "factor",
    description: "Integrated salary (salario integrado) of every employee.",
    dist: "triangular",
    params: { low: 0.97, mode: 1, high: 1.1 },
  },
  {
    name: "overhead",
    label: "Services / overhead",
    kind: "factor",
    description: "Monthly amount of every Servicios line (general administrative expenses).",
    dist: "triangular",
    params: { low: 0.95, mode: 1, high: 1.15 },
  },
  {
    name: "investment",
    label: "Investment (CAPEX)",
    kind: "factor",
    description: "Acquisition cost of every Inversion asset and machine - captures cost overruns.",
    dist: "triangular",
    params: { low: 0.95, mode: 1, high: 1.3 },
  },
  {
    name: "discountRate",
    label: "TREMA",
    kind: "delta",
    description: "Shift on the discount rate (market rate + inflation + risk premium).",
    dist: "uniform",
    params: { low: -0.02, high: 0.02 },
  },
];

/** Pairs offered in the UI. rho = 0 means "independent" (the default). */
export const DEFAULT_CORRELATIONS = [
  { a: "demandVolume", b: "salePrice", rho: 0 },
  { a: "demandVolume", b: "demandGrowth", rho: 0 },
  { a: "materialCost", b: "laborCost", rho: 0 },
];

export function neutralValue(kind) {
  return kind === "factor" ? 1 : 0;
}

const scale = (value, factor) =>
  typeof value === "number" && Number.isFinite(value) ? value * factor : value;

/**
 * Copy-on-write clone of only the branches a shock touches - everything
 * else is shared read-only with the base CBM (the calculators never mutate
 * their input). Asset items are cloned through a Map so items the mapper
 * shares between `assets.byCategory` and the legacy buckets stay shared
 * (and get scaled exactly once).
 */
export function applyShocks(baseCbm, draw) {
  const f = (name) => (Number.isFinite(draw[name]) ? draw[name] : 1);
  const d = (name) => (Number.isFinite(draw[name]) ? draw[name] : 0);

  const demandFactor = f("demandVolume");
  const investmentFactor = f("investment");
  const laborFactor = f("laborCost");
  const overheadFactor = f("overhead");

  const demand = baseCbm.demand ?? {};
  const premises = baseCbm.premises ?? {};

  const clonedAssets = new Map();
  const scaleAsset = (item) => {
    if (!item || typeof item !== "object") return item;
    if (!clonedAssets.has(item)) {
      clonedAssets.set(item, {
        ...item,
        acquisitionByYear: Array.isArray(item.acquisitionByYear)
          ? item.acquisitionByYear.map((value) => scale(value, investmentFactor))
          : item.acquisitionByYear,
      });
    }
    return clonedAssets.get(item);
  };
  const scaleAssetList = (list) => (Array.isArray(list) ? list.map(scaleAsset) : list);

  const assets = baseCbm.assets ?? {};
  const byCategory = Object.fromEntries(
    Object.entries(assets.byCategory ?? {}).map(([category, list]) => [category, scaleAssetList(list)]),
  );

  return {
    ...baseCbm,
    premises: {
      ...premises,
      demandGrowth: (Number.isFinite(premises.demandGrowth) ? premises.demandGrowth : 0) + d("demandGrowth"),
    },
    demand: {
      ...demand,
      yearZeroTotal: scale(demand.yearZeroTotal, demandFactor),
      yearZeroOrders: (demand.yearZeroOrders ?? []).map((value) => scale(value, demandFactor)),
      history: (demand.history ?? []).map((row) => ({ ...row, total: scale(row.total, demandFactor) })),
      yearlyTotals: (demand.yearlyTotals ?? []).map((row) => ({ ...row, total: scale(row.total, demandFactor) })),
    },
    bom: { ...baseCbm.bom, salePrice: scale(baseCbm.bom?.salePrice, f("salePrice")) },
    derivedBase: {
      ...baseCbm.derivedBase,
      bomMaterialCost: scale(baseCbm.derivedBase?.bomMaterialCost, f("materialCost")),
      employees: (baseCbm.derivedBase?.employees ?? []).map((employee) => ({
        ...employee,
        salarioIntegrado: scale(employee.salarioIntegrado, laborFactor),
      })),
    },
    services: (baseCbm.services ?? []).map((service) => ({
      ...service,
      monthlyAmount: scale(service.monthlyAmount, overheadFactor),
    })),
    assets: {
      ...assets,
      byCategory,
      buildings: scaleAssetList(assets.buildings),
      transport: scaleAssetList(assets.transport),
      compute: scaleAssetList(assets.compute),
    },
    capacity: baseCbm.capacity
      ? { ...baseCbm.capacity, machines: scaleAssetList(baseCbm.capacity.machines) }
      : baseCbm.capacity,
  };
}

/**
 * The exact series the Cash Flows tab's TREMA / TIR / VNA panel
 * (ProjectEvaluationSummary) feeds to computeNPV/computeIRR, so a run with
 * every input at its base value reproduces that panel's numbers.
 */
export function projectCashFlowSeries(cbm) {
  const { endingBalanceByYear, years } = computeCashBalanceByYear(cbm);
  return { years, cashFlows: years.map((year) => endingBalanceByYear[year]) };
}

/** Same default TREMA ProjectEvaluationSummary loads: Premisas year-zero rates + risk premium. */
export function baseTremaInputs(cbm) {
  const { years } = projectCashFlowSeries(cbm);
  if (years.length === 0) return { marketRate: 0, inflation: 0 };
  const firstYear = years[0];
  return {
    marketRate: yearMapFromSeries(cbm.premises?.nationalLeadingRate, years)[firstYear] || 0,
    inflation: yearMapFromSeries(cbm.premises?.nationalInflation, years)[firstYear] || 0,
  };
}

/** Deterministic TREMA (RF-65), same formula as the Cash Flows panel. */
export function computeBaseTrema({ marketRate, inflation, riskPremium }) {
  return computeTrema(marketRate, inflation, riskPremium);
}

/**
 * Builds the `evaluate(draw)` function the engine calls N times.
 * @param {object} cbm base project (already through applyDerivedBase)
 * @param {number} baseTrema deterministic TREMA (decimal, 0.18 = 18%)
 */
export function createFeasibilityEvaluator(cbm, baseTrema) {
  return function evaluate(draw) {
    const shocked = applyShocks(cbm, draw);
    const { years, cashFlows } = projectCashFlowSeries(shocked);
    if (cashFlows.length === 0) return null;
    const trema = baseTrema + (Number.isFinite(draw.discountRate) ? draw.discountRate : 0);
    const npv = computeNPV(cashFlows, trema);
    const irr = computeIRR(cashFlows);
    const { accepted } = decideProject(npv, irr, trema);
    return { years, cashFlows, npv, irr, trema, accepted };
  };
}
