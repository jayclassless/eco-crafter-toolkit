import { describe, expect, it } from 'vitest'

import { buildDonutSlices, type DonutDatum } from '../housing-donut-layout'

const OPTIONS = { size: 100, thickness: 0.4 }

function datum(key: string, value: number, color = '#ff0000'): DonutDatum {
  return { key, label: key, color, value }
}

describe('buildDonutSlices', () => {
  it('splits the ring into shares that sum to one', () => {
    const slices = buildDonutSlices([datum('a', 30), datum('b', 10)], OPTIONS)
    expect(slices.map((s) => s.share)).toEqual([0.75, 0.25])
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 10)
  })

  it('returns nothing when there is no value to draw', () => {
    // Dividing by a zero total would put NaN in every path, which renders as an
    // invisible broken shape with no error anywhere.
    expect(buildDonutSlices([], OPTIONS)).toEqual([])
    expect(buildDonutSlices([datum('a', 0)], OPTIONS)).toEqual([])
    expect(buildDonutSlices([datum('a', -5)], OPTIONS)).toEqual([])
  })

  it('never emits NaN into a path', () => {
    const slices = buildDonutSlices([datum('a', 1), datum('b', 2), datum('c', 0.001)], OPTIONS)
    for (const slice of slices) expect(slice.d).not.toContain('NaN')
  })

  it('flags a lone category instead of drawing a collapsed arc', () => {
    // A wedge spanning the full circle starts and ends at the same point, so
    // its path encloses nothing.
    const [slice] = buildDonutSlices([datum('only', 42)], OPTIONS)
    expect(slice.fullCircle).toBe(true)
    expect(slice.share).toBe(1)
    expect(slice.d).toBe('')
  })

  it('sets the large-arc flag once a slice passes half the ring', () => {
    const [big, small] = buildDonutSlices([datum('a', 60), datum('b', 40)], OPTIONS)
    expect(big.d).toMatch(/A 50 50 0 1 1/)
    expect(small.d).toMatch(/A 50 50 0 0 1/)
  })

  it('drops valueless categories but keeps every contributing one', () => {
    const slices = buildDonutSlices([datum('a', 5), datum('zero', 0), datum('b', 5)], OPTIONS)
    expect(slices.map((s) => s.key)).toEqual(['a', 'b'])
  })

  it('passes an absent color through untouched, for the consumer to resolve', () => {
    const [slice] = buildDonutSlices([datum('a', 5, ''), datum('b', 5)], OPTIONS)
    expect(slice.color).toBe('')
  })
})
