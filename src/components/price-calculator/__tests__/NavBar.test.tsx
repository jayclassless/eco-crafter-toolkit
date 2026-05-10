import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { NavBar } from '../NavBar'

import '@/i18n'

// NewsBadgeButton (rendered inside NavBar) calls fetchSteamNews against a
// relative URL that node's fetch can't parse, polluting test output with a
// console.warn. These tests don't exercise the badge, so stub the module
// with a never-resolving promise — no console.warn, no post-unmount setState.
vi.mock('@/lib/steam-news', () => ({
  fetchSteamNews: vi.fn(() => new Promise(() => {})),
}))

beforeEach(() => {
  _resetGitHubReleasesCacheForTests()
  // Default to a never-resolving fetch so the releases badge hook doesn't
  // hit the network from tests that don't explicitly cover it. Individual
  // tests may override this with their own mock.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
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
  gameDataStore.setRow('skills', 'sk-self', {
    id: 'sk-self',
    datasetId: 'ds1',
    name: 'SelfImprovementSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  return {
    gameDataStore,
    buildStore: createBuildStore(),
    uiStore: createUIStore(),
  }
}

function renderNav(
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store },
  opts: { onOpenConfig?: () => void } = {}
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
      <MemoryRouter>
        <NavBar
          datasetId="ds1"
          buildId="b1"
          onSelectBuild={() => {}}
          onDeletedBuild={() => {}}
          onOpenSettings={() => {}}
          onOpenConfig={opts.onOpenConfig}
        />
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

describe('NavBar', () => {
  it('renders the dataset name from the game-data store', () => {
    const stores = makeStores()
    renderNav(stores)
    expect(screen.getByText('Eco vTest')).toBeInTheDocument()
  })

  it('shows a count badge on the hamburger button when there are unseen releases', async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            tag_name: 'v0.3.0',
            name: 'Release 0.3.0',
            published_at: '2026-05-01T12:00:00Z',
            body: '',
            html_url: 'https://example.com/r/v0.3.0',
            draft: false,
            prerelease: false,
          },
        ]),
        { status: 200 }
      )
    )
    const stores = makeStores()
    const { container } = renderNav(stores)
    const hamburger = container.querySelector('button .pi-bars')?.closest('button')
    expect(hamburger).not.toBeNull()
    await waitFor(() => {
      expect(hamburger?.querySelector('.p-badge')?.textContent).toBe('1')
    })
  })

  it('does not show a hamburger badge once releases have been viewed', async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            tag_name: 'v0.3.0',
            name: 'Release 0.3.0',
            published_at: '2026-05-01T12:00:00Z',
            body: '',
            html_url: 'https://example.com/r/v0.3.0',
            draft: false,
            prerelease: false,
          },
        ]),
        { status: 200 }
      )
    )
    const stores = makeStores()
    stores.uiStore.setCell(
      'uiState',
      'main',
      'lastReleasesViewedAt',
      Date.parse('2026-05-01T12:00:00Z')
    )
    const { container } = renderNav(stores)
    const hamburger = container.querySelector('button .pi-bars')?.closest('button')
    // Wait long enough for the badge hook's fetch to resolve.
    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
    )
    expect(hamburger?.querySelector('.p-badge')).toBeNull()
  })

  it('does not render the open-config button when onOpenConfig is not provided', () => {
    renderNav(makeStores())
    expect(screen.queryByLabelText('Open Build Configuration')).not.toBeInTheDocument()
  })

  it('renders the open-config button and invokes the callback when clicked', () => {
    const onOpenConfig = vi.fn()
    renderNav(makeStores(), { onOpenConfig })
    const button = screen.getByLabelText('Open Build Configuration')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onOpenConfig).toHaveBeenCalledTimes(1)
  })

  it('renders an empty dataset name when the dataset row is missing', () => {
    const stores = {
      gameDataStore: createGameDataStore(),
      buildStore: createBuildStore(),
      uiStore: createUIStore(),
    }
    // Need at least the SelfImprovementSkill row for BuildSelector's createBuild
    // path to work — we don't trigger that here, but renderNav still mounts.
    stores.gameDataStore.setRow('skills', 'sk-self', {
      id: 'sk-self',
      datasetId: 'ds1',
      name: 'SelfImprovementSkill',
      profession: '',
      maxLevel: 7,
      laborReducePercent: '[]',
    })
    renderNav(stores)
    // No dataset row means the cell read returns null → empty span; just check
    // that the New Build button (also rendered by BuildSelector) is present.
    expect(screen.getByText(/New build/i)).toBeInTheDocument()
  })
})
