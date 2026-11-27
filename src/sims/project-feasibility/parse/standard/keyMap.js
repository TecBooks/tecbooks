// Stable Standard 1.0 keys that mean the same thing as an existing CBM field.
// Anything absent here stays on project.standard.

export const PREMISE_SERIES = {
  exchange_rate: 'fxClose',
  central_bank_policy_rate: 'nationalLeadingRate',
  average_cost_of_funds: 'cpp',
  treasury_bill_rate_28_days: 'cetes',
  us_dollar_reference_rate: 'libor',
  inflation_mexico: 'nationalInflation',
  inflation_abroad: 'foreignInflation',
  income_tax_rate: 'isr',
  employee_profit_sharing_rate: 'ptu',
  asset_tax_rate: 'impac',
  inventory: 'inventoryPct',
  accounts_payable: 'suppliersPct',
  short_term_liabilities: 'shortTermLiabilityPct',
  direct_cost: 'directProductCostPct',
  indirect_cost: 'indirectProductCostPct',
  selling_expenses: 'salesExpensePct',
  administrative_expenses: 'adminPct',
}

// Also written into premises.depreciationByCategory under the key's suffix.
export const DEPRECIATION_FIELDS = {
  depreciation_buildings: 'depreciationBuildings',
  depreciation_machinery: 'depreciationMachinery',
  depreciation_vehicles: 'depreciationTransport',
  depreciation_computer_equipment: 'depreciationCompute',
}

export const CAPACITY_LINE = {
  quality_yield: 'qualityYield',
  hours_per_shift: 'hoursShift',
  shifts_per_day: 'shifts',
  production_lines: 'productionLines',
  working_days_per_week: 'weekWorkingDays',
  operating_days_per_week: 'weekWorkingDays',
  working_weeks_per_month: 'monthsWorkingWeeks',
  operating_weeks_per_month: 'monthsWorkingWeeks',
  working_months_per_year: 'yearWorkingMonths',
  operating_months_per_year: 'yearWorkingMonths',
}

export const MONTH_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

export const STANDARD_SHEETS = ['General', 'PREMISES', 'Dictionary']

export function tableStorageKey(sheet, title) {
  return `${sheet} / ${title}`
}
