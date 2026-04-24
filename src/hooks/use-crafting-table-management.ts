import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

export interface UseCraftingTableManagement {
  addTable: (craftingTableId: string) => string
  getRecipesUsingTable: (userTableId: string) => string[]
  removeTableWithRecipes: (userTableId: string) => void
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
  gameDataStore: Store,
  buildId: string,
  datasetId: string
): UseCraftingTableManagement {
  const findDefaultMarginId = (): string => {
    for (const mId of buildStore.getRowIds('userMargins')) {
      const m = buildStore.getRow('userMargins', mId)
      if (m.buildId === buildId && m.isDefault) return mId
    }
    return ''
  }

  const addTable = (craftingTableId: string): string => {
    const id = generateId()
    buildStore.transaction(() => {
      buildStore.setRow('userCraftingTables', id, {
        id,
        buildId,
        craftingTableId,
        pluginModuleId: '',
        costPerMinute: 0,
      })

      const userSkillIds = new Set<string>()
      for (const usId of buildStore.getRowIds('userSkills')) {
        const us = buildStore.getRow('userSkills', usId)
        if (us.buildId === buildId) userSkillIds.add(us.skillId as string)
      }
      if (userSkillIds.size === 0) return

      const existingRecipeIds = new Set<string>()
      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId === buildId) existingRecipeIds.add(ur.recipeId as string)
      }

      const defaultMarginId = findDefaultMarginId()

      for (const rId of gameDataStore.getRowIds('recipes')) {
        const recipe = gameDataStore.getRow('recipes', rId)
        if (recipe.datasetId !== datasetId) continue
        if (recipe.craftingTableId !== craftingTableId) continue
        const skillId = recipe.skillId as string
        if (!skillId || !userSkillIds.has(skillId)) continue
        if (existingRecipeIds.has(rId)) continue

        const urId = generateId()
        buildStore.setRow('userRecipes', urId, {
          id: urId,
          buildId,
          recipeId: rId,
          roundFactor: 0,
        })
        if (defaultMarginId) {
          const urmId = generateId()
          buildStore.setRow('userRecipeMargins', urmId, {
            id: urmId,
            buildId,
            userRecipeId: urId,
            userMarginId: defaultMarginId,
          })
        }
      }
    })
    return id
  }

  const getRecipesUsingTable = (userTableId: string): string[] => {
    const craftingTableId = buildStore.getCell(
      'userCraftingTables',
      userTableId,
      'craftingTableId'
    ) as string | undefined
    if (!craftingTableId) return []

    const result: string[] = []
    for (const urId of buildStore.getRowIds('userRecipes')) {
      const ur = buildStore.getRow('userRecipes', urId)
      if (ur.buildId !== buildId) continue
      const recipeCtId = gameDataStore.getCell(
        'recipes',
        ur.recipeId as string,
        'craftingTableId'
      ) as string | undefined
      if (recipeCtId === craftingTableId) result.push(urId)
    }
    return result
  }

  const removeTableWithRecipes = (userTableId: string) => {
    const affectedUserRecipeIds = new Set(getRecipesUsingTable(userTableId))
    buildStore.transaction(() => {
      if (affectedUserRecipeIds.size > 0) {
        for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
          const urm = buildStore.getRow('userRecipeMargins', urmId)
          if (affectedUserRecipeIds.has(urm.userRecipeId as string)) {
            buildStore.delRow('userRecipeMargins', urmId)
          }
        }
        for (const upsId of buildStore.getRowIds('userProductShares')) {
          const ups = buildStore.getRow('userProductShares', upsId)
          if (affectedUserRecipeIds.has(ups.userRecipeId as string)) {
            buildStore.delRow('userProductShares', upsId)
          }
        }
        for (const urId of affectedUserRecipeIds) {
          buildStore.delRow('userRecipes', urId)
        }
      }
      buildStore.delRow('userCraftingTables', userTableId)
    })
  }

  return {
    addTable,
    getRecipesUsingTable,
    removeTableWithRecipes,
    setPluginModule: (userTableId: string, pluginModuleId: string) => {
      buildStore.setCell('userCraftingTables', userTableId, 'pluginModuleId', pluginModuleId)
    },
    setCostPerMinute: (userTableId: string, cost: number) => {
      buildStore.setCell('userCraftingTables', userTableId, 'costPerMinute', cost)
    },
  }
}

export function useCraftingTableManagement(
  buildId: string,
  datasetId: string
): UseCraftingTableManagement {
  const { buildStore, gameDataStore } = useStores()
  return useMemo(
    () => createCraftingTableManagement(buildStore, gameDataStore, buildId, datasetId),
    [buildStore, gameDataStore, buildId, datasetId]
  )
}
