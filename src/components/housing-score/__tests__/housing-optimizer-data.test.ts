import { beforeEach, describe, expect, it } from 'vitest'

import { getCompare } from '@/lib/collator'
import { clearGameDataIndexesCache } from '@/lib/game-data-indexes'
import { createGameDataStore } from '@/stores/game-data-store'

import {
  buildOptimizerCatalog,
  collectOptimizerSkillOptions,
  parsePowerTypes,
  parseSkillSelection,
  serializePowerTypes,
  serializeSkillSelection,
  type SkillOption,
  toOptimizerInput,
} from '../housing-optimizer-data'
import {
  DEFAULT_OPTIMIZER_CONFIG,
  type OptimizerCatalog,
  UNSKILLED_SKILL_ID,
} from '../housing-optimizer-types'

const compare = getCompare('en-US')
const getName = (entityType: string, entityId: string) => `${entityType}:${entityId}`

let store: ReturnType<typeof createGameDataStore>

beforeEach(() => {
  store = createGameDataStore()
  clearGameDataIndexesCache(store)
})

function seed() {
  store.setRow('roomCategories', 'c1', {
    id: 'c1',
    datasetId: 'ds1',
    name: 'Bedroom',
    color: '#00B4A5',
    index: 0,
    affectsPropertyTypes: JSON.stringify(['Residence']),
    supportingRoomCategoryNames: JSON.stringify([]),
    maxSupportPercentOfPrimaryPerCategory: '{}',
  })
  // Cultural applies only to Cultural properties, but still SUPPORTS rooms on a
  // Residence, so it must survive into the catalog.
  store.setRow('roomCategories', 'c2', {
    id: 'c2',
    datasetId: 'ds1',
    name: 'Cultural',
    color: '',
    index: 1,
    affectsPropertyTypes: JSON.stringify(['Cultural']),
    supportingRoomCategoryNames: JSON.stringify([]),
    maxSupportPercentOfPrimaryPerCategory: '{}',
  })
  store.setRow('roomTiers', 't5', {
    id: 't5',
    datasetId: 'ds1',
    tierVal: 5,
    softCap: 25,
    hardCap: 50,
    diminishingReturnPercent: 0.65,
  })
  store.setRow('skills', 's1', { id: 's1', datasetId: 'ds1', name: 'CarpentrySkill' })

  store.setRow('items', 'i1', {
    id: 'i1',
    datasetId: 'ds1',
    name: 'CastIronBedItem',
    housingCategory: 'Bedroom',
    housingBaseValue: 7.5,
    housingTypeForRoomLimit: 'Bed',
    housingDiminishingReturnMultiplier: 0.3,
  })
  store.setRow('items', 'i2', {
    id: 'i2',
    datasetId: 'ds1',
    name: 'StoveItem',
    housingCategory: 'Bedroom',
    housingBaseValue: 10,
    housingTypeForRoomLimit: 'Cooking',
    housingDiminishingReturnMultiplier: 0.3,
    housingPowerType: 'Electric',
    housingPowerWatts: 500,
  })
  // Nothing crafts this one — it is what the synthetic Unskilled entry covers.
  store.setRow('items', 'i3', {
    id: 'i3',
    datasetId: 'ds1',
    name: 'DaisyItem',
    housingCategory: 'Cultural',
    housingBaseValue: 1,
    housingTypeForRoomLimit: 'Daisy',
    housingDiminishingReturnMultiplier: 0.5,
  })
  // A different dataset must not leak in.
  store.setRow('items', 'other', {
    id: 'other',
    datasetId: 'ds2',
    name: 'OtherBedItem',
    housingCategory: 'Bedroom',
    housingBaseValue: 99,
  })

  store.setRow('recipes', 'r1', {
    id: 'r1',
    datasetId: 'ds1',
    name: 'CastIronBedRecipe',
    skillId: 's1',
  })
  store.setRow('recipeElements', 'e1', {
    id: 'e1',
    datasetId: 'ds1',
    recipeId: 'r1',
    itemOrTagId: 'i1',
    isProduct: true,
    baseQuantity: 1,
    index: 0,
  })
}

