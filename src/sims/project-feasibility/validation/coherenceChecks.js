import { projectYears } from '../constants.js'
import { cbmToCostTableInputs } from '../costTable/cbmToCostTableInputs.js'
import { annualizeYearZero } from '../demand/projectPurchaseOrders.js'

/**
 * Upload-time coherence checks: the workbook parsed fine (years, sheets,
 * numbers) but the DATA or the STRATEGY it describes doesn't add up.
 *
 * - severity 'error'  → the data is impossible; the upload is blocked
 *   (a quality yield of 0 or above 100%, no sale price, zero capacity with
 *   demand, monthly orders above the yearly total).
 * - severity 'warning' → the project can be computed, but some result will
 *   look wrong or the user probably made a mistake (every unit loses money,
 *   demand above capacity, duplicated machines...). Upload allowed.
 *
 * Each issue: { id, severity, title, message }. Ids are stable - tests and
 * the UI can key on them. Thresholds live in COHERENCE_THRESHOLDS.
 *
 * Runs on the parsed project (after applyDerivedBase), in parseNovusProject.
 */
export const COHERENCE_THRESHOLDS = {
  demandJumpRatio: 2, // year-zero demand vs historical average (both ways)
  growthTolerance: 0.1, // |implied COs growth - Demanda Anual| in points
  capacityDropRatio: 0.5, // capacity below this share of the previous year
  excelCapacityTolerance: 0.01, // Excel "Anual Capacity" vs the app's formula
  machineryMismatchTolerance: 0.01,
  yearZeroTotalTolerance: 0.05, // year-zero total vs sum of year-zero monthly orders
  maxListed: 4,
}
// Not checked on purpose: Premisas "Tipo de cambio" (fxClose) - no
// calculation reads it (the official template itself jumps 16.66 → 9.35),
// so flagging it would only be noise.

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function listItems(items, max = COHERENCE_THRESHOLDS.maxListed) {
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`
}

function fmt(value) {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function sum(values) {
  return (values ?? []).reduce((total, value) => total + (isNumber(value) ? value : 0), 0)
}

function issue(id, severity, title, message) {
  return { id, severity, title, message }
}

// ---------- data the checks share ----------

function demandByYear(project) {
  if (project.demand?.yearZeroYear === undefined) return {}
  return cbmToCostTableInputs(project).production.purchaseOrders ?? {}
}

const MACHINERY_CATEGORY = /maquinaria|machinery/i

// ---------- errors: impossible data ----------

function checkQualityYield(project, years) {
  const bad = years.filter((year, i) => {
    const value = project.capacity?.line?.qualityYield?.[i]
    return isNumber(value) && (value <= 0 || value > 1)
  })
  if (!bad.length) return []
  return [
    issue(
      'quality-yield-out-of-range',
      'error',
      'Quality yield',
      `Capacidad "Quality yield" must be between 0 and 1 (e.g. 0.9 = 90%) - check ${listItems(bad)}. Material cost per unit is divided by it.`,
    ),
  ]
}

function checkSalePrice(project) {
  const price = project.bom?.salePrice
  if (isNumber(price) && price > 0) return []
  return [
    issue(
      'sale-price-missing',
      'error',
      'Sale price',
      'BOM has no sale price ("Costo de venta") - sales would be 0 in every year.',
    ),
  ]
}

function checkCapacityVsDemandPresence(project, years, demand) {
  const capacity = project.derivedBase?.annualCapacityByYear ?? []
  const zero = []
  const unknown = []
  years.forEach((year, i) => {
    if (!(demand[year] > 0)) return
    if (!isNumber(capacity[i])) unknown.push(year)
    else if (capacity[i] <= 0) zero.push(year)
  })
  const issues = []
  if (zero.length) {
    issues.push(
      issue(
        'capacity-zero-with-demand',
        'error',
        'Capacity',
        `Annual capacity is 0 in ${listItems(zero)} while there is demand - check Capacidad (shifts, lines, days, seconds per unit).`,
      ),
    )
  }
  if (unknown.length) {
    issues.push(
      issue(
        'capacity-unknown',
        'warning',
        'Capacity',
        `Annual capacity can't be computed for ${listItems(unknown)} - a Capacidad line parameter is empty in those years.`,
      ),
    )
  }
  return issues
}

