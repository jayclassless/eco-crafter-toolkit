import { beforeEach, describe, expect, it } from 'vitest'

import { getCompare } from '@/lib/collator'
import { clearGameDataIndexesCache } from '@/lib/game-data-indexes'
import { createGameDataStore } from '@/stores/game-data-store'

import {
  applyFurnishingFilters,
  buildFurnishingRows,
  buildMaterialRows,
  buildRoomCategoryViews,
  buildRoomTierMap,
  collectFurnishingFilterOptions,
} from '../housing-data'
import { ALL_SELECTED } from '../housing-types'

const compare = getCompare('en-US')
const getName = (entityType: string, entityId: string) => `${entityType}:${entityId}`

let store: ReturnType<typeof createGameDataStore>

beforeEach(() => {
  store = createGameDataStore()
  clearGameDataIndexesCache(store)
})

function seedCategories(negatingName = 'Industrial') {
  store.setRow('roomCategories', 'c1', {
    id: 'c1',
    datasetId: 'ds1',
    name: 'Seating',
    color: '#E5956E',
    index: 1,
  })
  store.setRow('roomCategories', 'c2', {
    id: 'c2',
    datasetId: 'ds1',
    name: negatingName,
    color: '#A300B4',
    index: 0,
    negatesValue: true,
  })
  // A category with no color of its own.
  store.setRow('roomCategories', 'c3', {
    id: 'c3',
    datasetId: 'ds1',
    name: 'Cultural',
    color: '',
    index: 2,
  })
}

function seedTiers() {
  store.setRow('roomTiers', 't0', {
    id: 't0',
    datasetId: 'ds1',
    tierVal: 0,
    softCap: 2,
    hardCap: 4,
    diminishingReturnPercent: 0.65,
  })
  store.setRow('roomTiers', 't3', {
    id: 't3',
    datasetId: 'ds1',
    tierVal: 3,
    softCap: 15,
    hardCap: 30,
    diminishingReturnPercent: 0.65,
  })
}

describe('buildRoomCategoryViews', () => {
  it('returns categories in the game declaration order with localized names', () => {
    seedCategories()
    const views = buildRoomCategoryViews(store, 'ds1', getName)
    expect(views.map((v) => v.name)).toEqual(['Industrial', 'Seating', 'Cultural'])
    expect(views[1].displayName).toBe('roomCategory:c1')
  })

  it('keeps an empty color rather than inventing one', () => {
    seedCategories()
    const cultural = buildRoomCategoryViews(store, 'ds1', getName).find(
      (v) => v.name === 'Cultural'
    )
    expect(cultural?.color).toBe('')
  })

  it('returns nothing for a dataset with no housing data', () => {
    expect(buildRoomCategoryViews(store, 'ds-other', getName)).toEqual([])
  })
})