describe('buildOptimizerCatalog', () => {
  it('reads the raw housing numbers, skills and power for a dataset', () => {
    seed()
    const catalog = buildOptimizerCatalog(store, 'ds1', getName)
    const byId = new Map(catalog.furnishings.map((f) => [f.itemId, f]))

    expect(byId.get('i1')).toMatchObject({
      categoryName: 'Bedroom',
      typeForRoomLimit: 'Bed',
      baseValue: 7.5,
      // The raw multiplier, NOT the browser's 1 - multiplier reduction.
      dimMultiplier: 0.3,
      skillIds: ['s1'],
      powerType: '',
      rawName: 'CastIronBedItem',
    })
    expect(byId.get('i2')?.powerType).toBe('Electric')
    expect(byId.get('i3')?.skillIds).toEqual([])
  })

  it('keeps Cultural, which applies to Cultural properties but supports Residence rooms', () => {
    seed()
    const catalog = buildOptimizerCatalog(store, 'ds1', getName)
    expect(catalog.categories.map((c) => c.name)).toContain('Cultural')
    expect(catalog.furnishings.map((f) => f.itemId)).toContain('i3')
  })

  it('scopes to the requested dataset', () => {
    seed()
    expect(
      buildOptimizerCatalog(store, 'ds1', getName).furnishings.map((f) => f.itemId)
    ).not.toContain('other')
    expect(buildOptimizerCatalog(store, 'ds2', getName).furnishings).toHaveLength(1)
  })

  it('falls back to the raw name while the localized index is still cold', () => {
    seed()
    const cold = buildOptimizerCatalog(store, 'ds1', () => '')
    expect(cold.furnishings.find((f) => f.itemId === 'i1')?.name).toBe('CastIronBedItem')
  })

  it('treats an unmodelled power grid as needing no power', () => {
    seed()
    store.setCell('items', 'i2', 'housingPowerType', 'Antimatter')
    clearGameDataIndexesCache(store)
    expect(
      buildOptimizerCatalog(store, 'ds1', getName).furnishings.find((f) => f.itemId === 'i2')
        ?.powerType
    ).toBe('')
  })

  it('is empty for a dataset extracted before housing support', () => {
    const catalog = buildOptimizerCatalog(store, 'ds1', getName)
    expect(catalog).toEqual({ furnishings: [], categories: [], tiers: [] })
  })
})

describe('collectOptimizerSkillOptions', () => {
  it('lists crafting skills with counts, and leads with the Unskilled bucket', () => {
    seed()
    const catalog = buildOptimizerCatalog(store, 'ds1', getName)
    const options = collectOptimizerSkillOptions(catalog, store, getName, compare, 'Unskilled')
    expect(options[0]).toMatchObject({ id: UNSKILLED_SKILL_ID, name: 'Unskilled', count: 2 })
    expect(options.find((o) => o.id === 's1')).toMatchObject({
      name: 'skill:s1',
      rawName: 'CarpentrySkill',
      count: 1,
    })
  })

  it('omits the Unskilled entry when everything is craftable', () => {
    seed()
    store.delRow('items', 'i2')
    store.delRow('items', 'i3')
    clearGameDataIndexesCache(store)
    const catalog = buildOptimizerCatalog(store, 'ds1', getName)
    const options = collectOptimizerSkillOptions(catalog, store, getName, compare, 'Unskilled')
    expect(options.map((o) => o.id)).toEqual(['s1'])
  })
})

describe('power encoding', () => {
  it('round-trips a selection', () => {
    expect(parsePowerTypes(serializePowerTypes(['Heat', 'Mechanical']))).toEqual([
      'Heat',
      'Mechanical',
    ])
  })

  it('decodes the empty string to "no power available", never to "all"', () => {
    expect(parsePowerTypes('')).toEqual([])
    expect(serializePowerTypes([])).toBe('')
  })

  it('drops tokens it does not recognize and normalizes order', () => {
    expect(parsePowerTypes('Electric,Antimatter,Heat')).toEqual(['Heat', 'Electric'])
  })
})

