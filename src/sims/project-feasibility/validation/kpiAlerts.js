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
  return rest > 0 ? `${shown}; y ${rest} año(s) más` : shown;
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
    title: `La demanda proyectada es hasta ${ratio(Math.max(...jumps.map((j) => j.r)))} el promedio histórico`,
    reasons: [
      `Histórico de COs: ${historyText} (promedio ${units(historyAvg)} unidades/año).`,
      `Años que pasan de ${ratio(thresholds.demandJumpRatio)} ese promedio: ${listYears(
        jumps,
        (j) => `${j.year}: ${units(j.orders)} (${ratio(j.r)})`,
      )}.`,
      isNum(sales)
        ? `Ventas = unidades × precio: en ${first.year} las ventas netas suben a ${formatCurrency(sales, currency)}, y eso sube la TIR y el VNA.`
        : "Ventas = unidades × precio: más unidades suben directamente la TIR y el VNA.",
      "Revisa que esos totales sean unidades del producto y no otra escala o un error de captura.",
    ],
    source: "Hoja COs, columnas Histórico y Año Cero | Total",
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
    title: `Los totales de COs no siguen la Demanda Anual de ${pct(growth)}`,
    reasons: [
      `Con la Demanda Anual de ${pct(growth)} (Premisas), ${first.year} daría ${units(first.proj)} unidades, pero COs trae ${units(first.total)} (${first.gap > 0 ? "+" : ""}${pct(first.gap)}).`,
      `Años que se separan más de ${pct(thresholds.demandGrowthTolerance)} de la proyección: ${listYears(
        gaps,
        (g) => `${g.year}: ${units(g.total)} vs ${units(g.proj)}`,
      )}.`,
      "Cuando COs trae un total para un año, la app usa ese total y no aplica la tasa de crecimiento. Por eso la Demanda Anual no tiene efecto en esos años.",
    ],
    source: "Hoja COs (Año Cero | Total) y Premisas (Demanda Anual)",
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
    title: `La demanda supera la capacidad anual en ${over.length} año(s)`,
    reasons: [
      `Demanda contra capacidad: ${listYears(
        over,
        (o) => `${o.year}: ${units(o.orders)} vs ${units(o.capacity)} (${pct(o.orders / o.capacity)})`,
      )}.`,
      "La capacidad sale de la hoja Capacidad: unidades por hora × horas por turno × turnos × líneas × días × semanas × meses.",
      "La app no limita las ventas a la capacidad: vende todas las unidades de la demanda aunque la planta no pueda producirlas, así que las ventas de esos años están sobreestimadas.",
    ],
    source: "Hojas Capacidad y COs",
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
      `El flujo de ${y0} es ${formatCurrency(flowByYear[y0], currency)} y el de ${y1} es ${formatCurrency(flowByYear[y1], currency)}. La TIR sale alta cuando el flujo negativo inicial es chico frente a los positivos que siguen.`,
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
      `El préstamo de ${y0} (${formatCurrency(loan, currency)}) cubre ${pct(loan / capex)} de la inversión de ese año (${formatCurrency(capex, currency)}). Como la plantilla lo cuenta como entrada, el año 0 casi no refleja la inversión.`,
    );
  }

  reasons.push(
    "El Flujo Neto de la plantilla es acumulado: cada año suma el saldo del anterior, así que una buena racha de ventas se arrastra a todos los años siguientes.",
  );

  if (otherAlerts.length > 0) {
    reasons.push(`Causas en los datos de entrada: ${otherAlerts.map((alert) => alert.title).join("; ")}.`);
  }

  return {
    id: "irr-over-limit",
    severity: "error",
    title: `La TIR (${pct(irr)}) pasa el límite de ${pct(thresholds.maxIrr)}`,
    reasons,
    source: "Tabla de flujo (Flujo Neto) y hojas de entrada",
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
