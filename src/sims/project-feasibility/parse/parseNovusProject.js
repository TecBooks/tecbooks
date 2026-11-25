import * as XLSX from 'xlsx'
import { DEFAULT_YEAR_ZERO, REQUIRED_SHEETS, clampProjectionYears, horizonYears } from '../constants.js'
import { createYearReport } from './yearReport.js'
import { detectYearZero } from './yearZero.js'
import { createProjectClass } from '../model/createProjectClass.js'
import { applyDerivedBase } from '../model/applyDerivedBase.js'
import { validateProjectClass } from '../model/validateProjectClass.js'
import { getFileGateError } from './fileGates.js'
import { Logger } from '../utils/logger.js'
import {
  readBOM,
  readCOs,
  readCapacidad,
  readEmpleados,
  readInversion,
  readPremisas,
  readServicios,
} from './sheets.js'

const logger = new Logger('ParseNovusProject')

function toRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: undefined, raw: true })
}

function readWorkbook(input) {
  if (input && input.SheetNames && input.Sheets) return input
  if (input instanceof ArrayBuffer) {
    return XLSX.read(input, { type: 'array' })
  }
  if (input instanceof Uint8Array) {
    return XLSX.read(input, { type: 'array' })
  }
  throw new Error('Expected an ArrayBuffer or an xlsx workbook')
}

/**
 * Parse one Novus project workbook.
 *
 * Year zero: `options.yearZero` (what the user picked at upload) or, when not
 * given, the one the workbook's own sheets suggest (parse/yearZero.js).
 * Projection: `options.projectionYears` (2-10, default 10). The horizon is
 * year zero .. year zero + projectionYears, and every sheet is read against
 * it (extra year columns past it are ignored).
 *
 * Returns { project, validation, yearZero: { selected, suggested, candidates, projectionYears } }.
 * `validation` includes the year report: a skipped or missing year column is
 * an error (blocks the upload), a blank cell is a warning.
 *
 * @param {ArrayBuffer | Uint8Array | object} input
 * @param {{ fileName?: string, yearZero?: number, projectionYears?: number }} [options]
 */
export function parseNovusProject(input, { fileName, yearZero, projectionYears } = {}) {
  logger.info('parsing workbook', { fileName, yearZero, projectionYears })
  const workbook = readWorkbook(input)
  const missing = REQUIRED_SHEETS.filter((name) => !workbook.Sheets[name])
  if (missing.length) {
    logger.warn('workbook missing required sheets', { fileName, missing })
    return {
      project: null,
      validation: {
        valid: false,
        errors: missing.map((name) => `Missing sheet "${name}"`),
        warnings: [],
      },
      yearZero: null,
    }
  }

  const rows = Object.fromEntries(REQUIRED_SHEETS.map((name) => [name, toRows(workbook, name)]))
  const detected = detectYearZero(rows)
  const selected = Number.isInteger(yearZero) ? yearZero : (detected.suggested ?? DEFAULT_YEAR_ZERO)
  const projection = clampProjectionYears(projectionYears)
  const years = horizonYears(selected, projection)
  const report = createYearReport(years)

  const project = createProjectClass({ fileName, years })
  readPremisas(rows.Premisas, project, report)
  readCOs(rows.COs, project, report)
  readCapacidad(rows.Capacidad, project, report)
  readBOM(rows.BOM, project)
  readInversion(rows.Inversion, project, report)
  readEmpleados(rows.Empleados_2, project)
  readServicios(rows.Servicios, project)

  project.metadata.name = project.bom.productName || ''
  applyDerivedBase(project)

  const modelValidation = validateProjectClass(project)
  const errors = [...report.errors, ...modelValidation.errors]
  const validation = {
    valid: errors.length === 0,
    errors,
    warnings: [...report.warnings, ...modelValidation.warnings],
  }
  if (!validation.valid) {
    logger.warn('workbook parsed with validation errors', { fileName, errors: validation.errors })
  } else {
    logger.debug('workbook parsed OK', { fileName })
  }

  return {
    project,
    validation,
    yearZero: {
      selected,
      suggested: detected.suggested,
      candidates: detected.candidates,
      projectionYears: projection,
    },
  }
}

export async function parseNovusProjectFile(file, { yearZero, projectionYears } = {}) {
  const gate = getFileGateError(file)
  if (gate) {
    logger.warn('rejected file before parsing', { fileName: file?.name, reason: gate })
    return {
      project: null,
      validation: { valid: false, errors: [gate], warnings: [] },
      yearZero: null,
    }
  }
  const buffer = await file.arrayBuffer()
  return parseNovusProject(buffer, { fileName: file.name, yearZero, projectionYears })
}
