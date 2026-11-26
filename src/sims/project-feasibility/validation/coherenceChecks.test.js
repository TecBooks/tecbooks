import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { parseNovusProject } from "../parse/parseNovusProject.js";
import { applyDerivedBase } from "../model/applyDerivedBase.js";
import { checkProjectCoherence } from "./coherenceChecks.js";

// Baseline: the official template (public/official-input-template.xlsx),
// parsed by the real parser. Every case below clones it and breaks ONE thing.
let template;
beforeAll(() => {
  template = parseNovusProject(readFileSync("public/official-input-template.xlsx")).project;
});

const clone = () => structuredClone(template);
const issues = (project) => checkProjectCoherence(project);
const ids = (project) => issues(project).map((item) => item.id);
const find = (project, id) => issues(project).find((item) => item.id === id);
const lastIndex = (project) => project.timeline.years.length - 1;
/** The official template's Inversion has no assets - add one category to break. */
const withAssetCategory = (project, category = "EQUIPO DE COMPUTO.") => {
  const asset = { name: "Compu-001", acquisitionByYear: project.timeline.years.map(() => 15500) };
  project.assets.byCategory[category] = [asset];
  return [category, project.assets.byCategory[category]];
};

/** Re-derive capacity / BOM cost / employees after mutating inputs. */
const rederive = (project) => applyDerivedBase(project);

describe("coherence checks - baseline", () => {
  it("the official template has no coherence errors", () => {
    expect(issues(template).filter((item) => item.severity === "error")).toEqual([]);
  });

  it("parseNovusProject puts coherence issues into the upload validation", () => {
    const { validation } = parseNovusProject(readFileSync("public/official-input-template.xlsx"));
    expect(validation.valid).toBe(true);
    expect(Array.isArray(validation.coherence)).toBe(true);
  });
});

describe("errors - impossible data (block the upload)", () => {
  it("quality yield of 0 or above 100%", () => {
    const project = clone();
    project.capacity.line.qualityYield[1] = 0;
    project.capacity.line.qualityYield[2] = 1.2;
    const item = find(project, "quality-yield-out-of-range");
    expect(item.severity).toBe("error");
    expect(item.message).toContain(String(project.timeline.years[1]));
    expect(item.message).toContain(String(project.timeline.years[2]));
  });

  it("no sale price", () => {
    const project = clone();
    project.bom.salePrice = undefined;
    expect(find(project, "sale-price-missing").severity).toBe("error");
  });

  it("zero capacity in years with demand", () => {
    const project = clone();
    project.capacity.line.shifts = project.capacity.line.shifts.map(() => 0);
    rederive(project);
    expect(find(project, "capacity-zero-with-demand").severity).toBe("error");
  });

  it("year-zero monthly orders above the year-zero total", () => {
    const project = clone();
    project.demand.yearZeroOrders = project.demand.yearZeroOrders.map(() => project.demand.yearZeroTotal);
    expect(find(project, "year-zero-orders-exceed-total").severity).toBe("error");
  });
});

