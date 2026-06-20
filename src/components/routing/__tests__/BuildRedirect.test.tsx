import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { BuildRedirect } from '../BuildRedirect'

import '@/i18n' // initialize react-i18next

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

function addDataset(gameDataStore: Store, id: string) {
  gameDataStore.setRow('datasets', id, {
    id,
    name: id,
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: true,
  })
  // SelfImprovementSkill is auto-added by createBuild; provide one tied to
  // this dataset so the createBuild path doesn't fail when no builds exist.
  gameDataStore.setRow('skills', `${id}-self`, {
    id: `${id}-self`,
    datasetId: id,
    name: 'SelfImprovementSkill',
  })
}

function addBuild(buildStore: Store, id: string, datasetId: string) {
  buildStore.setRow('builds', id, {
    id,
    datasetId,
    name: 'Build',
    createdAt: '2026-01-01',
  })
}

function renderAt(initialPath: string, stores: ReturnType<typeof makeStores>) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/:datasetId/calculator" element={<BuildRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

describe('BuildRedirect', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(() => {
    stores = makeStores()
  })

  it('redirects to the first build of the dataset when builds exist', async () => {
    addDataset(stores.gameDataStore, 'ds1')
    addBuild(stores.buildStore, 'b1', 'ds1')
    addBuild(stores.buildStore, 'b2', 'ds1')
    addBuild(stores.buildStore, 'bx', 'ds-other')

    renderAt('/ds1/calculator', stores)

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/ds1/calculator/b1')
    })
  })

  it('redirects to the last-viewed build for the dataset when one is recorded', async () => {
    addDataset(stores.gameDataStore, 'ds1')
    addBuild(stores.buildStore, 'b1', 'ds1')
    addBuild(stores.buildStore, 'b2', 'ds1')
    stores.uiStore.setCell('lastViewedBuilds', 'ds1', 'buildId', 'b2')

    renderAt('/ds1/calculator', stores)

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/ds1/calculator/b2')
    })
  })

  it('falls back to the first build when the last-viewed build no longer exists', async () => {
    addDataset(stores.gameDataStore, 'ds1')
    addBuild(stores.buildStore, 'b1', 'ds1')
    addBuild(stores.buildStore, 'b2', 'ds1')
    stores.uiStore.setCell('lastViewedBuilds', 'ds1', 'buildId', 'deleted-build')

    renderAt('/ds1/calculator', stores)

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/ds1/calculator/b1')
    })
  })

  it('ignores a last-viewed build recorded for a different dataset', async () => {
    addDataset(stores.gameDataStore, 'ds1')
    addBuild(stores.buildStore, 'b1', 'ds1')
    addBuild(stores.buildStore, 'b2', 'ds1')
    // A pointer for ds-other must not leak into ds1's redirect.
    stores.uiStore.setCell('lastViewedBuilds', 'ds-other', 'buildId', 'b2')

    renderAt('/ds1/calculator', stores)

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/ds1/calculator/b1')
    })
  })

  it('creates a build and redirects to it when the dataset has none', async () => {
    addDataset(stores.gameDataStore, 'ds1')

    renderAt('/ds1/calculator', stores)

    await waitFor(() => {
      const path = screen.getByTestId('location').textContent ?? ''
      expect(path).toMatch(/^\/ds1\/calculator\/.+$/)
    })

    expect(stores.buildStore.getRowIds('builds')).toHaveLength(1)
  })

  it('creates exactly one build under StrictMode (regression: dev double-invoke)', async () => {
    addDataset(stores.gameDataStore, 'ds1')

    render(
      <StrictMode>
        <StoreContext.Provider
          value={{
            ...stores,
            gameDataPersister: stubPersister(),
            buildPersister: stubPersister(),
            uiPersister: stubPersister(),
          }}
        >
          <MemoryRouter initialEntries={['/ds1/calculator']}>
            <Routes>
              <Route path="/:datasetId/calculator" element={<BuildRedirect />} />
              <Route path="*" element={<LocationProbe />} />
            </Routes>
          </MemoryRouter>
        </StoreContext.Provider>
      </StrictMode>
    )

    await waitFor(() => {
      const path = screen.getByTestId('location').textContent ?? ''
      expect(path).toMatch(/^\/ds1\/calculator\/.+$/)
    })

    expect(stores.buildStore.getRowIds('builds')).toHaveLength(1)
  })

  it('redirects to root when the datasetId is unknown', async () => {
    addDataset(stores.gameDataStore, 'ds1')

    renderAt('/no-such-dataset/calculator', stores)

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/')
    })
  })
})
