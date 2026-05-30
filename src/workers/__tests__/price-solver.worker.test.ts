import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SolverInput, SolverOutput } from '@/types/solver'

const postMessage = vi.fn()
const originalSelf = globalThis.self

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  globalThis.self = originalSelf
  postMessage.mockReset()
})

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

const fakeOutput: SolverOutput = {
  prices: { iron: { costPrice: 1, salePrice: 2, recipeId: 'r1' } },
  recipePrices: {},
  recipeCosts: {},
  errors: [],
}

describe('price-solver.worker', () => {
  it('wires self.onmessage to solve() and posts the result back', async () => {
    // Stub the worker self with a minimal object before importing the module,
    // so the top-level `self.onmessage = ...` assignment writes to our stub.
    const fakeSelf = {
      onmessage: null as ((event: MessageEvent<SolverInput>) => void) | null,
      postMessage,
    }
    vi.stubGlobal('self', fakeSelf)

    const solve = vi.fn(() => fakeOutput)
    vi.resetModules()
    vi.doMock('@/lib/solver', () => ({ solve }))

    await import('../price-solver.worker')
    expect(fakeSelf.onmessage).toBeInstanceOf(Function)

    fakeSelf.onmessage?.({ data: emptyInput } as MessageEvent<SolverInput>)

    expect(solve).toHaveBeenCalledWith(emptyInput)
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({ type: 'result', result: fakeOutput })
  })

  it('posts an error message instead of throwing when solve() fails', async () => {
    const fakeSelf = {
      onmessage: null as ((event: MessageEvent<SolverInput>) => void) | null,
      postMessage,
    }
    vi.stubGlobal('self', fakeSelf)

    const solve = vi.fn(() => {
      throw new Error('boom')
    })
    vi.resetModules()
    vi.doMock('@/lib/solver', () => ({ solve }))

    await import('../price-solver.worker')

    fakeSelf.onmessage?.({ data: emptyInput } as MessageEvent<SolverInput>)

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', message: 'boom' })
  })
})
