import { HORIZON_LENGTH, HORIZON_YEARS, MAX_SHEET_YEAR, MIN_SHEET_YEAR } from '../constants.js'

export function emptyYearSeries(length = HORIZON_LENGTH) {
  return Array.from({ length }, () => undefined)
}

export function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

/** Empty → undefined. "-" is not coerced to 0 here. */
export function toNumberOrUndefined(value) {
  if (isBlank(value)) return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  const trimmed = String(value).trim().replace(/,/g, '')
  if (trimmed === '-') return undefined
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : undefined
}

/** COs year-zero orders: "-" and empty → 0. */
export function toNumberDashAsZero(value) {
  if (isBlank(value)) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const trimmed = String(value).trim().replace(/,/g, '')
  if (trimmed === '-') return 0
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : 0
}

export function toStringOrUndefined(value) {
  if (isBlank(value)) return undefined
  return String(value).trim()
}

function asSheetYear(cell) {
  const year = typeof cell === 'number' ? cell : Number(String(cell ?? '').trim())
  return Number.isInteger(year) && year >= MIN_SHEET_YEAR && year <= MAX_SHEET_YEAR ? year : null
}

/**
 * A row is a year header when it has at least 2 year-like cells and they are
 * strictly increasing left to right (2026 | 2027 | ...). The "increasing"
 * rule keeps a data row that repeats a value like 2000 from passing as a
 * header. A header that skips a year (2026 | 2028) still counts - the gap is
 * reported by the year report, not hidden.
 *
 * Returns { years: [...in column order], columns: {year: colIndex} } or null.
 */
export function detectYearHeader(row) {
  if (!Array.isArray(row)) return null
  const years = []
  const columns = {}
  row.forEach((cell, index) => {
    const year = asSheetYear(cell)
    if (year === null) return
    years.push(year)
    columns[year] = index
  })
  if (years.length < 2) return null
  for (let i = 1; i < years.length; i += 1) {
    if (years[i] <= years[i - 1]) return null
  }
  return { years, columns }
}

/** {year: colIndex} for the horizon years this header has (others dropped). */
export function yearColumnMap(headerRow, years = HORIZON_YEARS) {
  const header = detectYearHeader(headerRow)
  if (!header) return {}
  const map = {}
  years.forEach((year) => {
    if (year in header.columns) map[year] = header.columns[year]
  })
  return map
}

export function seriesFromRow(row, colMap, years = HORIZON_YEARS) {
  return years.map((year) => {
    if (!(year in colMap)) return undefined
    return toNumberOrUndefined(row?.[colMap[year]])
  })
}

export function findRowByLabel(rows, expected) {
  const target = normalizeLabel(expected)
  return rows.find((row) => normalizeLabel(row?.[0]) === target) ?? null
}

export function labelIncludes(row, fragment) {
  return normalizeLabel(row?.[0]).includes(normalizeLabel(fragment))
}
