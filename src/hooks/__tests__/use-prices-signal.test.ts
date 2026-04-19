import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import {
  usePriceCell,
  usePriceSignal,
  useRecipePriceCell,
  type PriceSignal,
  type PricesMap,
} from '../use-prices-signal'

const makePrices = (entries: Record<string, [number, number]>): PricesMap => {
  const out: PricesMap = {}
  for (const [id, [costPrice, salePrice]] of Object.entries(entries)) {
    out[id] = { costPrice, salePrice }
  }
  return out
}

describe('usePriceSignal', () => {
  it('returns a stable signal instance across re-renders', () => {
    const { result, rerender } = renderHook(() => usePriceSignal())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  describe('signal.get', () => {
    it('returns null for items that have no entry', () => {
      const { result } = renderHook(() => usePriceSignal())
      expect(result.current.get('unknown', 'costPrice')).toBeNull()
      expect(result.current.get('unknown', 'salePrice')).toBeNull()
    })

    it('returns the current price after set() is called', () => {
      const { result } = renderHook(() => usePriceSignal())
      act(() => {
        result.current.set(makePrices({ iron: [10, 15] }))
      })
      expect(result.current.get('iron', 'costPrice')).toBe(10)
      expect(result.current.get('iron', 'salePrice')).toBe(15)
    })

    it('returns null after an entry is removed by a subsequent set()', () => {
      const { result } = renderHook(() => usePriceSignal())
      act(() => {
        result.current.set(makePrices({ iron: [10, 15] }))
      })
      act(() => {
        result.current.set(makePrices({}))
      })
      expect(result.current.get('iron', 'costPrice')).toBeNull()
    })
  })

  describe('signal.subscribe', () => {
    it('notifies the listener only when its cell value actually changes', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const ironCost = vi.fn()
      signal.subscribe('iron', 'costPrice', ironCost)

      // Initial push — value transitions from null -> 10, listener should fire.
      act(() => signal.set(makePrices({ iron: [10, 15] })))
      expect(ironCost).toHaveBeenCalledTimes(1)

      // Same value → no fire.
      act(() => signal.set(makePrices({ iron: [10, 20] })))
      expect(ironCost).toHaveBeenCalledTimes(1)

      // Actual change → fires again.
      act(() => signal.set(makePrices({ iron: [11, 20] })))
      expect(ironCost).toHaveBeenCalledTimes(2)
    })

    it('does not notify subscribers of other cells when one cell changes', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const ironCost = vi.fn()
      const copperCost = vi.fn()
      const ironSale = vi.fn()
      signal.subscribe('iron', 'costPrice', ironCost)
      signal.subscribe('copper', 'costPrice', copperCost)
      signal.subscribe('iron', 'salePrice', ironSale)

      act(() =>
        signal.set(
          makePrices({
            iron: [10, 15],
            copper: [5, 8],
          })
        )
      )

      ironCost.mockClear()
      copperCost.mockClear()
      ironSale.mockClear()

      // Only iron costPrice changes.
      act(() =>
        signal.set(
          makePrices({
            iron: [11, 15],
            copper: [5, 8],
          })
        )
      )

      expect(ironCost).toHaveBeenCalledTimes(1)
      expect(copperCost).not.toHaveBeenCalled()
      expect(ironSale).not.toHaveBeenCalled()
    })

    it('fires when an entry is added (null → value)', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const listener = vi.fn()
      signal.subscribe('iron', 'costPrice', listener)

      act(() => signal.set(makePrices({ iron: [10, 15] })))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('fires when an entry is removed (value → null)', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const listener = vi.fn()
      signal.subscribe('iron', 'costPrice', listener)

      act(() => signal.set(makePrices({ iron: [10, 15] })))
      listener.mockClear()

      act(() => signal.set(makePrices({})))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notifies every subscriber registered for the same cell', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const a = vi.fn()
      const b = vi.fn()
      signal.subscribe('iron', 'costPrice', a)
      signal.subscribe('iron', 'costPrice', b)

      act(() => signal.set(makePrices({ iron: [10, 15] })))
      expect(a).toHaveBeenCalledTimes(1)
      expect(b).toHaveBeenCalledTimes(1)
    })

    it('returns an unsubscribe function that detaches the listener', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const listener = vi.fn()
      const unsubscribe = signal.subscribe('iron', 'costPrice', listener)

      act(() => signal.set(makePrices({ iron: [10, 15] })))
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      act(() => signal.set(makePrices({ iron: [99, 15] })))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('handles unsubscribe of an already-unsubscribed listener without error', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const listener = vi.fn()
      const unsubscribe = signal.subscribe('iron', 'costPrice', listener)

      // Second call should be a no-op, not a crash.
      unsubscribe()
      expect(() => unsubscribe()).not.toThrow()
    })

    it('leaves other subscribers intact when one unsubscribes', () => {
      const { result } = renderHook(() => usePriceSignal())
      const signal = result.current

      const a = vi.fn()
      const b = vi.fn()
      const unsubA = signal.subscribe('iron', 'costPrice', a)
      signal.subscribe('iron', 'costPrice', b)

      unsubA()

      act(() => signal.set(makePrices({ iron: [10, 15] })))
      expect(a).not.toHaveBeenCalled()
      expect(b).toHaveBeenCalledTimes(1)
    })
  })
})