function checkYearZeroOrders(project) {
  const total = project.demand?.yearZeroTotal
  const monthly = sum(project.demand?.yearZeroOrders)
  if (!(isNumber(total) && total > 0) || monthly <= total * 1.001) return []
  return [
    issue(
      'year-zero-orders-exceed-total',
      'error',
      'Year-zero orders',
      `COs monthly year-zero orders add up to ${fmt(monthly)}, more than the year-zero total ${fmt(total)}.`,
    ),
  ]
}

// ---------- warnings: incoherent strategy / likely mistakes ----------

function checkYearZeroTotalVsOrders(project) {
  const total = project.demand?.yearZeroTotal
  const monthly = sum(project.demand?.yearZeroOrders)
  if (!(monthly > 0) || !(isNumber(total) && total > 0)) return []
  if (total <= monthly * (1 + COHERENCE_THRESHOLDS.yearZeroTotalTolerance)) return []
  return [
    issue(
      'year-zero-total-vs-orders',
      'warning',
      'Year-zero demand',
      `COs "Año Cero | Total" for year zero is ${fmt(total)}, but the year-zero monthly orders add up to ${fmt(monthly)}. The app sells the total in year zero - check which one is right.`,
    ),
  ]
}

function checkUnitEconomics(project, years) {
  const price = project.bom?.salePrice
  const material = project.derivedBase?.bomMaterialCost
  if (!(price > 0) || !(material > 0)) return []
  // Price and material grow by the same inflation, so the comparison per
  // year only depends on that year's quality yield (material / yield).
  const losing = []
  let worst = 0
  years.forEach((year, i) => {
    const yieldValue = project.capacity?.line?.qualityYield?.[i]
    const effective = isNumber(yieldValue) && yieldValue > 0 && yieldValue <= 1 ? yieldValue : 1
    const perUnit = material / effective
    if (perUnit >= price) {
      losing.push(year)
      worst = Math.max(worst, perUnit)
    }
  })
  if (!losing.length) return []
  const all = losing.length === years.length
  return [
    issue(
      'unit-loses-money',
      'warning',
      'Unit economics',
      `Material per unit (BOM ${fmt(material)} / quality yield = up to ${fmt(worst)}) is not below the sale price ${fmt(price)} in ${all ? 'every year' : listItems(losing)} - every unit loses money before salaries and investment${all ? ', so the cash flow never turns positive and the TIR will be N/A' : ''}.`,
    ),
  ]
}

// Year zero is often a partial year (only the months already sold, e.g.
// Oct-Dec) - compare its FULL-YEAR equivalent, the same annualization
// projectPurchaseOrders uses, not the raw stub total.
function annualizedYearZero(project) {
  return annualizeYearZero(
    project.demand?.yearZeroOrders,
    project.demand?.monthShares,
    project.demand?.yearZeroTotal,
  )
}

function checkDemandJump(project) {
  const history = (project.demand?.history ?? []).filter((row) => isNumber(row.total) && row.total > 0)
  // The larger of the full-year equivalent of the monthly orders and the
  // year-zero total the app actually sells (a stub year must not read as a drop).
  const yearZero = Math.max(annualizedYearZero(project) || 0, project.demand?.yearZeroTotal || 0)
  if (!history.length || !(yearZero > 0)) return []
  const average = sum(history.map((row) => row.total)) / history.length
  const ratio = yearZero / average
  const { demandJumpRatio } = COHERENCE_THRESHOLDS
  if (ratio <= demandJumpRatio && ratio >= 1 / demandJumpRatio) return []
  return [
    issue(
      'demand-jump',
      'warning',
      'Demand',
      `Year-zero demand (full-year equivalent ${fmt(yearZero)}) is ${ratio.toFixed(1)}× the historical average ${fmt(average)} (COs "Histórico") - check COs "Año Cero | Total" and the year-zero monthly orders.`,
    ),
  ]
}

function checkHistoryYears(project) {
  const yearZero = project.demand?.yearZeroYear
  if (!isNumber(yearZero)) return []
  const late = (project.demand?.history ?? []).filter((row) => isNumber(row.year) && row.year >= yearZero)
  if (!late.length) return []
  return [
    issue(
      'history-not-before-year-zero',
      'warning',
      'Demand history',
      `COs "Histórico" has ${listItems(late.map((row) => row.year))}, not before year zero ${yearZero} - history should be past years.`,
    ),
  ]
}

