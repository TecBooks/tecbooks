import { MONTHS, SKIP_SERVICES_SUBCATEGORY } from '../constants.js'
import { createYearReport } from './yearReport.js'
import {
  detectYearHeader,
  isBlank,
  normalizeLabel,
  seriesFromRow,
  toNumberDashAsZero,
  toNumberOrUndefined,
  toStringOrUndefined,
  yearColumnMap,
} from './cells.js'
import { Logger } from '../utils/logger.js'

const logger = new Logger('Sheets')

const PREMISES_ROWS = {
  'tipo de cambio al cierre (dolares)': 'fxClose',
  'tasa lider nacional': 'nationalLeadingRate',
  cpp: 'cpp',
  cetes: 'cetes',
  libor: 'libor',
  'inflacion nacional': 'nationalInflation',
  'tasa isr': 'isr',
  'tasa impac': 'impac',
  'tasa de ptu': 'ptu',
  'inflacion extranjera': 'foreignInflation',
  'porcentaje de inventario': 'inventoryPct',
  'porcentaje de proveedores': 'suppliersPct',
  'porcentaje de pasivo corto plazo': 'shortTermLiabilityPct',
  'porcentaje de costo directo del producto': 'directProductCostPct',
  'porcentaje de costo indirecto del producto': 'indirectProductCostPct',
  'porcentaje de gasto de venta': 'salesExpensePct',
  'porcentaje de administracion': 'adminPct',
  'porcentaje depreciacion edificios': 'depreciationBuildings',
  'porcentaje depreciacion maquinaria y equipo': 'depreciationMachinery',
  'porcentaje depreciacion equipo de transporte': 'depreciationTransport',
  'porcentaje depreciacion equipo de computo': 'depreciationCompute',
}

const LINE_LABELS = {
  'quality yield': 'qualityYield',
  'seconds x unit': 'secondsPerUnit',
  'hours shift': 'hoursShift',
  shifts: 'shifts',
  'production lines': 'productionLines',
  'week working days': 'weekWorkingDays',
  'months working weeks': 'monthsWorkingWeeks',
  'year working months': 'yearWorkingMonths',
}

const SKIP_LINE_LABELS = new Set(['units x hour', 'anual capacity', 'annual capacity'])

const ASSET_BLOCKS = [
  { match: 'equipo de transporte', key: 'transport' },
  { match: 'edificios', key: 'buildings' },
  { match: 'equipo de computo', key: 'compute' },
]

// Any "Porcentaje depreciacion X" row becomes its own category rate - not
// just the 4 fixed PREMISES_ROWS fields InputNovus happens to always have.
// Mirrors readInversion's structural category detection: X can be anything,
// including a category Inversion invents that has no fixed field for it.
// BUG FIX: "de" is optional - some Premisas sheets write "Porcentaje de
// depreciacion X" (matches the 4 built-in categories' own wording, which
// never had "de"), others "Porcentaje depreciacion X".
const DEPRECIATION_RATE_PATTERN = /^porcentaje (?:de )?depreciacion (.+)$/

// Excel row 33 / column B on Premisas: opening cash (scalar, not a year series).
const STARTING_MONEY_ROW_INDEX = 32
const STARTING_MONEY_LABELS = new Set([
  'saldo inicial',
  'capital inicial',
  'caja inicial',
  'efectivo inicial',
  'dinero inicial',
  'starting money',
])

/**
 * Every reader takes `report` (parse/yearReport.js): `report.years` is the
 * project's horizon (year zero .. +10) - series are read against those years,
 * and year-header gaps / blank cells are reported there.
 */
