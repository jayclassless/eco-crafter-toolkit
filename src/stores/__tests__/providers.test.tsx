import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetLocalizedNameStore } from '../localized-name-store'
import { StoreProvider, useStores } from '../providers'

// Wipe fake-indexeddb between tests so the previous test's persisted state
// doesn't leak into the next one (StoreProvider's load() would otherwise
// short-circuit the manifest fetch path).
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

import '@/i18n'

// Tiny consumer that proves the StoreProvider exposed three live stores.
function StoresProbe() {
  const stores = useStores()
  return (
    <div>
      <span data-testid="game-rows">{stores.gameDataStore.getRowIds('datasets').length}</span>
      <span data-testid="ui-row">{stores.uiStore.hasRow('uiState', 'main') ? 'ok' : 'no'}</span>
    </div>
  )
}

const minimalDataset = () =>
  ({ Version: 1, Skills: [], Items: [], Tags: [], Recipes: [] }) as unknown as object

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await resetIndexedDB()
  // Always default to a happy fetch — every test that needs a manifest stubs
  // its own response, but jsdom's fetch is undefined so this avoids a noisy
  // "fetch is not defined" if anything falls through.
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

describe('StoreProvider', () => {
  it('mounts the three persisted stores and exposes them via useStores', async () => {
    render(
      <StoreProvider>
        <StoresProbe />
      </StoreProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('ui-row').textContent).toBe('ok')
    })
    // First-launch path: gameDataStore populated from the default manifest entry.
    await waitFor(() => {
      expect(parseInt(screen.getByTestId('game-rows').textContent ?? '0', 10)).toBeGreaterThan(0)
    })
  })

  it('renders the InitError fallback when manifest fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    )
    render(
      <StoreProvider>
        <div>child</div>
      </StoreProvider>
    )
    await waitFor(() => {
      expect(screen.getByText(/Could not load dataset/i)).toBeInTheDocument()
    })
    // The Retry button is rendered.
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })
})
