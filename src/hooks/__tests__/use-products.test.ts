import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { buildProducts, buildMarginOptions } from '../use-products'

const BUILD_ID = 'build1'
const OTHER_BUILD_ID = 'build2'

let buildStore: Store
let gameDataStore: Store

const fakeName = (entityType: string, entityId: string) => `${entityType}:${entityId}`

beforeEach(() => {
  buildStore = createBuildStore()
  gameDataStore = createGameDataStore()

  // skills
  gameDataStore.setRow('skills', 'skill-mining', {
    id: 'skill-mining',
    datasetId: 'ds1',
    name: 'MiningSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[]',
  })

  // items
  gameDataStore.setRow('items', 'item-iron', {
    id: 'item-iron',
    datasetId: 'ds1',
    name: 'IronOre',
    isTag: false,
  })

  // recipes
  gameDataStore.setRow('recipes', 'recipe-iron', {
    id: 'recipe-iron',
    datasetId: 'ds1',
    name: 'IronRecipe',
    familyName: 'Iron',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 're1', {
    id: 're1',
    datasetId: 'ds1',
    recipeId: 'recipe-iron',
    itemOrTagId: 'item-iron',
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })

  // build
  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: 'ds1',
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
  buildStore.setRow('userMargins', 'm-prem', {
    id: 'm-prem',
    buildId: BUILD_ID,
    name: 'Premium',
    percent: 25,
    isDefault: false,
  })
})

describe('buildProducts', () => {
  it('returns empty when the build has no recipes', () => {
    expect(buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)).toEqual([])
  })

  it('joins recipe with primary product, skill, and margin', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    buildStore.setRow('userRecipeMargins', 'urm1', {
      id: 'urm1',
      buildId: BUILD_ID,
      userRecipeId: 'ur1',
      userMarginId: 'm-prem',
    })

    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)

    expect(items).toHaveLength(1)
    const [it0] = items
    expect(it0.userRecipeId).toBe('ur1')
    expect(it0.recipeId).toBe('recipe-iron')
    expect(it0.recipeName).toBe('recipe:recipe-iron')
    expect(it0.skillId).toBe('skill-mining')
    expect(it0.skillName).toBe('skill:skill-mining')
    expect(it0.skillRawName).toBe('MiningSkill')
    expect(it0.primaryProductId).toBe('item-iron')
    expect(it0.primaryProductName).toBe('item:item-iron')
    expect(it0.primaryProductRawName).toBe('IronOre')
    expect(it0.productItemIds).toEqual(['item-iron'])
    expect(it0.userMarginId).toBe('m-prem')
  })

  it('leaves userMarginId empty when no recipe-margin link exists', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)
    expect(it0.userMarginId).toBe('')
  })

  it('ignores recipes belonging to other builds', () => {
    buildStore.setRow('userRecipes', 'ur-other', {
      id: 'ur-other',
      buildId: OTHER_BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    expect(buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)).toEqual([])
  })

  it('emits no entries for a recipe with no product elements', () => {
    gameDataStore.setRow('recipes', 'recipe-empty', {
      id: 'recipe-empty',
      datasetId: 'ds1',
      name: 'Empty',
      familyName: 'Empty',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    buildStore.setRow('userRecipes', 'ur-empty', {
      id: 'ur-empty',
      buildId: BUILD_ID,
      recipeId: 'recipe-empty',
      roundFactor: 0,
    })
    expect(buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)).toEqual([])
  })

  it('emits one entry per non-ingredient product for multi-product recipes', () => {
    gameDataStore.setRow('items', 'item-coal', {
      id: 'item-coal',
      datasetId: 'ds1',
      name: 'Coal',
      isTag: false,
    })
    gameDataStore.setRow('items', 'item-scrap', {
      id: 'item-scrap',
      datasetId: 'ds1',
      name: 'Scrap',
      isTag: false,
    })
    // Second product on recipe-iron
    gameDataStore.setRow('recipeElements', 're-coal', {
      id: 're-coal',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      itemOrTagId: 'item-coal',
      baseQuantity: 1,
      isProduct: true,
      index: 1,
    })
    // Third product that is ALSO an ingredient — must be excluded
    gameDataStore.setRow('recipeElements', 're-scrap-prod', {
      id: 're-scrap-prod',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      itemOrTagId: 'item-scrap',
      baseQuantity: 1,
      isProduct: true,
      index: 2,
    })
    gameDataStore.setRow('recipeElements', 're-scrap-ing', {
      id: 're-scrap-ing',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      itemOrTagId: 'item-scrap',
      baseQuantity: 1,
      isProduct: false,
      index: 3,
    })
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)
    const productIds = items.map((i) => i.primaryProductId).sort()
    expect(productIds).toEqual(['item-coal', 'item-iron'])
    for (const it of items) {
      expect(it.userRecipeId).toBe('ur1')
      expect(it.recipeId).toBe('recipe-iron')
    }
  })

  it('ignores recipe-margin links that belong to other builds', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    // Wrong build → must NOT be associated
    buildStore.setRow('userRecipeMargins', 'urm-foreign', {
      id: 'urm-foreign',
      buildId: 'other-build',
      userRecipeId: 'ur1',
      userMarginId: 'm-prem',
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)
    expect(it0.userMarginId).toBe('')
  })

  it('populates unlockingTalentIds from recipeUnlocks rows', () => {
    gameDataStore.setRow('recipeUnlocks', 'ru1', {
      id: 'ru1',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      talentId: 'talent-unlock-a',
    })
    gameDataStore.setRow('recipeUnlocks', 'ru2', {
      id: 'ru2',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      talentId: 'talent-unlock-b',
    })
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)
    expect([...it0.unlockingTalentIds].sort()).toEqual(['talent-unlock-a', 'talent-unlock-b'])
  })

  it('leaves unlockingTalentIds empty for recipes without Unlock bonuses', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)
    expect(it0.unlockingTalentIds).toEqual([])
  })

  it('sorts by skillName then recipeName', () => {
    // Add a second skill + recipe
    gameDataStore.setRow('skills', 'skill-aaa', {
      id: 'skill-aaa',
      datasetId: 'ds1',
      name: 'AAA',
      profession: '',
      maxLevel: 1,
      laborReducePercent: '[]',
    })
    gameDataStore.setRow('recipes', 'recipe-zzz', {
      id: 'recipe-zzz',
      datasetId: 'ds1',
      name: 'Zzz',
      familyName: 'Z',
      skillId: 'skill-aaa',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    gameDataStore.setRow('recipeElements', 're-zzz', {
      id: 're-zzz',
      datasetId: 'ds1',
      recipeId: 'recipe-zzz',
      itemOrTagId: 'item-iron',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    buildStore.setRow('userRecipes', 'ur2', {
      id: 'ur2',
      buildId: BUILD_ID,
      recipeId: 'recipe-zzz',
      roundFactor: 0,
    })

    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName)
    // skill:skill-aaa < skill:skill-mining alphabetically
    expect(items.map((i) => i.recipeId)).toEqual(['recipe-zzz', 'recipe-iron'])
  })
})

describe('buildMarginOptions', () => {
  it('returns only margins for the requested build', () => {
    buildStore.setRow('userMargins', 'm-other-build', {
      id: 'm-other-build',
      buildId: OTHER_BUILD_ID,
      name: 'Other',
      percent: 1,
      isDefault: true,
    })
    const options = buildMarginOptions(buildStore, BUILD_ID)
    const ids = options.map((o) => o.id).sort()
    expect(ids).toEqual(['m-default', 'm-prem'])
  })
})
