import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { SolverInput, SolverOutput, SolverWorkerMessage } from '@/types/solver'

import { usePriceSolver } from '../use-price-solver'

const captureException = vi.fn()
vi.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

interface MockWorker {
  onmessage: ((event: MessageEvent<SolverWorkerMessage>) => void) | null
  onerror: ((event: { message: string }) => void) | null
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}

const workers: MockWorker[] = []

class FakeWorker implements MockWorker {
  onmessage: ((event: MessageEvent<SolverWorkerMessage>) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
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
  captureException.mockClear()
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
      worker.onmessage?.({
        data: { type: 'result', result: output },
      } as MessageEvent<SolverWorkerMessage>)
    })

    expect(result.current.result).toBe(output)
    expect(result.current.solving).toBe(false)
  })

  it('clears solving and reports to Sentry when the worker posts an error', () => {
    const { result } = renderHook(() => usePriceSolver())
    const worker = workers[0]

    act(() => {
      result.current.recalculate(() => emptyInput)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.solving).toBe(true)

    act(() => {
      worker.onmessage?.({
        data: { type: 'error', message: 'boom' },
      } as MessageEvent<SolverWorkerMessage>)
    })

    expect(result.current.solving).toBe(false)
    expect(result.current.result).toBeNull()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('clears solving and reports to Sentry when the worker crashes', () => {
    const { result } = renderHook(() => usePriceSolver())
    const worker = workers[0]

    act(() => {
      result.current.recalculate(() => emptyInput)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.solving).toBe(true)

    act(() => {
      worker.onerror?.({ message: 'segfault' })
    })

    expect(result.current.solving).toBe(false)
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('terminates the worker on unmount', () => {
    const { unmount } = renderHook(() => usePriceSolver())
    const worker = workers[0]
    unmount()
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending debounce on unmount so no post hits a dead worker', () => {
    const { result, unmount } = renderHook(() => usePriceSolver())
    const worker = workers[0]

    act(() => {
      result.current.recalculate(() => emptyInput)
    })
    // Unmount before the debounce window elapses.
    unmount()
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(worker.postMessage).not.toHaveBeenCalled()
  })
})
