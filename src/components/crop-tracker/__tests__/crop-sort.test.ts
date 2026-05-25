import { describe, expect, it } from 'vitest'

import { type SortablePlanting, sortPlantings } from '../crop-sort'

const make = (over: Partial<SortablePlanting> & { id: string }): SortablePlanting => ({
  fieldName: '',
  plantName: '',
  plantedAtMs: null,
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
    expect(ids(sortPlantings(rows, 'name', 'asc'))).toEqual(['A', 'b', 'c'])
    expect(ids(sortPlantings(rows, 'name', 'desc'))).toEqual(['c', 'b', 'A'])
  })

  it('sorts by plant name', () => {
    const rows = [make({ id: '1', plantName: 'Tomato' }), make({ id: '2', plantName: 'Corn' })]
    expect(ids(sortPlantings(rows, 'plant', 'asc'))).toEqual(['2', '1'])
  })

  it('sorts by planted time with unplanted fields last (asc) / first (desc)', () => {
    const rows = [
      make({ id: 'unplanted' }),
      make({ id: 'late', plantedAtMs: 200 }),
      make({ id: 'early', plantedAtMs: 100 }),
    ]
    expect(ids(sortPlantings(rows, 'planted', 'asc'))).toEqual(['early', 'late', 'unplanted'])
    expect(ids(sortPlantings(rows, 'planted', 'desc'))).toEqual(['unplanted', 'late', 'early'])
  })

  it('sorts by harvest time, missing harvests last in ascending', () => {
    const rows = [
      make({ id: 'soon', harvestMs: 50 }),
      make({ id: 'none' }),
      make({ id: 'later', harvestMs: 500 }),
    ]
    expect(ids(sortPlantings(rows, 'harvest', 'asc'))).toEqual(['soon', 'later', 'none'])
  })

  it('is stable for ties and does not mutate the input', () => {
    const rows = [
      make({ id: 'x', fieldName: 'same' }),
      make({ id: 'y', fieldName: 'same' }),
      make({ id: 'z', fieldName: 'same' }),
    ]
    const sorted = sortPlantings(rows, 'name', 'asc')
    expect(ids(sorted)).toEqual(['x', 'y', 'z'])
    expect(ids(rows)).toEqual(['x', 'y', 'z']) // input untouched
  })
})