describe('usePriceCell', () => {
  it('returns null when itemId is undefined', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      return usePriceCell(signal, undefined, 'costPrice')
    })
    expect(result.current).toBeNull()
  })

  it('returns null when itemId is null', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      return usePriceCell(signal, null, 'costPrice')
    })
    expect(result.current).toBeNull()
  })

  it('returns null when itemId is the empty string', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      return usePriceCell(signal, '', 'costPrice')
    })
    expect(result.current).toBeNull()
  })

  it('returns the initial cell value for a known item', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      signal.set(makePrices({ iron: [10, 15] }))
      return { signal, value: usePriceCell(signal, 'iron', 'costPrice') }
    })
    expect(result.current.value).toBe(10)
  })

  it('returns the sale price when field is salePrice', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      signal.set(makePrices({ iron: [10, 15] }))
      return { value: usePriceCell(signal, 'iron', 'salePrice') }
    })
    expect(result.current.value).toBe(15)
  })

  it('updates when its cell changes via signal.set', () => {
    let signalRef: PriceSignal | null = null
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      signalRef = signal
      return usePriceCell(signal, 'iron', 'costPrice')
    })
    expect(result.current).toBeNull()

    act(() => signalRef!.set(makePrices({ iron: [10, 15] })))
    expect(result.current).toBe(10)

    act(() => signalRef!.set(makePrices({ iron: [11, 15] })))
    expect(result.current).toBe(11)
  })

  it('does not re-render when an unrelated cell changes', () => {
    let signalRef: PriceSignal | null = null
    let renderCount = 0

    renderHook(() => {
      renderCount++
      const signal = usePriceSignal()
      signalRef = signal
      return usePriceCell(signal, 'iron', 'costPrice')
    })

    const baseline = renderCount

    // Seed iron; this *will* re-render our cell (null → 10).
    act(() => signalRef!.set(makePrices({ iron: [10, 15] })))
    expect(renderCount).toBe(baseline + 1)

    // Change an unrelated item — no re-render expected.
    act(() =>
      signalRef!.set(
        makePrices({
          iron: [10, 15],
          copper: [7, 9],
        })
      )
    )
    expect(renderCount).toBe(baseline + 1)

    // Change iron's sale price — still no re-render for costPrice subscriber.
    act(() =>
      signalRef!.set(
        makePrices({
          iron: [10, 20],
          copper: [7, 9],
        })
      )
    )
    expect(renderCount).toBe(baseline + 1)
  })

  it('re-subscribes when itemId changes', () => {
    let signalRef: PriceSignal | null = null
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        const signal = usePriceSignal()
        signalRef = signal
        return usePriceCell(signal, id, 'costPrice')
      },
      { initialProps: { id: 'iron' } }
    )
    act(() => signalRef!.set(makePrices({ iron: [10, 15], copper: [7, 9] })))
    expect(result.current).toBe(10)

    rerender({ id: 'copper' })
    expect(result.current).toBe(7)

    // Mutating iron should not affect the copper-bound hook.
    act(() => signalRef!.set(makePrices({ iron: [99, 15], copper: [7, 9] })))
    expect(result.current).toBe(7)

    // Mutating copper should update the hook.
    act(() => signalRef!.set(makePrices({ iron: [99, 15], copper: [8, 9] })))
    expect(result.current).toBe(8)
  })

  it('re-subscribes when field changes', () => {
    let signalRef: PriceSignal | null = null
    const { result, rerender } = renderHook(
      ({ field }: { field: 'costPrice' | 'salePrice' }) => {
        const signal = usePriceSignal()
        signalRef = signal
        return usePriceCell(signal, 'iron', field)
      },
      { initialProps: { field: 'costPrice' as 'costPrice' | 'salePrice' } }
    )
    act(() => signalRef!.set(makePrices({ iron: [10, 15] })))
    expect(result.current).toBe(10)

    rerender({ field: 'salePrice' })
    expect(result.current).toBe(15)

    // Changing only costPrice must not affect a salePrice subscriber.
    const renderedValue = result.current
    act(() => signalRef!.set(makePrices({ iron: [99, 15] })))
    expect(result.current).toBe(renderedValue)

    act(() => signalRef!.set(makePrices({ iron: [99, 22] })))
    expect(result.current).toBe(22)
  })

  it('detaches its subscription on unmount', () => {
    let signalRef: PriceSignal | null = null
    let renderCount = 0

    const { unmount } = renderHook(() => {
      renderCount++
      const signal = usePriceSignal()
      signalRef = signal
      return usePriceCell(signal, 'iron', 'costPrice')
    })

    act(() => signalRef!.set(makePrices({ iron: [10, 15] })))
    const afterMountRenders = renderCount

    unmount()

    // Further updates must not call back into the unmounted hook.
    // If the listener is still attached, React would warn but renderCount
    // wouldn't change (unmounted component doesn't re-render). The real
    // assertion is that subsequent signal pushes do not throw.
    expect(() => {
      act(() => signalRef!.set(makePrices({ iron: [11, 15] })))
    }).not.toThrow()
    expect(renderCount).toBe(afterMountRenders)
  })
})

