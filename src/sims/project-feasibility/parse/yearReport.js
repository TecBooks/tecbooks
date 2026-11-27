import { isBlank } from './cells.js'

const MAX_LISTED_YEARS = 4

function listYears(years) {
  if (years.length <= MAX_LISTED_YEARS) return years.join(', ')
  return `${years.slice(0, MAX_LISTED_YEARS).join(', ')} and ${years.length - MAX_LISTED_YEARS} more`
}

/**
 * Collects year problems while the sheets are read, against the project's
 * horizon (year zero .. year zero + 10):
 *
 * - errors (block the upload):
 *     a year header that skips a year (2026 | 2028), or that is missing a
 *     horizon year (year zero 2026 but the header stops at 2035)
 * - warnings (upload allowed):
 *     a value row with an empty cell under a year its header does have
 *
 * Messages name the sheet, the block/row and the years, so the user can fix
 * the workbook without opening the processed data.
 */
export function createYearReport(years) {
  const errors = []
  const warnings = []
  const seenHeaders = new Set()

  /** header: detectYearHeader() result. `where` e.g. 'Premisas · POLITICAS'. */
  function checkHeader(where, header) {
    if (!header) return
    const key = `${where}|${header.years.join(',')}`
    if (seenHeaders.has(key)) return
    seenHeaders.add(key)

    const skipped = []
    for (let i = 1; i < header.years.length; i += 1) {
      for (let year = header.years[i - 1] + 1; year < header.years[i]; year += 1) {
        skipped.push(year)
      }
    }
    if (skipped.length) {
      errors.push(`${where}: the year header skips ${listYears(skipped)}`)
    }

    const missing = years.filter((year) => !(year in header.columns) && !skipped.includes(year))
    if (missing.length) {
      errors.push(
        `${where}: no column for ${listYears(missing)} (year zero is ${years[0]}, the horizon is ${years[0]}-${years[years.length - 1]})`,
      )
    }
  }

  /** Warn about blank cells under year columns the header DOES have. */
  function checkRowCells(where, row, colMap) {
    const present = years.filter((year) => year in colMap)
    if (!present.length) return
    const blank = present.filter((year) => isBlank(row?.[colMap[year]]))
    if (!blank.length) return
    if (blank.length === present.length) {
      warnings.push(`${where}: no values in any year`)
    } else {
      warnings.push(`${where}: empty cell in ${listYears(blank)}`)
    }
  }

  function error(message) {
    errors.push(message)
  }

  function warning(message) {
    warnings.push(message)
  }

  return { years, errors, warnings, checkHeader, checkRowCells, error, warning }
}
