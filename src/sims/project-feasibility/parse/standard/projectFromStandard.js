import { HORIZON_YEARS } from '../../constants.js'
import { emptyYearSeries, normalizeLabel, toNumberOrUndefined, toStringOrUndefined } from '../cells.js'
import {
  CAPACITY_LINE,
  DEPRECIATION_FIELDS,
  MONTH_INDEX,
  PREMISE_SERIES,
  tableStorageKey,
} from './keyMap.js'

function cell(row, header) {
  if (!row?.cells) return undefined
  const target = normalizeLabel(header)
  for (const [name, value] of Object.entries(row.cells)) {
    if (normalizeLabel(name) === target) return value
  }
  return undefined
}

function text(row, header) {
  return toStringOrUndefined(cell(row, header))
}

function number(row, header) {
  return toNumberOrUndefined(cell(row, header))
}

function findTable(tables, sheet, title) {
  return tables[tableStorageKey(sheet, title)] ?? null
}

function tablesOn(tables, sheet) {
  return Object.values(tables).filter((table) => table.sheet === sheet)
}

function horizonSeries(row) {
  const series = emptyYearSeries()
  let found = false
  if (!row) return { series, found }
  for (let index = 0; index < HORIZON_YEARS.length; index += 1) {
    const value = toNumberOrUndefined(row.cells[String(HORIZON_YEARS[index])])
    if (value === undefined) continue
    series[index] = value
    found = true
  }
  return { series, found }
}

function firstHorizonValue(row) {
  if (!row) return null
  for (const year of HORIZON_YEARS) {
    const value = toNumberOrUndefined(row.cells[String(year)])
    if (value !== undefined) return { year, value }
  }
  return null
}

function rowByKey(table, key) {
  return table?.rows?.find((row) => row.key === key) ?? null
}

function legacyAssetBucket(category) {
  const label = normalizeLabel(category)
  if (label.includes('vehicle') || label.includes('transporte') || label.includes('transport')) return 'transport'
  if (label.includes('building') || label.includes('edificio')) return 'buildings'
  if (label.includes('computer') || label.includes('computo')) return 'compute'
  return null
}

function pushAsset(project, category, asset) {
  const label = category || 'Assets'
  project.assets.byCategory[label] ??= []
  project.assets.byCategory[label].push(asset)
  const bucket = legacyAssetBucket(label)
  if (bucket) project.assets[bucket].push(asset)
}

function purchaseSeries(purchaseYear, amount) {
  const series = emptyYearSeries()
  if (amount === undefined) return series
  HORIZON_YEARS.forEach((year, index) => {
    if (purchaseYear === undefined || year >= purchaseYear) series[index] = amount
  })
  return series
}

function rowMatchingProduct(table, productKey, prefixes) {
  if (!table || !productKey) return null
  const prefixed = prefixes.map((prefix) => `${prefix}${productKey}`)
  return (
    table.rows.find((row) => prefixed.includes(row.key))
    ?? table.rows.find((row) => row.key.includes(productKey))
    ?? null
  )
}

function depreciationLabel(key) {
  return key.replace(/^depreciation_/, '').replace(/_/g, ' ')
}

/**
 * Copy Standard 1.0 keys that mean the same thing as an existing CBM slot.
 * Every table is kept on project.standard. Keys that are not copied are listed
 * on project.standard.unmappedKeys.
 */