export function readPremisas(rows, project, report = createYearReport(project.timeline.years)) {
  const years = report.years
  let lastYearMap = {}
  // BUG FIX: some Premisas sheets give ONE rate per item, not per category
  // ("Porcentaje de depreciacion Animales" as a year-header row, then Vaca/
  // Cerdo/Perro below it each with their own %) - same category-then-bare-
  // item-rows shape readInversion already handles for the Inversion sheet.
  // While true, any otherwise-unrecognized labeled row is captured as that
  // item's own rate (computeFixedAssets.js's rateSeriesForItem looks up an
  // item by its own name first, exactly this key).
  let insideDepreciationItemBlock = false
  const readSeries = (row) => {
    report.checkRowCells(`Premisas · ${String(row[0]).trim()}`, row, lastYearMap)
    return seriesFromRow(row, lastYearMap, years)
  }
  rows.forEach((row, rowIndex) => {
    const label = normalizeLabel(row?.[0])
    const header = detectYearHeader(row)
    if (header) {
      lastYearMap = yearColumnMap(row, years)
      report.checkHeader(
        `Premisas · year header${label ? ` "${String(row[0]).trim()}"` : ''} (row ${rowIndex + 1})`,
        header,
      )
    }
    if (!label) {
      insideDepreciationItemBlock = false
      return
    }
    if (label === 'periodos' || label.startsWith('periodos')) {
      project.timeline.financingPeriods = toNumberOrUndefined(row[1])
      insideDepreciationItemBlock = false
      return
    }
    // Premisas!B33 "Demanda anual" - scalar growth rate (0.07 = 7%), not a
    // yearly series. Drives projectPurchaseOrders' compounding after year
    // zero (see cbmToCostTableInputs.js) - was dropped in an earlier rewrite
    // of this loop, which is why CO came out flat for a while.
    if (label === 'demanda anual') {
      project.premises.demandGrowth = toNumberOrUndefined(row[1])
      insideDepreciationItemBlock = false
      return
    }
    const field = PREMISES_ROWS[label]
    if (field) {
      project.premises[field] = readSeries(row)
      insideDepreciationItemBlock = false
      return
    }
    const depreciationMatch = label.match(DEPRECIATION_RATE_PATTERN)
    if (depreciationMatch) {
      // A row can BE a year header itself (e.g. "Porcentaje de depreciacion
      // Animales | 2025 | 2026 | ...") rather than carrying rate values
      // directly - lastYearMap was just set from this row's own year columns
      // above, so it's ready for the per-item rows that follow.
      if (header) {
        insideDepreciationItemBlock = true
        return
      }
      project.premises.depreciationByCategory[depreciationMatch[1]] = readSeries(row)
      insideDepreciationItemBlock = false
      return
    }
    if (insideDepreciationItemBlock) {
      project.premises.depreciationByCategory[label] = readSeries(row)
    }
  })

  if (project.premises.startingMoney === undefined) {
    project.premises.startingMoney = toNumberOrUndefined(rows[STARTING_MONEY_ROW_INDEX]?.[1])
  }
}

export function readCOs(rows, project, report = createYearReport(project.timeline.years)) {
  const history = []
  const yearlyTotals = []
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    const month = toStringOrUndefined(row?.[0])
    if (normalizeLabel(month) === 'total') break
    const monthIndex = MONTHS.findIndex((name) => normalizeLabel(name) === normalizeLabel(month))
    if (monthIndex >= 0) {
      project.demand.monthShares[monthIndex] = toNumberOrUndefined(row[1])
      project.demand.yearZeroOrders[monthIndex] = toNumberDashAsZero(row[2])
    }
    const histYear = toNumberOrUndefined(row[4])
    const histTotal = toNumberOrUndefined(row[5])
    if (histYear !== undefined && histTotal !== undefined) {
      history.push({ year: histYear, total: histTotal })
    }
    // BUG FIX: "Año Cero | Total" (columns H/I) is not one scalar pair on
    // row 2 - it's one row per year the project gives (2025, 2026, 2027...),
    // same shape as "Historico" right next to it. Was only ever reading
    // rows[1] (year zero), throwing away every real future-year total the
    // Excel actually provides. Read every row's pair; the FIRST one found is
    // year zero, everything after is a real (not projected) CO total.
    const rowYear = toNumberOrUndefined(row[7])
    const rowTotal = toNumberOrUndefined(row[8])
    if (rowYear !== undefined && rowTotal !== undefined) {
      yearlyTotals.push({ year: rowYear, total: rowTotal })
    }
  }
  project.demand.history = history
  project.demand.yearlyTotals = checkCosYearlyTotals(yearlyTotals, report)
  project.demand.yearZeroYear = project.demand.yearlyTotals[0]?.year
  project.demand.yearZeroTotal = project.demand.yearlyTotals[0]?.total
}

