import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { CropTracker } from '../CropTracker'

import '@/i18n'

// NewsBadgeButton (rendered inside NavBar) hits a relative URL node's fetch
// can't parse; stub it so it never resolves and stays quiet.
vi.mock('@/lib/steam-news', () => ({
  fetchSteamNews: vi.fn(() => new Promise(() => {})),
}))

const DS = 'ds1'
const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(withCrops: boolean) {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  gameDataStore.setRow('datasets', DS, {
    id: DS,
    name: 'Eco vTest',
    version: 1,
    bundledId: 'eco-vtest',
    installedRevision: 1,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
  // A non-crop item is always present; a crop item only when requested.
  gameDataStore.setRow('items', 'wood', {
    id: 'wood',
    datasetId: DS,
    name: 'WoodItem',
    isTag: false,
  })
  if (withCrops) {
    gameDataStore.setRow('items', 'corn', {
      id: 'corn',
      datasetId: DS,
      name: 'CornItem',
      isTag: false,
      maturityAgeDays: 0.8,
    })
  }
  buildStore.setRow('builds', BUILD, { id: BUILD, datasetId: DS, name: 'Build A', createdAt: 'x' })
  buildStore.setRow('userSettings', 'st1', { id: 'st1', buildId: BUILD })

  return { gameDataStore, buildStore, uiStore }
}

function renderApp(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <MemoryRouter initialEntries={[`/${DS}/crops/${BUILD}`]}>
        <Routes>
          <Route path="/:datasetId/crops/:buildId" element={<CropTracker />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('CropTracker', () => {
  it('shows an empty state when the dataset has no crop data', async () => {
    renderApp(makeStores(false))
    await waitFor(() => expect(screen.getByText('Build A')).toBeInTheDocument())
    expect(screen.getByText(/no crop data/i)).toBeInTheDocument()
  })

  it('adds a planting row for this build when Add Field is clicked', async () => {
    const stores = makeStores(true)
    renderApp(stores)
    await waitFor(() => expect(screen.getByText('Add Field')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Add Field'))

    const plantings = stores.buildStore
      .getRowIds('userPlantings')
      .filter((id) => stores.buildStore.getCell('userPlantings', id, 'buildId') === BUILD)
    expect(plantings).toHaveLength(1)
  })

  it('orders fields by name and reverses when the direction is toggled', async () => {
    const stores = makeStores(true)
    stores.buildStore.setRow('userPlantings', 'p1', {
      id: 'p1',
      buildId: BUILD,
      cropItemId: '',
      name: 'Zucchini',
    })
    stores.buildStore.setRow('userPlantings', 'p2', {
      id: 'p2',
      buildId: BUILD,
      cropItemId: '',
      name: 'Apple',
    })
    renderApp(stores)
    await waitFor(() => expect(screen.getByText('Add Field')).toBeInTheDocument())

    const apple = screen.getByDisplayValue('Apple')
    const zucchini = screen.getByDisplayValue('Zucchini')
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING

    // Default sort is name ascending → Apple before Zucchini.
    expect(apple.compareDocumentPosition(zucchini) & FOLLOWING).toBeTruthy()

    // Toggle to descending → Zucchini before Apple.
    fireEvent.click(screen.getByLabelText('Ascending'))
    expect(zucchini.compareDocumentPosition(apple) & FOLLOWING).toBeTruthy()
    expect(stores.uiStore.getCell('uiState', 'main', 'cropSortDir')).toBe('desc')
  })

  it('does not reorder a field while its name is being edited', async () => {
    const stores = makeStores(true)
    stores.buildStore.setRow('userPlantings', 'p1', {
      id: 'p1',
      buildId: BUILD,
      cropItemId: '',
      name: 'Banana',
    })
    stores.buildStore.setRow('userPlantings', 'p2', {
      id: 'p2',
      buildId: BUILD,
      cropItemId: '',
      name: 'Cherry',
    })
    renderApp(stores)
    await waitFor(() => expect(screen.getByText('Add Field')).toBeInTheDocument())

    const banana = screen.getByDisplayValue('Banana')
    // Rename "Cherry" to "Apple" — which would sort first if re-sorted live.
    fireEvent.change(screen.getByDisplayValue('Cherry'), { target: { value: 'Apple' } })
    const apple = screen.getByDisplayValue('Apple')

    // The edited field stays put (Banana still precedes it); no live reshuffle.
    expect(banana.compareDocumentPosition(apple) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
