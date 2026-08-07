import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { createCraftingTableManagement } from '../use-crafting-table-management'

const BUILD_ID = 'build1'
const OTHER_BUILD_ID = 'build2'
const DATASET_ID = 'ds1'
const OTHER_DATASET_ID = 'ds2'

let buildStore: Store
let gameDataStore: Store

type Row = Record<string, unknown> & { id: string }

function rowsForBuild(store: Store, table: string): Row[] {
  return store
    .getRowIds(table)
    .map((id): Row => ({ id, ...(store.getRow(table, id) as Record<string, unknown>) }))
    .filter((r) => r.buildId === BUILD_ID)
}

function setupGameData() {
  // Skills — two in this dataset, one in another
  gameDataStore.setRow('skills', 'skill-mining', {
    id: 'skill-mining',
    datasetId: DATASET_ID,
    name: 'MiningSkill',
    profession: 'MiningProfession',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('skills', 'skill-smelting', {
    id: 'skill-smelting',
    datasetId: DATASET_ID,
    name: 'SmeltingSkill',
    profession: 'SmeltingProfession',
    maxLevel: 7,
    laborReducePercent: '[]',
  })

  // Crafting tables
  gameDataStore.setRow('craftingTables', 'ct-pickaxe', {
    id: 'ct-pickaxe',
    datasetId: DATASET_ID,
    name: 'Pickaxe',
  })
  gameDataStore.setRow('craftingTables', 'ct-bloomery', {
    id: 'ct-bloomery',
    datasetId: DATASET_ID,
    name: 'Bloomery',
  })

  // Recipes:
  //  - recipe-iron / recipe-copper: mining, use ct-pickaxe (should auto-add when ct-pickaxe is added and skill-mining is selected)
  //  - recipe-smelt-iron: smelting, uses ct-bloomery
  //  - recipe-other-dataset: mining, ct-pickaxe, but different datasetId (must be filtered out)
  gameDataStore.setRow('recipes', 'recipe-iron', {
    id: 'recipe-iron',
    datasetId: DATASET_ID,
    name: 'IronOre',
    familyName: 'IronOre',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-pickaxe',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipes', 'recipe-copper', {
    id: 'recipe-copper',
    datasetId: DATASET_ID,
    name: 'CopperOre',
    familyName: 'CopperOre',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-pickaxe',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipes', 'recipe-smelt-iron', {
    id: 'recipe-smelt-iron',
    datasetId: DATASET_ID,
    name: 'SmeltIron',
    familyName: 'SmeltIron',
    skillId: 'skill-smelting',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-bloomery',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipes', 'recipe-other-dataset', {
    id: 'recipe-other-dataset',
    datasetId: OTHER_DATASET_ID,
    name: 'Other',
    familyName: 'Other',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-pickaxe',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
}

function setupBuild() {
  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: DATASET_ID,
    name: 'Test',
    createdAt: 'now',
  })
  buildStore.setRow('userMargins', 'margin-default', {
    id: 'margin-default',
    buildId: BUILD_ID,
    name: 'Default',
    percent: 15,
    isDefault: true,
  })
}

function addUserSkill(skillId: string, buildId: string = BUILD_ID) {
  const id = `us-${buildId}-${skillId}`
  buildStore.setRow('userSkills', id, { id, buildId, skillId, level: 1 })
  return id
}

beforeEach(() => {
  buildStore = createBuildStore()
  gameDataStore = createGameDataStore()
  setupGameData()
  setupBuild()
})

const mgmt = () => createCraftingTableManagement(buildStore, gameDataStore, BUILD_ID, DATASET_ID)

describe('createCraftingTableManagement', () => {
  describe('addTable', () => {
    it('creates a userCraftingTables row with defaults', () => {
      const id = mgmt().addTable('ct-pickaxe')
      const row = buildStore.getRow('userCraftingTables', id)
      expect(row.craftingTableId).toBe('ct-pickaxe')
      expect(row.buildId).toBe(BUILD_ID)
      expect(row.specialtyModuleId).toBe('')
      expect(row.costPerMinute).toBe(0)
    })

    it('adds no recipes when the build has no skills', () => {
      mgmt().addTable('ct-pickaxe')
      expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(0)
    })

    it('auto-adds recipes whose skill the user has and whose table matches', () => {
      addUserSkill('skill-mining')
      mgmt().addTable('ct-pickaxe')
      const recipeIds = rowsForBuild(buildStore, 'userRecipes')
        .map((r) => r.recipeId)
        .sort()
      expect(recipeIds).toEqual(['recipe-copper', 'recipe-iron'])
    })

    it('auto-links each new recipe to the default margin', () => {
      addUserSkill('skill-mining')
      mgmt().addTable('ct-pickaxe')
      const links = rowsForBuild(buildStore, 'userRecipeMargins')
      expect(links).toHaveLength(2)
      expect(links.every((l) => l.userMarginId === 'margin-default')).toBe(true)
    })

    it('still adds recipes when no default margin exists (no margin links created)', () => {
      addUserSkill('skill-mining')
      buildStore.delRow('userMargins', 'margin-default')
      mgmt().addTable('ct-pickaxe')
      expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(2)
      expect(rowsForBuild(buildStore, 'userRecipeMargins')).toHaveLength(0)
    })

    it('does not add duplicate recipes when one already exists in this build', () => {
      addUserSkill('skill-mining')
      buildStore.setRow('userRecipes', 'ur-pre', {
        id: 'ur-pre',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      mgmt().addTable('ct-pickaxe')
      const recipeIds = rowsForBuild(buildStore, 'userRecipes')
        .map((r) => r.recipeId)
        .sort()
      expect(recipeIds).toEqual(['recipe-copper', 'recipe-iron'])
    })

    it('does not add recipes whose skill the user has not selected', () => {
      // Only smelting selected; adding the mining table must NOT pull in mining recipes
      addUserSkill('skill-smelting')
      mgmt().addTable('ct-pickaxe')
      expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(0)
    })

    it('skips recipes from another dataset', () => {
      addUserSkill('skill-mining')
      mgmt().addTable('ct-pickaxe')
      // recipe-other-dataset shares the table and skill but lives in OTHER_DATASET_ID — it must not be pulled in.
      const recipeIds = rowsForBuild(buildStore, 'userRecipes').map((r) => r.recipeId)
      expect(recipeIds).not.toContain('recipe-other-dataset')
    })

    it('ignores foreign-build userSkills and userRecipes', () => {
      // A foreign build picked the skill + has the recipe already — neither
      // should affect this build's decisions.
      addUserSkill('skill-mining', OTHER_BUILD_ID)
      buildStore.setRow('userRecipes', 'ur-foreign', {
        id: 'ur-foreign',
        buildId: OTHER_BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      mgmt().addTable('ct-pickaxe')
      // No skill in THIS build → no auto-adds.
      expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(0)
    })
  })

  describe('getRecipesUsingTable', () => {
    it('returns userRecipe IDs whose recipe targets the given table', () => {
      const utId = mgmt().addTable('ct-pickaxe')
      // Seed two mining recipes + one smelting recipe manually
      buildStore.setRow('userRecipes', 'ur-iron', {
        id: 'ur-iron',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipes', 'ur-copper', {
        id: 'ur-copper',
        buildId: BUILD_ID,
        recipeId: 'recipe-copper',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipes', 'ur-smelt', {
        id: 'ur-smelt',
        buildId: BUILD_ID,
        recipeId: 'recipe-smelt-iron',
        roundFactor: 0,
      })
      const ids = mgmt().getRecipesUsingTable(utId).sort()
      expect(ids).toEqual(['ur-copper', 'ur-iron'])
    })

    it('does not return userRecipes from other builds', () => {
      const utId = mgmt().addTable('ct-pickaxe')
      buildStore.setRow('userRecipes', 'ur-foreign', {
        id: 'ur-foreign',
        buildId: OTHER_BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      expect(mgmt().getRecipesUsingTable(utId)).toEqual([])
    })

    it('returns [] for an unknown userTable id', () => {
      expect(mgmt().getRecipesUsingTable('nonexistent')).toEqual([])
    })
  })

  describe('removeTableWithRecipes', () => {
    it('deletes the table, its dependent userRecipes, their margins and their shares', () => {
      const utId = mgmt().addTable('ct-pickaxe')
      buildStore.setRow('userRecipes', 'ur-iron', {
        id: 'ur-iron',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipeMargins', 'urm-iron', {
        id: 'urm-iron',
        buildId: BUILD_ID,
        userRecipeId: 'ur-iron',
        userMarginId: 'margin-default',
      })
      buildStore.setRow('userProductShares', 'ups-iron', {
        id: 'ups-iron',
        buildId: BUILD_ID,
        userRecipeId: 'ur-iron',
        productItemOrTagId: 'iron',
        sharePercent: 100,
      })

      mgmt().removeTableWithRecipes(utId)

      expect(buildStore.getRowIds('userCraftingTables')).not.toContain(utId)
      expect(buildStore.getRowIds('userRecipes')).not.toContain('ur-iron')
      expect(buildStore.getRowIds('userRecipeMargins')).not.toContain('urm-iron')
      expect(buildStore.getRowIds('userProductShares')).not.toContain('ups-iron')
    })

    it('leaves unrelated recipes, margins, and shares intact', () => {
      const utPickaxe = mgmt().addTable('ct-pickaxe')
      // Dependent on the table we'll remove
      buildStore.setRow('userRecipes', 'ur-iron', {
        id: 'ur-iron',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      // Unrelated — different table
      buildStore.setRow('userRecipes', 'ur-smelt', {
        id: 'ur-smelt',
        buildId: BUILD_ID,
        recipeId: 'recipe-smelt-iron',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipeMargins', 'urm-smelt', {
        id: 'urm-smelt',
        buildId: BUILD_ID,
        userRecipeId: 'ur-smelt',
        userMarginId: 'margin-default',
      })
      buildStore.setRow('userProductShares', 'ups-smelt', {
        id: 'ups-smelt',
        buildId: BUILD_ID,
        userRecipeId: 'ur-smelt',
        productItemOrTagId: 'iron-ingot',
        sharePercent: 100,
      })

      mgmt().removeTableWithRecipes(utPickaxe)

      expect(buildStore.getRowIds('userRecipes')).toContain('ur-smelt')
      expect(buildStore.getRowIds('userRecipeMargins')).toContain('urm-smelt')
      expect(buildStore.getRowIds('userProductShares')).toContain('ups-smelt')
    })

    it('only deletes the table when there are no dependent recipes', () => {
      const utId = mgmt().addTable('ct-pickaxe')
      // Unrelated recipe in the build
      buildStore.setRow('userRecipes', 'ur-smelt', {
        id: 'ur-smelt',
        buildId: BUILD_ID,
        recipeId: 'recipe-smelt-iron',
        roundFactor: 0,
      })

      mgmt().removeTableWithRecipes(utId)

      expect(buildStore.getRowIds('userCraftingTables')).not.toContain(utId)
      expect(buildStore.getRowIds('userRecipes')).toContain('ur-smelt')
    })
  })

  describe('setSlotModule / setCostPerMinute', () => {
    it('updates the row cells', () => {
      const id = mgmt().addTable('ct-pickaxe')
      mgmt().setSlotModule(id, 'Specialty', 'pm1')
      mgmt().setCostPerMinute(id, 2.5)
      expect(buildStore.getCell('userCraftingTables', id, 'specialtyModuleId')).toBe('pm1')
      expect(buildStore.getCell('userCraftingTables', id, 'costPerMinute')).toBe(2.5)
    })

    it('writes each slot to its own cell independently', () => {
      const id = mgmt().addTable('ct-pickaxe')
      mgmt().setSlotModule(id, 'Basic', 'pm-basic')
      mgmt().setSlotModule(id, 'Advanced', 'pm-adv')
      mgmt().setSlotModule(id, 'Modern', 'pm-mod')
      mgmt().setSlotModule(id, 'Specialty', 'pm-spec')
      expect(buildStore.getCell('userCraftingTables', id, 'basicModuleId')).toBe('pm-basic')
      expect(buildStore.getCell('userCraftingTables', id, 'advancedModuleId')).toBe('pm-adv')
      expect(buildStore.getCell('userCraftingTables', id, 'modernModuleId')).toBe('pm-mod')
      expect(buildStore.getCell('userCraftingTables', id, 'specialtyModuleId')).toBe('pm-spec')
    })

    it('clears a slot when passed an empty id', () => {
      const id = mgmt().addTable('ct-pickaxe')
      mgmt().setSlotModule(id, 'Specialty', 'pm1')
      mgmt().setSlotModule(id, 'Specialty', '')
      expect(buildStore.getCell('userCraftingTables', id, 'specialtyModuleId')).toBe('')
    })
  })
})