describe("warnings - incoherent strategy or likely mistakes", () => {
  it("every unit loses money on material alone (project 150: TIR N/A)", () => {
    const project = clone();
    // BOM / yield above the price in every year, like price 8,328 vs 7,571 / 0.8
    project.bom.salePrice = project.derivedBase.bomMaterialCost * 0.9;
    const item = find(project, "unit-loses-money");
    expect(item.severity).toBe("warning");
    expect(item.message).toContain("every year");
    expect(item.message).toContain("TIR will be N/A");
  });

  it("unit loses money only in a low-yield year", () => {
    const project = clone();
    const material = project.derivedBase.bomMaterialCost;
    project.capacity.line.qualityYield = project.capacity.line.qualityYield.map(() => 1);
    project.capacity.line.qualityYield[0] = 0.5; // material / 0.5 = 2× material
    project.bom.salePrice = material * 1.5;
    const item = find(project, "unit-loses-money");
    expect(item.message).toContain(String(project.timeline.years[0]));
    expect(item.message).not.toContain("every year");
  });

  it("year-zero demand far above the history (the 114% TIR case: 243,907 vs 66-70k)", () => {
    const project = clone();
    project.demand.history = [
      { year: project.timeline.years[0] - 2, total: 70000 },
      { year: project.timeline.years[0] - 1, total: 66800 },
    ];
    project.demand.yearZeroTotal = 243907;
    expect(find(project, "demand-jump").severity).toBe("warning");
  });

  it("year-zero total doesn't match the year-zero monthly orders (project 150: 243,907 vs 16,000)", () => {
    const project = clone();
    expect(ids(project)).not.toContain("year-zero-total-vs-orders"); // template: total = monthly sum
    project.demand.yearZeroTotal = 243907;
    const item = find(project, "year-zero-total-vs-orders");
    expect(item.message).toContain("243,907");
  });

  it("year-zero demand far below the history", () => {
    const project = clone();
    project.demand.history = [{ year: project.timeline.years[0] - 1, total: 1e9 }];
    expect(ids(project)).toContain("demand-jump");
  });

  it("does NOT flag a partial year zero (Oct-Dec only) as a jump - it is annualized", () => {
    expect(ids(template)).not.toContain("demand-jump");
  });

  it("history years not before year zero", () => {
    const project = clone();
    project.demand.history = [{ year: project.timeline.years[0], total: 50000 }];
    expect(find(project, "history-not-before-year-zero").severity).toBe("warning");
  });

  it("COs totals grow very differently from Premisas 'Demanda Anual'", () => {
    const project = clone();
    const [y0] = project.timeline.years;
    project.demand.yearlyTotals = project.timeline.years.map((year, k) => ({ year, total: 100000 * Math.pow(1.3, k) }));
    project.demand.yearZeroYear = y0;
    project.premises.demandGrowth = 0.05;
    const item = find(project, "demand-ignores-growth");
    expect(item.message).toContain("30.0%");
    expect(item.message).toContain("5.0%");
  });

  it("demand above capacity (the app does not cap sales)", () => {
    const project = clone();
    const year = project.timeline.years[2];
    const capacity = project.derivedBase.annualCapacityByYear[2];
    project.demand.yearlyTotals = project.demand.yearlyTotals.map((row) =>
      row.year === year ? { ...row, total: capacity * 2 } : row,
    );
    const item = find(project, "demand-over-capacity");
    expect(item.message).toContain(String(year));
  });

  it("capacity falls by more than half (project 150: last year 627k → 194k)", () => {
    const project = clone();
    const last = lastIndex(project);
    project.capacity.line.shifts[last] = project.capacity.line.shifts[last - 1] / 3;
    rederive(project);
    expect(find(project, "capacity-drop").message).toContain(String(project.timeline.years[last]));
  });

  it("Excel 'Anual Capacity' row disagrees with the app's formula", () => {
    const project = clone();
    project.capacity.excelAnnualCapacity = project.derivedBase.annualCapacityByYear.map((value, i) =>
      i === 0 ? value * 2 : value,
    );
    expect(ids(project)).toContain("excel-capacity-mismatch");
  });

  it("machinery in both Inversion and Capacidad with different totals (project 150: 29.2M vs 10.3M)", () => {
    const project = clone();
    const years = project.timeline.years;
    project.assets.byCategory["Maquinaria y equipo"] = [
      { name: "Investment 1", acquisitionByYear: years.map(() => 29200000) },
    ];
    const item = find(project, "machinery-double-source");
    expect(item.message).toContain("29,200,000");
  });

  it("repeated machine codes (project 150: M-011..M-016 twice)", () => {
    const project = clone();
    project.capacity.machines[1].code = project.capacity.machines[0].code;
    expect(find(project, "duplicate-machine-codes").message).toContain(project.capacity.machines[0].code);
  });

  it("repeated asset names in a category (project 150: six Compu-001)", () => {
    const project = clone();
    const [category, assets] = withAssetCategory(project);
    expect(ids(project)).not.toContain("duplicate-asset-names");
    project.assets.byCategory[category] = [...assets, { ...assets[0], acquisitionByYear: [...assets[0].acquisitionByYear] }];
    expect(find(project, "duplicate-asset-names").message).toContain("Compu-001");
  });

  it("an asset whose value changes across the years", () => {
    const project = clone();
    const [category, assets] = withAssetCategory(project);
    expect(ids(project)).not.toContain("asset-value-changes"); // same value every year = fine
    assets[0].acquisitionByYear = assets[0].acquisitionByYear.map((value, i) => (i === 3 ? 999999 : 100000));
    expect(find(project, "asset-value-changes").message).toContain(category);
  });

  it("an employee that matches no labor category is left out of every cost", () => {
    const project = clone();
    project.employees.push({ name: "Becario", type: "Otro", percepcion: 5000, cantidad: 1 });
    rederive(project);
    expect(find(project, "unclassified-employees").message).toContain("Becario");
  });

  it("no direct-labor (MOD) employee", () => {
    const project = clone();
    project.employees = project.employees.filter((e) => !String(e.name).toUpperCase().startsWith("MOD "));
    rederive(project);
    expect(ids(project)).toContain("no-direct-labor");
  });

  it("no financing periods", () => {
    const project = clone();
    project.timeline.financingPeriods = undefined;
    expect(ids(project)).toContain("no-financing-periods");
  });

  it("BOM with zero material cost", () => {
    const project = clone();
    project.bom.parts = project.bom.parts.map((part) => ({ ...part, cost: 0 }));
    rederive(project);
    expect(ids(project)).toContain("bom-zero-cost");
  });

  it("capacity that can't be computed (a line parameter left empty)", () => {
    const project = clone();
    project.capacity.line.shifts[3] = undefined;
    rederive(project);
    expect(find(project, "capacity-unknown").message).toContain(String(project.timeline.years[3]));
  });
});

describe("issue order", () => {
  it("errors come before warnings", () => {
    const project = clone();
    project.bom.salePrice = undefined; // error
    project.timeline.financingPeriods = undefined; // warning
    const severities = issues(project).map((item) => item.severity);
    expect(severities.indexOf("error")).toBeLessThan(severities.indexOf("warning"));
  });
});
