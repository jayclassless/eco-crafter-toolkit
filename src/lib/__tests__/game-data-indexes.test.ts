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

describe('skillIdsByItemId', () => {
  function seedRecipe(recipeId: string, skillId: string, productId: string, ingredientId?: string) {
    store.setRow('recipes', recipeId, { id: recipeId, datasetId: 'ds', skillId })
    store.setRow('recipeElements', `${recipeId}p`, {
      id: `${recipeId}p`,
      datasetId: 'ds',
      recipeId,
      itemOrTagId: productId,
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    if (ingredientId) {
      store.setRow('recipeElements', `${recipeId}i`, {
        id: `${recipeId}i`,
        datasetId: 'ds',
        recipeId,
        itemOrTagId: ingredientId,
        baseQuantity: -1,
        isProduct: false,
        index: 0,
      })
    }
  }

  it('reports every distinct skill that produces the item', () => {
    // Glass is the real multi-skill case: Glassworking and Recycling both make it.
    seedRecipe('r1', 'glassworking', 'glass')
    seedRecipe('r2', 'recycling', 'glass')
    seedRecipe('r3', 'glassworking', 'glass') // duplicate skill, deduped
    const map = getGameDataIndexes(store).skillIdsByItemId
    expect(map.get('glass')).toEqual(['glassworking', 'recycling'])
  })

  it('omits recipes that also consume the item', () => {
    // Reprocessing is not a way to obtain the item.
    seedRecipe('r1', 'smelting', 'ingot', 'ingot')
    expect(getGameDataIndexes(store).skillIdsByItemId.get('ingot')).toBeUndefined()
  })

  it('omits unskilled recipes and items nothing produces', () => {
    seedRecipe('r1', '', 'campfire')
    const map = getGameDataIndexes(store).skillIdsByItemId
    expect(map.get('campfire')).toBeUndefined()
    expect(map.get('never-made')).toBeUndefined()
  })
})

describe('housing indexes', () => {
  it('buckets furnishings and materials by dataset, keeping tier 0 materials', () => {
    store.setRow('items', 'chair', {
      id: 'chair',
      datasetId: 'ds1',
      name: 'ChairItem',
      housingCategory: 'Seating',
    })
    store.setRow('items', 'chair2', {
      id: 'chair2',
      datasetId: 'ds2',
      name: 'ChairItem',
      housingCategory: 'Seating',
    })
    store.setRow('items', 'basalt', {
      id: 'basalt',
      datasetId: 'ds1',
      name: 'MortaredBasaltItem',
      isBuildingMaterial: true,
      buildingBlockTier: 0,
    })
    store.setRow('items', 'plain', { id: 'plain', datasetId: 'ds1', name: 'WoodItem' })
    const indexes = getGameDataIndexes(store)
    expect(indexes.housingItemIdsByDatasetId.get('ds1')).toEqual(['chair'])
    expect(indexes.housingItemIdsByDatasetId.get('ds2')).toEqual(['chair2'])
    expect(indexes.buildingMaterialItemIdsByDatasetId.get('ds1')).toEqual(['basalt'])
  })

  it('rehydrates the JSON-encoded category columns and orders by declaration index', () => {
    store.setRow('roomCategories', 'c1', {
      id: 'c1',
      datasetId: 'ds1',
      name: 'Bedroom',
      color: '#00B4A5',
      index: 1,
      supportingRoomCategoryNames: JSON.stringify(['Living Room', 'Seating']),
      maxSupportPercentOfPrimaryPerCategory: JSON.stringify({ Outdoor: 1 }),
      affectsPropertyTypes: JSON.stringify(['Residence']),
    })
    store.setRow('roomCategories', 'c0', {
      id: 'c0',
      datasetId: 'ds1',
      name: 'Living Room',
      color: '#DB48C5',
      index: 0,
    })
    store.setRow('roomCategories', 'other', { id: 'other', datasetId: 'ds2', name: 'Kitchen' })
    const list = getGameDataIndexes(store).roomCategoriesByDatasetId.get('ds1')!
    expect(list.map((c) => c.name)).toEqual(['Living Room', 'Bedroom'])
    expect(list[1].supportingRoomCategoryNames).toEqual(['Living Room', 'Seating'])
    expect(list[1].maxSupportPercentOfPrimaryPerCategory).toEqual({ Outdoor: 1 })
    expect(list[1].affectsPropertyTypes).toEqual(['Residence'])
    // Defaults survive for a row that never set the JSON columns.
    expect(list[0].supportingRoomCategoryNames).toEqual([])
  })

  it('orders room tiers by tier value and scopes them to their dataset', () => {
    store.setRow('roomTiers', 't3', {
      id: 't3',
      datasetId: 'ds1',
      tierVal: 3,
      softCap: 15,
      hardCap: 30,
    })
    store.setRow('roomTiers', 't0', {
      id: 't0',
      datasetId: 'ds1',
      tierVal: 0,
      softCap: 2,
      hardCap: 4,
    })
    store.setRow('roomTiers', 'x', {
      id: 'x',
      datasetId: 'ds2',
      tierVal: 5,
      softCap: 25,
      hardCap: 50,
    })
    const tiers = getGameDataIndexes(store).roomTiersByDatasetId.get('ds1')!
    expect(tiers.map((t) => t.tierVal)).toEqual([0, 3])
    expect(getGameDataIndexes(store).roomTiersByDatasetId.get('ds2')!).toHaveLength(1)
  })
})

describe('gatheringConstantsByDatasetId', () => {
  it('indexes one row per dataset and keeps them apart', () => {
    const store = createGameDataStore()
    store.setRow('gatheringConstants', 'gc1', {
      id: 'gc1',
      datasetId: 'ds1',
      bowHeadshotMultiplier: 1.4,
      bowHeadshotMultiplierDeadeye: 0,
      maxTrunkPickupSize: 5,
    })
    store.setRow('gatheringConstants', 'gc2', {
      id: 'gc2',
      datasetId: 'ds2',
      bowHeadshotMultiplier: 1.5,
      bowHeadshotMultiplierDeadeye: 2,
      maxTrunkPickupSize: 5,
    })
    const index = getGameDataIndexes(store).gatheringConstantsByDatasetId
    expect(index.get('ds1')).toMatchObject({ bowHeadshotMultiplier: 1.4 })
    expect(index.get('ds2')).toMatchObject({ bowHeadshotMultiplierDeadeye: 2 })
    expect(index.get('ds3')).toBeUndefined()
  })
})

describe('rawMaterialItemIds', () => {
  const item = (id: string, cells: Record<string, unknown> = {}) =>
    store.setRow('items', id, { id, datasetId: 'ds', name: id, ...cells })

  it('admits an item for any one of the gathering markers', () => {
    item('ore', { minableHardness: 2 })
    item('clay', { requiresShovel: true })
    item('carcass', { animalHealth: 8.5 })
    item('oak', { isTree: true })
    item('wheat', { maturityAgeDays: 0.8 })
    // PlantFibers carries only the resource range, and is ALSO produced by a
    // recipe — so nothing but this marker catches it.
    item('plantFibers', { primaryResourceMin: 1 })
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', skillId: 'gathering' })
    store.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'plantFibers',
      isProduct: true,
    })
    const { rawMaterialItemIds } = getGameDataIndexes(store)
    for (const id of ['ore', 'clay', 'carcass', 'oak', 'wheat', 'plantFibers']) {
      expect(rawMaterialItemIds.has(id), id).toBe(true)
    }
  })

  it('admits an item that no recipe produces, and excludes tags', () => {
    item('tuna')
    item('woodTag', { isTag: true })
    const { rawMaterialItemIds } = getGameDataIndexes(store)
    expect(rawMaterialItemIds.has('tuna')).toBe(true)
    expect(rawMaterialItemIds.has('woodTag')).toBe(false)
  })

  it('seeds the Campsite, which is otherwise unreachable', () => {
    // It is the crafting table for the Workbench and Tool Bench recipes but is
    // itself built at a Tailoring Table, so the graph has no entry point
    // without it. Players spawn holding one; the dataset cannot say so.
    item('CampsiteItem')
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', skillId: 'tailoring' })
    store.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'CampsiteItem',
      isProduct: true,
    })
    expect(getGameDataIndexes(store).rawMaterialItemIds.has('CampsiteItem')).toBe(true)
  })

  it('excludes a processed excavatable, which really does come from a recipe', () => {
    item('crushedRock')
    item('excavatable', { isTag: true })
    item('crushedRockTag', { isTag: true })
    store.setRow('tagItems', 'a', {
      id: 'a',
      datasetId: 'ds',
      tagId: 'excavatable',
      itemId: 'crushedRock',
    })
    store.setRow('tagItems', 'b', {
      id: 'b',
      datasetId: 'ds',
      tagId: 'crushedRockTag',
      itemId: 'crushedRock',
    })
    store.setCell('items', 'excavatable', 'name', 'Excavatable')
    store.setCell('items', 'crushedRockTag', 'name', 'CrushedRock')
    // Produced by a recipe, so the "nothing makes it" rule does not save it.
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', skillId: 'mining' })
    store.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'crushedRock',
      isProduct: true,
    })
    expect(getGameDataIndexes(store).rawLeafItemIds.has('crushedRock')).toBe(false)
    expect(getGameDataIndexes(store).rawMaterialItemIds.has('crushedRock')).toBe(false)
  })
})

