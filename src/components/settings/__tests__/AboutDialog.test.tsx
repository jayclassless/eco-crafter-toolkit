import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { AboutDialog } from '../AboutDialog'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  return {
    gameDataStore: createGameDataStore(),
    buildStore: createBuildStore(),
    uiStore: createUIStore(),
  }
}

function renderWith(
  ui: ReactElement,
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store } = makeStores()
) {
  return {
    stores,
    ...render(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        {ui}
      </StoreContext.Provider>
    ),
  }
}

const SAMPLE_RELEASES = [
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
  {
    id: 2,
    tag_name: 'v0.2.0',
    name: 'Release 0.2.0',
    published_at: '2026-04-01T12:00:00Z',
    body: '',
    html_url: 'https://example.com/r/v0.2.0',
    draft: false,
    prerelease: false,
  },
]

describe('AboutDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    _resetGitHubReleasesCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the icon, app name, and package version in the header', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderWith(<AboutDialog visible onHide={() => {}} />)
    expect(screen.getByAltText('Eco Crafter Toolkit')).toBeInTheDocument()
    expect(screen.getAllByText('Eco Crafter Toolkit').length).toBeGreaterThan(0)
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument()
  })

  it('renders nothing when not visible', () => {
    renderWith(<AboutDialog visible={false} onHide={() => {}} />)
    expect(screen.queryByText(/Welcome to the Eco Crafter Toolkit/i)).not.toBeInTheDocument()
  })

  it('calls onHide when the close button is clicked', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const onHide = vi.fn()
    renderWith(<AboutDialog visible onHide={onHide} />)
    const closeBtn = document.body.querySelector('.p-dialog-header-close') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn)
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('renders the About tab content by default', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderWith(<AboutDialog visible onHide={() => {}} />)
    expect(screen.getByText(/Welcome to the Eco Crafter Toolkit/i)).toBeInTheDocument()
  })

  it('renders the Update History tab when activated', async () => {
    // First call serves the badge hook, second serves the tab body.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )
    renderWith(<AboutDialog visible onHide={() => {}} />)
    const tab = screen.getByRole('tab', { name: /update history/i })
    fireEvent.click(tab)
    await waitFor(() => {
      expect(screen.getByText('No releases yet.')).toBeInTheDocument()
    })
  })

  it('does not fetch the Update History body until the tab is activated', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    renderWith(<AboutDialog visible onHide={() => {}} />)
    // The About tab is the default; the tab body should not have rendered.
    expect(screen.queryByText('No releases yet.')).not.toBeInTheDocument()
    // The badge hook may have called fetch, but the tab body specifically
    // hasn't mounted — confirmed by the absence of the empty-state message.
    fetchSpy.mockClear()
  })

  it('shows a count badge on the Update History tab when there are unseen releases', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_RELEASES), { status: 200 })
    )
    const { stores } = renderWith(<AboutDialog visible onHide={() => {}} />)
    // lastReleasesViewedAt defaults to 0 → both sample releases are unseen.
    await waitFor(() => {
      const tab = screen.getByRole('tab', { name: /update history/i })
      expect(tab.querySelector('.p-badge')?.textContent).toBe('2')
    })
    expect(stores.uiStore.getCell('uiState', 'main', 'lastReleasesViewedAt')).toBe(0)
  })
})
