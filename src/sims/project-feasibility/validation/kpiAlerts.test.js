import { describe, it, expect } from "vitest";
import { buildKpiAlerts, KPI_ALERT_THRESHOLDS } from "./kpiAlerts.js";
import { computeCashBalanceByYear } from "../costTable/cashFlowCalculations.js";
import { computeIRR } from "@/utils/dashboard/financialEvaluation.js";
import { HORIZON_YEARS } from "../constants.js";
import { buildInput2Cbm } from "@/test-fixtures/input2GoldenCbm.js";
import { YEARS } from "@/test-fixtures/input2Golden.js";

// Same shape as the professor's Excel that produced TIR 114%: 66-70k units
// of history, 9% annual demand growth, but COs column I jumps to 243,907 in
// 2026, and 2035 capacity drops to 194,400 while demand keeps growing.
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

describe("KPI alerts - Input_2 without anomalies", () => {
  it("fires no alert (TIR 97.6%, no history, no capacity, no growth rate)", () => {
    const cbm = buildInput2Cbm();
    // The fixture's demandGrowth: 0 is only filler (its totals come complete
    // from COs); with no captured rate, Rule 2 has nothing to compare against.
    delete cbm.premises.demandGrowth;
    expect(buildKpiAlerts(cbm, metricsFor(cbm))).toEqual([]);
  });

  it("Rule 2 fires with a captured 0% rate and growing totals", () => {
    const cbm = buildInput2Cbm();
    const alerts = buildKpiAlerts(cbm, metricsFor(cbm));
    expect(alerts.map((alert) => alert.id)).toEqual(["demand-ignores-growth"]);
  });

  it("returns [] when the cbm can't be computed", () => {
    expect(buildKpiAlerts({}, { irr: null, flowByYear: {} })).toEqual([]);
  });
});

describe("KPI alerts - professor-like Excel", () => {
  const cbm = professorLikeCbm();
  const alerts = buildKpiAlerts(cbm, metricsFor(cbm));

  it("Rule 1: demand jump vs history, with the reason", () => {
    const text = byId(alerts, "demand-jump")?.reasons.join(" ");
    expect(text).toContain("average 68,400");
    expect(text).toContain("2026: 243,907 (3.6×)");
    expect(text).toMatch(/net sales/);
  });

  it("Rule 2: COs totals that ignore the annual demand growth, with the reason", () => {
    const alert = byId(alerts, "demand-ignores-growth");
    expect(alert.title).toContain("9.0%");
    expect(alert.reasons.join(" ")).toContain("COs has 243,907");
    expect(alert.reasons.join(" ")).toMatch(/does not apply the growth rate/);
  });

  it("Rule 3: demand above capacity only in 2035, with the reason", () => {
    const alert = byId(alerts, "demand-over-capacity");
    expect(alert.title).toContain("1 year(s)");
    expect(alert.reasons[0]).toContain("2035: 577,798 vs 194,400");
    expect(alert.reasons.join(" ")).toMatch(/does not cap sales/);
  });

  it("Rule 4: TIR > 100% with initial flow, loan and input causes", () => {
    const alert = byId(alerts, "irr-over-limit");
    expect(alert.severity).toBe("error");
    expect(alerts[0].id).toBe("irr-over-limit");
    const text = alert.reasons.join(" ");
    expect(text).toMatch(/The 2025 cash flow/);
    expect(text).toMatch(/The 2025 loan/);
    expect(text).toMatch(/cumulative/);
    expect(text).toMatch(/Causes in the input data/);
  });

  it("every alert has a title, at least one reason and a source to check", () => {
    expect(alerts.length).toBe(4);
    alerts.forEach((alert) => {
      expect(alert.title).toBeTruthy();
      expect(alert.reasons.length).toBeGreaterThan(0);
      expect(alert.source).toBeTruthy();
    });
  });
});

describe("KPI alerts - TIR limit", () => {
  it("exactly 100% does not fire; 100.1% does", () => {
    const cbm = buildInput2Cbm();
    const at = buildKpiAlerts(cbm, metricsFor(cbm, KPI_ALERT_THRESHOLDS.maxIrr));
    const over = buildKpiAlerts(cbm, metricsFor(cbm, 1.001));
    expect(byId(at, "irr-over-limit")).toBeUndefined();
    expect(byId(over, "irr-over-limit")).toBeDefined();
  });

  it("null TIR does not fire the limit rule", () => {
    const cbm = buildInput2Cbm();
    const alerts = buildKpiAlerts(cbm, { ...metricsFor(cbm), irr: null });
    expect(byId(alerts, "irr-over-limit")).toBeUndefined();
  });
});
