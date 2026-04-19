import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useDebouncedValue } from '../use-debounced-value'

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 100))
    expect(result.current).toBe('a')
  })

  it('updates the value only after the delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    expect(result.current).toBe('a')
    advance(99)
    expect(result.current).toBe('a')
    advance(1)
    expect(result.current).toBe('b')
  })

  it('cancels the previous timer when value changes again', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    advance(50)
    rerender({ v: 'c' })
    advance(50)
    expect(result.current).toBe('a')
    advance(50)
    expect(result.current).toBe('c')
  })
})