describe('skill selection encoding', () => {
  const options: SkillOption[] = [
    { id: UNSKILLED_SKILL_ID, name: 'Unskilled', rawName: '', count: 4 },
    { id: 'uuid-carpentry', name: 'Carpentry', rawName: 'CarpentrySkill', count: 12 },
    { id: 'uuid-masonry', name: 'Masonry', rawName: 'MasonrySkill', count: 8 },
  ]

  it('round-trips a selection through skill names, not row ids', () => {
    const raw = serializeSkillSelection(['uuid-carpentry'], options)
    // Ids are per-dataset uuids; the stored form must be the stable game name.
    expect(raw).toBe('CarpentrySkill')
    expect(parseSkillSelection(raw, options)).toEqual(['uuid-carpentry'])
  })

  it('distinguishes "all" from "none"', () => {
    expect(serializeSkillSelection(null, options)).toBe('*')
    expect(parseSkillSelection('*', options)).toBeNull()
    expect(serializeSkillSelection([], options)).toBe('')
    expect(parseSkillSelection('', options)).toEqual([])
  })

  it('carries the synthetic Unskilled entry, which has no game name', () => {
    const raw = serializeSkillSelection([UNSKILLED_SKILL_ID, 'uuid-masonry'], options)
    expect(parseSkillSelection(raw, options)).toEqual([UNSKILLED_SKILL_ID, 'uuid-masonry'])
  })

  it('drops names the current dataset does not have', () => {
    expect(parseSkillSelection('CarpentrySkill,GhostSkill', options)).toEqual(['uuid-carpentry'])
  })

  it('falls back to "all" when a stored selection resolves to nothing', () => {
    // Otherwise switching to a dataset that names its skills differently would
    // hand the solver an empty pool and report a zero-score house.
    expect(parseSkillSelection('GhostSkill,PhantomSkill', options)).toBeNull()
  })
})

describe('toOptimizerInput', () => {
  const catalog: OptimizerCatalog = {
    furnishings: [],
    categories: [],
    tiers: [
      {
        id: '0',
        datasetId: 'ds',
        tierVal: 0,
        softCap: 2,
        hardCap: 4,
        diminishingReturnPercent: 0.65,
      },
      {
        id: '3',
        datasetId: 'ds',
        tierVal: 3,
        softCap: 15,
        hardCap: 30,
        diminishingReturnPercent: 0.65,
      },
    ],
  }

  it('treats a null skill selection as everything unlocked, unskilled included', () => {
    const input = toOptimizerInput({ ...DEFAULT_OPTIMIZER_CONFIG, tier: 3 }, catalog)
    expect(input.skillIds).toBeNull()
    expect(input.includeUnskilled).toBe(true)
  })

  it('splits the synthetic Unskilled entry back out of the selection', () => {
    const withUnskilled = toOptimizerInput(
      { ...DEFAULT_OPTIMIZER_CONFIG, tier: 3, skillIds: ['s1', UNSKILLED_SKILL_ID] },
      catalog
    )
    expect(withUnskilled.skillIds).toEqual(['s1'])
    expect(withUnskilled.includeUnskilled).toBe(true)

    const without = toOptimizerInput(
      { ...DEFAULT_OPTIMIZER_CONFIG, tier: 3, skillIds: ['s1'] },
      catalog
    )
    expect(without.includeUnskilled).toBe(false)
  })

  it('clamps a persisted tier the dataset does not have', () => {
    // Default is tier 5, which this cut-down tier table lacks.
    expect(toOptimizerInput(DEFAULT_OPTIMIZER_CONFIG, catalog).tier).toBe(3)
    expect(toOptimizerInput({ ...DEFAULT_OPTIMIZER_CONFIG, tier: 0 }, catalog).tier).toBe(0)
  })
})
