import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { SolverInput, SolverOutput } from '@/types/solver'

import { usePriceSolver } from '../use-price-solver'

interface MockWorker {
  onmessage: ((event: MessageEvent<SolverOutput>) => void) | null
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}

const workers: MockWorker[] = []

class FakeWorker implements MockWorker {
  onmessage: ((event: MessageEvent<SolverOutput>) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    workers.push(this)
  }
}

const emptyInput: SolverInput = {
  recipes: [],
  prices: {},
  overrides: {},
  settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: false },
  margins: {},
  recipeMargins: {},
  productMargins: {},
  tagItems: {},
  primaryTagItems: {},
  primaryRecipeIds: {},
  priceModes: {},
}

beforeEach(() => {
  workers.length = 0
  vi.useFakeTimers()
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePriceSolver', () => {
  it('starts in idle state with no result', () => {
    const { result } = renderHook(() => usePriceSolver())
    expect(result.current.result).toBeNull()
    expect(result.current.solving).toBe(false)
    expect(workers).toHaveLength(1)
  })

  it('debounces calls and posts the latest input to the worker', () => {
    const { result } = renderHook(() => usePriceSolver())
    const worker = workers[0]
    const inputA = { ...emptyInput, prices: { a: 1 } }
    const inputB = { ...emptyInput, prices: { b: 2 } }

    act(() => {
      result.current.recalculate(() => inputA)
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      result.current.recalculate(() => inputB)
    })
    // First timer was cancelled — worker not called yet
    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(result.current.solving).toBe(false)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith(inputB)
    expect(result.current.solving).toBe(true)
  })

  it('updates result and clears solving when the worker responds', () => {
    const { result } = renderHook(() => usePriceSolver())
    const worker = workers[0]

    act(() => {
      result.current.recalculate(() => emptyInput)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.solving).toBe(true)

    const output: SolverOutput = {
      computedPrices: {},
      iterations: 1,
      converged: true,
    } as unknown as SolverOutput

    act(() => {
      worker.onmessage?.({ data: output } as MessageEvent<SolverOutput>)
    })

    expect(result.current.result).toBe(output)
    expect(result.current.solving).toBe(false)
  })

  it('terminates the worker on unmount', () => {
    const { unmount } = renderHook(() => usePriceSolver())
    const worker = workers[0]
    unmount()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
