import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useTableVirtualScroll } from '../use-table-virtual-scroll'
import { createTestStores, makeWrapper } from './store-wrapper'

describe('useTableVirtualScroll', () => {
  it('returns undefined below the row threshold', () => {
    const stores = createTestStores()
    const { result } = renderHook(() => useTableVirtualScroll(99, 3.6), {
      wrapper: makeWrapper(stores),
    })
    expect(result.current).toBeUndefined()
  })

  it('returns options with itemSize = rem × uiScale at the threshold', () => {
    const stores = createTestStores()
    const { result } = renderHook(() => useTableVirtualScroll(100, 3.6), {
      wrapper: makeWrapper(stores),
    })
    // Default uiScale is 14 (ui-store schema default).
    expect(result.current?.itemSize).toBeCloseTo(3.6 * 14)
  })

  it('recomputes itemSize when the uiScale setting changes', () => {
    const stores = createTestStores()
    const { result } = renderHook(() => useTableVirtualScroll(500, 4), {
      wrapper: makeWrapper(stores),
    })
    expect(result.current?.itemSize).toBeCloseTo(4 * 14)

    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'uiScale', 18)
    })
    expect(result.current?.itemSize).toBeCloseTo(4 * 18)
  })

  it('switches modes as the row count crosses the threshold', () => {
    const stores = createTestStores()
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useTableVirtualScroll(count, 3.6),
      { wrapper: makeWrapper(stores), initialProps: { count: 500 } }
    )
    expect(result.current).toBeDefined()

    rerender({ count: 12 })
    expect(result.current).toBeUndefined()

    rerender({ count: 500 })
    expect(result.current).toBeDefined()
  })
})
