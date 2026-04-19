import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Store } from 'tinybase'

/**
 * Returns a revision counter that increments whenever the given store mutates.
 *
 * The counter is intended to be used as a `useMemo` dependency so that derived
 * view-models are rebuilt only when the underlying store actually changes —
 * not on every local-state re-render of a component (e.g. typing into a
 * search input). Without this, every keystroke forces re-running O(N) scans
 * over the store even though nothing in the store changed.
 *
 * If `tableIds` is provided, only listens to those tables. Otherwise listens
 * to every table change.
 */
export function useStoreRevision(store: Store, tableIds?: readonly string[]): number {
  const [rev, setRev] = useState(0)

  useEffect(() => {
    const bump = () => setRev((r) => r + 1)
    if (tableIds && tableIds.length > 0) {
      const ids = tableIds.map((t) => store.addTableListener(t, bump))
      return () => {
        for (const id of ids) store.delListener(id)
      }
    }
    const id = store.addTablesListener(bump)
    return () => {
      store.delListener(id)
    }
    // tableIds is intentionally joined; callers should pass a stable array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, (tableIds ?? []).join(',')])

  return rev
}

/**
 * Revision counter that increments only when the set of row IDs in the given
 * tables changes — i.e. rows are added or removed. Cell edits within existing
 * rows do NOT bump this counter. Use this when your view-model's *structure*
 * depends on which rows exist, but the row contents are read elsewhere (e.g.
 * by per-cell subscriptions in leaf components).
 *
 * This is the counterpart to `useStoreRevision` for the "edit a single cell
 * without rebuilding the whole table view-model" pattern.
 */
export function useTableRowIdsRevision(store: Store, tableIds: readonly string[]): number {
  const [rev, setRev] = useState(0)
  useEffect(() => {
    const bump = () => setRev((r) => r + 1)
    const ids = tableIds.map((t) => store.addRowIdsListener(t, bump))
    return () => {
      for (const id of ids) store.delListener(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, tableIds.join(',')])
  return rev
}

/**
 * Subscribe to a single cell's value. Returns null if the row doesn't exist.
 * Uses `useSyncExternalStore` so React bails out of re-renders when the
 * scalar value is `===` to the previous snapshot.
 *
 * Combined with a parent view-model that does NOT depend on the cell, this
 * lets us re-render only the one cell on edit — no DataTable rebuild.
 */
export function useCellValue<T = unknown>(
  store: Store,
  tableId: string,
  rowId: string,
  cellId: string
): T | null {
  return useSyncExternalStore(
    (listener) => {
      if (!rowId) return () => {}
      const id = store.addCellListener(tableId, rowId, cellId, listener)
      return () => store.delListener(id)
    },
    () => {
      if (!rowId) return null
      return (store.getCell(tableId, rowId, cellId) ?? null) as T | null
    },
    () => null
  )
}
