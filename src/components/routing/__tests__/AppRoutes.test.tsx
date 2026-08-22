import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { AppRoutes } from '../AppRoutes'

// The resources route mounts a NavBar, whose NewsBadgeButton calls
// fetchSteamNews against a relative URL node's fetch can't parse; stub it
// out like NavBar.test does.
vi.mock('@/lib/steam-news', () => ({
  fetchSteamNews: vi.fn(() => new Promise(() => {})),
}))

beforeEach(() => {
  _resetGitHubReleasesCacheForTests()
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(): { gameDataStore: Store; buildStore: Store; uiStore: Store } {
  // Empty game-data so the wildcard-navigate-to-/ chain stops at RootRedirect
  // (which renders null when no datasets exist) — avoids cascading into
  // PriceCalculator, which spins up a Web Worker that jsdom can't run.
  return {
    gameDataStore: createGameDataStore(),
    buildStore: createBuildStore(),
    uiStore: createUIStore(),
  }
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderAt(stores: ReturnType<typeof makeStores>, path: string) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<AppRoutes />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

describe('AppRoutes', () => {
  it('mounts without throwing for an unknown path', () => {
    const stores = makeStores()
    const { container } = renderAt(stores, '/totally-unknown')
    // Wildcard path navigates back to RootRedirect → which redirects again.
    // Either way: no throw.
    expect(container).toBeInTheDocument()
  })

  it('mounts the biome resources page for /:datasetId/resources', () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('datasets', 'ds1', {
      id: 'ds1',
      name: 'Eco vTest',
      version: 1,
      bundledId: 'eco-vtest',
      installedRevision: 1,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: false,
    })
    renderAt(stores, '/ds1/resources')
    expect(screen.getByText('Below the Surface')).toBeInTheDocument()
  })

  it('mounts the housing score page for /:datasetId/housing', () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('datasets', 'ds1', {
      id: 'ds1',
      name: 'Eco vTest',
      version: 1,
      bundledId: 'eco-vtest',
      installedRevision: 1,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: false,
    })
    renderAt(stores, '/ds1/housing')
    expect(screen.getByText('Building Materials')).toBeInTheDocument()
  })
})
