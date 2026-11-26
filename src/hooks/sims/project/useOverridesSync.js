import { useEffect, useMemo, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import useTableRows from './useTableRows.js'
import { replaceTableRowsRequest } from '@/sims/project-feasibility/api/rows.api.js'

const SAVE_DEBOUNCE_MS = 800

/**
 * Persists the cell overrides of some FIXED rows of an EditableTableSlice
 * (rows marked `editable: true`, e.g. Current Actives → Stocks) in D1
 * row_table, under their own `tableKey` (one row_table row per rowKey,
 * values = { [year]: value }). Without this an override lived only in Redux
 * and was gone on reload.
 *
 * Same guards as useTableRowsSync (read its header): hydrate once per
 * gameId before any write is allowed - an empty PUT is a DELETE - and flush
 * a pending write when leaving the project instead of dropping it.
 *
 * @param {number} gameId
 * @param {import('@/store/EditableTableSlice').EditableTableSlice} slice
 * @param {string} tableKey  row_table key, e.g. 'currentActivesOverrides'
 * @param {string[]} rowKeys fixed row keys whose overrides are persisted
 */
export default function useOverridesSync(gameId, slice, tableKey, rowKeys) {
  const dispatch = useDispatch()
  const { data } = useTableRows(gameId)
  const overrides = useSelector(slice.selectOverrides)
  const hydratedFor = useRef(null)
  const saveTimer = useRef(null)
  const pendingSave = useRef(null)
  const rowKeysKey = rowKeys.join('|')

  // Only the persisted rows' overrides, as row_table rows.
  const payload = useMemo(() => {
    const byRow = {}
    for (const [key, value] of Object.entries(overrides)) {
      const separator = key.indexOf(':')
      const rowKey = key.slice(0, separator)
      if (!rowKeys.includes(rowKey)) continue
      ;(byRow[rowKey] ??= {})[key.slice(separator + 1)] = value
    }
    return Object.entries(byRow).map(([rowId, values]) => ({ rowId, label: rowId, values }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, rowKeysKey])
  const payloadKey = JSON.stringify(payload)

  useEffect(() => {
    if (!data || hydratedFor.current === gameId) return
    hydratedFor.current = gameId
    dispatch(slice.actions.hydrateOverrides({ rowKeys, rows: data[tableKey] ?? [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, gameId])

  useEffect(() => {
    if (hydratedFor.current !== gameId) return
    if (!Number.isInteger(gameId) || gameId < 1) return
    clearTimeout(saveTimer.current)
    pendingSave.current = { gameId, tableKey, payload }
    saveTimer.current = setTimeout(() => {
      pendingSave.current = null
      replaceTableRowsRequest(gameId, tableKey, payload)
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(saveTimer.current)
    // payloadKey (not payload) so unrelated override edits don't re-save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, gameId, tableKey])

  useEffect(() => {
    return () => {
      const pending = pendingSave.current
      if (!pending) return
      pendingSave.current = null
      if (pending.gameId !== gameId) return
      replaceTableRowsRequest(pending.gameId, pending.tableKey, pending.payload)
    }
  }, [gameId])
}
