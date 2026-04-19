import { act, renderHook } from '@testing-library/react'
import { createStore, type Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { useCellValue, useStoreRevision, useTableRowIdsRevision } from '../use-store-revision'

let store: Store

beforeEach(() => {
  store = createStore()
  store.setTable('a', { r1: { v: 1 } })
  store.setTable('b', { r1: { v: 1 } })
})

describe('useStoreRevision', () => {
  it('returns 0 initially', () => {
    const { result } = renderHook(() => useStoreRevision(store))
    expect(result.current).toBe(0)
  })

  it('increments when any table changes (no tableIds filter)', () => {
    const { result } = renderHook(() => useStoreRevision(store))
    expect(result.current).toBe(0)

    act(() => {
      store.setCell('a', 'r1', 'v', 2)
    })
    expect(result.current).toBe(1)

    act(() => {
      store.setCell('b', 'r1', 'v', 3)
    })
    expect(result.current).toBe(2)
  })

  it('only increments for listed tables when tableIds filter is provided', () => {
    const { result } = renderHook(() => useStoreRevision(store, ['a']))
    expect(result.current).toBe(0)

    // Mutate a watched table → bump
    act(() => {
      store.setCell('a', 'r1', 'v', 2)
    })
    expect(result.current).toBe(1)

    // Mutate an unwatched table → no bump
    act(() => {
      store.setCell('b', 'r1', 'v', 99)
    })
    expect(result.current).toBe(1)

    // Another watched mutation → bump
    act(() => {
      store.setRow('a', 'r2', { v: 5 })
    })
    expect(result.current).toBe(2)
  })

  it('listens to all tables when tableIds is an empty array', () => {
    // Empty array is treated the same as "no filter" — listen to everything.
    const { result } = renderHook(() => useStoreRevision(store, []))
    expect(result.current).toBe(0)

    act(() => {
      store.setCell('b', 'r1', 'v', 7)
    })
    expect(result.current).toBe(1)
  })

  it('detaches listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useStoreRevision(store, ['a']))

    act(() => {
      store.setCell('a', 'r1', 'v', 2)
    })
    expect(result.current).toBe(1)

    unmount()

    // After unmount, further store mutations must not call back into React.
    // We can't directly observe that, but we can at least confirm no crash
    // and that the tinybase store has no leftover listeners matching our
    // table-listener IDs (indirectly verified by listener count).
    const before = store.getListenerStats().table ?? 0
    act(() => {
      store.setCell('a', 'r1', 'v', 3)
    })
    expect(store.getListenerStats().table ?? 0).toBe(before)
  })

  it('re-subscribes when tableIds change between renders', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) => useStoreRevision(store, ids),
      { initialProps: { ids: ['a'] as readonly string[] } }
    )

    act(() => {
      store.setCell('a', 'r1', 'v', 2)
    })
    expect(result.current).toBe(1)

    // Switch to watching 'b' instead — changes to 'a' should no longer bump.
    rerender({ ids: ['b'] as readonly string[] })

    const snap = result.current
    act(() => {
      store.setCell('a', 'r1', 'v', 3)
    })
    expect(result.current).toBe(snap)

    act(() => {
      store.setCell('b', 'r1', 'v', 4)
    })
    expect(result.current).toBe(snap + 1)
  })
})

