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
})