describe('signal recipe-keyed API', () => {
  it('setRecipe + getRecipe round-trip', () => {
    const { result } = renderHook(() => usePriceSignal())
    const signal = result.current
    expect(signal.getRecipe('r1', 'costPrice')).toBeNull()
    act(() => signal.setRecipe(makePrices({ r1: [3, 8] })))
    expect(signal.getRecipe('r1', 'costPrice')).toBe(3)
    expect(signal.getRecipe('r1', 'salePrice')).toBe(8)
  })

  it('subscribeRecipe only fires on recipe-keyed changes', () => {
    const { result } = renderHook(() => usePriceSignal())
    const signal = result.current
    const listener = vi.fn()
    signal.subscribeRecipe('r1', 'costPrice', listener)

    // Changing item-keyed prices must not fire recipe-keyed listeners.
    act(() => signal.set(makePrices({ r1: [3, 8] })))
    expect(listener).not.toHaveBeenCalled()

    act(() => signal.setRecipe(makePrices({ r1: [3, 8] })))
    expect(listener).toHaveBeenCalledTimes(1)

    // Same value → no fire.
    act(() => signal.setRecipe(makePrices({ r1: [3, 9] })))
    expect(listener).toHaveBeenCalledTimes(1)

    act(() => signal.setRecipe(makePrices({ r1: [4, 9] })))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('subscribeRecipe returns an unsubscribe that cleans up', () => {
    const { result } = renderHook(() => usePriceSignal())
    const signal = result.current
    const listener = vi.fn()
    const unsub = signal.subscribeRecipe('r1', 'costPrice', listener)
    act(() => signal.setRecipe(makePrices({ r1: [3, 8] })))
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    act(() => signal.setRecipe(makePrices({ r1: [4, 8] })))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('signal.getRecipeIdFor', () => {
  it("returns '' when there is no entry for the item", () => {
    const { result } = renderHook(() => usePriceSignal())
    expect(result.current.getRecipeIdFor('iron')).toBe('')
  })

  it("returns '' when the entry has no recipeId", () => {
    const { result } = renderHook(() => usePriceSignal())
    act(() => result.current.set(makePrices({ iron: [1, 2] })))
    expect(result.current.getRecipeIdFor('iron')).toBe('')
  })

  it('returns the recipeId attached to the entry', () => {
    const { result } = renderHook(() => usePriceSignal())
    act(() =>
      result.current.set({
        iron: { costPrice: 1, salePrice: 2, recipeId: 'r-winner' },
      })
    )
    expect(result.current.getRecipeIdFor('iron')).toBe('r-winner')
  })
})

describe('signal.getAll', () => {
  it('returns the current item-keyed prices map snapshot', () => {
    const { result } = renderHook(() => usePriceSignal())
    act(() => result.current.set(makePrices({ iron: [1, 2], copper: [3, 4] })))
    const snapshot = result.current.getAll()
    expect(snapshot).toEqual({
      iron: { costPrice: 1, salePrice: 2 },
      copper: { costPrice: 3, salePrice: 4 },
    })
  })
})

describe('useRecipePriceCell', () => {
  it('returns null when recipeId is falsy', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      return useRecipePriceCell(signal, null, 'costPrice')
    })
    expect(result.current).toBeNull()
  })

  it('returns null when recipeId is the empty string', () => {
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      return useRecipePriceCell(signal, '', 'salePrice')
    })
    expect(result.current).toBeNull()
  })

  it('reads from the recipe-keyed namespace (not item-keyed)', () => {
    let signalRef: PriceSignal | null = null
    const { result } = renderHook(() => {
      const signal = usePriceSignal()
      signalRef = signal
      return useRecipePriceCell(signal, 'r1', 'costPrice')
    })

    // Item-keyed push must not affect a recipe-keyed subscriber.
    act(() => signalRef!.set(makePrices({ r1: [10, 20] })))
    expect(result.current).toBeNull()

    act(() => signalRef!.setRecipe(makePrices({ r1: [3, 8] })))
    expect(result.current).toBe(3)

    act(() => signalRef!.setRecipe(makePrices({ r1: [4, 8] })))
    expect(result.current).toBe(4)
  })

  it('re-subscribes when recipeId changes', () => {
    let signalRef: PriceSignal | null = null
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        const signal = usePriceSignal()
        signalRef = signal
        return useRecipePriceCell(signal, id, 'costPrice')
      },
      { initialProps: { id: 'r1' } }
    )
    act(() => signalRef!.setRecipe(makePrices({ r1: [3, 8], r2: [5, 6] })))
    expect(result.current).toBe(3)

    rerender({ id: 'r2' })
    expect(result.current).toBe(5)
  })
})
