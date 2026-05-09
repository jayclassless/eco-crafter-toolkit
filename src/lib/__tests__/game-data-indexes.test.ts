import { beforeEach, describe, expect, it } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'

import { clearGameDataIndexesCache, getGameDataIndexes } from '../game-data-indexes'

let store: ReturnType<typeof createGameDataStore>

beforeEach(() => {
  store = createGameDataStore()
  clearGameDataIndexesCache(store)
})

describe('getGameDataIndexes', () => {
  it('caches the same indexes object across repeated calls', () => {
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', skillId: '' })
    const first = getGameDataIndexes(store)
    const second = getGameDataIndexes(store)
    expect(second).toBe(first)
  })

  it('invalidates the cache when the store mutates', () => {
    store.setRow('items', 'i1', { id: 'i1', datasetId: 'ds', name: 'Iron' })
    const first = getGameDataIndexes(store)
    // Any mutation on the store should drop the cache so the next call
    // returns a fresh index set. Without this, dataset re-imports would
    // keep stale product/ingredient maps.
    store.setRow('items', 'i2', { id: 'i2', datasetId: 'ds', name: 'Copper' })
    const second = getGameDataIndexes(store)
    expect(second).not.toBe(first)
  })
})

describe('itemIdsByTagId', () => {
  it('groups items by their tagId, preserving row order per tag', () => {
    store.setRow('tagItems', 'ti1', {
      id: 'ti1',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'oak',
    })
    store.setRow('tagItems', 'ti2', {
      id: 'ti2',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'birch',
    })
    store.setRow('tagItems', 'ti3', {
      id: 'ti3',
      datasetId: 'ds',
      tagId: 'tag:metal',
      itemId: 'iron',
    })
    clearGameDataIndexesCache(store)
    const { itemIdsByTagId } = getGameDataIndexes(store)
    expect(itemIdsByTagId.get('tag:wood')).toEqual(['oak', 'birch'])
    expect(itemIdsByTagId.get('tag:metal')).toEqual(['iron'])
  })

  it('returns undefined for unknown tag ids', () => {
    const { itemIdsByTagId } = getGameDataIndexes(store)
    expect(itemIdsByTagId.get('tag:missing')).toBeUndefined()
  })

  it('is the inverse of tagIdsByItemId for the same input', () => {
    store.setRow('tagItems', 'ti1', {
      id: 'ti1',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'oak',
    })
    store.setRow('tagItems', 'ti2', {
      id: 'ti2',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'birch',
    })
    store.setRow('tagItems', 'ti3', {
      id: 'ti3',
      datasetId: 'ds',
      tagId: 'tag:fuel',
      itemId: 'oak',
    })
    clearGameDataIndexesCache(store)
    const { itemIdsByTagId, tagIdsByItemId } = getGameDataIndexes(store)
    expect(itemIdsByTagId.get('tag:wood')).toContain('oak')
    expect(tagIdsByItemId.get('oak')).toEqual(expect.arrayContaining(['tag:wood', 'tag:fuel']))
  })
})

