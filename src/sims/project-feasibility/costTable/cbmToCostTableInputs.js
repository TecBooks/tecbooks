import { projectYears } from '../constants.js'
import { projectPurchaseOrders } from '../demand/projectPurchaseOrders.js'

// Every per-year series in the CBM (premises.*, capacity.line.*,
// acquisitionByYear) is indexed from the project's own year zero:
// series[i] is cbm.timeline.years[i]. Never index them with HORIZON_YEARS.

// BUG FIX: Quality Yield genuinely changes year to year (Capacidad's own
// sheet has a year column for it) - was reading a single year-zero value
// and repeating it flat across the whole projection.
function projectQualityYield(years, yearZeroYear, qualityYieldSeries) {
  const qualityYield = {}
  years.forEach((year, index) => {
    if (year < yearZeroYear) return
    qualityYield[year] = qualityYieldSeries?.[index]
  })
  return qualityYield
}

/**
 * RF-56-XX BUG FIX: the sale price is not flat across the projection - it
 * grows by national inflation every year (Ingresos!C23 = B23 * (1 + Premisas!C12)).
 * Volume (purchase orders) uses demandGrowth, not this inflation series -
 * see projectPurchaseOrders (demand module). Capacity (Capacidad sheet) is
 * a separate, derived utilization check - it does not drive CO.
 */
function projectSalesPrice(years, yearZeroYear, yearZeroPrice, inflationByIndex) {
  const salesPricePerUnit = {}
  let previous = yearZeroPrice

  years.forEach((year, index) => {
    if (year < yearZeroYear) return
    if (year === yearZeroYear) {
      salesPricePerUnit[year] = yearZeroPrice
      return
    }
    const rate = inflationByIndex[index] ?? 0
    previous = previous * (1 + rate)
    salesPricePerUnit[year] = previous
  })

  return salesPricePerUnit
}

/**
 * MP material cost per unit grows by national inflation every year, mirroring
 * the Template Financiero IN3001B and the sales-price treatment above -
 * until this, materialCostPerUnit was a flat scalar for every year even
 * though CO volume was already real/per-year.
 */
function projectMaterialCost(years, yearZeroYear, yearZeroCost, inflationByIndex) {
  const materialCostPerUnit = {}
  let previous = yearZeroCost

  years.forEach((year, index) => {
    if (year < yearZeroYear) return
    if (year === yearZeroYear) {
      materialCostPerUnit[year] = yearZeroCost
      return
    }
    const rate = inflationByIndex[index] ?? 0
    previous = previous * (1 + rate)
    materialCostPerUnit[year] = previous
  })

  return materialCostPerUnit
}

/**
 * Maps a saved project's canonical business model (cbm, from parseNovusProject)
 * into the { employees, production, premises } shape costCalculations.js
 * expects - same functions the standalone Cost Table upload page uses, just
 * fed from the already-parsed program data instead of a fresh Excel upload.
 */
export function cbmToCostTableInputs(cbm) {
  if (!cbm) {
    return { employees: [], production: {}, premises: {} }
  }

  const employees = (cbm.derivedBase?.employees ?? []).map((employee, index) => ({
    id: index,
    name: employee.name,
    category: employee.category,
    quantity: employee.quantity,
    monthlySalary: employee.salarioIntegrado,
  }))

  const years = projectYears(cbm)
  const yearZeroYear = cbm.demand?.yearZeroYear
  let purchaseOrders = {}
  let qualityYield = {}
  let salesPricePerUnit = {}
  let materialCostPerUnit = cbm.derivedBase?.bomMaterialCost ?? 0
  if (yearZeroYear !== undefined) {
    purchaseOrders = projectPurchaseOrders({
      years,
      yearZeroYear,
      yearZeroTotal: cbm.demand?.yearZeroTotal,
      yearZeroOrders: cbm.demand?.yearZeroOrders,
      monthShares: cbm.demand?.monthShares,
      history: cbm.demand?.history,
      demandGrowth: cbm.premises?.demandGrowth,
    })
    // BUG FIX: COs' "Año Cero | Total" block gives a real total per year,
    // not just year zero (see readCOs) - any year the Excel actually gives
    // wins outright over the demandGrowth-projected guess above. Years the
    // Excel doesn't cover keep the projection.
    // Only years inside the horizon: a total past it would add an extra year
    // with no premises/costs behind it (an empty year in the cash flow is
    // what turned the TIR into NaN → 1000%).
    for (const { year, total } of cbm.demand?.yearlyTotals ?? []) {
      if (years.includes(year) && total !== undefined) purchaseOrders[year] = total
    }
    qualityYield = projectQualityYield(years, yearZeroYear, cbm.capacity?.line?.qualityYield)
    salesPricePerUnit = projectSalesPrice(
      years,
      yearZeroYear,
      cbm.bom?.salePrice,
      cbm.premises?.nationalInflation ?? []
    )
    materialCostPerUnit = projectMaterialCost(
      years,
      yearZeroYear,
      cbm.derivedBase?.bomMaterialCost,
      cbm.premises?.nationalInflation ?? []
    )
  }

  const indirectProductPercentage = {}
  years.forEach((year, index) => {
    indirectProductPercentage[year] = cbm.premises?.indirectProductCostPct?.[index]
  })

  return {
    employees,
    production: {
      purchaseOrders,
      qualityYield,
      // {year: cost} map, grown by national inflation - see projectMaterialCost.
      materialCostPerUnit,
      // {year: price} map, grown by national inflation - see projectSalesPrice.
      salesPricePerUnit,
    },
    premises: {
      startingMoney: typeof cbm.premises?.startingMoney === 'number' ? cbm.premises.startingMoney : 0,
      indirectProductPercentage,
    },
  }
}

