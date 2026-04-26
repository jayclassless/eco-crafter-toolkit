import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetLocalizedNameStore } from '@/stores/localized-name-store'

import { App } from '../App'

import '@/i18n'

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

const minimalDataset = () =>
  ({ Version: 1, Skills: [], Items: [], Tags: [], Recipes: [] }) as unknown as object

async function resetIndexedDB() {
  await Promise.all(
    ['eco-crafter-game-data', 'eco-crafter-builds', 'eco-crafter-ui'].map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name)
          req.onsuccess = () => resolve()
          req.onerror = () => resolve()
          req.onblocked = () => resolve()
        })
    )
  )
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await resetIndexedDB()
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('datasets-manifest.json')) {
        return {
          ok: true,
          json: async () => ({
            datasets: [
              {
                id: 'eco-vtest',
                name: 'Eco vTest',
                file: 'eco-vtest.json',
                revision: 1,
                updatedAt: '2026-04-01',
                default: true,
              },
            ],
          }),
        }
      }
      return { ok: true, json: async () => minimalDataset() }
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App (smoke)', () => {
  it('renders without crashing and mounts a child element', async () => {
    const { container } = render(<App />)
    await waitFor(() => {
      // Once the StoreProvider finishes loading, the AppRoutes mount and at
      // minimum a routing-related node exists.
      expect(container.firstChild).not.toBeNull()
    })
  })
})
