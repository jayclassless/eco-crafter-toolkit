import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { SettingsSidebar } from '../SettingsSidebar'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async () => {},
  } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  uiStore.setRow('uiState', 'main', {
    themeMode: 'auto',
    themeColor: 'blue',
    uiScale: 14,
  })
  return { gameDataStore, buildStore, uiStore }
}

function renderSidebar(opts: {
  visible?: boolean
  onHide?: () => void
  onOpenRecipeCalculator?: () => void
  onOpenGameNews?: () => void
  onOpenDatasets?: () => void
  onOpenAbout?: () => void
  stores?: { gameDataStore: Store; buildStore: Store; uiStore: Store }
}) {
  const stores = opts.stores ?? makeStores()
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <SettingsSidebar
        visible={opts.visible ?? true}
        onHide={opts.onHide ?? (() => {})}
        onOpenRecipeCalculator={opts.onOpenRecipeCalculator ?? (() => {})}
        onOpenGameNews={opts.onOpenGameNews ?? (() => {})}
        onOpenDatasets={opts.onOpenDatasets ?? (() => {})}
        onOpenAbout={opts.onOpenAbout ?? (() => {})}
      />
    </StoreContext.Provider>
  )
}

describe('SettingsSidebar', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    _resetGitHubReleasesCacheForTests()
    // Default to a never-resolving fetch so the releases-badge hook in the
    // sidebar menu doesn't hit the network in tests that don't cover it.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens to the menu view by default', () => {
    renderSidebar({})
    expect(screen.getByText('Game Datasets')).toBeInTheDocument()
    expect(screen.getByText('UI Settings')).toBeInTheDocument()
  })

  it('switches to UI Settings view when its menu item is clicked', () => {
    renderSidebar({})
    fireEvent.click(screen.getByText('UI Settings'))
    // Theme controls now visible
    expect(screen.getByText('Theme Mode')).toBeInTheDocument()
    expect(screen.getByText('Theme Color')).toBeInTheDocument()
    expect(screen.getByText('UI Scale')).toBeInTheDocument()
    // Back button is rendered (aria-label "Back")
    expect(screen.getByLabelText('Back')).toBeInTheDocument()
  })

  it('returns to the menu when Back is clicked from UI Settings', () => {
    renderSidebar({})
    fireEvent.click(screen.getByText('UI Settings'))
    fireEvent.click(screen.getByLabelText('Back'))
    expect(screen.getByText('Game Datasets')).toBeInTheDocument()
  })

  it('calls onHide and onOpenGameNews when Game News is clicked', () => {
    const onHide = vi.fn()
    const onOpenGameNews = vi.fn()
    renderSidebar({ onHide, onOpenGameNews })
    fireEvent.click(screen.getByText('Game News'))
    expect(onHide).toHaveBeenCalledTimes(1)
    expect(onOpenGameNews).toHaveBeenCalledTimes(1)
  })

  it('calls onHide and onOpenDatasets when Game Datasets is clicked', () => {
    const onHide = vi.fn()
    const onOpenDatasets = vi.fn()
    renderSidebar({ onHide, onOpenDatasets })
    fireEvent.click(screen.getByText('Game Datasets'))
    expect(onHide).toHaveBeenCalledTimes(1)
    expect(onOpenDatasets).toHaveBeenCalledTimes(1)
  })

  it('calls onHide and onOpenAbout when About is clicked', () => {
    const onHide = vi.fn()
    const onOpenAbout = vi.fn()
    renderSidebar({ onHide, onOpenAbout })
    fireEvent.click(screen.getByText('About this App'))
    expect(onHide).toHaveBeenCalledTimes(1)
    expect(onOpenAbout).toHaveBeenCalledTimes(1)
  })

  it('renders a danger badge on the About item when releases are unseen', async () => {
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
    renderSidebar({})
    await waitFor(() => {
      const aboutAnchor = screen.getByText('About this App').closest('a')
      expect(aboutAnchor?.querySelector('.p-badge')?.textContent).toBe('1')
    })
  })

  it('does not render an About badge when no releases are unseen', () => {
    const stores = makeStores()
    stores.uiStore.setCell(
      'uiState',
      'main',
      'lastReleasesViewedAt',
      Date.parse('2099-01-01T00:00:00Z')
    )
    renderSidebar({ stores })
    const aboutAnchor = screen.getByText('About this App').closest('a')
    expect(aboutAnchor?.querySelector('.p-badge')).toBeNull()
  })

  it('resets to the menu view each time the sidebar opens', () => {
    const stores = makeStores()
    const { rerender } = renderSidebar({ stores, visible: true })
    fireEvent.click(screen.getByText('UI Settings'))
    expect(screen.getByText('Theme Mode')).toBeInTheDocument()

    // Close
    rerender(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        <SettingsSidebar
          visible={false}
          onHide={() => {}}
          onOpenRecipeCalculator={() => {}}
          onOpenGameNews={() => {}}
          onOpenDatasets={() => {}}
          onOpenAbout={() => {}}
        />
      </StoreContext.Provider>
    )

    // Reopen
    rerender(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        <SettingsSidebar
          visible={true}
          onHide={() => {}}
          onOpenRecipeCalculator={() => {}}
          onOpenGameNews={() => {}}
          onOpenDatasets={() => {}}
          onOpenAbout={() => {}}
        />
      </StoreContext.Provider>
    )

    expect(screen.getByText('Game Datasets')).toBeInTheDocument()
    expect(screen.queryByText('Theme Mode')).not.toBeInTheDocument()
  })
})
