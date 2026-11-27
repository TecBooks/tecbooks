import { HORIZON_YEARS } from "../constants.js";
import { cbmToCostTableInputs } from "../costTable/cbmToCostTableInputs.js";
import { buildCostOfSales } from "../costTable/buildCostOfSales.js";
import { computeCapexByYear, outflowBaseValue } from "../costTable/outflowCalculations.js";
import { projectPurchaseOrders } from "../demand/projectPurchaseOrders.js";
import formatCurrency from "@/utils/sims/program/formatCurrency.util";

/**
 * KPI sanity alerts. They do NOT change any calculation (TIR/VNA keep the
 * reference template's methodology); they explain WHY a KPI looks off,
 * pointing at the input that causes it. Every alert carries:
 *   id, severity ("warning" | "error"), title, reasons (string[]), source.
 */
export const KPI_ALERT_THRESHOLDS = {
  // Projected units vs average of the historical COs totals.
  demandJumpRatio: 2,
  // Captured COs total vs the "Demanda Anual" projection (relative gap).
  demandGrowthTolerance: 0.1,
  // TIR above this (1 = 100%) is flagged.
  maxIrr: 1,
};

const MAX_LISTED_YEARS = 3;
const CAPEX_OUTFLOW_KEYS = [
  "buildingPurchase",
  "civilWorks",
  "computerEquipment",
  "transportEquipment",
  "machineryPurchase",
];

const units = (value) =>
  Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const ratio = (value) => `${value.toFixed(1)}×`;
const isNum = (value) => typeof value === "number" && Number.isFinite(value);

function listYears(items, format) {
  const shown = items.slice(0, MAX_LISTED_YEARS).map(format).join("; ");
  const rest = items.length - MAX_LISTED_YEARS;
  return rest > 0 ? `${shown}; and ${rest} more year(s)` : shown;
}

function demandContext(cbm) {
  const { production } = cbmToCostTableInputs(cbm);
  const ordersByYear = production.purchaseOrders ?? {};
  const yearZeroYear = cbm?.demand?.yearZeroYear;
  const history = (cbm?.demand?.history ?? []).filter((row) => isNum(row?.total));
  const historyAvg = history.length
    ? history.reduce((sum, row) => sum + row.total, 0) / history.length
    : null;
  return { ordersByYear, yearZeroYear, history, historyAvg };
}

/** Rule 1: projected demand far above the historical COs. */
export function checkDemandJump(cbm, ctx, { netSalesByYear, currency }, thresholds) {
  const { ordersByYear, yearZeroYear, history, historyAvg } = ctx;
  if (!historyAvg || historyAvg <= 0 || yearZeroYear === undefined) return null;

  const jumps = Object.entries(ordersByYear)
    .map(([year, orders]) => ({ year: Number(year), orders, r: orders / historyAvg }))
    .filter(({ year, r }) => year > yearZeroYear && r > thresholds.demandJumpRatio)
    .sort((a, b) => a.year - b.year);
  if (jumps.length === 0) return null;

  const first = jumps[0];
  const historyText = history.map((row) => `${row.year}: ${units(row.total)}`).join(", ");
  const sales = netSalesByYear?.[first.year];
  return {
    id: "demand-jump",
    severity: "warning",
    title: `Projected demand is up to ${ratio(Math.max(...jumps.map((j) => j.r)))} the historical average`,
    reasons: [
      `COs history: ${historyText} (average ${units(historyAvg)} units/year).`,
      `Years above ${ratio(thresholds.demandJumpRatio)} that average: ${listYears(
        jumps,
        (j) => `${j.year}: ${units(j.orders)} (${ratio(j.r)})`,
      )}.`,
      isNum(sales)
        ? `Sales = units × price: in ${first.year} net sales rise to ${formatCurrency(sales, currency)}, which pushes TIR and VNA up.`
        : "Sales = units × price: more units push TIR and VNA up directly.",
      "Check that these totals are product units and not a different scale or a data-entry error.",
    ],
    source: "COs sheet, Histórico and Año Cero | Total columns",
  };
}

/** Rule 2: captured COs totals that don't follow Premisas' "Demanda Anual". */
export function checkDemandIgnoresGrowth(cbm, ctx, _metrics, thresholds) {
  const { yearZeroYear } = ctx;
  const growth = cbm?.premises?.demandGrowth;
  if (yearZeroYear === undefined || !isNum(growth)) return null;

  const projected = projectPurchaseOrders({
    yearZeroYear,
    yearZeroTotal: cbm.demand?.yearZeroTotal,
    yearZeroOrders: cbm.demand?.yearZeroOrders,
    monthShares: cbm.demand?.monthShares,
    history: cbm.demand?.history,
    demandGrowth: growth,
  });

  const gaps = (cbm.demand?.yearlyTotals ?? [])
    .filter(({ year, total }) => year > yearZeroYear && isNum(total) && projected[year] > 0)
    .map(({ year, total }) => ({ year, total, proj: projected[year], gap: total / projected[year] - 1 }))
    .filter(({ gap }) => Math.abs(gap) > thresholds.demandGrowthTolerance);
  if (gaps.length === 0) return null;

  const first = gaps[0];
  return {
    id: "demand-ignores-growth",
    severity: "warning",
    title: `COs totals don't follow the ${pct(growth)} annual demand growth`,
    reasons: [
      `With the ${pct(growth)} annual demand growth (Premisas), ${first.year} would be ${units(first.proj)} units, but COs has ${units(first.total)} (${first.gap > 0 ? "+" : ""}${pct(first.gap)}).`,
      `Years more than ${pct(thresholds.demandGrowthTolerance)} away from the projection: ${listYears(
        gaps,
        (g) => `${g.year}: ${units(g.total)} vs ${units(g.proj)}`,
      )}.`,
      "When COs has a total for a year, the app uses that total and does not apply the growth rate, so the annual demand growth has no effect on those years.",
    ],
    source: "COs sheet (Año Cero | Total) and Premisas (Demanda Anual)",
  };
}

