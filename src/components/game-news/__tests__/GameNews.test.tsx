import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetSteamNewsCacheForTests, type SteamNewsItem } from '@/lib/steam-news'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { GameNews } from '../GameNews'

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
      <MemoryRouter initialEntries={['/game-news']}>
        <GameNews />
      </MemoryRouter>
    </StoreContext.Provider>
  )
}

const ITEMS: SteamNewsItem[] = [
  {
    gid: '1',
    title: 'Hotfix 13.0.2',
    url: 'https://example.com/news/1',
    author: 'SLG-Dennis',
    contents: '[h3]Hey![/h3][p]Hotfix is out.[/p]',
    feedlabel: 'Community Announcements',
    date: 1776283033,
  },
  {
    gid: '2',
    title: 'Hotfix 13.0.1',
    url: 'https://example.com/news/2',
    author: 'SLG-Dennis',
    contents: '[p]Earlier hotfix.[/p]',
    feedlabel: 'Community Announcements',
    date: 1776100000,
  },
]

describe('GameNews', () => {
  beforeEach(() => {
    _resetSteamNewsCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a spinner while loading', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))
    const stores = makeStores()
    renderAt(stores)
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
  })

  it('renders titles and formatted body HTML on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ appnews: { newsitems: ITEMS } }), { status: 200 })
    )
    const stores = makeStores()
    renderAt(stores)

    await waitFor(() => {
      expect(screen.getByText('Hotfix 13.0.2')).toBeInTheDocument()
    })

    const titleLink = screen.getByRole('link', { name: 'Hotfix 13.0.2' })
    expect(titleLink).toHaveAttribute('href', 'https://example.com/news/1')
    expect(titleLink).toHaveAttribute('target', '_blank')

    expect(screen.getByText(/Hotfix is out\./)).toBeInTheDocument()
    expect(document.querySelectorAll('h3').length).toBeGreaterThan(0)
  })

  it('writes the latest item date to lastNewsViewedAt after a successful fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ appnews: { newsitems: ITEMS } }), { status: 200 })
    )
    const stores = makeStores()
    renderAt(stores)

    await waitFor(() => {
      expect(stores.uiStore.getCell('uiState', 'main', 'lastNewsViewedAt')).toBe(1776283033)
    })
  })

  it('shows an error and a working Retry button on fetch failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ appnews: { newsitems: ITEMS } }), { status: 200 })
      )
    const stores = makeStores()
    renderAt(stores)

    await waitFor(() => {
      expect(screen.getByText(/could not load news/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Hotfix 13.0.2')).toBeInTheDocument()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
