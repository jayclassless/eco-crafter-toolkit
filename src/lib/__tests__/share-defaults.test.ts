import { describe, expect, it } from 'vitest'

import { computeAutoShares, roundSharesPreservingSum } from '../share-defaults'

describe('computeAutoShares', () => {
  const ZERO = new Set(['slag', 'tailings'])
  const NONE = new Set<string>()

  it('returns an empty map when there are no products', () => {
    expect(computeAutoShares([], NONE, 20)).toEqual(new Map())
  })

  it('gives a single product 100%', () => {
    expect(computeAutoShares(['ingot'], NONE, 20)).toEqual(new Map([['ingot', 100]]))
  })

  it('splits config% among multiple non-zero secondaries', () => {
    const result = computeAutoShares(['ingot', 'gravel', 'dust'], NONE, 20)
    expect(result.get('ingot')).toBe(80)
    expect(result.get('gravel')).toBeCloseTo(10)
    expect(result.get('dust')).toBeCloseTo(10)
  })

  it('produces a fractional secondary share when config % does not divide evenly', () => {
    const result = computeAutoShares(['ingot', 's1', 's2', 's3'], NONE, 20)
    expect(result.get('ingot')).toBe(80)
    expect(result.get('s1')).toBeCloseTo(20 / 3)
    expect(result.get('s2')).toBeCloseTo(20 / 3)
    expect(result.get('s3')).toBeCloseTo(20 / 3)
  })

  it('forces zero-share secondaries to 0 and excludes them from the split', () => {
    // Slag is zero-share; gravel takes the entire config%.
    const result = computeAutoShares(['ingot', 'slag', 'gravel'], ZERO, 20)
    expect(result.get('ingot')).toBe(80)
    expect(result.get('slag')).toBe(0)
    expect(result.get('gravel')).toBe(20)
  })

  it('keeps primary at 100% when every secondary is zero-share', () => {
    const result = computeAutoShares(['ingot', 'slag', 'tailings'], ZERO, 20)
    expect(result.get('ingot')).toBe(100)
    expect(result.get('slag')).toBe(0)
    expect(result.get('tailings')).toBe(0)
  })

  it('clamps config to [0, 100]', () => {
    expect(computeAutoShares(['p', 's'], NONE, -5).get('p')).toBe(100)
    expect(computeAutoShares(['p', 's'], NONE, -5).get('s')).toBe(0)
    expect(computeAutoShares(['p', 's'], NONE, 150).get('p')).toBe(0)
    expect(computeAutoShares(['p', 's'], NONE, 150).get('s')).toBe(100)
  })

  it('config=0 reverts to legacy 100/0 split', () => {
    const result = computeAutoShares(['ingot', 'gravel', 'dust'], NONE, 0)
    expect(result.get('ingot')).toBe(100)
    expect(result.get('gravel')).toBe(0)
    expect(result.get('dust')).toBe(0)
  })

  it('always sums to exactly 100', () => {
    for (const config of [0, 5, 20, 33, 50, 75, 100]) {
      for (const n of [1, 2, 3, 4, 5]) {
        const ids = Array.from({ length: n }, (_, i) => `p${i}`)
        const result = computeAutoShares(ids, NONE, config)
        const sum = [...result.values()].reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(100, 6)
      }
    }
  })
})

describe('roundSharesPreservingSum', () => {
  it('returns identical values when all inputs are already integer', () => {
    const result = roundSharesPreservingSum(
      ['a', 'b'],
      new Map([
        ['a', 80],
        ['b', 20],
      ])
    )
    expect(result.get('a')).toBe(80)
    expect(result.get('b')).toBe(20)
  })

  it('preserves the sum when rounding fractional values', () => {
    // 80 + 6.67 + 6.67 + 6.67 = 100.01 → target 100
    const result = roundSharesPreservingSum(
      ['p', 's1', 's2', 's3'],
      new Map([
        ['p', 80],
        ['s1', 20 / 3],
        ['s2', 20 / 3],
        ['s3', 20 / 3],
      ])
    )
    const sum = [...result.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
    // primary stays at 80; the leftover 1 from rounding the 6.67's goes to
    // the secondary with the largest fractional remainder (all tied → first).
    expect(result.get('p')).toBe(80)
  })

  it('preserves sum across many fractional inputs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const shares = new Map([
      ['a', 33.33],
      ['b', 16.67],
      ['c', 16.67],
      ['d', 16.67],
      ['e', 16.66],
    ])
    const result = roundSharesPreservingSum(ids, shares)
    const sum = [...result.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
  })

  it('handles 0 leftover (already-integer fractional remainders)', () => {
    const result = roundSharesPreservingSum(
      ['a', 'b', 'c'],
      new Map([
        ['a', 50],
        ['b', 25],
        ['c', 25],
      ])
    )
    expect(result.get('a')).toBe(50)
    expect(result.get('b')).toBe(25)
    expect(result.get('c')).toBe(25)
  })
})
