import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  arrayEquals,
  mapEquals,
  setEquals,
  shallowEquals,
  useStableContent,
} from '../use-stable-content'

describe('mapEquals', () => {
  it('returns true for identical maps', () => {
    const a = new Map([['x', 1]])
    expect(mapEquals(a, a)).toBe(true)
  })

  it('returns true for maps with the same content', () => {
    expect(
      mapEquals(
        new Map([
          ['x', 1],
          ['y', 2],
        ]),
        new Map([
          ['y', 2],
          ['x', 1],
        ])
      )
    ).toBe(true)
  })

  it('returns false for size mismatch', () => {
    expect(
      mapEquals(
        new Map([['x', 1]]),
        new Map([
          ['x', 1],
          ['y', 2],
        ])
      )
    ).toBe(false)
  })

  it('returns false for value mismatch', () => {
    expect(mapEquals(new Map([['x', 1]]), new Map([['x', 2]]))).toBe(false)
  })

  it('returns false for key mismatch', () => {
    expect(mapEquals(new Map([['x', 1]]), new Map([['y', 1]]))).toBe(false)
  })
})

describe('setEquals', () => {
  it('returns true for identical sets', () => {
    const a = new Set(['a'])
    expect(setEquals(a, a)).toBe(true)
  })

  it('returns true for sets with the same members', () => {
    expect(setEquals(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
  })

  it('returns false for size mismatch', () => {
    expect(setEquals(new Set(['a']), new Set(['a', 'b']))).toBe(false)
  })

  it('returns false for member mismatch', () => {
    expect(setEquals(new Set(['a']), new Set(['b']))).toBe(false)
  })
})

describe('arrayEquals', () => {
  it('returns true for the same reference', () => {
    const a = [1, 2, 3]
    expect(arrayEquals(a, a, (x, y) => x === y)).toBe(true)
  })

  it('returns true for element-equal arrays', () => {
    expect(arrayEquals([1, 2, 3], [1, 2, 3], (x, y) => x === y)).toBe(true)
  })

  it('returns false for different lengths', () => {
    expect(arrayEquals([1, 2], [1, 2, 3], (x, y) => x === y)).toBe(false)
  })

  it('returns false on the first mismatched element', () => {
    expect(arrayEquals([1, 2, 3], [1, 9, 3], (x, y) => x === y)).toBe(false)
  })

  it('uses the supplied predicate for per-element comparison', () => {
    const eq = (x: { id: string }, y: { id: string }) => x.id === y.id
    expect(arrayEquals([{ id: 'a' }], [{ id: 'a' }], eq)).toBe(true)
    expect(arrayEquals([{ id: 'a' }], [{ id: 'b' }], eq)).toBe(false)
  })
})

describe('shallowEquals', () => {
  it('returns true for the same reference', () => {
    const obj = { a: 1, b: 'x' }
    expect(shallowEquals(obj, obj)).toBe(true)
  })

  it('returns true when every scalar key matches', () => {
    expect(shallowEquals({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
  })

  it('returns false on a scalar value mismatch', () => {
    expect(shallowEquals({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns false when key sets differ', () => {
    expect(shallowEquals({ a: 1 } as Record<string, number>, { b: 1 })).toBe(false)
  })

  it('compares nested references by identity (strict ===)', () => {
    const inner = { x: 1 }
    expect(shallowEquals({ obj: inner }, { obj: inner })).toBe(true)
    // Different object identity, even with same content, is considered unequal.
    expect(shallowEquals({ obj: { x: 1 } }, { obj: { x: 1 } })).toBe(false)
  })
})

describe('useStableContent', () => {
  it('returns the same reference when content is equal', () => {
    const initial = new Map([['x', 1]])
    const { result, rerender } = renderHook(({ value }) => useStableContent(value, mapEquals), {
      initialProps: { value: initial },
    })
    const first = result.current
    rerender({ value: new Map([['x', 1]]) })
    expect(result.current).toBe(first)
  })

  it('returns the new reference when content changes', () => {
    const { result, rerender } = renderHook(({ value }) => useStableContent(value, mapEquals), {
      initialProps: { value: new Map([['x', 1]]) },
    })
    const next = new Map([['x', 2]])
    rerender({ value: next })
    expect(result.current).toBe(next)
  })
})