describe('reachabilityGraphByDatasetId', () => {
  it('resolves a recipe crafting table to its item id, matching by name', () => {
    // `craftingTables` rows carry a fresh uuid with no link back to the item,
    // so the only join available is the shared raw name.
    store.setRow('items', 'i:workbench', { id: 'i:workbench', datasetId: 'ds', name: 'Workbench' })
    store.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: 'ds', name: 'Workbench' })
    store.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: 'ds',
      skillId: 'carpentry',
      craftingTableId: 'ct1',
    })
    const graph = getGameDataIndexes(store).reachabilityGraphByDatasetId.get('ds')!
    expect(graph.recipes[0].craftingTableItemId).toBe('i:workbench')
    expect(graph.recipes[0].skillId).toBe('carpentry')
  })

  it('leaves the table unrestricted when the name resolves to no item', () => {
    // Over-blocking would silently empty the optimizer; import already
    // validates this link, so a miss here means malformed data.
    store.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: 'ds', name: 'Ghost' })
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', craftingTableId: 'ct1' })
    const graph = getGameDataIndexes(store).reachabilityGraphByDatasetId.get('ds')!
    expect(graph.recipes[0].craftingTableItemId).toBe('')
  })

  it('keeps tag ingredients unresolved and separates datasets', () => {
    store.setRow('items', 'woodTag', { id: 'woodTag', datasetId: 'ds', name: 'Wood', isTag: true })
    store.setRow('items', 'oak', { id: 'oak', datasetId: 'ds', name: 'Oak' })
    store.setRow('tagItems', 'ti', { id: 'ti', datasetId: 'ds', tagId: 'woodTag', itemId: 'oak' })
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', skillId: '' })
    store.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'woodTag',
      isProduct: false,
    })
    store.setRow('recipes', 'r2', { id: 'r2', datasetId: 'other', skillId: '' })

    const { reachabilityGraphByDatasetId } = getGameDataIndexes(store)
    const graph = reachabilityGraphByDatasetId.get('ds')!
    expect(graph.recipes).toHaveLength(1)
    expect(graph.recipes[0].ingredientIds).toEqual(['woodTag'])
    expect(graph.tagMembers.get('woodTag')).toEqual(['oak'])
    expect(reachabilityGraphByDatasetId.get('other')!.recipes).toHaveLength(1)
  })
})
