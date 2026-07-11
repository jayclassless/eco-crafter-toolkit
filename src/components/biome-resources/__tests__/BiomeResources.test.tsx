import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { createTestStores, makeWrapper, type TestStores } from '@/hooks/__tests__/store-wrapper'
import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'

import { BiomeResources } from '../BiomeResources'

import '@/i18n'

// NewsBadgeButton (rendered inside NavBar) calls fetchSteamNews against a
// relative URL that node's fetch can't parse; stub it out like NavBar.test.
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
          <Route path="/:datasetId/resources" element={<BiomeResources />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

describe('BiomeResources', () => {
  it('redirects to / when the dataset does not exist', () => {
    const stores = createTestStores()
    renderAt(stores, '/nope/resources')
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('renders the Grassland biome by default', () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/resources')
    expect(screen.getByRole('heading', { name: 'Grassland' })).toBeInTheDocument()
    expect(screen.getByText('Below the Surface')).toBeInTheDocument()
    expect(screen.getByText('Flora & Fauna')).toBeInTheDocument()
  })

  it('switches biomes via the navbar dropdown', async () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/resources')
    const dropdown = document.body.querySelector('.p-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    const desertOption = await waitFor(() => screen.getByText('Desert'))
    fireEvent.click(desertOption)
    expect(screen.getByRole('heading', { name: 'Desert' })).toBeInTheDocument()
    expect(screen.getByText(/driest and hottest biome/)).toBeInTheDocument()
  })

  it('groups the dropdown Land/Coast/Sea with biomes alphabetized within each group', async () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/resources')
    fireEvent.click(document.body.querySelector('.p-dropdown') as HTMLElement)
    await waitFor(() => screen.getByText('Desert'))
    const groups = [...document.body.querySelectorAll('.p-dropdown-item-group')].map(
      (el) => el.textContent
    )
    expect(groups).toEqual(['Land', 'Coast', 'Sea'])
    const items = [...document.body.querySelectorAll('.p-dropdown-item')].map(
      (el) => el.textContent
    )
    expect(items).toEqual([
      'Boreal Forest',
      'Cold Forest',
      'Desert',
      'Grassland',
      'Ice',
      'Rainforest',
      'Tundra',
      'Warm Forest',
      'Wetland',
      'Cold Coast',
      'Warm Coast',
      'Deep Ocean',
      'Ocean',
    ])
  })

  it('records the dataset hint in the ui store', () => {
    const stores = createTestStores()
    seedDataset(stores)
    renderAt(stores, '/ds1/resources')
    expect(stores.uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe('ds1')
  })
})