/**
 * COs "Año Cero | Total" is a list of rows, not year columns, so it gets its
 * own checks: it must start at year zero and must not skip a year. Years
 * after the list ends are projected with "Demanda Anual" (warning only);
 * years past the horizon are dropped (they used to leak an extra 11th year
 * into the cash flow - an empty year that turned the TIR into NaN/1000%).
 */
function checkCosYearlyTotals(yearlyTotals, report) {
  const years = report.years
  const yearZero = years[0]
  const lastYear = years[years.length - 1]
  if (!yearlyTotals.length) {
    report.error('COs: the "Año Cero | Total" list (columns H/I) is empty')
    return []
  }

  if (yearlyTotals[0].year !== yearZero) {
    report.error(
      `COs: the "Año Cero | Total" list starts in ${yearlyTotals[0].year}, but year zero is ${yearZero}`,
    )
  }
  const skipped = []
  for (let i = 1; i < yearlyTotals.length; i += 1) {
    for (let year = yearlyTotals[i - 1].year + 1; year < yearlyTotals[i].year; year += 1) {
      skipped.push(year)
    }
    if (yearlyTotals[i].year <= yearlyTotals[i - 1].year) {
      report.error(`COs: the "Año Cero | Total" list repeats or goes back to ${yearlyTotals[i].year}`)
    }
  }
  if (skipped.length) {
    report.error(`COs: the "Año Cero | Total" list skips ${skipped.join(', ')}`)
  }

  const inHorizon = yearlyTotals.filter(({ year }) => year >= yearZero && year <= lastYear)
  const beyond = yearlyTotals.filter(({ year }) => year > lastYear).map(({ year }) => year)
  if (beyond.length) {
    report.warning(`COs: ${beyond.join(', ')} is past the horizon (${yearZero}-${lastYear}) and was ignored`)
  }
  const lastGiven = inHorizon[inHorizon.length - 1]?.year
  if (lastGiven !== undefined && lastGiven < lastYear) {
    report.warning(
      `COs: no total after ${lastGiven} - ${lastGiven + 1}-${lastYear} are projected with "Demanda Anual"`,
    )
  }
  return inHorizon
}

// Line params (Quality Yield etc.) are a single scalar per row (label in
// column A, values start at column B) - see LINE_LABELS above.
const LINE_YEAR_START_COL = 1  // B

// BUG FIX: the machine block's columns used to be hardcoded (code at a
// fixed index, etc.) - broke the moment the sheet got edited (columns
// added/reordered/moved to make room for the line-params block). Find the
// machine header row by its own label instead, wherever it actually sits,
// and read every other machine column relative to what THAT row's cells
// say they are - the block can move or gain/lose columns and this still
// finds it.
const MACHINE_HEADER_PATTERN = /^linea\s*\/?\s*maquina/
const MACHINE_COLUMN_LABELS = {
  descripcion: 'description',
  'tiempo en segundos de cada proceso': 'processSeconds',
  'operadores necesarios': 'operators',
  'tiempo de ciclo': 'cycleTime',
}

/** Locates the machine table's header row and each column's real index, by label - not a fixed offset. */
function findMachineHeader(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const codeCol = row.findIndex((cell) => MACHINE_HEADER_PATTERN.test(normalizeLabel(cell)))
    if (codeCol === -1) continue
    const columns = { code: codeCol }
    row.forEach((cell, index) => {
      const field = MACHINE_COLUMN_LABELS[normalizeLabel(cell)]
      if (field) columns[field] = index
    })
    return { rowIndex, columns, header: detectYearHeader(row) }
  }
  return null
}

