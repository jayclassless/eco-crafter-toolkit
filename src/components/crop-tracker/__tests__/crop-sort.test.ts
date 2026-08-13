import { describe, expect, it } from 'vitest'

import { getCompare } from '@/lib/collator'

import { type SortablePlanting, sortPlantings } from '../crop-sort'

const make = (over: Partial<SortablePlanting> & { id: string }): SortablePlanting => ({
  fieldName: '',
  plantName: '',
  plantedAtMs: null,
  firstYieldMs: null,
  harvestMs: null,
  ...over,
})

const ids = (rows: SortablePlanting[]) => rows.map((r) => r.id)

describe('sortPlantings', () => {
  it('sorts by field name case-insensitively, ascending and descending', () => {
    const rows = [
      make({ id: 'b', fieldName: 'banana' }),
      make({ id: 'A', fieldName: 'Apple' }),
      make({ id: 'c', fieldName: 'cherry' }),
    ]
    expect(ids(sortPlantings(rows, 'name', 'asc', getCompare('en-US')))).toEqual(['A', 'b', 'c'])
    expect(ids(sortPlantings(rows, 'name', 'desc', getCompare('en-US')))).toEqual(['c', 'b', 'A'])
  })

  it('follows the comparator it is given rather than the browser locale', () => {
    const rows = [
      make({ id: 'ol', fieldName: 'Öl' }),
      make({ id: 'z', fieldName: 'Zebra' }),
      make({ id: 'a', fieldName: 'Apple' }),
    ]
    expect(ids(sortPlantings(rows, 'name', 'asc', getCompare('en-US')))).toEqual(['a', 'ol', 'z'])
    // Swedish sorts Ö after Z.
    expect(ids(sortPlantings(rows, 'name', 'asc', getCompare('sv')))).toEqual(['a', 'z', 'ol'])
  })

  it('sorts by plant name', () => {
    const rows = [make({ id: '1', plantName: 'Tomato' }), make({ id: '2', plantName: 'Corn' })]
    expect(ids(sortPlantings(rows, 'plant', 'asc', getCompare('en-US')))).toEqual(['2', '1'])
  })

  it('sorts by planted time with unplanted fields last (asc) / first (desc)', () => {
    const rows = [
      make({ id: 'unplanted' }),
      make({ id: 'late', plantedAtMs: 200 }),
      make({ id: 'early', plantedAtMs: 100 }),
    ]
    expect(ids(sortPlantings(rows, 'planted', 'asc', getCompare('en-US')))).toEqual([
      'early',
      'late',
      'unplanted',
    ])
    expect(ids(sortPlantings(rows, 'planted', 'desc', getCompare('en-US')))).toEqual([
      'unplanted',
      'late',
      'early',
    ])
  })

  it('sorts by harvest time (full yield), missing harvests last in ascending', () => {
    const rows = [
      make({ id: 'soon', harvestMs: 50 }),
      make({ id: 'none' }),
      make({ id: 'later', harvestMs: 500 }),
    ]
    expect(ids(sortPlantings(rows, 'harvest', 'asc', getCompare('en-US')))).toEqual([
      'soon',
      'later',
      'none',
    ])
  })

  it('sorts by first-yield time independently of full-yield time', () => {
    // A tree yields something early but finishes last; a crop is the reverse.
    const rows = [
      make({ id: 'crop', firstYieldMs: 400, harvestMs: 500 }),
      make({ id: 'tree', firstYieldMs: 100, harvestMs: 900 }),
      make({ id: 'none' }),
    ]
    expect(ids(sortPlantings(rows, 'firstYield', 'asc', getCompare('en-US')))).toEqual([
      'tree',
      'crop',
      'none',
    ])
    expect(ids(sortPlantings(rows, 'harvest', 'asc', getCompare('en-US')))).toEqual([
      'crop',
      'tree',
      'none',
    ])
  })

  it('is stable for ties and does not mutate the input', () => {
    const rows = [
      make({ id: 'x', fieldName: 'same' }),
      make({ id: 'y', fieldName: 'same' }),
      make({ id: 'z', fieldName: 'same' }),
    ]
    const sorted = sortPlantings(rows, 'name', 'asc', getCompare('en-US'))
    expect(ids(sorted)).toEqual(['x', 'y', 'z'])
    expect(ids(rows)).toEqual(['x', 'y', 'z']) // input untouched
  })
})
