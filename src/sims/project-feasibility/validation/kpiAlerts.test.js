import { describe, it, expect } from "vitest";
import { buildKpiAlerts, KPI_ALERT_THRESHOLDS } from "./kpiAlerts.js";
import { computeCashBalanceByYear } from "../costTable/cashFlowCalculations.js";
import { computeIRR } from "@/utils/dashboard/financialEvaluation.js";
import { HORIZON_YEARS } from "../constants.js";
import { buildInput2Cbm } from "@/test-fixtures/input2GoldenCbm.js";
import { YEARS } from "@/test-fixtures/input2Golden.js";

// Same shape as the professor's Excel that produced TIR 114%: 66-70k units
// of history, Demanda Anual 9%, but COs columna I jumps to 243,907 in 2026,
// and 2035 capacity drops to 194,400 while demand keeps growing.
const PROFESSOR_TOTALS = [16000, 243907, 292688, 296502, 326152, 358767, 394644, 434109, 477520, 525272, 577798];

function professorLikeCbm() {
  const cbm = buildInput2Cbm();
  cbm.premises.demandGrowth = 0.09;
  cbm.demand.history = [
    { year: 2023, total: 70000 },
    { year: 2024, total: 66800 },
  ];
  cbm.demand.yearlyTotals = YEARS.map((year, i) => ({ year, total: PROFESSOR_TOTALS[i] }));
  cbm.derivedBase.annualCapacityByYear = HORIZON_YEARS.map((year) => (year === 2035 ? 194400 : 627097));
  return cbm;
}

function metricsFor(cbm, irrOverride) {
  const { endingBalanceByYear } = computeCashBalanceByYear(cbm);
  const irr = irrOverride ?? computeIRR(Object.values(endingBalanceByYear));
  return { irr, flowByYear: endingBalanceByYear, currency: "MXN" };
}

const byId = (alerts, id) => alerts.find((alert) => alert.id === id);

describe("KPI alerts - Input_2 sin anomalias", () => {
  it("no dispara ninguna alerta (TIR 97.6%, sin historico, sin capacidad, sin tasa)", () => {
    const cbm = buildInput2Cbm();
    // El fixture trae demandGrowth: 0 solo como relleno (sus totales vienen
    // completos de COs); sin tasa capturada la Regla 2 no tiene contra que comparar.
    delete cbm.premises.demandGrowth;
    expect(buildKpiAlerts(cbm, metricsFor(cbm))).toEqual([]);
  });

  it("Regla 2 si se dispara con tasa 0% capturada y totales que crecen", () => {
    const cbm = buildInput2Cbm();
    const alerts = buildKpiAlerts(cbm, metricsFor(cbm));
    expect(alerts.map((alert) => alert.id)).toEqual(["demand-ignores-growth"]);
  });

  it("regresa [] si el cbm no alcanza para calcular", () => {
    expect(buildKpiAlerts({}, { irr: null, flowByYear: {} })).toEqual([]);
  });
});

describe("KPI alerts - caso tipo Excel del profesor", () => {
  const cbm = professorLikeCbm();
  const alerts = buildKpiAlerts(cbm, metricsFor(cbm));

  it("Regla 1: salto de demanda contra el historico, con la razon", () => {
    const alert = byId(alerts, "demand-jump");
    expect(alert).toBeDefined();
    expect(alert.reasons.join(" ")).toContain("promedio 68,400");
    expect(alert.reasons.join(" ")).toContain("2026: 243,907 (3.6×)");
    expect(alert.reasons.join(" ")).toMatch(/ventas netas/);
  });

  it("Regla 2: totales de COs que no siguen la Demanda Anual, con la razon", () => {
    const alert = byId(alerts, "demand-ignores-growth");
    expect(alert).toBeDefined();
    expect(alert.title).toContain("9.0%");
    expect(alert.reasons.join(" ")).toContain("COs trae 243,907");
    expect(alert.reasons.join(" ")).toMatch(/no aplica la tasa de crecimiento/);
  });

  it("Regla 3: demanda mayor que la capacidad solo en 2035, con la razon", () => {
    const alert = byId(alerts, "demand-over-capacity");
    expect(alert).toBeDefined();
    expect(alert.title).toContain("1 año(s)");
    expect(alert.reasons[0]).toContain("2035: 577,798 vs 194,400");
    expect(alert.reasons.join(" ")).toMatch(/no limita las ventas/);
  });

  it("Regla 4: TIR > 100% con flujo inicial, prestamo y causas de entrada", () => {
    const alert = byId(alerts, "irr-over-limit");
    expect(alert).toBeDefined();
    expect(alert.severity).toBe("error");
    expect(alerts[0].id).toBe("irr-over-limit");
    const text = alert.reasons.join(" ");
    expect(text).toMatch(/El flujo de 2025/);
    expect(text).toMatch(/El préstamo de 2025/);
    expect(text).toMatch(/acumulado/);
    expect(text).toMatch(/Causas en los datos de entrada/);
  });

  it("toda alerta trae titulo, al menos una razon y la hoja a revisar", () => {
    expect(alerts.length).toBe(4);
    alerts.forEach((alert) => {
      expect(alert.title).toBeTruthy();
      expect(alert.reasons.length).toBeGreaterThan(0);
      expect(alert.source).toBeTruthy();
    });
  });
});

describe("KPI alerts - limite de TIR", () => {
  it("TIR exactamente 100% no dispara; 100.1% si", () => {
    const cbm = buildInput2Cbm();
    const at = buildKpiAlerts(cbm, metricsFor(cbm, KPI_ALERT_THRESHOLDS.maxIrr));
    const over = buildKpiAlerts(cbm, metricsFor(cbm, 1.001));
    expect(byId(at, "irr-over-limit")).toBeUndefined();
    expect(byId(over, "irr-over-limit")).toBeDefined();
  });

  it("TIR null no dispara la regla de limite", () => {
    const cbm = buildInput2Cbm();
    const alerts = buildKpiAlerts(cbm, { ...metricsFor(cbm), irr: null });
    expect(byId(alerts, "irr-over-limit")).toBeUndefined();
  });
});
