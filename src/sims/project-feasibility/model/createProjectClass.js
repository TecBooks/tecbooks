import { HORIZON_YEARS } from '../constants.js'
import { emptyYearSeries } from '../parse/cells.js'

/** `years`: the project's horizon (year zero .. +N) - see horizonYears(). */
export function createProjectClass({ fileName, years = HORIZON_YEARS } = {}) {
  // Every per-year series is as long as this project's horizon.
  const empty = () => emptyYearSeries(years.length)
  return {
    metadata: {
      name: '',
      source: 'novus-excel',
      fileName: fileName ?? '',
    },
    timeline: {
      years: [...years],
      startYear: years[0],
      endYear: years[years.length - 1],
      financingPeriods: undefined,
    },
    premises: {
      startingMoney: undefined,
      fxClose: empty(),
      nationalLeadingRate: empty(),
      cpp: empty(),
      cetes: empty(),
      libor: empty(),
      nationalInflation: empty(),
      isr: empty(),
      impac: empty(),
      ptu: empty(),
      foreignInflation: empty(),
      inventoryPct: empty(),
      suppliersPct: empty(),
      shortTermLiabilityPct: empty(),
      directProductCostPct: empty(),
      indirectProductCostPct: empty(),
      salesExpensePct: empty(),
      adminPct: empty(),
      depreciationBuildings: empty(),
      depreciationMachinery: empty(),
      depreciationTransport: empty(),
      depreciationCompute: empty(),
      // Generic capture of every "Porcentaje depreciacion X" row Premisas
      // actually has - keyed by whatever category label X is, not limited
      // to the 4 above.
      depreciationByCategory: {},
      demandGrowth: undefined,
    },
    demand: {
      monthShares: Array.from({ length: 12 }, () => undefined),
      yearZeroOrders: Array.from({ length: 12 }, () => 0),
      history: [],
      // "Año Cero | Total" block (COs sheet, columns H/I) - one row per
      // year the project actually gives (not just year zero). First entry
      // is year zero; every entry after is a real captured/given CO total
      // for that future year, straight from the Excel - see readCOs.
      yearlyTotals: [],
      yearZeroYear: undefined,
      yearZeroTotal: undefined,
    },
    capacity: {
      // BUG FIX: was a single flat value per field (year-zero only) even
      // though Capacidad's own sheet has a year column per field and these
      // genuinely change year to year (Shifts, Production Lines, Quality
      // Yield, etc. - see readCapacidad). Per-year series now, same
      // HORIZON_YEARS-indexed array shape as premises.* fields.
      line: {
        qualityYield: empty(),
        secondsPerUnit: empty(),
        hoursShift: empty(),
        shifts: empty(),
        productionLines: empty(),
        weekWorkingDays: empty(),
        monthsWorkingWeeks: empty(),
        yearWorkingMonths: empty(),
      },
      machines: [],
    },
    bom: {
      productName: '',
      salePrice: undefined,
      parts: [],
    },
    assets: {
      transport: [],
      buildings: [],
      compute: [],
      // Generic capture of every category the Inversion sheet actually has -
      // keyed by whatever label the Excel uses, not limited to the 3 above.
      byCategory: {},
    },
    employees: [],
    services: [],
    derivedBase: {
      unitsPerHour: undefined,
      annualCapacity: undefined,
      annualCapacityByYear: empty(),
      operatorCount: 0,
      supervisorCount: 0,
      bomMaterialCost: undefined,
      monthShareSum: undefined,
      yearZeroOrdersSum: undefined,
      employees: [],
    },
  }
}

export function createProgram({ name = '', projects = [] } = {}) {
  return {
    name,
    projects: projects.map((project) => ({
      name: project.name ?? project.cbm?.metadata?.name ?? '',
      cbm: project.cbm ?? project,
    })),
  }
}
