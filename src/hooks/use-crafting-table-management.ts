import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

export interface UseCraftingTableManagement {
  addTable: (craftingTableId: string) => string
  removeTable: (userTableId: string) => void
  setPluginModule: (userTableId: string, pluginModuleId: string) => void
  setCostPerMinute: (userTableId: string, cost: number) => void
}

/**
 * Adds a `userCraftingTables` row for the given crafting table if the build
 * doesn't already have one. Returns the existing or newly-created row id, or
 * empty string if `craftingTableId` is empty. Intended to be called inside a
 * `buildStore.transaction` by callers that are already mutating the build
 * store (e.g. when adding a recipe or skill whose recipes need a table).
 */
export function ensureUserCraftingTable(
  buildStore: Store,
  buildId: string,
  craftingTableId: string
): string {
  if (!craftingTableId) return ''
  for (const rowId of buildStore.getRowIds('userCraftingTables')) {
    const row = buildStore.getRow('userCraftingTables', rowId)
    if (row.buildId === buildId && row.craftingTableId === craftingTableId) {
      return rowId
    }
  }
  const id = generateId()
  buildStore.setRow('userCraftingTables', id, {
    id,
    buildId,
    craftingTableId,
    pluginModuleId: '',
    costPerMinute: 0,
  })
  return id
}

export function createCraftingTableManagement(
  buildStore: Store,
  buildId: string
): UseCraftingTableManagement {
  return {
    addTable: (craftingTableId: string) => {
      const id = generateId()
      buildStore.setRow('userCraftingTables', id, {
        id,
        buildId,
        craftingTableId,
        pluginModuleId: '',
        costPerMinute: 0,
      })
      return id
    },
    removeTable: (userTableId: string) => {
      buildStore.delRow('userCraftingTables', userTableId)
    },
    setPluginModule: (userTableId: string, pluginModuleId: string) => {
      buildStore.setCell('userCraftingTables', userTableId, 'pluginModuleId', pluginModuleId)
    },
    setCostPerMinute: (userTableId: string, cost: number) => {
      buildStore.setCell('userCraftingTables', userTableId, 'costPerMinute', cost)
    },
  }
}

export function useCraftingTableManagement(buildId: string): UseCraftingTableManagement {
  const { buildStore } = useStores()
  return useMemo(() => createCraftingTableManagement(buildStore, buildId), [buildStore, buildId])
}
