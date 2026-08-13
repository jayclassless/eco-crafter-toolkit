import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { getCompare } from '@/lib/collator'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import {
  buildMarginOptions,
  buildProducts,
  buildProductGroups,
  buildTagIdsByItemId,
  findDefaultMarginId,
  getRecipeSkillInfo,
} from '../use-products'

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
    expect(
      buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    ).toEqual([])
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

    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))

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
    // Default isCustom flags for non-custom rows.
    expect(it0.recipeIsCustom).toBe(false)
    expect(it0.primaryProductIsCustom).toBe(false)
  })

  it('marks recipeIsCustom and primaryProductIsCustom for custom entities', () => {
    gameDataStore.setCell('recipes', 'recipe-iron', 'isCustom', true)
    gameDataStore.setCell('items', 'item-iron', 'isCustom', true)
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })

    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect(it0.recipeIsCustom).toBe(true)
    expect(it0.primaryProductIsCustom).toBe(true)
  })

  it('leaves userMarginId empty when no recipe-margin link exists', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect(it0.userMarginId).toBe('')
  })

  it('ignores recipes belonging to other builds', () => {
    buildStore.setRow('userRecipes', 'ur-other', {
      id: 'ur-other',
      buildId: OTHER_BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    expect(
      buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    ).toEqual([])
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
    expect(
      buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    ).toEqual([])
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
    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    const productIds = items.map((i) => i.primaryProductId).sort()
    expect(productIds).toEqual(['item-coal', 'item-iron'])
    for (const it of items) {
      expect(it.userRecipeId).toBe('ur1')
      expect(it.recipeId).toBe('recipe-iron')
    }
  })

  it('excludes a non-primary BarrelItem product (auto-reintegrated) from the product list', () => {
    gameDataStore.setRow('items', 'item-barrel', {
      id: 'item-barrel',
      datasetId: 'ds1',
      name: 'BarrelItem',
      isTag: false,
    })
    // Barrel produced as a non-primary product (index 1) → auto-reintegrated.
    gameDataStore.setRow('recipeElements', 're-barrel', {
      id: 're-barrel',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      itemOrTagId: 'item-barrel',
      baseQuantity: 3,
      isProduct: true,
      index: 1,
    })
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect(items.map((i) => i.primaryProductId)).toEqual(['item-iron'])
  })

  it('includes a container product when a user override turns reintegration off', () => {
    gameDataStore.setRow('items', 'item-barrel', {
      id: 'item-barrel',
      datasetId: 'ds1',
      name: 'BarrelItem',
      isTag: false,
    })
    gameDataStore.setRow('recipeElements', 're-barrel', {
      id: 're-barrel',
      datasetId: 'ds1',
      recipeId: 'recipe-iron',
      itemOrTagId: 'item-barrel',
      baseQuantity: 3,
      isProduct: true,
      index: 1,
    })
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    buildStore.setRow('userReintegratedProducts', 'urp1', {
      id: 'urp1',
      buildId: BUILD_ID,
      userRecipeId: 'ur1',
      productItemOrTagId: 'item-barrel',
      isReintegrated: false,
    })
    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect(items.map((i) => i.primaryProductId).sort()).toEqual(['item-barrel', 'item-iron'])
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
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
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
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect([...it0.unlockingTalentIds].sort()).toEqual(['talent-unlock-a', 'talent-unlock-b'])
  })

  it('leaves unlockingTalentIds empty for recipes without Unlock bonuses', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
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

    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    // skill:skill-aaa < skill:skill-mining alphabetically
    expect(items.map((i) => i.recipeId)).toEqual(['recipe-zzz', 'recipe-iron'])
  })

  it('attaches the matching userPrices row id to userPriceId', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    buildStore.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: BUILD_ID,
      itemOrTagId: 'item-iron',
      price: 0,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'min',
    })
    const [it0] = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect(it0.userPriceId).toBe('up1')
  })

  it('omits products the user moved to Materials (isOverride=true, manual)', () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    buildStore.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: BUILD_ID,
      itemOrTagId: 'item-iron',
      price: 9,
      isOverride: true,
      primaryItemId: '',
      priceMode: 'manual',
    })
    expect(
      buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    ).toEqual([])
  })

  it("does not omit products when isOverride=true but priceMode isn't 'manual'", () => {
    buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD_ID,
      recipeId: 'recipe-iron',
      roundFactor: 0,
    })
    buildStore.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: BUILD_ID,
      itemOrTagId: 'item-iron',
      price: 9,
      isOverride: true,
      primaryItemId: '',
      priceMode: 'min',
    })
    const items = buildProducts(buildStore, gameDataStore, BUILD_ID, fakeName, getCompare('en-US'))
    expect(items).toHaveLength(1)
  })
})

