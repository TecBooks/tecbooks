import { detectYearHeader, normalizeLabel, toNumberOrUndefined } from './cells.js'

const MACHINE_HEADER_PATTERN = /^linea\s*\/?\s*maquina/

function firstHeaderYear(rows, predicate = () => true) {
  for (const row of rows ?? []) {
    if (!predicate(row)) continue
    const header = detectYearHeader(row)
    if (header) return header.years[0]
  }
  return undefined
}

function firstCosYear(rows) {
  for (const row of (rows ?? []).slice(1)) {
    const year = toNumberOrUndefined(row?.[7])
    const total = toNumberOrUndefined(row?.[8])
    if (Number.isInteger(year) && total !== undefined) return year
  }
  return undefined
}

/**
 * Where each sheet says the projection starts. Used to pre-select the
 * "Year zero" picker at upload - the user confirms or changes it, and the
 * workbook is then read against that year.
 *
 * `rowsBySheet`: { Premisas: rows, COs: rows, Capacidad: rows, Inversion: rows }
 * Returns { suggested, candidates: [{ sheet, firstYear }] }.
 */
export function detectYearZero(rowsBySheet) {
  const capacidad = rowsBySheet.Capacidad ?? []
  const candidates = [
    { sheet: 'Premisas', firstYear: firstHeaderYear(rowsBySheet.Premisas) },
    { sheet: 'COs (Año Cero)', firstYear: firstCosYear(rowsBySheet.COs) },
    { sheet: 'Capacidad (line)', firstYear: firstHeaderYear(capacidad.slice(0, 1)) },
    {
      sheet: 'Capacidad (machines)',
      firstYear: firstHeaderYear(capacidad, (row) =>
        (row ?? []).some((cell) => MACHINE_HEADER_PATTERN.test(normalizeLabel(cell))),
      ),
    },
    { sheet: 'Inversion', firstYear: firstHeaderYear(rowsBySheet.Inversion) },
  ].filter((candidate) => Number.isInteger(candidate.firstYear))

  // Most common first year wins; on a tie, COs' "Año Cero" (the sheet that
  // literally names year zero), else the earliest.
  const counts = new Map()
  candidates.forEach(({ firstYear }) => counts.set(firstYear, (counts.get(firstYear) ?? 0) + 1))
  const cosYear = candidates.find((c) => c.sheet.startsWith('COs'))?.firstYear
  let suggested
  let best = 0
  ;[...counts.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([year, count]) => {
      if (count > best || (count === best && year === cosYear)) {
        suggested = year
        best = count
      }
    })

  return { suggested, candidates }
}
