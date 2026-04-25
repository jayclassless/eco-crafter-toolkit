import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { createRecipeManagement } from '../use-recipe-management'

const BUILD_ID = 'build1'
const DATASET_ID = 'ds1'
let buildStore: Store
let gameDataStore: Store

type Row = Record<string, unknown> & { id: string }
function rowsForBuild(store: Store, table: string): Row[] {
  return store
    .getRowIds(table)
    .map((id): Row => ({ id, ...(store.getRow(table, id) as Record<string, unknown>) }))
    .filter((r) => r.buildId === BUILD_ID)
}

function setupRecipe(id: string, craftingTableId: string) {
  gameDataStore.setRow('recipes', id, {
    id,
    datasetId: DATASET_ID,
    name: id,
    familyName: id,
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId,
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
}

beforeEach(() => {
  buildStore = createBuildStore()
  gameDataStore = createGameDataStore()
  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: DATASET_ID,
    name: 'T',
    createdAt: 'now',
  })
  buildStore.setRow('userMargins', 'm-default', {
    id: 'm-default',
    buildId: BUILD_ID,
    name: 'Default',
    percent: 15,
    isDefault: true,
  })
  buildStore.setRow('userMargins', 'm-other', {
    id: 'm-other',
    buildId: BUILD_ID,
    name: 'Other',
    percent: 5,
    isDefault: false,
  })
  setupRecipe('recipe-iron', 'ct-workbench')
  setupRecipe('recipe-copper', 'ct-workbench')
  setupRecipe('recipe-no-margin', 'ct-workbench')
})

const mgmt = () => createRecipeManagement(buildStore, gameDataStore, BUILD_ID)

