import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { PriceCalculator } from '../PriceCalculator'

import '@/i18n'

// NewsBadgeButton (rendered inside NavBar) calls fetchSteamNews against a
// relative URL that node's fetch can't parse, polluting test output with a
// console.warn. These tests don't exercise the badge, so stub the module
// with a never-resolving promise — no console.warn, no post-unmount setState.
vi.mock('@/lib/steam-news', () => ({
  fetchSteamNews: vi.fn(() => new Promise(() => {})),
}))

// jsdom can't actually run a Web Worker, so we replace `globalThis.Worker`
// with a no-op stub that keeps the onmessage hook idle. The component then
// renders without crashing on `new Worker(...)`.
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

const DS = 'ds1'
const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
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
  gameDataStore.setRow('skills', 'sk-self', {
    id: 'sk-self',
    datasetId: DS,
    name: 'SelfImprovementSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[1,1,1,1,1,1,1,1]',
  })
  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DS,
    name: 'Build A',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userSettings', 'st1', {
    id: 'st1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 0,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderApp(
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store },
  path: string
) {
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
          <Route path="/:datasetId/calculator/:buildId" element={<PriceCalculator />} />
          {/* Sink route absorbs PriceCalculator's redirect targets ('/' and
              '/:datasetId/calculator') so react-router doesn't warn about
              "no routes matched" in the redirect-validation tests. */}
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PriceCalculator (smoke)', () => {
  it('renders the navbar, build name, and the three column panels', async () => {
    const stores = makeStores()
    renderApp(stores, `/${DS}/calculator/${BUILD}`)
    // Build name is shown in the SplitButton in the NavBar.
    await waitFor(() => expect(screen.getByText('Build A')).toBeInTheDocument())
    // Three columns: ConfigPanel, Materials, Products. Look for headers.
    expect(document.body.querySelector('.col-3')).toBeInTheDocument()
    expect(document.body.querySelector('.col-4')).toBeInTheDocument()
    expect(document.body.querySelector('.col-5')).toBeInTheDocument()
  })

  it('persists activeDatasetId and activeBuildId in uiStore on mount', async () => {
    const stores = makeStores()
    renderApp(stores, `/${DS}/calculator/${BUILD}`)
    await waitFor(() => {
      expect(stores.uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe(DS)
      expect(stores.uiStore.getCell('uiState', 'main', 'activeBuildId')).toBe(BUILD)
    })
  })

  it('redirects to / when the datasetId in the URL is not installed', () => {
    const stores = makeStores()
    const { container } = renderApp(stores, '/missing-dataset/calculator/foo')
    expect(container.querySelector('.col-3')).toBeNull()
  })

  it('redirects to /:datasetId/calculator when the build id is missing', () => {
    const stores = makeStores()
    const { container } = renderApp(stores, `/${DS}/calculator/missing-build`)
    expect(container.querySelector('.col-3')).toBeNull()
  })

  it('auto-opens the About dialog on first calculator visit and flips the persisted flag', async () => {
    const stores = makeStores()
    expect(stores.uiStore.getCell('uiState', 'main', 'hasSeenAboutDialog')).toBe(false)
    renderApp(stores, `/${DS}/calculator/${BUILD}`)
    await waitFor(() =>
      expect(screen.getByText(/Welcome to the Eco Crafter Toolkit/i)).toBeInTheDocument()
    )
    expect(stores.uiStore.getCell('uiState', 'main', 'hasSeenAboutDialog')).toBe(true)
  })

  it('does not auto-open the About dialog when the seen flag is already set', async () => {
    const stores = makeStores()
    stores.uiStore.setCell('uiState', 'main', 'hasSeenAboutDialog', true)
    renderApp(stores, `/${DS}/calculator/${BUILD}`)
    await waitFor(() => expect(screen.getByText('Build A')).toBeInTheDocument())
    expect(screen.queryByText(/Welcome to the Eco Crafter Toolkit/i)).not.toBeInTheDocument()
  })

  it('opens the settings sidebar when the menu icon is clicked', async () => {
    const stores = makeStores()
    renderApp(stores, `/${DS}/calculator/${BUILD}`)
    await waitFor(() => expect(screen.getByText('Build A')).toBeInTheDocument())
    const menuBtn = document.body.querySelector('.pi-bars')!.closest('button') as HTMLButtonElement
    fireEvent.click(menuBtn)
    await waitFor(() => {
      expect(screen.getByText(/Settings/i)).toBeInTheDocument()
    })
  })

  it('retriggers the solver when game-data recipe tables change (e.g. a custom recipe edit)', async () => {
    const workers: FakeWorker[] = []
    class CapturingFakeWorker extends FakeWorker {
      constructor() {
        super()
        workers.push(this)
      }
    }
    vi.stubGlobal('Worker', CapturingFakeWorker)

    const stores = makeStores()
    renderApp(stores, `/${DS}/calculator/${BUILD}`)
    await waitFor(() => expect(screen.getByText('Build A')).toBeInTheDocument())

    // Wait for the initial solver run (200ms debounce + worker postMessage).
    await waitFor(
      () => expect(workers.some((w) => w.postMessage.mock.calls.length > 0)).toBe(true),
      { timeout: 1500 }
    )
    const initialTotal = workers.reduce((n, w) => n + w.postMessage.mock.calls.length, 0)

    // Simulate a custom-recipe edit: rewriting a recipe row + its elements +
    // its modifiers. Listeners on these tables must enqueue a recalculation.
    // Wrap in `act` so the synchronous React state updates triggered by the
    // store's table listeners (MaterialDialog / RecipeDialog / AddRecipeDialog
    // memo invalidations) settle before assertions run — otherwise React's
    // testing utilities log noisy "not wrapped in act(...)" warnings.
    await act(async () => {
      stores.gameDataStore.transaction(() => {
        stores.gameDataStore.setRow('recipes', 'r-x', {
          datasetId: DS,
          name: 'Test Custom',
          familyName: 'Test Custom',
          skillId: '',
          requiredSkillLevel: 0,
          isBlueprint: false,
          isDefault: true,
          craftingTableId: '',
          baseCraftTime: 0,
          baseLaborCost: 0,
          isCustom: true,
        })
      })
    })

    await waitFor(
      () =>
        expect(workers.reduce((n, w) => n + w.postMessage.mock.calls.length, 0)).toBeGreaterThan(
          initialTotal
        ),
      { timeout: 1500 }
    )
  })
})