function checkDemandGrowth(project) {
  const growth = project.premises?.demandGrowth
  // From year 1 on: year zero can be a partial year and would inflate the
  // implied growth (16,000 Oct-Dec → 243,907 full year is not +1400%).
  const totals = (project.demand?.yearlyTotals ?? [])
    .filter((row) => isNumber(row.total) && row.total > 0)
    .filter((row) => row.year !== project.demand?.yearZeroYear)
  if (!isNumber(growth) || totals.length < 2) return []
  const first = totals[0]
  const last = totals[totals.length - 1]
  const span = last.year - first.year
  if (span <= 0) return []
  const implied = Math.pow(last.total / first.total, 1 / span) - 1
  if (Math.abs(implied - growth) <= COHERENCE_THRESHOLDS.growthTolerance) return []
  return [
    issue(
      'demand-ignores-growth',
      'warning',
      'Demand growth',
      `COs totals grow ${(implied * 100).toFixed(1)}% a year (${first.year}-${last.year}) but Premisas "Demanda Anual" says ${(growth * 100).toFixed(1)}%. The COs totals win; the growth rate only fills years COs doesn't give.`,
    ),
  ]
}

function checkDemandOverCapacity(project, years, demand) {
  const capacity = project.derivedBase?.annualCapacityByYear ?? []
  const over = years.filter((year, i) => isNumber(capacity[i]) && capacity[i] > 0 && demand[year] > capacity[i] * 1.0001)
  if (!over.length) return []
  return [
    issue(
      'demand-over-capacity',
      'warning',
      'Demand vs capacity',
      `Demand is above the annual capacity in ${listItems(over)}. The app does not cap sales at capacity, so it sells units the plant can't make.`,
    ),
  ]
}

function checkCapacityDrop(project, years) {
  const capacity = project.derivedBase?.annualCapacityByYear ?? []
  const drops = years.filter(
    (year, i) =>
      i > 0 &&
      isNumber(capacity[i]) &&
      isNumber(capacity[i - 1]) &&
      capacity[i - 1] > 0 &&
      capacity[i] < capacity[i - 1] * COHERENCE_THRESHOLDS.capacityDropRatio,
  )
  if (!drops.length) return []
  return [
    issue(
      'capacity-drop',
      'warning',
      'Capacity',
      `Annual capacity falls by more than half in ${listItems(drops)} - check Capacidad (shifts, lines, days) for that year.`,
    ),
  ]
}

function checkExcelCapacity(project, years) {
  const excel = project.capacity?.excelAnnualCapacity
  const computed = project.derivedBase?.annualCapacityByYear ?? []
  if (!Array.isArray(excel)) return []
  const off = years.filter((year, i) => {
    if (!(isNumber(excel[i]) && excel[i] > 0 && isNumber(computed[i]))) return false
    return Math.abs(computed[i] - excel[i]) / excel[i] > COHERENCE_THRESHOLDS.excelCapacityTolerance
  })
  if (!off.length) return []
  const i = years.indexOf(off[0])
  return [
    issue(
      'excel-capacity-mismatch',
      'warning',
      'Capacity formula',
      `Capacidad "Anual Capacity" in the Excel differs from the app's formula in ${listItems(off)} (e.g. ${off[0]}: Excel ${fmt(excel[i])}, app ${fmt(computed[i])}). The app uses its own formula - check the Excel's formula or line parameters.`,
    ),
  ]
}

function checkMachinerySource(project) {
  const byCategory = project.assets?.byCategory ?? {}
  const category = Object.keys(byCategory).find((name) => MACHINERY_CATEGORY.test(name))
  const machines = project.capacity?.machines ?? []
  if (!category || !machines.length) return []
  const inversion = sum(byCategory[category].map((asset) => asset.acquisitionByYear?.[0]))
  const capacidad = sum(machines.map((machine) => machine.acquisitionByYear?.[0]))
  if (!(inversion > 0) || !(capacidad > 0)) return []
  if (Math.abs(inversion - capacidad) / Math.max(inversion, capacidad) <= COHERENCE_THRESHOLDS.machineryMismatchTolerance) return []
  return [
    issue(
      'machinery-double-source',
      'warning',
      'Machinery',
      `Machinery is in both Inversion "${category}" (${fmt(inversion)}) and Capacidad machines (${fmt(capacidad)}) with different totals. The app uses Inversion and ignores the Capacidad costs.`,
    ),
  ]
}

