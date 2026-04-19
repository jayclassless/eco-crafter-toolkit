import { useMemo } from 'react'
import type { Cell, Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

export interface UseMarginManagement {
  createMargin: (name?: string, percent?: number) => string
  updateMargin: (marginId: string, field: 'name' | 'percent', value: Cell) => void
  setDefaultMargin: (marginId: string) => void
  /**
   * Counts the recipe-margin links that would be reassigned if this margin
   * were deleted. Useful for confirmation prompts.
   */
  countAffectedRecipes: (marginId: string) => number
  /**
   * Deletes a margin. Any recipes pointing at it are reassigned to the
   * remaining default margin (or another margin if no default exists).
   * Returns false if this is the last margin (deletion blocked).
   */
  deleteMargin: (marginId: string) => boolean
}

export function createMarginManagement(buildStore: Store, buildId: string): UseMarginManagement {
  const buildMargins = (): Array<{ id: string; isDefault: boolean }> => {
    const result: Array<{ id: string; isDefault: boolean }> = []
    for (const id of buildStore.getRowIds('userMargins')) {
      const row = buildStore.getRow('userMargins', id)
      if (row.buildId === buildId) {
        result.push({ id, isDefault: row.isDefault as boolean })
      }
    }
    return result
  }

  const createMargin = (name?: string, percent: number = 10): string => {
    const margins = buildMargins()
    const id = generateId()
    buildStore.setRow('userMargins', id, {
      id,
      buildId,
      name: name ?? `Margin ${margins.length + 1}`,
      percent,
    })
    return id
  }

  const updateMargin = (marginId: string, field: 'name' | 'percent', value: Cell) => {
    buildStore.setCell('userMargins', marginId, field, value)
  }

  const setDefaultMargin = (marginId: string) => {
    buildStore.transaction(() => {
      for (const m of buildMargins()) {
        if (m.id !== marginId && m.isDefault) {
          buildStore.setCell('userMargins', m.id, 'isDefault', false)
        }
      }
      buildStore.setCell('userMargins', marginId, 'isDefault', true)
    })
  }

  const countAffectedRecipes = (marginId: string): number => {
    let count = 0
    for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
      const urm = buildStore.getRow('userRecipeMargins', urmId)
      if (urm.buildId === buildId && urm.userMarginId === marginId) count++
    }
    return count
  }

  const deleteMargin = (marginId: string): boolean => {
    const margins = buildMargins()
    if (margins.length <= 1) return false

    buildStore.transaction(() => {
      const deleted = margins.find((m) => m.id === marginId)
      const wasDefault = deleted?.isDefault ?? false

      // Pick the reassignment target: the existing default if it isn't being
      // deleted, otherwise any other margin.
      const fallback =
        margins.find((m) => m.isDefault && m.id !== marginId) ??
        margins.find((m) => m.id !== marginId)

      if (fallback) {
        for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
          const urm = buildStore.getRow('userRecipeMargins', urmId)
          if (urm.buildId === buildId && urm.userMarginId === marginId) {
            buildStore.setCell('userRecipeMargins', urmId, 'userMarginId', fallback.id)
          }
        }
      }

      buildStore.delRow('userMargins', marginId)

      // If we deleted the default, promote the fallback so the build always
      // has exactly one default margin.
      if (wasDefault && fallback) {
        buildStore.setCell('userMargins', fallback.id, 'isDefault', true)
      }
    })

    return true
  }

  return { createMargin, updateMargin, setDefaultMargin, countAffectedRecipes, deleteMargin }
}

export function useMarginManagement(buildId: string): UseMarginManagement {
  const { buildStore } = useStores()
  return useMemo(() => createMarginManagement(buildStore, buildId), [buildStore, buildId])
}
