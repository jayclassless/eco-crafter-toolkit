import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { RootRedirect } from '../RootRedirect'

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function stubPersister(): IndexedDbPersister {
  return { save: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  return { gameDataStore, buildStore, uiStore }
}

function addDataset(gameDataStore: Store, id: string, name: string) {
  gameDataStore.setRow('datasets', id, {
    id,
    name,
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: true,
  })
}

function renderAt(stores: ReturnType<typeof makeStores>) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

describe('RootRedirect', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(() => {
    stores = makeStores()
  })

  it('redirects to /<storedActiveDatasetId>/calculator when valid', () => {
    addDataset(stores.gameDataStore, 'ds1', 'Dataset One')
    addDataset(stores.gameDataStore, 'ds2', 'Dataset Two')
    stores.uiStore.setCell('uiState', 'main', 'activeDatasetId', 'ds2')

    renderAt(stores)
    expect(screen.getByTestId('location').textContent).toBe('/ds2/calculator')
  })

  it('falls back to the first dataset when no activeDatasetId is stored', () => {
    addDataset(stores.gameDataStore, 'ds1', 'Dataset One')
    addDataset(stores.gameDataStore, 'ds2', 'Dataset Two')

    renderAt(stores)
    expect(screen.getByTestId('location').textContent).toBe('/ds1/calculator')
  })

  it('falls back to the first dataset when stored activeDatasetId is stale', () => {
    addDataset(stores.gameDataStore, 'ds1', 'Dataset One')
    stores.uiStore.setCell('uiState', 'main', 'activeDatasetId', 'ds-deleted')

    renderAt(stores)
    expect(screen.getByTestId('location').textContent).toBe('/ds1/calculator')
  })

  it('renders nothing when no datasets exist', () => {
    const { container } = renderAt(stores)
    expect(container.querySelector('[data-testid="location"]')).toBeNull()
  })
})