describe('buildTagIdsByItemId', () => {
  it('returns an empty map when no tagItems rows exist', () => {
    const map = buildTagIdsByItemId(gameDataStore)
    expect(map.size).toBe(0)
  })

  it('groups multiple tag ids under the same item id', () => {
    gameDataStore.setRow('tagItems', 'ti-food', {
      id: 'ti-food',
      datasetId: 'ds1',
      tagId: 'tag-food',
      itemId: 'item-iron',
    })
    gameDataStore.setRow('tagItems', 'ti-metal', {
      id: 'ti-metal',
      datasetId: 'ds1',
      tagId: 'tag-metal',
      itemId: 'item-iron',
    })

    const map = buildTagIdsByItemId(gameDataStore)
    expect(map.size).toBe(1)
    expect([...(map.get('item-iron') ?? [])].sort()).toEqual(['tag-food', 'tag-metal'])
  })

  it('keeps tag lists separate per item', () => {
    gameDataStore.setRow('items', 'item-coal', {
      id: 'item-coal',
      datasetId: 'ds1',
      name: 'Coal',
      isTag: false,
    })
    gameDataStore.setRow('tagItems', 'ti-1', {
      id: 'ti-1',
      datasetId: 'ds1',
      tagId: 'tag-metal',
      itemId: 'item-iron',
    })
    gameDataStore.setRow('tagItems', 'ti-2', {
      id: 'ti-2',
      datasetId: 'ds1',
      tagId: 'tag-fuel',
      itemId: 'item-coal',
    })

    const map = buildTagIdsByItemId(gameDataStore)
    expect(map.get('item-iron')).toEqual(['tag-metal'])
    expect(map.get('item-coal')).toEqual(['tag-fuel'])
  })

  it('omits items that are not referenced by any tagItems row', () => {
    gameDataStore.setRow('tagItems', 'ti-1', {
      id: 'ti-1',
      datasetId: 'ds1',
      tagId: 'tag-metal',
      itemId: 'item-iron',
    })

    const map = buildTagIdsByItemId(gameDataStore)
    expect(map.has('item-iron')).toBe(true)
    expect(map.get('item-untagged')).toBeUndefined()
  })

  it('preserves tagItems insertion order within the same item', () => {
    gameDataStore.setRow('tagItems', 'ti-a', {
      id: 'ti-a',
      datasetId: 'ds1',
      tagId: 'tag-z',
      itemId: 'item-iron',
    })
    gameDataStore.setRow('tagItems', 'ti-b', {
      id: 'ti-b',
      datasetId: 'ds1',
      tagId: 'tag-a',
      itemId: 'item-iron',
    })

    const map = buildTagIdsByItemId(gameDataStore)
    expect(map.get('item-iron')).toEqual(['tag-z', 'tag-a'])
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

describe('findDefaultMarginId', () => {
  it('returns the default margin id for the requested build', () => {
    expect(findDefaultMarginId(buildStore, BUILD_ID)).toBe('m-default')
  })

  it('returns empty string when no default exists', () => {
    buildStore.delRow('userMargins', 'm-default')
    expect(findDefaultMarginId(buildStore, BUILD_ID)).toBe('')
  })

  it('ignores defaults belonging to a different build', () => {
    buildStore.delRow('userMargins', 'm-default')
    buildStore.setRow('userMargins', 'm-foreign-default', {
      id: 'm-foreign-default',
      buildId: OTHER_BUILD_ID,
      name: 'ForeignDefault',
      percent: 5,
      isDefault: true,
    })
    expect(findDefaultMarginId(buildStore, BUILD_ID)).toBe('')
  })
})

describe('buildProductGroups', () => {
  it('returns parent=null single-recipe groups when products do not overlap', () => {
    // Add a second item and recipe producing it
    gameDataStore.setRow('items', 'item-copper', {
      id: 'item-copper',
      datasetId: 'ds1',
      name: 'Copper',
      isTag: false,
    })
    gameDataStore.setRow('recipes', 'recipe-copper', {
      id: 'recipe-copper',
      datasetId: 'ds1',
      name: 'CopperRecipe',
      familyName: 'Copper',
      skillId: 'skill-mining',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    gameDataStore.setRow('recipeElements', 're-copper', {
      id: 're-copper',
      datasetId: 'ds1',
      recipeId: 'recipe-copper',
      itemOrTagId: 'item-copper',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
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

    const groups = buildProductGroups(
      buildStore,
      gameDataStore,
      BUILD_ID,
      fakeName,
      getCompare('en-US')
    )
    expect(groups).toHaveLength(2)
    for (const g of groups) expect(g.parent).toBeNull()
    // Sorted alphabetically by primary product name
    expect(groups[0].children[0].primaryProductRawName).toBe('Copper')
    expect(groups[1].children[0].primaryProductRawName).toBe('IronOre')
  })

  it('synthesizes a parent when two recipes share the same primary product', () => {
    // Second recipe for the same item
    gameDataStore.setRow('recipes', 'recipe-iron-alt', {
      id: 'recipe-iron-alt',
      datasetId: 'ds1',
      name: 'IronAlt',
      familyName: 'Iron',
      skillId: 'skill-mining',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: false,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    gameDataStore.setRow('recipeElements', 're-iron-alt', {
      id: 're-iron-alt',
      datasetId: 'ds1',
      recipeId: 'recipe-iron-alt',
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
      recipeId: 'recipe-iron-alt',
      roundFactor: 0,
    })
    // Wire a userPrices row and a userProductMargins row on the parent product.
    buildStore.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: BUILD_ID,
      itemOrTagId: 'item-iron',
      price: 12,
    })
    buildStore.setRow('userProductMargins', 'upm1', {
      id: 'upm1',
      buildId: BUILD_ID,
      itemOrTagId: 'item-iron',
      userMarginId: 'm-prem',
    })

    const groups = buildProductGroups(
      buildStore,
      gameDataStore,
      BUILD_ID,
      fakeName,
      getCompare('en-US')
    )
    expect(groups).toHaveLength(1)
    const group = groups[0]
    expect(group.parent).not.toBeNull()
    expect(group.parent?.primaryProductId).toBe('item-iron')
    expect(group.parent?.userPriceId).toBe('up1')
    expect(group.parent?.productUserMarginId).toBe('m-prem')
    expect(group.children).toHaveLength(2)
    // Children sorted by skill then recipe name
    expect(group.children[0].recipeId).toBe('recipe-iron')
    expect(group.children[1].recipeId).toBe('recipe-iron-alt')
  })

  it('leaves parent.userPriceId empty when no userPrices row exists for the product', () => {
    gameDataStore.setRow('recipes', 'recipe-iron-alt', {
      id: 'recipe-iron-alt',
      datasetId: 'ds1',
      name: 'IronAlt',
      familyName: 'Iron',
      skillId: 'skill-mining',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: false,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    gameDataStore.setRow('recipeElements', 're-iron-alt', {
      id: 're-iron-alt',
      datasetId: 'ds1',
      recipeId: 'recipe-iron-alt',
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
      recipeId: 'recipe-iron-alt',
      roundFactor: 0,
    })

    const [group] = buildProductGroups(
      buildStore,
      gameDataStore,
      BUILD_ID,
      fakeName,
      getCompare('en-US')
    )
    expect(group.parent?.userPriceId).toBe('')
    expect(group.parent?.productUserMarginId).toBe('')
  })

  it('ignores userPrices and userProductMargins from other builds', () => {
    gameDataStore.setRow('recipes', 'recipe-iron-alt', {
      id: 'recipe-iron-alt',
      datasetId: 'ds1',
      name: 'IronAlt',
      familyName: 'Iron',
      skillId: 'skill-mining',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: false,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    gameDataStore.setRow('recipeElements', 're-iron-alt', {
      id: 're-iron-alt',
      datasetId: 'ds1',
      recipeId: 'recipe-iron-alt',
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
      recipeId: 'recipe-iron-alt',
      roundFactor: 0,
    })
    buildStore.setRow('userPrices', 'up-foreign', {
      id: 'up-foreign',
      buildId: OTHER_BUILD_ID,
      itemOrTagId: 'item-iron',
      price: 99,
    })
    buildStore.setRow('userProductMargins', 'upm-foreign', {
      id: 'upm-foreign',
      buildId: OTHER_BUILD_ID,
      itemOrTagId: 'item-iron',
      userMarginId: 'm-prem',
    })

    const [group] = buildProductGroups(
      buildStore,
      gameDataStore,
      BUILD_ID,
      fakeName,
      getCompare('en-US')
    )
    expect(group.parent?.userPriceId).toBe('')
    expect(group.parent?.productUserMarginId).toBe('')
  })

  describe('family clustering', () => {
    // Custom getName so product names sort the way real localized names do
    // (Board < Hardwood Board < Iron Ore < Softwood Board), letting us
    // observe whether clustering kept Softwood Board adjacent to its family.
    const namedFakeName = (entityType: string, entityId: string) => {
      const names: Record<string, string> = {
        'item-board': 'Board',
        'item-hardwood-board': 'Hardwood Board',
        'item-softwood-board': 'Softwood Board',
        'item-iron': 'Iron Ore',
      }
      return names[entityId] ?? `${entityType}:${entityId}`
    }

    function addBoardFamily(opts: { hardwood: boolean; softwood: boolean }) {
      const variants: Array<{ id: string; recipe: string; ur: string }> = [
        { id: 'item-board', recipe: 'recipe-board', ur: 'ur-board' },
      ]
      if (opts.hardwood) {
        variants.push({
          id: 'item-hardwood-board',
          recipe: 'recipe-hardwood-board',
          ur: 'ur-hardwood-board',
        })
      }
      if (opts.softwood) {
        variants.push({
          id: 'item-softwood-board',
          recipe: 'recipe-softwood-board',
          ur: 'ur-softwood-board',
        })
      }
      for (const v of variants) {
        gameDataStore.setRow('items', v.id, {
          id: v.id,
          datasetId: 'ds1',
          name: v.id,
          isTag: false,
        })
        gameDataStore.setRow('recipes', v.recipe, {
          id: v.recipe,
          datasetId: 'ds1',
          name: v.recipe,
          familyName: 'Board',
          skillId: 'skill-mining',
          requiredSkillLevel: 1,
          isBlueprint: false,
          isDefault: true,
          craftingTableId: 'ct1',
          baseCraftTime: 1,
          baseLaborCost: 1,
        })
        gameDataStore.setRow('recipeElements', `re-${v.recipe}`, {
          id: `re-${v.recipe}`,
          datasetId: 'ds1',
          recipeId: v.recipe,
          itemOrTagId: v.id,
          baseQuantity: 1,
          isProduct: true,
          index: 0,
        })
        buildStore.setRow('userRecipes', v.ur, {
          id: v.ur,
          buildId: BUILD_ID,
          recipeId: v.recipe,
          roundFactor: 0,
        })
      }
      // Iron is in the base fixture but needs a userRecipes row to appear.
      buildStore.setRow('userRecipes', 'ur-iron', {
        id: 'ur-iron',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
    }

    it('clusters family variants adjacently when 2+ family members are visible', () => {
      addBoardFamily({ hardwood: true, softwood: true })

      const groups = buildProductGroups(
        buildStore,
        gameDataStore,
        BUILD_ID,
        namedFakeName,
        getCompare('en-US')
      )
      const order = groups.map((g) => g.children[0].primaryProductName)
      // Without clustering: [Board, Hardwood Board, Iron Ore, Softwood Board].
      // With clustering, Board family stays adjacent.
      expect(order).toEqual(['Board', 'Hardwood Board', 'Softwood Board', 'Iron Ore'])
    })

    it('keeps lone family members in alphabetical product order', () => {
      addBoardFamily({ hardwood: true, softwood: false })

      const groups = buildProductGroups(
        buildStore,
        gameDataStore,
        BUILD_ID,
        namedFakeName,
        getCompare('en-US')
      )
      const order = groups.map((g) => g.children[0].primaryProductName)
      // Family "Board" has 2 visible members → still clusters.
      expect(order).toEqual(['Board', 'Hardwood Board', 'Iron Ore'])
    })

    it('does not cluster a single family member', () => {
      // Only Hardwood Board from the family — Board family has count 1.
      gameDataStore.setRow('items', 'item-hardwood-board', {
        id: 'item-hardwood-board',
        datasetId: 'ds1',
        name: 'item-hardwood-board',
        isTag: false,
      })
      gameDataStore.setRow('recipes', 'recipe-hardwood-board', {
        id: 'recipe-hardwood-board',
        datasetId: 'ds1',
        name: 'recipe-hardwood-board',
        familyName: 'Board',
        skillId: 'skill-mining',
        requiredSkillLevel: 1,
        isBlueprint: false,
        isDefault: true,
        craftingTableId: 'ct1',
        baseCraftTime: 1,
        baseLaborCost: 1,
      })
      gameDataStore.setRow('recipeElements', 're-hardwood-board', {
        id: 're-hardwood-board',
        datasetId: 'ds1',
        recipeId: 'recipe-hardwood-board',
        itemOrTagId: 'item-hardwood-board',
        baseQuantity: 1,
        isProduct: true,
        index: 0,
      })
      buildStore.setRow('userRecipes', 'ur-hardwood-board', {
        id: 'ur-hardwood-board',
        buildId: BUILD_ID,
        recipeId: 'recipe-hardwood-board',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipes', 'ur-iron', {
        id: 'ur-iron',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })

      const groups = buildProductGroups(
        buildStore,
        gameDataStore,
        BUILD_ID,
        namedFakeName,
        getCompare('en-US')
      )
      const order = groups.map((g) => g.children[0].primaryProductName)
      // Hardwood Board is the only Board-family member; sorts by its own
      // product name alongside Iron Ore.
      expect(order).toEqual(['Hardwood Board', 'Iron Ore'])
    })

    it('clusters via canonical family when build-recipe is in a different family', () => {
      // Two families both cover all three Board items at the dataset level:
      //   "Board"  → BoardRecipe, HardwoodBoardRecipe, SoftwoodBoardRecipe
      //   "Boards" → BoardsRecipe2, HardwoodBoardsRecipe2, SoftwoodBoardsRecipe2
      // Both have size 3 → tie broken alphabetically → canonical "Board" for
      // all three items.
      addBoardFamily({ hardwood: true, softwood: true })
      // Add a parallel "Boards" family at the dataset level (no userRecipes
      // yet — we only put one of these recipes into the build below).
      const parallel: Array<{ id: string; itemId: string; recipeId: string }> = [
        { id: 'item-board', itemId: 'item-board', recipeId: 'recipe-boards-2' },
        {
          id: 'item-hardwood-board',
          itemId: 'item-hardwood-board',
          recipeId: 'recipe-hardwood-boards-2',
        },
        {
          id: 'item-softwood-board',
          itemId: 'item-softwood-board',
          recipeId: 'recipe-softwood-boards-2',
        },
      ]
      for (const p of parallel) {
        gameDataStore.setRow('recipes', p.recipeId, {
          id: p.recipeId,
          datasetId: 'ds1',
          name: p.recipeId,
          familyName: 'Boards',
          skillId: 'skill-mining',
          requiredSkillLevel: 1,
          isBlueprint: false,
          isDefault: true,
          craftingTableId: 'ct1',
          baseCraftTime: 1,
          baseLaborCost: 1,
        })
        gameDataStore.setRow('recipeElements', `re-${p.recipeId}`, {
          id: `re-${p.recipeId}`,
          datasetId: 'ds1',
          recipeId: p.recipeId,
          itemOrTagId: p.itemId,
          baseQuantity: 1,
          isProduct: true,
          index: 0,
        })
      }
      // Replace the Softwood Board build-recipe with the "Boards"-family
      // variant — the only Softwood-Board producer in this build now sits
      // in family "Boards", not "Board".
      buildStore.delRow('userRecipes', 'ur-softwood-board')
      buildStore.setRow('userRecipes', 'ur-softwood-via-boards', {
        id: 'ur-softwood-via-boards',
        buildId: BUILD_ID,
        recipeId: 'recipe-softwood-boards-2',
        roundFactor: 0,
      })

      const groups = buildProductGroups(
        buildStore,
        gameDataStore,
        BUILD_ID,
        namedFakeName,
        getCompare('en-US')
      )
      const order = groups.map((g) => g.children[0].primaryProductName)
      // All three Board items resolve to canonical family "Board" (size 3,
      // alphabetically before "Boards") regardless of which family produced
      // them in the build, so Softwood Board stays adjacent to its siblings.
      expect(order).toEqual(['Board', 'Hardwood Board', 'Softwood Board', 'Iron Ore'])
    })

    it('treats empty familyName as never clustering', () => {
      // Two recipes with empty familyName — even though they share an empty
      // string, they should not cluster.
      gameDataStore.setRow('items', 'item-zzz', {
        id: 'item-zzz',
        datasetId: 'ds1',
        name: 'item-zzz',
        isTag: false,
      })
      gameDataStore.setRow('items', 'item-aaa', {
        id: 'item-aaa',
        datasetId: 'ds1',
        name: 'item-aaa',
        isTag: false,
      })
      gameDataStore.setRow('recipes', 'recipe-zzz', {
        id: 'recipe-zzz',
        datasetId: 'ds1',
        name: 'recipe-zzz',
        familyName: '',
        skillId: 'skill-mining',
        requiredSkillLevel: 1,
        isBlueprint: false,
        isDefault: true,
        craftingTableId: 'ct1',
        baseCraftTime: 1,
        baseLaborCost: 1,
      })
      gameDataStore.setRow('recipes', 'recipe-aaa', {
        id: 'recipe-aaa',
        datasetId: 'ds1',
        name: 'recipe-aaa',
        familyName: '',
        skillId: 'skill-mining',
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
        itemOrTagId: 'item-zzz',
        baseQuantity: 1,
        isProduct: true,
        index: 0,
      })
      gameDataStore.setRow('recipeElements', 're-aaa', {
        id: 're-aaa',
        datasetId: 'ds1',
        recipeId: 'recipe-aaa',
        itemOrTagId: 'item-aaa',
        baseQuantity: 1,
        isProduct: true,
        index: 0,
      })
      buildStore.setRow('userRecipes', 'ur-zzz', {
        id: 'ur-zzz',
        buildId: BUILD_ID,
        recipeId: 'recipe-zzz',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipes', 'ur-aaa', {
        id: 'ur-aaa',
        buildId: BUILD_ID,
        recipeId: 'recipe-aaa',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipes', 'ur-iron', {
        id: 'ur-iron',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })

      const groups = buildProductGroups(
        buildStore,
        gameDataStore,
        BUILD_ID,
        fakeName,
        getCompare('en-US')
      )
      const order = groups.map((g) => g.children[0].primaryProductId)
      // Empty familyName never clusters even with multiple empty-family
      // recipes; iron's family ("Iron") has count 1 so it doesn't cluster
      // either. Pure alphabetical by product name
      // (item:item-aaa < item:item-iron < item:item-zzz).
      expect(order).toEqual(['item-aaa', 'item-iron', 'item-zzz'])
    })
  })
})

describe('getRecipeSkillInfo', () => {
  it('resolves a recipe to its skill id, raw asset name, and localized name', () => {
    expect(getRecipeSkillInfo(gameDataStore, 'recipe-iron', fakeName)).toEqual({
      skillId: 'skill-mining',
      skillName: 'skill:skill-mining',
      skillRawName: 'MiningSkill',
    })
  })

  it('returns empty strings when recipeId is the empty string', () => {
    expect(getRecipeSkillInfo(gameDataStore, '', fakeName)).toEqual({
      skillId: '',
      skillName: '',
      skillRawName: '',
    })
  })

  it('returns empty strings when the recipe has no skill (skill-less recipe)', () => {
    gameDataStore.setRow('recipes', 'recipe-skilless', {
      id: 'recipe-skilless',
      datasetId: 'ds1',
      name: 'Skilless',
      familyName: 'Skilless',
      skillId: '',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    expect(getRecipeSkillInfo(gameDataStore, 'recipe-skilless', fakeName)).toEqual({
      skillId: '',
      skillName: '',
      skillRawName: '',
    })
  })

  it("returns empty strings when the recipe doesn't exist", () => {
    expect(getRecipeSkillInfo(gameDataStore, 'unknown-recipe', fakeName)).toEqual({
      skillId: '',
      skillName: '',
      skillRawName: '',
    })
  })
})