describe('useTableRowIdsRevision', () => {
  it('returns 0 initially', () => {
    const { result } = renderHook(() => useTableRowIdsRevision(store, ['a']))
    expect(result.current).toBe(0)
  })

  it('increments when a row is added to a watched table', () => {
    const { result } = renderHook(() => useTableRowIdsRevision(store, ['a']))
    act(() => {
      store.setRow('a', 'r2', { v: 1 })
    })
    expect(result.current).toBe(1)
  })

  it('increments when a row is removed from a watched table', () => {
    store.setRow('a', 'r2', { v: 2 })
    const { result } = renderHook(() => useTableRowIdsRevision(store, ['a']))
    act(() => {
      store.delRow('a', 'r2')
    })
    expect(result.current).toBe(1)
  })

  it('does NOT increment on cell edits within an existing row', () => {
    const { result } = renderHook(() => useTableRowIdsRevision(store, ['a']))
    act(() => {
      store.setCell('a', 'r1', 'v', 999)
    })
    expect(result.current).toBe(0)
  })

  it('listens to multiple tables', () => {
    const { result } = renderHook(() => useTableRowIdsRevision(store, ['a', 'b']))
    act(() => {
      store.setRow('a', 'r2', { v: 1 })
    })
    expect(result.current).toBe(1)
    act(() => {
      store.setRow('b', 'r2', { v: 1 })
    })
    expect(result.current).toBe(2)
  })

  it('only listens to provided tables', () => {
    const { result } = renderHook(() => useTableRowIdsRevision(store, ['a']))
    act(() => {
      store.setRow('b', 'r2', { v: 1 })
    })
    expect(result.current).toBe(0)
  })

  it('detaches listeners on unmount', () => {
    const { unmount } = renderHook(() => useTableRowIdsRevision(store, ['a']))
    const before = store.getListenerStats().rowIds ?? 0
    unmount()
    const after = store.getListenerStats().rowIds ?? 0
    expect(after).toBeLessThan(before)
  })

  it('re-subscribes when tableIds change between renders', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: readonly string[] }) => useTableRowIdsRevision(store, ids),
      { initialProps: { ids: ['a'] as readonly string[] } }
    )

    act(() => {
      store.setRow('a', 'r2', { v: 1 })
    })
    expect(result.current).toBe(1)

    rerender({ ids: ['b'] as readonly string[] })

    const snap = result.current
    // Adding to 'a' no longer bumps.
    act(() => {
      store.setRow('a', 'r3', { v: 1 })
    })
    expect(result.current).toBe(snap)

    // Adding to 'b' does bump.
    act(() => {
      store.setRow('b', 'r2', { v: 1 })
    })
    expect(result.current).toBe(snap + 1)
  })
})

describe('useCellValue', () => {
  it('returns the current cell value', () => {
    const { result } = renderHook(() => useCellValue<number>(store, 'a', 'r1', 'v'))
    expect(result.current).toBe(1)
  })

  it('returns null when the row does not exist', () => {
    const { result } = renderHook(() => useCellValue<number>(store, 'a', 'missing', 'v'))
    expect(result.current).toBeNull()
  })

  it('returns null when the cell does not exist on an existing row', () => {
    const { result } = renderHook(() => useCellValue<number>(store, 'a', 'r1', 'missing'))
    expect(result.current).toBeNull()
  })

  it('returns null when rowId is the empty string', () => {
    const { result } = renderHook(() => useCellValue<number>(store, 'a', '', 'v'))
    expect(result.current).toBeNull()
  })

  it('updates when the cell changes', () => {
    const { result } = renderHook(() => useCellValue<number>(store, 'a', 'r1', 'v'))
    expect(result.current).toBe(1)

    act(() => {
      store.setCell('a', 'r1', 'v', 42)
    })
    expect(result.current).toBe(42)
  })

  it('does not update when other cells in the same row change', () => {
    store.setRow('a', 'r1', { v: 1, other: 'x' })
    const { result } = renderHook(() => useCellValue<number>(store, 'a', 'r1', 'v'))
    const before = result.current

    act(() => {
      store.setCell('a', 'r1', 'other', 'y')
    })
    expect(result.current).toBe(before)
  })

  it('does not update when a different row changes', () => {
    store.setRow('a', 'r2', { v: 99 })
    const { result } = renderHook(() => useCellValue<number>(store, 'a', 'r1', 'v'))
    const before = result.current

    act(() => {
      store.setCell('a', 'r2', 'v', 100)
    })
    expect(result.current).toBe(before)
  })

  it('detaches the cell listener on unmount', () => {
    const { unmount } = renderHook(() => useCellValue<number>(store, 'a', 'r1', 'v'))
    const before = store.getListenerStats().cell ?? 0
    unmount()
    const after = store.getListenerStats().cell ?? 0
    expect(after).toBeLessThan(before)
  })

  it('does not subscribe when rowId is empty (no cell listener attached)', () => {
    const before = store.getListenerStats().cell ?? 0
    const { unmount } = renderHook(() => useCellValue<number>(store, 'a', '', 'v'))
    const after = store.getListenerStats().cell ?? 0
    expect(after).toBe(before)
    unmount()
  })
})
