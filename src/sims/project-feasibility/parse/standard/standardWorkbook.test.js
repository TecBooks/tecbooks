import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HORIZON_YEARS } from '../../constants.js'
import { computeFixedAssetsByCategory } from '../../balance/computeFixedAssets.js'
import { cbmToCostTableInputs } from '../../costTable/cbmToCostTableInputs.js'
import { parseNovusProject } from '../parseNovusProject.js'

function readWorkbook(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath))
}

function parse(relativePath) {
  return parseNovusProject(readWorkbook(relativePath), { fileName: path.basename(relativePath) })
}

describe('InputNovus upload is unchanged', () => {
  const { project, validation } = parse('work/InputNovus_last.xlsx')

  it('keeps the novus source and does not grow a standard capture', () => {
    expect(project.metadata.source).toBe('novus-excel')
    expect(project.standard).toBeUndefined()
    expect(project.metadata.name).toBe('NombreProducto')
    expect(project.bom.productName).toBe('NombreProducto')
    expect(project.premises.fxClose[0]).toBe(16.66)
    expect(project.demand.monthShares[0]).toBe(0.08)
    expect(project.capacity.machines[0].code).toBe('M-001')
    expect(validation.errors).not.toContain('Capacity must have at least one machine')
  })

  it('still feeds the existing dashboard calculators', () => {
    const { production } = cbmToCostTableInputs(project)
    expect(production.purchaseOrders).toBeTypeOf('object')
    expect(Object.keys(production.purchaseOrders).length).toBeGreaterThan(0)
    const fixedAssets = computeFixedAssetsByCategory(project, HORIZON_YEARS)
    expect(Object.keys(fixedAssets).length).toBeGreaterThan(0)
  })
})

describe('Standard 1.0 capture', () => {
  it('reads Agribusiness into the existing slots and leaves hectare tasks out of machines', () => {
    const { project, validation } = parse('work/templates/Template__Agribusiness.xlsx')

    expect(project.metadata.source).toBe('tecbooks-standard-1.0')
    expect(project.metadata.businessFamily).toBe('Agribusiness')
    expect(project.metadata.name).toContain('Hass avocado')
    expect(project.bom.productName).toBe('Hass avocado')
    expect(project.bom.salePrice).toBe(28000)
    expect(project.premises.fxClose[0]).toBe(18)
    expect(project.demand.monthShares[0]).toBe(0.12)
    expect(project.demand.yearlyTotals).toContainEqual({ year: 2025, total: 2418 })
    expect(project.demand.yearZeroYear).toBe(2025)
    expect(project.demand.yearZeroTotal).toBe(2418)
    expect(project.bom.parts[0]).toMatchObject({ id: 'bom_fe001', quantity: 1 })
    expect(project.bom.parts[0].cost).toBeCloseTo(463.192721257237, 6)
    expect(project.capacity.machines).toEqual([])
    expect(project.capacity.line.secondsPerUnit.every((value) => value === undefined)).toBe(true)
    expect(project.standard.tables['Industry / Orchard parameters']).toBeTruthy()
    expect(project.standard.unmappedKeys).toContain('mature_hectares')
    expect(project.standard.unmappedKeys).toContain('task_pruning')
    expect(project.assets.byCategory['Machinery and equipment']?.length).toBeGreaterThan(0)

    const operator = project.derivedBase.employees.find((employee) => employee.name.startsWith('Field worker'))
    expect(operator.category).toBe('direct')
    expect(operator.quantity).toBe(47)

    expect(validation.errors).toEqual([])
    const { production } = cbmToCostTableInputs(project)
    expect(production.purchaseOrders[2025]).toBe(2418)
    expect(() => computeFixedAssetsByCategory(project, HORIZON_YEARS)).not.toThrow()
  })

  it('maps a manufactured process to a machine and ignores a plant that has none', () => {
    const transformative = parse('work/templates/ProcesosTransformativos_Estandarizado.xlsx').project
    const machine = transformative.capacity.machines.find((item) => item.code === 'op_001')
    expect(machine).toMatchObject({ processSeconds: 60, operators: 6, cycleTime: 10 })
    expect(() => cbmToCostTableInputs(transformative)).not.toThrow()
    expect(() => computeFixedAssetsByCategory(transformative, HORIZON_YEARS)).not.toThrow()

    const realEstate = parse('work/templates/Template_Financiero_RealEstate_Estandarizado.xlsx').project
    expect(realEstate.capacity.machines).toEqual([])
    expect(() => cbmToCostTableInputs(realEstate)).not.toThrow()
    expect(() => computeFixedAssetsByCategory(realEstate, HORIZON_YEARS)).not.toThrow()

    const manufacturing = parse('work/templates/TECBooks_Manufacturing_Standard_EN_v1.0.xlsx').project
    expect(manufacturing.capacity.machines).toEqual([])
    expect(manufacturing.capacity.line.secondsPerUnit.every((value) => value === undefined)).toBe(true)
    expect(manufacturing.standard.unmappedKeys).toContain('units_per_hour')
    expect(() => cbmToCostTableInputs(manufacturing)).not.toThrow()
    expect(() => computeFixedAssetsByCategory(manufacturing, HORIZON_YEARS)).not.toThrow()
  })

  it('opens human capital on the existing calculators with an empty factory', () => {
    const { project, validation } = parse('work/templates/Template_TECBooks_Human_Capital_EN (1).xlsx')
    expect(project.capacity.machines).toEqual([])
    expect(validation.errors).toContain('BOM must have at least one part')
    expect(validation.errors.some((error) => error.includes('Laboratory'))).toBe(false)
    expect(project.bom.productName).toBe('High school')
    expect(project.bom.salePrice).toBe(133000)
    expect(project.demand.yearZeroYear).toBe(2026)
    const { production } = cbmToCostTableInputs(project)
    expect(production.purchaseOrders[2026]).toBeCloseTo(1403.33333333333, 4)
    expect(() => computeFixedAssetsByCategory(project, HORIZON_YEARS)).not.toThrow()
  })
})
