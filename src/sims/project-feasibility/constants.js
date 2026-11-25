// The horizon is year zero + N projected years, N chosen by the user at
// upload (MIN..MAX_PROJECTION_YEARS, default 10 → 11 years). Year zero comes
// from the uploaded workbook (also chosen at upload - see parse/yearZero.js);
// a project's real years live in `cbm.timeline.years` - its length is the
// horizon length, never assume 11.
// HORIZON_YEARS / HORIZON_START_YEAR / HORIZON_LENGTH are only the legacy
// default (2025 + 10) for callers that have no project at hand (old tests,
// fixtures) - never use them to label, index or size a project's own data.
export const MIN_PROJECTION_YEARS = 2
export const MAX_PROJECTION_YEARS = 10
export const DEFAULT_PROJECTION_YEARS = 10
export const HORIZON_LENGTH = DEFAULT_PROJECTION_YEARS + 1
export const DEFAULT_YEAR_ZERO = 2025

export function clampProjectionYears(value) {
  const n = Number.isInteger(value) ? value : DEFAULT_PROJECTION_YEARS
  return Math.min(MAX_PROJECTION_YEARS, Math.max(MIN_PROJECTION_YEARS, n))
}

/** Year zero .. year zero + projectionYears (projectionYears + 1 years). */
export function horizonYears(yearZero = DEFAULT_YEAR_ZERO, projectionYears = DEFAULT_PROJECTION_YEARS) {
  const length = clampProjectionYears(projectionYears) + 1
  return Array.from({ length }, (_, i) => yearZero + i)
}

/** A project's own horizon: `cbm.timeline.years`, or the legacy default. */
export function projectYears(cbm) {
  const years = cbm?.timeline?.years
  return Array.isArray(years) && years.length ? years : horizonYears()
}

export const HORIZON_START_YEAR = DEFAULT_YEAR_ZERO
export const HORIZON_YEARS = horizonYears(DEFAULT_YEAR_ZERO)
export const HORIZON_END_YEAR = HORIZON_YEARS[HORIZON_LENGTH - 1]

// A header cell counts as a year in this range (wide on purpose - the check
// that matters is "strictly increasing", see detectYearHeader).
export const MIN_SHEET_YEAR = 1950
export const MAX_SHEET_YEAR = 2150

export const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export const REQUIRED_SHEETS = [
  'Premisas',
  'COs',
  'Capacidad',
  'BOM',
  'Inversion',
  'Empleados_2',
  'Servicios',
]

export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_PROJECTS_PER_PROGRAM = 10
export const ALLOWED_EXTENSIONS = ['.xlsx', '.xls']

export const SKIP_SERVICES_SUBCATEGORY = /sueldos y salarios/i
