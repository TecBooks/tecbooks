import { describe, it, expect } from "vitest";
import { detectYearHeader } from "./cells.js";
import { createYearReport } from "./yearReport.js";
import { detectYearZero } from "./yearZero.js";
import { horizonYears } from "../constants.js";
import { computeIRR } from "@/utils/dashboard/financialEvaluation";

// Year problems found with project 150 (sheets starting in 2025 vs 2026,
// an extra 2036 leaking into the cash flow, TIR 1000%).

describe("detectYearHeader", () => {
  it("needs at least 2 strictly increasing years", () => {
    expect(detectYearHeader(["Inversion", 2026, 2027, 2028])?.years).toEqual([2026, 2027, 2028]);
    expect(detectYearHeader(["Auto-1", 2000, 2000, 2000])).toBeNull(); // a value row, not a header
    expect(detectYearHeader(["x", 2026])).toBeNull();
  });

  it("still detects a header that skips a year (reported, not hidden)", () => {
    expect(detectYearHeader(["", 2026, 2028, 2029])?.years).toEqual([2026, 2028, 2029]);
  });
});

describe("year report", () => {
  const years = horizonYears(2026, 9); // 2026-2035

  it("error: a sheet header skips a year", () => {
    const report = createYearReport(years);
    report.checkHeader("Inversion · EDIFICIOS", detectYearHeader(["", 2026, 2027, 2029, 2030, 2031, 2032, 2033, 2034, 2035]));
    expect(report.errors.join(" ")).toContain("skips 2028");
  });

  it("error: a sheet has no column for a horizon year (Premisas stops at 2035 with year zero 2026 + 10)", () => {
    const report = createYearReport(horizonYears(2026, 10));
    report.checkHeader("Premisas", detectYearHeader(["", ...horizonYears(2025, 10)]));
    expect(report.errors.join(" ")).toContain("no column for 2036");
  });

  it("ignores extra columns past the horizon", () => {
    const report = createYearReport(years);
    report.checkHeader("Premisas", detectYearHeader(["", ...horizonYears(2025, 10)])); // 2025-2035 covers 2026-2035
    expect(report.errors).toEqual([]);
  });

  it("warning: a blank cell under an existing year column", () => {
    const report = createYearReport(horizonYears(2026, 2));
    const colMap = { 2026: 1, 2027: 2, 2028: 3 };
    report.checkRowCells("Inversion · Auto-1", ["Auto-1", 300000, "", 300000], colMap);
    expect(report.warnings).toEqual(["Inversion · Auto-1: empty cell in 2027"]);
    expect(report.errors).toEqual([]);
  });
});

describe("detectYearZero", () => {
  it("suggests the year most sheets start in and lists every sheet (project 150 shape)", () => {
    const header = (start) => ["", ...horizonYears(start, 10)];
    const cosRows = [["Mes"], ["Enero", 0.08, 0, "", "", "", "", 2026, 243907]];
    const result = detectYearZero({
      Premisas: [[], header(2025)],
      COs: cosRows,
      Capacidad: [["Capacidad de la línea", ...horizonYears(2026, 10)]],
      Inversion: [["EQUIPO DE TRANSPORTE.", ...horizonYears(2026, 10)]],
    });
    expect(result.suggested).toBe(2026);
    expect(result.candidates.map((c) => `${c.sheet}:${c.firstYear}`)).toEqual([
      "Premisas:2025",
      "COs (Año Cero):2026",
      "Capacidad (line):2026",
      "Inversion:2026",
    ]);
  });
});

describe("projection length", () => {
  it("allows 2 to 15 projected years and clamps outside that range", () => {
    expect(horizonYears(2026, 15)).toHaveLength(16); // 2026-2041
    expect(horizonYears(2026, 15).at(-1)).toBe(2041);
    expect(horizonYears(2026, 2)).toHaveLength(3);
    expect(horizonYears(2026, 20)).toHaveLength(16); // clamped to 15
    expect(horizonYears(2026, 1)).toHaveLength(3); // clamped to 2
  });

  it("a 15-year projection on an 11-year template reports the missing year columns", () => {
    const report = createYearReport(horizonYears(2025, 15)); // 2025-2040
    report.checkHeader("Premisas", detectYearHeader(["", ...horizonYears(2025, 10)])); // 2025-2035
    expect(report.errors.join(" ")).toContain("no column for 2036, 2037, 2038, 2039 and 1 more");
  });
});

describe("computeIRR with an invalid flow", () => {
  it("returns null (N/A), not the 1000% search bound, when a year is NaN/missing", () => {
    expect(computeIRR([-100, 50, NaN])).toBeNull();
    expect(computeIRR([-100, 50, null])).toBeNull();
  });

  it("returns null when the flow never changes sign (all negative)", () => {
    expect(computeIRR([-407, -609, -815])).toBeNull();
  });
});