/** Rule 3: demand above the line's annual capacity. */
export function checkDemandOverCapacity(cbm, ctx) {
  const capacityByYear = cbm?.derivedBase?.annualCapacityByYear;
  if (!Array.isArray(capacityByYear)) return null;

  const over = Object.entries(ctx.ordersByYear)
    .map(([year, orders]) => {
      const capacity = capacityByYear[HORIZON_YEARS.indexOf(Number(year))];
      return { year: Number(year), orders, capacity };
    })
    .filter(({ orders, capacity }) => isNum(capacity) && capacity > 0 && orders > capacity)
    .sort((a, b) => a.year - b.year);
  if (over.length === 0) return null;

  return {
    id: "demand-over-capacity",
    severity: "warning",
    title: `Demand exceeds annual capacity in ${over.length} year(s)`,
    reasons: [
      `Demand vs capacity: ${listYears(
        over,
        (o) => `${o.year}: ${units(o.orders)} vs ${units(o.capacity)} (${pct(o.orders / o.capacity)})`,
      )}.`,
      "Capacity comes from the Capacidad sheet: units per hour × hours per shift × shifts × lines × days × weeks × months.",
      "The app does not cap sales at capacity: it sells every unit of demand even if the plant can't produce it, so sales in those years are overstated.",
    ],
    source: "Capacidad and COs sheets",
  };
}

/** Rule 4: TIR above the limit, with the drivers that push it there. */
export function checkIrrOverLimit(cbm, _ctx, { irr, flowByYear, rowByYear, capexByYear, currency }, thresholds, otherAlerts) {
  if (!isNum(irr) || irr <= thresholds.maxIrr) return null;

  const years = Object.keys(flowByYear ?? {}).map(Number).sort((a, b) => a - b);
  const reasons = [];

  if (years.length >= 2) {
    const [y0, y1] = years;
    reasons.push(
      `The ${y0} cash flow is ${formatCurrency(flowByYear[y0], currency)} and the ${y1} cash flow is ${formatCurrency(flowByYear[y1], currency)}. TIR comes out high when the initial negative flow is small compared to the positive flows that follow.`,
    );
  }

  const y0 = years[0];
  const loan = rowByYear?.[y0]?.financingAmount ?? 0;
  const capex = CAPEX_OUTFLOW_KEYS.reduce(
    (sum, key) => sum + (outflowBaseValue(key, y0, rowByYear, capexByYear) ?? 0),
    0,
  );
  if (loan > 0 && capex > 0) {
    reasons.push(
      `The ${y0} loan (${formatCurrency(loan, currency)}) covers ${pct(loan / capex)} of that year's investment (${formatCurrency(capex, currency)}). Since the template counts it as an inflow, year 0 barely reflects the investment.`,
    );
  }

  reasons.push(
    "The template's Net Cash Flow is cumulative: each year adds the previous year's balance, so a strong sales run carries over into every following year.",
  );

  if (otherAlerts.length > 0) {
    reasons.push(`Causes in the input data: ${otherAlerts.map((alert) => alert.title).join("; ")}.`);
  }

  return {
    id: "irr-over-limit",
    severity: "error",
    title: `TIR (${pct(irr)}) is above the ${pct(thresholds.maxIrr)} limit`,
    reasons,
    source: "Cash flow table (Net Cash Flow) and input sheets",
  };
}

/**
 * @param {object} cbm project.cbm
 * @param {{ irr: number|null, flowByYear: Record<number, number>, currency?: string }} metrics
 *   flowByYear = the same series the TIR was computed on.
 */
export function buildKpiAlerts(cbm, metrics, thresholds = KPI_ALERT_THRESHOLDS) {
  const result = buildCostOfSales(cbm);
  if (result.error) return [];

  const rowByYear = Object.fromEntries(result.costOfSalesByYear.map((row) => [row.year, row]));
  const years = result.costOfSalesByYear.map((row) => row.year);
  const netSalesByYear = Object.fromEntries(
    result.costOfSalesByYear.map((row) => [row.year, row.netSales]),
  );
  const enriched = {
    ...metrics,
    rowByYear,
    netSalesByYear,
    capexByYear: computeCapexByYear(cbm, years),
  };
  const ctx = demandContext(cbm);

  const inputAlerts = [
    checkDemandJump(cbm, ctx, enriched, thresholds),
    checkDemandIgnoresGrowth(cbm, ctx, enriched, thresholds),
    checkDemandOverCapacity(cbm, ctx, enriched, thresholds),
  ].filter(Boolean);

  const irrAlert = checkIrrOverLimit(cbm, ctx, enriched, thresholds, inputAlerts);
  return irrAlert ? [irrAlert, ...inputAlerts] : inputAlerts;
}
