import { beforeEach, describe, expect, it } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'

import {
  clearGameDataIndexesCache,
  craftingTableModules,
  getGameDataIndexes,
} from '../game-data-indexes'

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

describe('solverTagItemsByDatasetId', () => {
  it('scopes tags to their own dataset', () => {
    // The dataset split is the reason this can't just reuse `itemIdsByTagId`:
    // `solve()` walks `for (const tagId in tagItems)` to emit tag prices, so a
    // second installed dataset's tags would leak into SolverOutput.
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
      datasetId: 'other-ds',
      tagId: 'tag:metal',
      itemId: 'iron',
    })
    clearGameDataIndexesCache(store)
    const { solverTagItemsByDatasetId } = getGameDataIndexes(store)
    expect(solverTagItemsByDatasetId.get('ds')).toEqual({ 'tag:wood': ['oak', 'birch'] })
    expect(solverTagItemsByDatasetId.get('other-ds')).toEqual({ 'tag:metal': ['iron'] })
  })

  it('has no entry for a dataset with no tag items', () => {
    // buildSolverSnapshot falls back to {} on a miss.
    const { solverTagItemsByDatasetId } = getGameDataIndexes(store)
    expect(solverTagItemsByDatasetId.get('ds')).toBeUndefined()
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

describe('craftingTableModules', () => {
  function seed() {
    store.setRow('pluginModules', 'pm-basic', {
      id: 'pm-basic',
      datasetId: 'ds1',
      name: 'BasicUpgradeItem',
      slot: 'Basic',
      isDeprecated: false,
    })
    store.setRow('pluginModules', 'pm-spec', {
      id: 'pm-spec',
      datasetId: 'ds1',
      name: 'CarpentryBasicUpgradeItem',
      slot: 'Specialty',
      isDeprecated: false,
    })
    store.setRow('craftingTablePluginModules', 'j1', {
      id: 'j1',
      datasetId: 'ds1',
      craftingTableId: 'ct1',
      pluginModuleId: 'pm-basic',
    })
    store.setRow('craftingTablePluginModules', 'j2', {
      id: 'j2',
      datasetId: 'ds1',
      craftingTableId: 'ct1',
      pluginModuleId: 'pm-spec',
    })
    clearGameDataIndexesCache(store)
  }

  it('returns the modules a table accepts, with slot and deprecation', () => {
    seed()
    expect(craftingTableModules(store, 'ds1', 'ct1')).toEqual([
      {
        id: 'pm-basic',
        datasetId: 'ds1',
        name: 'BasicUpgradeItem',
        slot: 'Basic',
        isDeprecated: false,
      },
      {
        id: 'pm-spec',
        datasetId: 'ds1',
        name: 'CarpentryBasicUpgradeItem',
        slot: 'Specialty',
        isDeprecated: false,
      },
    ])
  })

  it('filters by dataset', () => {
    // The two open-coded scans this replaces matched on craftingTableId alone.
    // Several datasets stay installed side by side, so the filter is what makes
    // the result correct rather than merely unlikely to collide.
    seed()
    expect(craftingTableModules(store, 'ds2', 'ct1')).toEqual([])
  })

  it('returns an empty list for a table that accepts no modules', () => {
    seed()
    expect(craftingTableModules(store, 'ds1', 'ct-none')).toEqual([])
  })

  it('skips join rows whose module is missing or unnamed', () => {
    // A dangling join would otherwise render a blank, unselectable option and,
    // on a generic slot, turn the single-candidate checkbox into a dropdown.
    seed()
    store.setRow('pluginModules', 'pm-nameless', {
      id: 'pm-nameless',
      datasetId: 'ds1',
      name: '',
      slot: 'Basic',
    })
    store.setRow('craftingTablePluginModules', 'j3', {
      id: 'j3',
      datasetId: 'ds1',
      craftingTableId: 'ct1',
      pluginModuleId: 'pm-nameless',
    })
    store.setRow('craftingTablePluginModules', 'j4', {
      id: 'j4',
      datasetId: 'ds1',
      craftingTableId: 'ct1',
      pluginModuleId: 'pm-gone',
    })
    clearGameDataIndexesCache(store)
    expect(craftingTableModules(store, 'ds1', 'ct1').map((m) => m.id)).toEqual([
      'pm-basic',
      'pm-spec',
    ])
  })

  it('defaults a module with no stored slot to Specialty', () => {
    // Specialty is the zero-star slot every legacy module normalizes to, so an
    // unslotted row lands somewhere harmless rather than vanishing.
    store.setRow('pluginModules', 'pm-old', { id: 'pm-old', datasetId: 'ds1', name: 'OldUpgrade' })
    store.setRow('craftingTablePluginModules', 'j9', {
      id: 'j9',
      datasetId: 'ds1',
      craftingTableId: 'ct9',
      pluginModuleId: 'pm-old',
    })
    clearGameDataIndexesCache(store)
    expect(craftingTableModules(store, 'ds1', 'ct9')[0].slot).toBe('Specialty')
  })
})