describe('canonicalFamilyByItemId', () => {
  function setRecipeWithProducts(
    recipeId: string,
    familyName: string,
    products: string[],
    ingredients: string[] = []
  ) {
    store.setRow('recipes', recipeId, {
      id: recipeId,
      datasetId: 'ds',
      name: recipeId,
      familyName,
      skillId: '',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: '',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    let idx = 0
    for (const item of products) {
      store.setRow('recipeElements', `${recipeId}-p-${item}`, {
        id: `${recipeId}-p-${item}`,
        datasetId: 'ds',
        recipeId,
        itemOrTagId: item,
        baseQuantity: 1,
        isProduct: true,
        index: idx++,
      })
    }
    for (const item of ingredients) {
      store.setRow('recipeElements', `${recipeId}-i-${item}`, {
        id: `${recipeId}-i-${item}`,
        datasetId: 'ds',
        recipeId,
        itemOrTagId: item,
        baseQuantity: 1,
        isProduct: false,
        index: idx++,
      })
    }
  }

  it('clusters substrate variants under the family that produces them all as primary products', () => {
    setRecipeWithProducts('BoardRecipe', 'Board', ['BoardItem'])
    setRecipeWithProducts('HardwoodBoardRecipe', 'Board', ['HardwoodBoardItem'])
    setRecipeWithProducts('SoftwoodBoardRecipe', 'Board', ['SoftwoodBoardItem'])
    clearGameDataIndexesCache(store)
    const { canonicalFamilyByItemId } = getGameDataIndexes(store)
    expect(canonicalFamilyByItemId.get('BoardItem')).toBe('Board')
    expect(canonicalFamilyByItemId.get('HardwoodBoardItem')).toBe('Board')
    expect(canonicalFamilyByItemId.get('SoftwoodBoardItem')).toBe('Board')
  })

  it('does not let shared byproducts conflate distinct concentrate families (regression)', () => {
    // Each ore-concentrate recipe produces its concentrate as the primary
    // product and WetTailings as a byproduct. Counting the byproduct toward
    // family size used to make every concentrate item resolve to the
    // alphabetically-first family ("Concentrate Copper Lv2"), spuriously
    // clustering Copper Concentrate, Iron Concentrate, Gold Concentrate,
    // and Wet Tailings together.
    setRecipeWithProducts(
      'ConcentrateCopperLv2Recipe',
      'Concentrate Copper Lv2',
      ['CopperConcentrateItem', 'WetTailingsItem'],
      ['CrushedCopperOreItem']
    )
    setRecipeWithProducts(
      'ConcentrateIronLv2Recipe',
      'Concentrate Iron Lv2',
      ['IronConcentrateItem', 'WetTailingsItem'],
      ['CrushedIronOreItem']
    )
    setRecipeWithProducts(
      'ConcentrateGoldLv2Recipe',
      'Concentrate Gold Lv2',
      ['GoldConcentrateItem', 'WetTailingsItem'],
      ['CrushedGoldOreItem']
    )
    clearGameDataIndexesCache(store)
    const { canonicalFamilyByItemId } = getGameDataIndexes(store)
    // Each concentrate resolves to its own family; WetTailings (only ever a
    // byproduct) doesn't appear in the canonical map at all.
    expect(canonicalFamilyByItemId.get('CopperConcentrateItem')).toBe('Concentrate Copper Lv2')
    expect(canonicalFamilyByItemId.get('IronConcentrateItem')).toBe('Concentrate Iron Lv2')
    expect(canonicalFamilyByItemId.get('GoldConcentrateItem')).toBe('Concentrate Gold Lv2')
    expect(canonicalFamilyByItemId.has('WetTailingsItem')).toBe(false)
  })

  it('omits items that have no family-bearing producer', () => {
    setRecipeWithProducts('OrphanRecipe', '', ['OrphanItem'])
    clearGameDataIndexesCache(store)
    const { canonicalFamilyByItemId } = getGameDataIndexes(store)
    expect(canonicalFamilyByItemId.has('OrphanItem')).toBe(false)
  })
})

describe('productItemIdsByRecipeId & ingredientItemIdsByRecipeId', () => {
  it('bucket recipeElements into product vs ingredient maps keyed by recipe', () => {
    store.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'iron-bar',
      isProduct: true,
      baseQuantity: 1,
      index: 0,
    })
    store.setRow('recipeElements', 're2', {
      id: 're2',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'iron-ore',
      isProduct: false,
      baseQuantity: 2,
      index: 1,
    })
    clearGameDataIndexesCache(store)
    const { productItemIdsByRecipeId, ingredientItemIdsByRecipeId } = getGameDataIndexes(store)
    expect(productItemIdsByRecipeId.get('r1')).toEqual(['iron-bar'])
    expect(ingredientItemIdsByRecipeId.get('r1')?.has('iron-ore')).toBe(true)
    // Ingredients are a Set so membership checks stay O(1) — the Materials
    // view-model relies on this for the reintegration filter.
    expect(ingredientItemIdsByRecipeId.get('r1')).toBeInstanceOf(Set)
  })
})