function duplicates(values) {
  const seen = new Set()
  const repeated = new Set()
  values.forEach((value) => {
    if (!value) return
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  })
  return [...repeated]
}

function checkDuplicates(project) {
  const issues = []
  const machineCodes = duplicates((project.capacity?.machines ?? []).map((machine) => machine.code))
  if (machineCodes.length) {
    issues.push(
      issue(
        'duplicate-machine-codes',
        'warning',
        'Machines',
        `Capacidad repeats machine codes ${listItems(machineCodes)} - each machine should have its own code.`,
      ),
    )
  }
  for (const [category, assets] of Object.entries(project.assets?.byCategory ?? {})) {
    const names = duplicates((assets ?? []).map((asset) => asset.name))
    if (names.length) {
      issues.push(
        issue(
          'duplicate-asset-names',
          'warning',
          'Investment',
          `Inversion "${category}" repeats ${listItems(names)} - if they are different assets, give each its own name.`,
        ),
      )
    }
  }
  return issues
}

function checkAssetValuesChange(project) {
  const changing = []
  for (const [category, assets] of Object.entries(project.assets?.byCategory ?? {})) {
    for (const asset of assets ?? []) {
      const values = new Set((asset.acquisitionByYear ?? []).filter((value) => isNumber(value) && value !== 0))
      if (values.size > 1) changing.push(`${category} · ${asset.name}`)
    }
  }
  if (!changing.length) return []
  return [
    issue(
      'asset-value-changes',
      'warning',
      'Investment',
      `${listItems(changing)} change value across the years. Inversion expects the asset's value repeated every year; an increase is counted as a new purchase that year.`,
    ),
  ]
}

function checkWorkforce(project) {
  const issues = []
  const employees = project.derivedBase?.employees ?? []
  const unclassified = employees.filter((employee) => !employee.category).map((employee) => employee.name)
  if (unclassified.length) {
    issues.push(
      issue(
        'unclassified-employees',
        'warning',
        'Employees',
        `${listItems(unclassified)} match no labor category (MOD, MOID, IM/Ingeniero, Administración/Operación) and are left out of every cost.`,
      ),
    )
  }
  if (employees.length && !employees.some((employee) => employee.category === 'direct')) {
    issues.push(
      issue(
        'no-direct-labor',
        'warning',
        'Employees',
        'No direct-labor employee ("MOD ...") in Empleados_2 - production would have no operators cost.',
      ),
    )
  }
  return issues
}

function checkFinancing(project) {
  const periods = project.timeline?.financingPeriods
  if (isNumber(periods) && periods > 0) return []
  return [
    issue(
      'no-financing-periods',
      'warning',
      'Financing',
      'Premisas "Periodos" is empty or 0 - the loan has no repayment schedule.',
    ),
  ]
}

function checkBomCost(project) {
  const material = project.derivedBase?.bomMaterialCost
  if (isNumber(material) && material > 0) return []
  return [
    issue(
      'bom-zero-cost',
      'warning',
      'BOM',
      'BOM parts add up to 0 material cost per unit (quantity × cost) - raw material would cost nothing.',
    ),
  ]
}

/** All checks, errors first. */
export function checkProjectCoherence(project) {
  if (!project) return []
  const years = projectYears(project)
  const demand = demandByYear(project)
  const issues = [
    ...checkQualityYield(project, years),
    ...checkSalePrice(project),
    ...checkCapacityVsDemandPresence(project, years, demand),
    ...checkYearZeroOrders(project),
    ...checkUnitEconomics(project, years),
    ...checkYearZeroTotalVsOrders(project),
    ...checkDemandJump(project),
    ...checkHistoryYears(project),
    ...checkDemandGrowth(project),
    ...checkDemandOverCapacity(project, years, demand),
    ...checkCapacityDrop(project, years),
    ...checkExcelCapacity(project, years),
    ...checkMachinerySource(project),
    ...checkDuplicates(project),
    ...checkAssetValuesChange(project),
    ...checkWorkforce(project),
    ...checkFinancing(project),
    ...checkBomCost(project),
  ]
  return [...issues.filter((i) => i.severity === 'error'), ...issues.filter((i) => i.severity !== 'error')]
}

/** Issue → the one-line message shown in the upload list. */
export function formatCoherenceIssue(item) {
  return `${item.title}: ${item.message}`
}