export function projectFromStandard(project, captured) {
  const tables = captured.tables ?? {}
  const consumed = new Set()

  const general = findTable(tables, 'General', 'General information')
  const company = rowByKey(general, 'company_name')
  const family = rowByKey(general, 'business_family')
  const cash = rowByKey(general, 'initial_cash_balance')
  if (company) {
    project.metadata.name = text(company, 'Value') ?? ''
    consumed.add(company.key)
  }
  if (family) {
    project.metadata.businessFamily = text(family, 'Value') ?? ''
    consumed.add(family.key)
  }
  if (cash) {
    const startingMoney = number(cash, 'Value')
    if (startingMoney !== undefined) project.premises.startingMoney = startingMoney
    consumed.add(cash.key)
  }

  for (const table of tablesOn(tables, 'PREMISES')) {
    for (const row of table.rows) {
      const { series, found } = horizonSeries(row)
      if (row.key.startsWith('depreciation_')) {
        if (found) {
          // Item text matches Investment's asset class ("Laboratory and workshop
          // equipment"). The key suffix ("laboratory equipment") does not.
          const itemLabel = text(row, 'Item')
          if (itemLabel) project.premises.depreciationByCategory[itemLabel] = series
          project.premises.depreciationByCategory[depreciationLabel(row.key)] = series
          const field = DEPRECIATION_FIELDS[row.key]
          if (field) project.premises[field] = series
        }
        consumed.add(row.key)
        continue
      }
      const field = PREMISE_SERIES[row.key]
      if (!field) continue
      if (found) project.premises[field] = series
      consumed.add(row.key)
    }
  }

  const products = findTable(tables, 'Demand', 'Products and services')
  const product = products?.rows?.[0] ?? null
  const productKey = product?.key
  if (product) {
    project.bom.productName = text(product, 'Product') ?? ''
    consumed.add(product.key)
  }

  const seasonality = findTable(tables, 'Demand', 'Monthly seasonality')
  for (const row of seasonality?.rows ?? []) {
    const index = MONTH_INDEX[row.key]
    if (index === undefined) continue
    const share = number(row, '% of annual volume')
    if (share !== undefined) project.demand.monthShares[index] = share
    const yearOne = number(row, 'Year 1 volume (optional)')
    if (yearOne !== undefined) project.demand.yearZeroOrders[index] = yearOne
    consumed.add(row.key)
  }

  const volume = rowMatchingProduct(findTable(tables, 'Demand', 'Sales volume by year'), productKey, ['volume_', 'enrollment_'])
  if (volume) {
    const yearlyTotals = []
    for (const year of HORIZON_YEARS) {
      const total = toNumberOrUndefined(volume.cells[String(year)])
      if (total !== undefined) yearlyTotals.push({ year, total })
    }
    project.demand.yearlyTotals = yearlyTotals
    const first = yearlyTotals[0]
    if (first) {
      project.demand.yearZeroYear = first.year
      project.demand.yearZeroTotal = first.total
    }
    consumed.add(volume.key)
  }

  const price = rowMatchingProduct(findTable(tables, 'Demand', 'Sales price by year'), productKey, ['price_', 'net_tuition_'])
  if (price) {
    const first = firstHorizonValue(price)
    if (first) project.bom.salePrice = first.value
    consumed.add(price.key)
  }

  const history = findTable(tables, 'Demand', 'Historical sales')
  for (const row of history?.rows ?? []) {
    const year = number(row, 'Year')
    const total = number(row, 'Volume')
    if (year === undefined || total === undefined) continue
    project.demand.history.push({ year, total })
    consumed.add(row.key)
  }

  const capacity = findTable(tables, 'Capacity', 'Installed capacity by year')
  for (const row of capacity?.rows ?? []) {
    const field = CAPACITY_LINE[row.key]
    if (!field) continue
    const { series, found } = horizonSeries(row)
    if (found) project.capacity.line[field] = series
    consumed.add(row.key)
  }

  const processes = findTable(tables, 'Capacity', 'Processes and productive resources')
  for (const row of processes?.rows ?? []) {
    const unit = normalizeLabel(cell(row, 'Capacity unit'))
    if (unit !== 'unit' && unit !== 'units') continue
    project.capacity.machines.push({
      code: row.key,
      description: text(row, 'Description'),
      processSeconds: number(row, 'Process time (seconds)'),
      operators: number(row, 'Operators or units'),
      cycleTime: number(row, 'Cycle time (seconds)'),
      acquisitionByYear: emptyYearSeries(),
    })
    consumed.add(row.key)
  }

  const bill = findTable(tables, 'Bill of Materials', 'Bill of materials')
  for (const row of bill?.rows ?? []) {
    const perUnit = number(row, 'Cost per unit of product')
    const quantity = perUnit === undefined ? number(row, 'Quantity per unit') : 1
    const cost = perUnit === undefined ? number(row, 'Unit cost') : perUnit
    project.bom.parts.push({
      id: row.key,
      description: text(row, 'Component') ?? '',
      quantity,
      cost,
    })
    consumed.add(row.key)
  }

  const positions = findTable(tables, 'Employees', 'Positions and benefits')
  const headcount = findTable(tables, 'Employees', 'Headcount by year')
  for (const row of positions?.rows ?? []) {
    const head = rowByKey(headcount, `headcount_${row.key}`)
    project.employees.push({
      name: text(row, 'Position') ?? row.key,
      type: text(row, 'Classification'),
      percepcion: number(row, 'Monthly base salary'),
      imss: number(row, 'Social security (employer)'),
      infonavit: number(row, 'Housing fund (employer)'),
      valesDespensa: number(row, 'Grocery vouchers'),
      primaVacacional: number(row, 'Vacation premium'),
      fondoAhorro: number(row, 'Savings fund'),
      comedor: number(row, 'Cafeteria'),
      isr: number(row, 'Income tax withheld'),
      cantidad: head ? firstHorizonValue(head)?.value : undefined,
    })
    consumed.add(row.key)
    if (head) consumed.add(head.key)
  }

  const expenses = findTable(tables, 'Expenses', 'Operating expenses by year')
  for (const row of expenses?.rows ?? []) {
    const item = text(row, 'Item') ?? row.key
    project.services.push({
      category: text(row, 'Category') ?? '',
      subcategory: item,
      description: item,
      monthlyAmount: firstHorizonValue(row)?.value,
      notes: text(row, 'Note') ?? '',
    })
    consumed.add(row.key)
  }

  const assetTable = findTable(tables, 'Investment', 'Fixed assets')
  const assetRows = assetTable?.rows ?? []
  if (assetRows.length) {
    for (const row of assetRows) {
      const quantity = number(row, 'Quantity')
      const unitCost = number(row, 'Unit cost')
      const total = number(row, 'Total amount') ?? (
        quantity !== undefined && unitCost !== undefined ? quantity * unitCost : undefined
      )
      pushAsset(project, text(row, 'Asset class') ?? '', {
        name: text(row, 'Description') ?? row.key,
        acquisitionByYear: purchaseSeries(number(row, 'Purchase year'), total),
      })
      consumed.add(row.key)
    }
  } else {
    const capex = findTable(tables, 'Investment', 'Capital expenditure plan')
    for (const row of capex?.rows ?? []) {
      const { series, found } = horizonSeries(row)
      if (!found) continue
      pushAsset(project, text(row, 'Asset class') ?? '', {
        name: text(row, 'Item') ?? row.key,
        acquisitionByYear: series,
      })
      consumed.add(row.key)
    }
  }

  const unmappedKeys = []
  for (const table of Object.values(tables)) {
    for (const row of table.rows) {
      if (!consumed.has(row.key)) unmappedKeys.push(row.key)
    }
  }

  project.standard = {
    version: captured.version ?? '1.0',
    tables,
    unmappedKeys,
  }
}