/**
 * series[i] belongs to year `startYear + i` (startYear = the project's year
 * zero, cbm.timeline.years[0] - see timelineStart). Default keeps the legacy
 * 2025 start for callers that have no project.
 */
export function yearMapFromSeries(series, years, startYear = projectYears(null)[0]) {
  const map = {}
  years.forEach((year) => {
    const index = year - startYear
    map[year] = series?.[index] ?? 0
  })
  return map
}

export function mapAssetsToYears(assetList, years, startYear) {
  return (assetList ?? []).map((asset) => ({
    // Machines (capacity.machines) have no "name", only code/description.
    name: asset.name ?? asset.description ?? asset.code,
    acquisitionByYear: yearMapFromSeries(asset.acquisitionByYear, years, startYear),
  }))
}

/** The year series index 0 belongs to. */
export function timelineStart(cbm) {
  return projectYears(cbm)[0]
}

// BUG FIX: machinery $ used to come from capacity.machines (Capacidad)
// unconditionally, double-counting whenever Inversion ALSO had its own
// "Maquinaria y equipo" category. Prefer Inversion's category when the
// project has one; fall back to Capacidad's machine list only when it
// doesn't (some projects only ever put machinery in Capacidad, never in
// Inversion) - never both, never neither. Same resolution as
// computeFixedAssets.js's resolveMachineryAssets, kept separate (no shared
// module boundary that both files already import from).
const MACHINERY_CATEGORY_PATTERN = /maquinaria|machinery/
function machineryAssetsFromInversion(cbm) {
  const byCategory = cbm.assets?.byCategory ?? {}
  const key = Object.keys(byCategory).find((category) => (
    MACHINERY_CATEGORY_PATTERN.test(String(category ?? '').toLowerCase().trim())
  ))
  if (key) return byCategory[key]
  return cbm.capacity?.machines ?? []
}

/**
 * RF-55/RF-56: assets (buildings/transport/compute/maquinaria, all from
 * Inversion) and the Premisas rates depreciation/admin/sales-expense/
 * financing need, all re-keyed from HORIZON_YEARS-indexed arrays to
 * {year: value} maps matching cbmToCostTableInputs' own output shape.
 */
export function cbmToOperatingExpenseInputs(cbm, years) {
  const start = timelineStart(cbm)
  const series = (values) => yearMapFromSeries(values, years, start)
  const assets = (list) => mapAssetsToYears(list, years, start)
  return {
    assets: {
      buildings: assets(cbm.assets?.buildings),
      transport: assets(cbm.assets?.transport),
      compute: assets(cbm.assets?.compute),
    },
    machines: assets(machineryAssetsFromInversion(cbm)),
    adminPct: series(cbm.premises?.adminPct),
    salesExpensePct: series(cbm.premises?.salesExpensePct),
    depreciationBuildings: series(cbm.premises?.depreciationBuildings),
    depreciationTransport: series(cbm.premises?.depreciationTransport),
    depreciationMachinery: series(cbm.premises?.depreciationMachinery),
    depreciationCompute: series(cbm.premises?.depreciationCompute),
    // RF-56 "Tasa": Premisas "Tasa lider nacional" - the closest match to a
    // generic bank lending rate InputNovus actually provides.
    financingPeriods: cbm.timeline?.financingPeriods,
    nationalLeadingRate: series(cbm.premises?.nationalLeadingRate),
    // RF-57: Premisas "Tasa ISR" / "Tasa de PTU".
    isr: series(cbm.premises?.isr),
    ptu: series(cbm.premises?.ptu),
    // RF-65 TREMA: Premisas "Inflacion nacional" - the other rate TREMA sums
    // (market rate + inflation + risk premium, risk premium has no source
    // field so it's a manual input, same situation as Financial Income).
    nationalInflation: series(cbm.premises?.nationalInflation),
  }
}