export function readCapacidad(rows, project, report = createYearReport(project.timeline.years)) {
  const years = report.years
  // Line params: row 1 is the year header ("Capacidad de la línea | 2026 | ...").
  // Read by year against it; only a sheet without that header falls back to
  // the old "column B = year zero" positional read.
  const lineHeader = detectYearHeader(rows[0])
  const lineYearMap = lineHeader ? yearColumnMap(rows[0], years) : null
  if (lineHeader) {
    report.checkHeader('Capacidad · line parameters', lineHeader)
  } else {
    report.warning('Capacidad: no year header in row 1 - line parameters read by position from column B')
  }

  for (const row of rows.slice(1)) {
    const label = normalizeLabel(row?.[0])
    if (label && !SKIP_LINE_LABELS.has(label) && LINE_LABELS[label]) {
      if (lineYearMap) {
        report.checkRowCells(`Capacidad · ${String(row[0]).trim()}`, row, lineYearMap)
        project.capacity.line[LINE_LABELS[label]] = seriesFromRow(row, lineYearMap, years)
      } else {
        project.capacity.line[LINE_LABELS[label]] = years.map(
          (_, index) => toNumberOrUndefined(row?.[LINE_YEAR_START_COL + index])
        )
      }
    }
  }

  const machineHeader = findMachineHeader(rows)
  if (!machineHeader) return
  const { rowIndex, columns, header } = machineHeader
  const yearMap = yearColumnMap(rows[rowIndex], years)
  report.checkHeader('Capacidad · machines', header)

  for (const row of rows.slice(rowIndex + 1)) {
    const code = toStringOrUndefined(row?.[columns.code])
    if (!code || normalizeLabel(code).startsWith('agregar')) continue
    report.checkRowCells(`Capacidad · machine ${code}`, row, yearMap)
    project.capacity.machines.push({
      code,
      description: toStringOrUndefined(row[columns.description]),
      processSeconds: toNumberOrUndefined(row[columns.processSeconds]),
      operators: toNumberOrUndefined(row[columns.operators]),
      cycleTime: toNumberOrUndefined(row[columns.cycleTime]),
      acquisitionByYear: seriesFromRow(row, yearMap, years),
    })
  }
}

export function readBOM(rows, project) {
  project.bom.productName = toStringOrUndefined(rows[0]?.[1]) ?? ''
  const header = rows[1] ?? []
  const salePriceCol = header.findIndex((cell) => normalizeLabel(cell) === 'costo de venta')
  if (salePriceCol >= 0) {
    project.bom.salePrice = toNumberOrUndefined(rows[1]?.[salePriceCol + 1])
  } else {
    project.bom.salePrice = toNumberOrUndefined(rows[1]?.[8])
  }

  for (const row of rows.slice(2)) {
    const id = toStringOrUndefined(row?.[0])
    const description = toStringOrUndefined(row?.[1])
    if (!id && !description) {
      if (project.bom.parts.length) break
      continue
    }
    project.bom.parts.push({
      id: id ?? '',
      description: description ?? '',
      quantity: toNumberOrUndefined(row[2]),
      cost: toNumberOrUndefined(row[3]),
    })
  }
}

/**
 * A row is a category header if ITS OWN cells are year values (2025, 2026...)
 * rather than money amounts - InputNovus isn't limited to the 3 categories
 * ASSET_BLOCKS knows by name (Edificios/Transporte/Computo), other projects'
 * Inversion sheets can have entirely different category names. Detecting the
 * header structurally (not by matching a fixed name list) means any category
 * name works. project.assets.byCategory captures ALL of them, generically;
 * project.assets.{transport,buildings,compute} keeps working exactly as
 * before (aliased in alongside, for the existing Cost Table/Income Statement/
 * Cash Flow pipeline that's hardcoded to those 3 names + machinery).
 */
export function readInversion(rows, project, report = createYearReport(project.timeline.years)) {
  const years = report.years
  let currentKey = null
  let currentCategory = null
  let yearMap = {}

  for (const row of rows) {
    const header = detectYearHeader(row)
    if (header) {
      currentCategory = toStringOrUndefined(row?.[0])
      yearMap = yearColumnMap(row, years)
      report.checkHeader(`Inversion · ${currentCategory ?? 'year header'}`, header)
      if (currentCategory) project.assets.byCategory[currentCategory] ??= []
      const label = normalizeLabel(row?.[0])
      const block = ASSET_BLOCKS.find((item) => label.startsWith(item.match))
      currentKey = block?.key ?? null
      continue
    }

    if (!currentCategory) continue
    const name = toStringOrUndefined(row?.[0])
    if (!name) {
      if (isBlank(row?.[1])) {
        currentKey = null
        currentCategory = null
      }
      continue
    }

    // BUG FIX: an asset's acquisition value is the SAME book value repeated
    // across every year column (see assetSchedule.js's own documented
    // convention) - if one year's header cell doesn't match a HORIZON_YEARS
    // number (e.g. it's formatted as a date in the Excel, not a plain
    // number - `raw: true` then reads its date serial instead of the year),
    // yearColumnMap never maps that column, and seriesFromRow leaves that
    // year `undefined` - which mapAssetsToYears/yearMapFromSeries defaults
    // to 0, wiping out the asset's whole gross value for that year alone
    // (e.g. 2035 dropping straight to $0 while every other year stayed
    // correct). Forward-fill from the last real value found instead of
    // trusting every column's header cell individually.
    report.checkRowCells(`Inversion · ${currentCategory} · ${name}`, row, yearMap)
    const rawSeries = seriesFromRow(row, yearMap, years)
    let lastKnownValue
    const acquisitionByYear = rawSeries.map((value) => {
      if (value !== undefined) lastKnownValue = value
      return value !== undefined ? value : lastKnownValue
    })

    const asset = { name, acquisitionByYear }
    project.assets.byCategory[currentCategory].push(asset)
    if (currentKey) project.assets[currentKey].push(asset)
  }
}

