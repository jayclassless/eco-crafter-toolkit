import { describe, expect, it } from 'vitest'

import { getCompare } from '@/lib/collator'

import { sortFurnishings, sortMaterials } from '../housing-sort'
import type { FurnishingRow, MaterialRow } from '../housing-types'

const compare = getCompare('en-US')

function furnishing(over: Partial<FurnishingRow> & { name: string }): FurnishingRow {
  return {
    itemId: over.name,
    rawName: `${over.name}Item`,
    categoryName: 'Seating',
    categoryDisplayName: 'Seating',
    categoryColor: '#E5956E',
    typeForRoomLimit: 'Chair',
    baseValue: 1,
    repeatReduction: 0.5,
    skillIds: [],
    skillNames: [],
    skillRawNames: [],
    skillLabel: '',
    ...over,
  }
}

function material(over: Partial<MaterialRow> & { name: string }): MaterialRow {
  return {
    itemId: over.name,
    rawName: `${over.name}Item`,
    tier: 0,
    softCap: 2,
    hardCap: 4,
    skillIds: [],
    skillNames: [],
    skillRawNames: [],
    skillLabel: '',
    ...over,
  }
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name)

describe('sortFurnishings', () => {
  it('sorts by base value descending by default-style usage', () => {
    const rows = [
      furnishing({ name: 'Low', baseValue: 1 }),
      furnishing({ name: 'High', baseValue: 10 }),
      furnishing({ name: 'Mid', baseValue: 5 }),
    ]
    expect(names(sortFurnishings(rows, 'baseValue', 'desc', compare))).toEqual([
      'High',
      'Mid',
      'Low',
    ])
    expect(names(sortFurnishings(rows, 'baseValue', 'asc', compare))).toEqual([
      'Low',
      'Mid',
      'High',
    ])
  })

  // The load-bearing guarantee: the secondary name sort stays ASCENDING even
  // when the primary key is descending. A stable pre-sort by name would fail
  // this, because it would be reversed along with the primary key.
  it('breaks ties by name ascending in BOTH directions', () => {
    const rows = [
      furnishing({ name: 'Charlie', baseValue: 3 }),
      furnishing({ name: 'Alpha', baseValue: 3 }),
      furnishing({ name: 'Bravo', baseValue: 3 }),
    ]
    expect(names(sortFurnishings(rows, 'baseValue', 'desc', compare))).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
    expect(names(sortFurnishings(rows, 'baseValue', 'asc', compare))).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
  })

  it('sorts a no-penalty repeat (null) ahead of every real reduction ascending', () => {
    const rows = [
      furnishing({ name: 'Half', repeatReduction: 0.5 }),
      furnishing({ name: 'None', repeatReduction: null }),
      furnishing({ name: 'Total', repeatReduction: 1 }),
    ]
    expect(names(sortFurnishings(rows, 'repeatReduction', 'asc', compare))).toEqual([
      'None',
      'Half',
      'Total',
    ])
  })

  it('sorts items with no skill first ascending', () => {
    const rows = [
      furnishing({ name: 'Crafted', skillLabel: 'Carpentry' }),
      furnishing({ name: 'Picked', skillLabel: '' }),
    ]
    expect(names(sortFurnishings(rows, 'skill', 'asc', compare))).toEqual(['Picked', 'Crafted'])
  })

  it('sorts by category and type using the injected collator', () => {
    const rows = [
      furnishing({ name: 'B', categoryDisplayName: 'Ölampa', typeForRoomLimit: 'Zebra' }),
      furnishing({ name: 'A', categoryDisplayName: 'Oak', typeForRoomLimit: 'Apple' }),
    ]
    // en-US collation places Ö after O; a Swedish collator would not.
    expect(names(sortFurnishings(rows, 'category', 'asc', compare))).toEqual(['A', 'B'])
    expect(names(sortFurnishings(rows, 'category', 'asc', getCompare('sv')))).toEqual(['A', 'B'])
    expect(names(sortFurnishings(rows, 'type', 'asc', compare))).toEqual(['A', 'B'])
  })

  it('does not mutate the input array', () => {
    const rows = [furnishing({ name: 'B' }), furnishing({ name: 'A' })]
    const before = names(rows)
    sortFurnishings(rows, 'name', 'asc', compare)
    expect(names(rows)).toEqual(before)
  })
})

describe('sortMaterials', () => {
  it('sorts by tier ascending with name-ascending ties', () => {
    const rows = [
      material({ name: 'Zinc', tier: 3 }),
      material({ name: 'Brick', tier: 3 }),
      material({ name: 'Adobe', tier: 1 }),
    ]
    expect(names(sortMaterials(rows, 'tier', 'asc', compare))).toEqual(['Adobe', 'Brick', 'Zinc'])
    // Descending tier, but Brick still precedes Zinc.
    expect(names(sortMaterials(rows, 'tier', 'desc', compare))).toEqual(['Brick', 'Zinc', 'Adobe'])
  })

  it('treats tier 0 as a real tier rather than a missing value', () => {
    const rows = [material({ name: 'Brick', tier: 3 }), material({ name: 'Basalt', tier: 0 })]
    expect(names(sortMaterials(rows, 'tier', 'asc', compare))).toEqual(['Basalt', 'Brick'])
  })

  it('sorts missing caps last ascending', () => {
    const rows = [
      material({ name: 'Known', softCap: 10, hardCap: 20 }),
      material({ name: 'Unknown', softCap: null, hardCap: null }),
    ]
    expect(names(sortMaterials(rows, 'softCap', 'asc', compare))).toEqual(['Known', 'Unknown'])
    expect(names(sortMaterials(rows, 'hardCap', 'asc', compare))).toEqual(['Known', 'Unknown'])
  })
})