describe('buildFurnishingRows', () => {
  function seedFurnishings() {
    store.setRow('items', 'chair', {
      id: 'chair',
      datasetId: 'ds1',
      name: 'ChairItem',
      isTag: false,
      housingCategory: 'Seating',
      housingBaseValue: 3,
      housingTypeForRoomLimit: 'Chair',
      housingDiminishingReturnMultiplier: 0.6,
    })
    store.setRow('items', 'plaque', {
      id: 'plaque',
      datasetId: 'ds1',
      name: 'PlaqueItem',
      isTag: false,
      housingCategory: 'Cultural',
      housingBaseValue: 0,
      housingTypeForRoomLimit: '',
      housingDiminishingReturnMultiplier: 0,
    })
    store.setRow('items', 'nopenalty', {
      id: 'nopenalty',
      datasetId: 'ds1',
      name: 'UniqueItem',
      isTag: false,
      housingCategory: 'Seating',
      housingBaseValue: 5,
      housingTypeForRoomLimit: 'Table',
      housingDiminishingReturnMultiplier: 1,
    })
    store.setRow('items', 'machine', {
      id: 'machine',
      datasetId: 'ds1',
      name: 'MachineItem',
      isTag: false,
      housingCategory: 'Industrial',
      housingBaseValue: 0,
    })
  }

  it('excludes categories that zero a room, by flag rather than by name', () => {
    // Renaming Industrial must not smuggle it back into the browser.
    seedCategories('Machines')
    seedFurnishings()
    store.setCell('items', 'machine', 'housingCategory', 'Machines')
    const categories = buildRoomCategoryViews(store, 'ds1', getName)
    const rows = buildFurnishingRows(store, 'ds1', getName, categories, compare)
    expect(rows.map((r) => r.itemId).sort()).toEqual(['chair', 'nopenalty', 'plaque'])
  })

  it('converts the repeat multiplier into a reduction, with null for no penalty', () => {
    seedCategories()
    seedFurnishings()
    const categories = buildRoomCategoryViews(store, 'ds1', getName)
    const byId = new Map(
      buildFurnishingRows(store, 'ds1', getName, categories, compare).map((r) => [r.itemId, r])
    )
    expect(byId.get('chair')?.repeatReduction).toBeCloseTo(0.4)
    expect(byId.get('nopenalty')?.repeatReduction).toBeNull()
    expect(byId.get('plaque')?.repeatReduction).toBe(1)
  })

  it('joins the category color and degrades when the category is unknown', () => {
    seedCategories()
    seedFurnishings()
    store.setCell('items', 'chair', 'housingCategory', 'Nonexistent')
    const categories = buildRoomCategoryViews(store, 'ds1', getName)
    const rows = buildFurnishingRows(store, 'ds1', getName, categories, compare)
    const chair = rows.find((r) => r.itemId === 'chair')
    expect(chair?.categoryColor).toBe('')
    expect(chair?.categoryDisplayName).toBe('Nonexistent')
  })

  it('excludes nothing when the dataset carries no categories', () => {
    seedFurnishings()
    const rows = buildFurnishingRows(store, 'ds1', getName, [], compare)
    expect(rows).toHaveLength(4)
  })

  it('reports every skill that produces the item, and none for uncraftable ones', () => {
    seedCategories()
    seedFurnishings()
    store.setRow('skills', 's1', {
      id: 's1',
      datasetId: 'ds1',
      name: 'CarpentrySkill',
      maxLevel: 7,
    })
    store.setRow('skills', 's2', {
      id: 's2',
      datasetId: 'ds1',
      name: 'RecyclingSkill',
      maxLevel: 7,
    })
    for (const [recipeId, skillId] of [
      ['r1', 's1'],
      ['r2', 's2'],
    ] as const) {
      store.setRow('recipes', recipeId, { id: recipeId, datasetId: 'ds1', skillId })
      store.setRow('recipeElements', `${recipeId}p`, {
        id: `${recipeId}p`,
        datasetId: 'ds1',
        recipeId,
        itemOrTagId: 'chair',
        baseQuantity: 1,
        isProduct: true,
        index: 0,
      })
    }
    const categories = buildRoomCategoryViews(store, 'ds1', getName)
    const rows = buildFurnishingRows(store, 'ds1', getName, categories, compare)
    const chair = rows.find((r) => r.itemId === 'chair')
    expect(chair?.skillIds.sort()).toEqual(['s1', 's2'])
    expect(chair?.skillLabel).toBe('skill:s1, skill:s2')
    expect(rows.find((r) => r.itemId === 'plaque')?.skillIds).toEqual([])
  })

  it('ignores items from other datasets', () => {
    seedCategories()
    seedFurnishings()
    store.setRow('items', 'other', {
      id: 'other',
      datasetId: 'ds2',
      name: 'OtherItem',
      isTag: false,
      housingCategory: 'Seating',
    })
    const categories = buildRoomCategoryViews(store, 'ds1', getName)
    const rows = buildFurnishingRows(store, 'ds1', getName, categories, compare)
    expect(rows.some((r) => r.itemId === 'other')).toBe(false)
  })
})

