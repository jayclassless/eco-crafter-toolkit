import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestStores, makeWrapper, type TestStores } from '@/hooks/__tests__/store-wrapper'
import { clearGameDataIndexesCache } from '@/lib/game-data-indexes'
import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'

import { HousingScore } from '../HousingScore'

import '@/i18n'

// NewsBadgeButton (inside NavBar) fetches a relative URL node can't parse.
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

function seedDataset(stores: TestStores) {
  const { gameDataStore } = stores
  gameDataStore.setRow('datasets', 'ds1', {
    id: 'ds1',
    name: 'Eco vTest',
    version: 1,
    bundledId: 'eco-vtest',
    installedRevision: 1,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
  gameDataStore.setRow('roomCategories', 'c1', {
    id: 'c1',
    datasetId: 'ds1',
    name: 'Seating',
    color: '#E5956E',
    index: 0,
  })
  gameDataStore.setRow('roomTiers', 't3', {
    id: 't3',
    datasetId: 'ds1',
    tierVal: 3,
    softCap: 15,
    hardCap: 30,
    diminishingReturnPercent: 0.65,
  })
  gameDataStore.setRow('items', 'chair', {
    id: 'chair',
    datasetId: 'ds1',
    name: 'ChairItem',
    isTag: false,
    housingCategory: 'Seating',
    housingBaseValue: 3,
    housingTypeForRoomLimit: 'Chair',
    housingDiminishingReturnMultiplier: 0.6,
  })
  gameDataStore.setRow('items', 'brick', {
    id: 'brick',
    datasetId: 'ds1',
    name: 'BrickItem',
    isTag: false,
    isBuildingMaterial: true,
    buildingBlockTier: 3,
  })
  clearGameDataIndexesCache(gameDataStore)
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderAt(stores: TestStores, path: string) {
  const Wrapper = makeWrapper(stores)
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:datasetId/housing" element={<HousingScore />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

describe('HousingScore', () => {
  it('redirects to / when the dataset does not exist', () => {
    const stores = createTestStores()
    renderAt(stores, '/nope/housing')
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('records the dataset hint on the ui store', () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/housing')
    expect(stores.uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe('ds1')
  })

  it('shows the furnishings browser first', () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/housing')
    expect(screen.getByText('Room Category')).toBeInTheDocument()
    expect(screen.getByText('ChairItem')).toBeInTheDocument()
    // The materials-only columns are absent.
    expect(screen.queryByText('Score Soft Cap')).not.toBeInTheDocument()
  })

  it('switches to the building materials browser', () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/housing')
    fireEvent.click(screen.getByText('Building Materials'))
    expect(screen.getByText('Score Soft Cap')).toBeInTheDocument()
    expect(screen.getByText('BrickItem')).toBeInTheDocument()
    // Tier 3 in the seeded tier table caps at 15/30.
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('shows the update-your-dataset state when the dataset has no housing data', () => {
    const stores = createTestStores()
    stores.gameDataStore.setRow('datasets', 'ds1', {
      id: 'ds1',
      name: 'Eco vOld',
      version: 1,
      bundledId: 'eco-vold',
      installedRevision: 1,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: false,
    })
    clearGameDataIndexesCache(stores.gameDataStore)
    renderAt(stores, '/ds1/housing')
    expect(screen.getByText(/no housing data/i)).toBeInTheDocument()
  })
})
