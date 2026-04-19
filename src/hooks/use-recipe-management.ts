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
  setProductShare: (userRecipeId: string, productItemOrTagId: string, percent: number) => void
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
      for (const upsId of buildStore.getRowIds('userProductShares')) {
        const ups = buildStore.getRow('userProductShares', upsId)
        if (ups.userRecipeId === userRecipeId) {
          buildStore.delRow('userProductShares', upsId)
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

  const setProductShare = (userRecipeId: string, productItemOrTagId: string, percent: number) => {
    // Resolve the recipe's non-reintegrated product item IDs in index order.
    // Mirrors the solver's definition of "primary = first non-reintegrated
    // product by recipeElements.index" so defaults line up.
    const ur = buildStore.getRow('userRecipes', userRecipeId)
    if (!ur) return
    const recipeId = ur.recipeId as string

    const ingredientIds = new Set<string>()
    const productsInOrder: { itemOrTagId: string; index: number }[] = []
    for (const reId of gameDataStore.getRowIds('recipeElements')) {
      const re = gameDataStore.getRow('recipeElements', reId)
      if (re.recipeId !== recipeId) continue
      if (re.isProduct) {
        productsInOrder.push({
          itemOrTagId: re.itemOrTagId as string,
          index: (re.index as number) ?? 0,
        })
      } else {
        ingredientIds.add(re.itemOrTagId as string)
      }
    }
    productsInOrder.sort((a, b) => a.index - b.index)
    const nonReintegrated = productsInOrder
      .map((p) => p.itemOrTagId)
      .filter((id) => !ingredientIds.has(id))

    if (nonReintegrated.length === 0) return
    if (!nonReintegrated.includes(productItemOrTagId)) return

    // Single non-reintegrated product → always 100%, no-op persistence.
    if (nonReintegrated.length === 1) return

    // Find existing rows for this userRecipeId. If none, bootstrap defaults
    // (primary=100, others=0) so the stored set is always complete.
    const existingByProductId = new Map<string, string>()
    const currentShares = new Map<string, number>()
    for (const upsId of buildStore.getRowIds('userProductShares')) {
      const ups = buildStore.getRow('userProductShares', upsId)
      if (ups.buildId !== buildId) continue
      if (ups.userRecipeId !== userRecipeId) continue
      const pid = ups.productItemOrTagId as string
      existingByProductId.set(pid, upsId)
      currentShares.set(pid, ups.sharePercent as number)
    }

    if (currentShares.size === 0) {
      for (let i = 0; i < nonReintegrated.length; i++) {
        currentShares.set(nonReintegrated[i], i === 0 ? 100 : 0)
      }
    } else {
      // Make sure every non-reintegrated product has an entry (handles a
      // stale stored set where a newly-added product is missing).
      for (const pid of nonReintegrated) {
        if (!currentShares.has(pid)) currentShares.set(pid, 0)
      }
    }

    // Apply the edit with strict sum-to-100: clamp v, then redistribute the
    // remainder across the other non-reintegrated products proportionally
    // (or equally if they all sit at 0). Round, then fix any ±1 drift.
    const v = Math.max(0, Math.min(100, Math.round(percent)))
    const others = nonReintegrated.filter((pid) => pid !== productItemOrTagId)
    const remainder = 100 - v

    const otherCurrentSum = others.reduce((s, pid) => s + (currentShares.get(pid) ?? 0), 0)
    const nextShares = new Map<string, number>()
    nextShares.set(productItemOrTagId, v)
    if (others.length > 0) {
      if (otherCurrentSum > 0) {
        for (const pid of others) {
          const cur = currentShares.get(pid) ?? 0
          nextShares.set(pid, Math.round((cur / otherCurrentSum) * remainder))
        }
      } else {
        const each = Math.floor(remainder / others.length)
        for (const pid of others) nextShares.set(pid, each)
      }

      // Correct rounding drift so the set sums to exactly 100. Apply any
      // diff to the largest "other" share (or the first if all are zero).
      let sum = 0
      for (const s of nextShares.values()) sum += s
      const drift = 100 - sum
      if (drift !== 0) {
        let targetPid = others[0]
        let best = -1
        for (const pid of others) {
          const cur = nextShares.get(pid) ?? 0
          if (cur > best) {
            best = cur
            targetPid = pid
          }
        }
        nextShares.set(targetPid, (nextShares.get(targetPid) ?? 0) + drift)
      }
    }

    buildStore.transaction(() => {
      for (const [pid, share] of nextShares) {
        const existingId = existingByProductId.get(pid)
        if (existingId) {
          buildStore.setCell('userProductShares', existingId, 'sharePercent', share)
        } else {
          const id = generateId()
          buildStore.setRow('userProductShares', id, {
            id,
            buildId,
            userRecipeId,
            productItemOrTagId: pid,
            sharePercent: share,
          })
        }
      }
    })
  }

  return {
    addRecipe,
    removeRecipe,
    setRecipeMargin,
    setProductMargin,
    setRoundFactor,
    setProductShare,
  }
}

export function useRecipeManagement(buildId: string): UseRecipeManagement {
  const { buildStore, gameDataStore } = useStores()
  return useMemo(
    () => createRecipeManagement(buildStore, gameDataStore, buildId),
    [buildStore, gameDataStore, buildId]
  )
}