const EMPLOYEE_HEADER = {
  nombre: 'name',
  tipo: 'type',
  percepcion: 'percepcion',
  imss: 'imss',
  infonavit: 'infonavit',
  'vales de despensa': 'valesDespensa',
  'prima vacacional': 'primaVacacional',
  aguinaldo: 'aguinaldo',
  'fondo de ahorro': 'fondoAhorro',
  comedor: 'comedor',
  isr: 'isr',
  cantidad: 'cantidad',
}

function employeeColumnIndex(headerRow, label) {
  return (headerRow ?? []).findIndex((cell) => normalizeLabel(cell) === label)
}

/**
 * Tabular Empleados_2 sheet (Nombre, Tipo, Percepcion, ..., Cantidad).
 */
export function readEmpleados(rows, project) {
  const header = rows[0] ?? []
  const columns = {}
  for (const [label, field] of Object.entries(EMPLOYEE_HEADER)) {
    const index = employeeColumnIndex(header, label)
    if (index >= 0) columns[field] = index
  }

  const nameCol = columns.name ?? 0
  const typeCol = columns.type ?? 1
  const percepcionCol = columns.percepcion ?? 2
  const cantidadCol = columns.cantidad

  for (const row of rows.slice(1)) {
    const name = toStringOrUndefined(row?.[nameCol])
    if (!name) break
    project.employees.push({
      name,
      type: toStringOrUndefined(row[typeCol]),
      percepcion: toNumberOrUndefined(row[percepcionCol]),
      imss: toNumberOrUndefined(row[columns.imss ?? 3]),
      infonavit: toNumberOrUndefined(row[columns.infonavit ?? 4]),
      valesDespensa: toNumberOrUndefined(row[columns.valesDespensa ?? 5]),
      primaVacacional: toNumberOrUndefined(row[columns.primaVacacional ?? 6]),
      aguinaldo: toNumberOrUndefined(row[columns.aguinaldo ?? 7]),
      fondoAhorro: toNumberOrUndefined(row[columns.fondoAhorro ?? 8]),
      comedor: toNumberOrUndefined(row[columns.comedor ?? 9]),
      isr: toNumberOrUndefined(row[columns.isr ?? 10]),
      cantidad: toNumberOrUndefined(row[cantidadCol]) ?? 1,
    })
  }

  logger.debug('readEmpleados: raw rows parsed from the "Empleados_2" sheet', {
    rowsInSheet: rows.length,
    parsedEmployees: project.employees.map((e) => ({ name: e.name, type: e.type, cantidad: e.cantidad })),
  })
}

export function readServicios(rows, project) {
  let category
  for (const row of rows.slice(1)) {
    const subcategory = toStringOrUndefined(row?.[1])
    const description = toStringOrUndefined(row?.[2])
    if (!subcategory && !description) {
      if (project.services.length) break
      continue
    }
    const nextCategory = toStringOrUndefined(row?.[0])
    if (nextCategory) category = nextCategory
    if (SKIP_SERVICES_SUBCATEGORY.test(subcategory ?? '')) continue
    project.services.push({
      category: category ?? '',
      subcategory: subcategory ?? '',
      description: description ?? '',
      monthlyAmount: toNumberOrUndefined(row[3]),
      // BUG FIX: ServicesTable's "Notes and Considerations" column (added
      // 2026-09-01) was never fed by the parser - column E was never read.
      notes: toStringOrUndefined(row[4]) ?? '',
    })
  }
}