describe('buildMaterialRows', () => {
  function seedMaterials() {
    store.setRow('items', 'basalt', {
      id: 'basalt',
      datasetId: 'ds1',
      name: 'MortaredBasaltItem',
      isTag: false,
      isBuildingMaterial: true,
      buildingBlockTier: 0,
    })
    store.setRow('items', 'brick', {
      id: 'brick',
      datasetId: 'ds1',
      name: 'BrickItem',
      isTag: false,
      isBuildingMaterial: true,
      buildingBlockTier: 3,
    })
    store.setRow('items', 'orphan', {
      id: 'orphan',
      datasetId: 'ds1',
      name: 'OrphanItem',
      isTag: false,
      isBuildingMaterial: true,
      buildingBlockTier: 5,
    })
  }

  it('joins tier to its soft/hard caps, treating tier 0 as present', () => {
    seedTiers()
    seedMaterials()
    const tiers = buildRoomTierMap(store, 'ds1')
    const byId = new Map(
      buildMaterialRows(store, 'ds1', getName, tiers, compare).map((r) => [r.itemId, r])
    )
    expect(byId.get('basalt')).toMatchObject({ tier: 0, softCap: 2, hardCap: 4 })
    expect(byId.get('brick')).toMatchObject({ tier: 3, softCap: 15, hardCap: 30 })
  })

  it('yields null caps when the tier table has no matching row', () => {
    seedTiers()
    seedMaterials()
    const tiers = buildRoomTierMap(store, 'ds1')
    const orphan = buildMaterialRows(store, 'ds1', getName, tiers, compare).find(
      (r) => r.itemId === 'orphan'
    )
    expect(orphan?.softCap).toBeNull()
    expect(orphan?.hardCap).toBeNull()
  })

  it('uses the boolean presence gate, not a tier truthiness test', () => {
    seedTiers()
    seedMaterials()
    // A plain item with the default tier 0 must not appear as a material.
    store.setRow('items', 'notmaterial', {
      id: 'notmaterial',
      datasetId: 'ds1',
      name: 'WoodItem',
      isTag: false,
    })
    const tiers = buildRoomTierMap(store, 'ds1')
    const rows = buildMaterialRows(store, 'ds1', getName, tiers, compare)
    expect(rows.some((r) => r.itemId === 'notmaterial')).toBe(false)
    expect(rows.some((r) => r.itemId === 'basalt')).toBe(true)
  })
})

describe('collectFurnishingFilterOptions and applyFurnishingFilters', () => {
  function rows() {
    seedCategories()
    store.setRow('items', 'chair', {
      id: 'chair',
      datasetId: 'ds1',
      name: 'ChairItem',
      isTag: false,
      housingCategory: 'Seating',
      housingTypeForRoomLimit: 'Chair',
      housingBaseValue: 3,
    })
    store.setRow('items', 'plaque', {
      id: 'plaque',
      datasetId: 'ds1',
      name: 'PlaqueItem',
      isTag: false,
      housingCategory: 'Cultural',
      housingTypeForRoomLimit: '',
      housingBaseValue: 1,
    })
    const categories = buildRoomCategoryViews(store, 'ds1', getName)
    return { categories, rows: buildFurnishingRows(store, 'ds1', getName, categories, compare) }
  }

  it('drops the empty furniture type and offers only categories in use', () => {
    const { categories, rows: r } = rows()
    const options = collectFurnishingFilterOptions(r, categories, compare)
    expect(options.types).toEqual(['Chair'])
    expect(options.categories.map((c) => c.name)).toEqual(['Seating', 'Cultural'])
  })

  it('returns every row when no filter is applied', () => {
    const { rows: r } = rows()
    expect(applyFurnishingFilters(r, ALL_SELECTED)).toBe(r)
  })

  it('narrows to the selected category', () => {
    const { rows: r } = rows()
    const filtered = applyFurnishingFilters(r, { ...ALL_SELECTED, categories: ['Seating'] })
    expect(filtered.map((x) => x.itemId)).toEqual(['chair'])
  })

  it('treats an empty selection as matching nothing', () => {
    const { rows: r } = rows()
    expect(applyFurnishingFilters(r, { ...ALL_SELECTED, categories: [] })).toEqual([])
  })
})
