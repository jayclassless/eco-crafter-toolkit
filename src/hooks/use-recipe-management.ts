import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

import { ensureUserCraftingTable } from './use-crafting-table-management'

export interface UseRecipeManagement {
  addRecipe: (recipeId: string) => string
  removeRecipe: (userRecipeId: string) => void
  setRecipeMargin: (userRecipeId: string, marginId: string) => void
  setProductMargin: (productId: string, marginId: string) => void
  setRoundFactor: (userRecipeId: string, factor: number) => void
}

export function createRecipeManagement(
  buildStore: Store,
  gameDataStore: Store,
  buildId: string
): UseRecipeManagement {
  const findDefaultMarginId = (): string => {
    for (const mId of buildStore.getRowIds('userMargins')) {
      const m = buildStore.getRow('userMargins', mId)
      if (m.buildId === buildId && m.isDefault) return mId
    }
    return ''
  }

  const findUrmId = (userRecipeId: string): string => {
    for (const id of buildStore.getRowIds('userRecipeMargins')) {
      const urm = buildStore.getRow('userRecipeMargins', id)
      if (urm.buildId === buildId && urm.userRecipeId === userRecipeId) return id
    }
    return ''
  }

  const findUpmId = (productId: string): string => {
    for (const id of buildStore.getRowIds('userProductMargins')) {
      const upm = buildStore.getRow('userProductMargins', id)
      if (upm.buildId === buildId && upm.itemOrTagId === productId) return id
    }
    return ''
  }

  const addRecipe = (recipeId: string): string => {
    let userRecipeId = ''
    buildStore.transaction(() => {
      userRecipeId = generateId()
      buildStore.setRow('userRecipes', userRecipeId, {
        id: userRecipeId,
        buildId,
        recipeId,
        roundFactor: 0,
      })

      const defaultMarginId = findDefaultMarginId()
      if (defaultMarginId) {
        const urmId = generateId()
        buildStore.setRow('userRecipeMargins', urmId, {
          id: urmId,
          buildId,
          userRecipeId,
          userMarginId: defaultMarginId,
        })
      }

      // Auto-add the recipe's crafting table to the build if it isn't
      // already present, so the solver has a table to cost against.
      const craftingTableId = gameDataStore.getCell('recipes', recipeId, 'craftingTableId') as
        | string
        | undefined
      if (craftingTableId) {
        ensureUserCraftingTable(buildStore, buildId, craftingTableId)
      }
    })
    return userRecipeId
  }

  const removeRecipe = (userRecipeId: string) => {
    buildStore.transaction(() => {
      for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
        const urm = buildStore.getRow('userRecipeMargins', urmId)
        if (urm.userRecipeId === userRecipeId) {
          buildStore.delRow('userRecipeMargins', urmId)
        }
      }
      buildStore.delRow('userRecipes', userRecipeId)
    })
  }

  const setRecipeMargin = (userRecipeId: string, marginId: string) => {
    if (!marginId) return
    const existing = findUrmId(userRecipeId)
    if (existing) {
      buildStore.setCell('userRecipeMargins', existing, 'userMarginId', marginId)
    } else {
      const id = generateId()
      buildStore.setRow('userRecipeMargins', id, {
        id,
        buildId,
        userRecipeId,
        userMarginId: marginId,
      })
    }
  }

  const setProductMargin = (productId: string, marginId: string) => {
    const existing = findUpmId(productId)
    if (!marginId) {
      if (existing) buildStore.delRow('userProductMargins', existing)
      return
    }
    if (existing) {
      buildStore.setCell('userProductMargins', existing, 'userMarginId', marginId)
    } else {
      const id = generateId()
      buildStore.setRow('userProductMargins', id, {
        id,
        buildId,
        itemOrTagId: productId,
        userMarginId: marginId,
      })
    }
  }

  const setRoundFactor = (userRecipeId: string, factor: number) => {
    buildStore.setCell('userRecipes', userRecipeId, 'roundFactor', factor)
  }

  return { addRecipe, removeRecipe, setRecipeMargin, setProductMargin, setRoundFactor }
}

export function useRecipeManagement(buildId: string): UseRecipeManagement {
  const { buildStore, gameDataStore } = useStores()
  return useMemo(
    () => createRecipeManagement(buildStore, gameDataStore, buildId),
    [buildStore, gameDataStore, buildId]
  )
}
