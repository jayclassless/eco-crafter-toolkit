import { useMemo } from 'react'
import type { Cell, Store } from 'tinybase'

import { useStores } from '@/stores/providers'

interface UseSettings {
  /**
   * Returns the row id of the singleton settings row for this build, or
   * empty string if it doesn't exist yet.
   */
  getSettingsRowId: () => string
  setSetting: (field: string, value: Cell) => void
}

export function createSettings(buildStore: Store, buildId: string): UseSettings {
  const getSettingsRowId = (): string => {
    for (const rowId of buildStore.getRowIds('userSettings')) {
      const row = buildStore.getRow('userSettings', rowId)
      if (row.buildId === buildId) return rowId
    }
    return ''
  }

  return {
    getSettingsRowId,
    setSetting: (field: string, value: Cell) => {
      const rowId = getSettingsRowId()
      if (!rowId) return
      buildStore.setCell('userSettings', rowId, field, value)
    },
  }
}

export function useSettings(buildId: string): UseSettings {
  const { buildStore } = useStores()
  return useMemo(() => createSettings(buildStore, buildId), [buildStore, buildId])
}