describe('createRecipeManagement', () => {
  it('addRecipe creates a userRecipe and links it to the default margin', () => {
    const id = mgmt().addRecipe('recipe-iron')
    const recipes = rowsForBuild(buildStore, 'userRecipes')
    expect(recipes).toHaveLength(1)
    expect(recipes[0].id).toBe(id)
    const links = rowsForBuild(buildStore, 'userRecipeMargins')
    expect(links).toHaveLength(1)
    expect(links[0].userMarginId).toBe('m-default')
    expect(links[0].userRecipeId).toBe(id)
  })

  it('removeRecipe deletes the recipe and its margin links', () => {
    const id = mgmt().addRecipe('recipe-iron')
    const otherId = mgmt().addRecipe('recipe-copper')
    mgmt().removeRecipe(id)
    expect(rowsForBuild(buildStore, 'userRecipes').map((r) => r.id)).toEqual([otherId])
    // Only the link for the removed recipe is gone
    const remainingLinks = rowsForBuild(buildStore, 'userRecipeMargins')
    expect(remainingLinks).toHaveLength(1)
    expect(remainingLinks[0].userRecipeId).toBe(otherId)
  })

  it('setRecipeMargin updates an existing link', () => {
    const id = mgmt().addRecipe('recipe-iron')
    // Foreign-build link must NOT be matched by findUrmId
    buildStore.setRow('userRecipeMargins', 'urm-foreign', {
      id: 'urm-foreign',
      buildId: 'other-build',
      userRecipeId: id,
      userMarginId: 'm-default',
    })
    // Same-build link for a different userRecipe — also must NOT be matched
    buildStore.setRow('userRecipeMargins', 'urm-other-recipe', {
      id: 'urm-other-recipe',
      buildId: BUILD_ID,
      userRecipeId: 'ur-zzz',
      userMarginId: 'm-default',
    })
    mgmt().setRecipeMargin(id, 'm-other')
    const link = rowsForBuild(buildStore, 'userRecipeMargins').find((r) => r.userRecipeId === id)!
    expect(link.userMarginId).toBe('m-other')
  })

  it('setRecipeMargin creates a link if none exists', () => {
    // Pre-create a recipe without a margin link
    buildStore.setRow('userRecipes', 'ur-bare', {
      id: 'ur-bare',
      buildId: BUILD_ID,
      recipeId: 'rx',
      roundFactor: 0,
    })
    mgmt().setRecipeMargin('ur-bare', 'm-other')
    const link = rowsForBuild(buildStore, 'userRecipeMargins')[0]
    expect(link.userMarginId).toBe('m-other')
  })

  it('ignores default margins from other builds when linking', () => {
    // Foreign build's default margin should NOT be linked
    buildStore.setRow('userMargins', 'm-foreign-default', {
      id: 'm-foreign-default',
      buildId: 'other-build',
      name: 'Foreign',
      percent: 5,
      isDefault: true,
    })
    const id = mgmt().addRecipe('recipe-iron')
    const link = rowsForBuild(buildStore, 'userRecipeMargins')[0]
    expect(link.userMarginId).toBe('m-default')
    expect(link.userRecipeId).toBe(id)
  })

  it('addRecipe creates the recipe without a margin link when no default margin exists', () => {
    buildStore.delRow('userMargins', 'm-default')
    buildStore.delRow('userMargins', 'm-other')
    const id = mgmt().addRecipe('recipe-no-margin')
    expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(1)
    expect(rowsForBuild(buildStore, 'userRecipeMargins')).toHaveLength(0)
    expect(buildStore.getCell('userRecipes', id, 'recipeId')).toBe('recipe-no-margin')
  })

  it('setRecipeMargin is a no-op when given an empty marginId', () => {
    const id = mgmt().addRecipe('recipe-iron')
    mgmt().setRecipeMargin(id, '')
    // Default link from addRecipe stays in place
    const link = rowsForBuild(buildStore, 'userRecipeMargins')[0]
    expect(link.userMarginId).toBe('m-default')
  })

  it('setRoundFactor updates the cell', () => {
    const id = mgmt().addRecipe('r')
    mgmt().setRoundFactor(id, 4)
    expect(buildStore.getCell('userRecipes', id, 'roundFactor')).toBe(4)
  })

  describe('setProductMargin', () => {
    it('creates a userProductMargins row when none exists', () => {
      mgmt().setProductMargin('item-iron', 'm-other')
      const rows = rowsForBuild(buildStore, 'userProductMargins')
      expect(rows).toHaveLength(1)
      expect(rows[0].itemOrTagId).toBe('item-iron')
      expect(rows[0].userMarginId).toBe('m-other')
    })

    it('updates an existing same-build row in place', () => {
      buildStore.setRow('userProductMargins', 'upm1', {
        id: 'upm1',
        buildId: BUILD_ID,
        itemOrTagId: 'item-iron',
        userMarginId: 'm-default',
      })
      mgmt().setProductMargin('item-iron', 'm-other')
      expect(buildStore.getCell('userProductMargins', 'upm1', 'userMarginId')).toBe('m-other')
      expect(rowsForBuild(buildStore, 'userProductMargins')).toHaveLength(1)
    })

    it('ignores foreign-build rows when locating the existing row', () => {
      buildStore.setRow('userProductMargins', 'upm-foreign', {
        id: 'upm-foreign',
        buildId: 'other-build',
        itemOrTagId: 'item-iron',
        userMarginId: 'm-default',
      })
      mgmt().setProductMargin('item-iron', 'm-other')
      // A new row is added for our build; the foreign one is untouched.
      expect(buildStore.getCell('userProductMargins', 'upm-foreign', 'userMarginId')).toBe(
        'm-default'
      )
      const ours = rowsForBuild(buildStore, 'userProductMargins')
      expect(ours).toHaveLength(1)
      expect(ours[0].userMarginId).toBe('m-other')
    })

    it('deletes the existing row when marginId is empty', () => {
      buildStore.setRow('userProductMargins', 'upm1', {
        id: 'upm1',
        buildId: BUILD_ID,
        itemOrTagId: 'item-iron',
        userMarginId: 'm-other',
      })
      mgmt().setProductMargin('item-iron', '')
      expect(rowsForBuild(buildStore, 'userProductMargins')).toHaveLength(0)
    })

    it('is a no-op when marginId is empty and no existing row exists', () => {
      mgmt().setProductMargin('item-iron', '')
      expect(rowsForBuild(buildStore, 'userProductMargins')).toHaveLength(0)
    })
  })

  describe('addRecipe auto-adds the crafting table', () => {
    it("adds the recipe's crafting table to the build when missing", () => {
      mgmt().addRecipe('recipe-iron')
      const tables = rowsForBuild(buildStore, 'userCraftingTables')
      expect(tables).toHaveLength(1)
      expect(tables[0].craftingTableId).toBe('ct-workbench')
      expect(tables[0].pluginModuleId).toBe('')
      expect(tables[0].costPerMinute).toBe(0)
    })

    it('does not duplicate an existing crafting table for the same build', () => {
      // Pre-existing user crafting table the user already configured.
      buildStore.setRow('userCraftingTables', 'uct-existing', {
        id: 'uct-existing',
        buildId: BUILD_ID,
        craftingTableId: 'ct-workbench',
        pluginModuleId: 'pm-upgrade',
        costPerMinute: 1.25,
      })
      mgmt().addRecipe('recipe-iron')
      const tables = rowsForBuild(buildStore, 'userCraftingTables')
      expect(tables).toHaveLength(1)
      // Existing config (module + cost) must be preserved.
      expect(tables[0].id).toBe('uct-existing')
      expect(tables[0].pluginModuleId).toBe('pm-upgrade')
      expect(tables[0].costPerMinute).toBe(1.25)
    })

    it('does not share crafting tables across builds', () => {
      // Another build has the same crafting table — this should NOT prevent
      // us from adding it to our build.
      buildStore.setRow('userCraftingTables', 'uct-foreign', {
        id: 'uct-foreign',
        buildId: 'other-build',
        craftingTableId: 'ct-workbench',
        pluginModuleId: '',
        costPerMinute: 0,
      })
      mgmt().addRecipe('recipe-iron')
      const tables = rowsForBuild(buildStore, 'userCraftingTables')
      expect(tables).toHaveLength(1)
      expect(tables[0].craftingTableId).toBe('ct-workbench')
    })

    it('adds only one table when two recipes share the same crafting table', () => {
      mgmt().addRecipe('recipe-iron')
      mgmt().addRecipe('recipe-copper')
      const tables = rowsForBuild(buildStore, 'userCraftingTables')
      expect(tables).toHaveLength(1)
      expect(tables[0].craftingTableId).toBe('ct-workbench')
    })

    it('is a no-op when the recipe has no crafting table in game data', () => {
      // Recipe `r` is not in the game data store.
      mgmt().addRecipe('r')
      expect(rowsForBuild(buildStore, 'userCraftingTables')).toHaveLength(0)
    })

    it('is a no-op when the recipe has an empty craftingTableId', () => {
      setupRecipe('recipe-no-table', '')
      mgmt().addRecipe('recipe-no-table')
      expect(rowsForBuild(buildStore, 'userCraftingTables')).toHaveLength(0)
    })
  })

  describe('setProductShare', () => {
    const setupMultiProduct = (productIds: string[], ingredientId?: string) => {
      const recipeId = 'recipe-multi'
      setupRecipe(recipeId, 'ct-workbench')
      if (ingredientId) {
        gameDataStore.setRow('recipeElements', 're-ing', {
          id: 're-ing',
          datasetId: DATASET_ID,
          recipeId,
          itemOrTagId: ingredientId,
          baseQuantity: -1,
          isProduct: false,
          index: 0,
        })
      }
      productIds.forEach((pid, i) => {
        gameDataStore.setRow('recipeElements', `re-p${i}`, {
          id: `re-p${i}`,
          datasetId: DATASET_ID,
          recipeId,
          itemOrTagId: pid,
          baseQuantity: 1,
          isProduct: true,
          index: i,
        })
      })
      return mgmt().addRecipe(recipeId)
    }

    const sharesFor = (userRecipeId: string): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const id of buildStore.getRowIds('userProductShares')) {
        const r = buildStore.getRow('userProductShares', id)
        if (r.buildId !== BUILD_ID) continue
        if (r.userRecipeId !== userRecipeId) continue
        out[r.productItemOrTagId as string] = r.sharePercent as number
      }
      return out
    }

    it('bootstraps defaults (primary=100, others=0) on first edit and redistributes', () => {
      const ur = setupMultiProduct(['a', 'b'])
      // Initial edit: set b to 40 — should bootstrap defaults then redistribute
      // the remainder across A (the only "other"), sending A to 60.
      mgmt().setProductShare(ur, 'b', 40)
      expect(sharesFor(ur)).toEqual({ a: 60, b: 40 })
    })

    it('three products with defaults 100/0/0, setting A to 50 splits remainder equally', () => {
      const ur = setupMultiProduct(['a', 'b', 'c'])
      mgmt().setProductShare(ur, 'a', 50)
      // Others started at 0/0 → equal split: 25/25
      expect(sharesFor(ur)).toEqual({ a: 50, b: 25, c: 25 })
    })

    it('preserves other-share ratios when redistributing', () => {
      const ur = setupMultiProduct(['a', 'b', 'c'])
      // Seed 60/30/10 so the ratio between B and C is 3:1.
      ;[
        ['a', 60],
        ['b', 30],
        ['c', 10],
      ].forEach(([pid, pct], i) => {
        buildStore.setRow('userProductShares', `seed-${i}`, {
          id: `seed-${i}`,
          buildId: BUILD_ID,
          userRecipeId: ur,
          productItemOrTagId: pid as string,
          sharePercent: pct as number,
        })
      })
      mgmt().setProductShare(ur, 'a', 20)
      // remainder = 80; B:C = 3:1 → 60/20
      expect(sharesFor(ur)).toEqual({ a: 20, b: 60, c: 20 })
    })

    it('clamps the entered value into [0, 100]', () => {
      const ur = setupMultiProduct(['a', 'b'])
      mgmt().setProductShare(ur, 'a', 150)
      expect(sharesFor(ur)).toEqual({ a: 100, b: 0 })
      mgmt().setProductShare(ur, 'a', -20)
      expect(sharesFor(ur)).toEqual({ a: 0, b: 100 })
    })

    it('ensures the stored set always sums to 100 by absorbing rounding drift', () => {
      const ur = setupMultiProduct(['a', 'b', 'c'])
      // Seed 33/33/34.
      ;[
        ['a', 33],
        ['b', 33],
        ['c', 34],
      ].forEach(([pid, pct], i) => {
        buildStore.setRow('userProductShares', `seed-${i}`, {
          id: `seed-${i}`,
          buildId: BUILD_ID,
          userRecipeId: ur,
          productItemOrTagId: pid as string,
          sharePercent: pct as number,
        })
      })
      mgmt().setProductShare(ur, 'a', 50)
      const shares = sharesFor(ur)
      expect(shares.a).toBe(50)
      expect(shares.b + shares.c).toBe(50)
    })

    it('skips reintegrated products when computing shares', () => {
      const ur = setupMultiProduct(['ingot', 'scrap'], 'scrap')
      // scrap is also an ingredient, so it's reintegrated — shouldn't appear
      // in userProductShares.
      mgmt().setProductShare(ur, 'ingot', 100)
      // Single non-reintegrated product → no-op (it's always 100%)
      expect(sharesFor(ur)).toEqual({})
    })

    it('is a no-op for a recipe with one non-reintegrated product', () => {
      const ur = setupMultiProduct(['only'])
      mgmt().setProductShare(ur, 'only', 50)
      expect(sharesFor(ur)).toEqual({})
    })

    it('is a no-op when the product is not part of the recipe', () => {
      const ur = setupMultiProduct(['a', 'b'])
      mgmt().setProductShare(ur, 'zzz', 40)
      expect(sharesFor(ur)).toEqual({})
    })

    it('removeRecipe also clears userProductShares for the recipe', () => {
      const ur = setupMultiProduct(['a', 'b'])
      mgmt().setProductShare(ur, 'b', 40)
      expect(Object.keys(sharesFor(ur))).toHaveLength(2)
      mgmt().removeRecipe(ur)
      expect(sharesFor(ur)).toEqual({})
    })
  })

  describe('setRecipeFavorite', () => {
    it('flips the favorite cell from false to true', () => {
      const id = mgmt().addRecipe('recipe-iron')
      expect(buildStore.getCell('userRecipes', id, 'favorite')).toBe(false)
      mgmt().setRecipeFavorite(id, true)
      expect(buildStore.getCell('userRecipes', id, 'favorite')).toBe(true)
    })

    it('flips the favorite cell from true to false', () => {
      const id = mgmt().addRecipe('recipe-iron')
      mgmt().setRecipeFavorite(id, true)
      mgmt().setRecipeFavorite(id, false)
      expect(buildStore.getCell('userRecipes', id, 'favorite')).toBe(false)
    })

    it('does not affect other recipes', () => {
      const a = mgmt().addRecipe('recipe-iron')
      const b = mgmt().addRecipe('recipe-copper')
      mgmt().setRecipeFavorite(a, true)
      expect(buildStore.getCell('userRecipes', a, 'favorite')).toBe(true)
      expect(buildStore.getCell('userRecipes', b, 'favorite')).toBe(false)
    })
  })

  describe('setRecipesFavorite', () => {
    it('sets all listed ids to true', () => {
      const a = mgmt().addRecipe('recipe-iron')
      const b = mgmt().addRecipe('recipe-copper')
      mgmt().setRecipesFavorite([a, b], true)
      expect(buildStore.getCell('userRecipes', a, 'favorite')).toBe(true)
      expect(buildStore.getCell('userRecipes', b, 'favorite')).toBe(true)
    })

    it('sets all listed ids to false', () => {
      const a = mgmt().addRecipe('recipe-iron')
      const b = mgmt().addRecipe('recipe-copper')
      mgmt().setRecipesFavorite([a, b], true)
      mgmt().setRecipesFavorite([a, b], false)
      expect(buildStore.getCell('userRecipes', a, 'favorite')).toBe(false)
      expect(buildStore.getCell('userRecipes', b, 'favorite')).toBe(false)
    })

    it('is a no-op when given an empty list', () => {
      const a = mgmt().addRecipe('recipe-iron')
      mgmt().setRecipesFavorite([], true)
      expect(buildStore.getCell('userRecipes', a, 'favorite')).toBe(false)
    })

    it('does not affect ids not in the list', () => {
      const a = mgmt().addRecipe('recipe-iron')
      const b = mgmt().addRecipe('recipe-copper')
      mgmt().setRecipesFavorite([a], true)
      expect(buildStore.getCell('userRecipes', a, 'favorite')).toBe(true)
      expect(buildStore.getCell('userRecipes', b, 'favorite')).toBe(false)
    })
  })
})
