import * as XLSX from 'xlsx'
import { normalizeLabel } from '../cells.js'
import { STANDARD_SHEETS, tableStorageKey } from './keyMap.js'

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: undefined, raw: true })
}

export function isStandardWorkbook(workbook) {
  const names = new Set(workbook?.SheetNames ?? [])
  return STANDARD_SHEETS.every((name) => names.has(name))
}

function headerLabels(row) {
  return (row ?? []).map((cell) => (cell == null || cell === '' ? '' : String(cell).trim()))
}

function isYearHeader(label) {
  const year = Number(label)
  return Number.isInteger(year) && year >= 1900 && year <= 2200
}

function inferType(columns) {
  if (columns.some((column) => isYearHeader(column))) return 'yearly series'
  if (columns.some((column) => normalizeLabel(column) === 'value')) return 'single values'
  return 'list'
}

function dictionaryTypes(workbook) {
  const types = new Map()
  const rows = sheetRows(workbook, 'Dictionary')
  let header = null
  for (const row of rows) {
    const label = normalizeLabel(row?.[0])
    if (!header) {
      if (label === 'key') header = headerLabels(row).map((cell) => normalizeLabel(cell))
      continue
    }
    if (!label) continue
    if (label === 'table') break
    const record = {}
    header.forEach((column, index) => {
      if (column) record[column] = row[index]
    })
    const title = normalizeLabel(record.title)
    const type = normalizeLabel(record['table type'])
    if (title && type) types.set(title, type)
  }
  return types
}

function cellsFrom(header, row) {
  const cells = {}
  header.forEach((column, index) => {
    if (!column) return
    const value = row?.[index]
    if (value === undefined || value === null || value === '') return
    cells[column] = value
  })
  return cells
}

function tablesOnSheet(sheetName, rows, typeByTitle) {
  const tables = []
  let current = null

  const commit = () => {
    if (!current?.header) {
      current = null
      return
    }
    const columns = current.header.filter(Boolean)
    const titleKey = normalizeLabel(current.title)
    tables.push({
      sheet: sheetName,
      title: current.title,
      type: typeByTitle.get(titleKey) ?? inferType(columns),
      columns,
      rows: current.rows,
    })
    current = null
  }

  for (const row of rows) {
    const label = row?.[0]
    const normalized = normalizeLabel(label)
    if (normalized === 'table') {
      commit()
      current = { title: String(row?.[1] ?? '').trim(), header: null, rows: [] }
      continue
    }
    if (!current) continue
    if (!normalized) {
      if (current.header) commit()
      continue
    }
    if (!current.header) {
      if (normalized === 'key') current.header = headerLabels(row)
      else current = null
      continue
    }
    current.rows.push({ key: String(label).trim(), cells: cellsFrom(current.header, row) })
  }
  commit()
  return tables
}

/**
 * Read every TABLE in a TECBooks Standard 1.0 workbook.
 * Dictionary supplies the table type by title. Its sheet column is ignored:
 * some files label PREMISES as "Assumptions".
 */
export function readStandardWorkbook(workbook) {
  const typeByTitle = dictionaryTypes(workbook)
  const tables = {}
  for (const sheetName of workbook.SheetNames ?? []) {
    for (const table of tablesOnSheet(sheetName, sheetRows(workbook, sheetName), typeByTitle)) {
      tables[tableStorageKey(table.sheet, table.title)] = table
    }
  }
  return { version: '1.0', tables }
}
