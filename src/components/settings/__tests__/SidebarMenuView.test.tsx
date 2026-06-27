import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'
import { _resetSteamNewsCacheForTests } from '@/lib/steam-news'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { SidebarMenuView } from '../SidebarMenuView'

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
  return render(
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
  )
}

describe('SidebarMenuView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    _resetGitHubReleasesCacheForTests()
    _resetSteamNewsCacheForTests()
    // Default the badge fetches (Steam news + GitHub releases) to never-resolve
    // so tests that don't care about the badges don't hit the network or warn
    // on post-unmount.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the menu items in order: recipe calculator, game news, datasets, custom entities, ui settings, about', () => {
    renderWith(
      <SidebarMenuView
        onSelectRecipeCalculator={() => {}}
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent?.trim())
    expect(labels).toEqual([
      'Ad-Hoc Recipe Calculator',
      'Game News',
      'Game Datasets',
      'Custom Recipes/Items',
      'UI Settings',
      'About this App',
    ])
  })

  it('invokes onSelectRecipeCalculator when the Ad-Hoc Recipe Calculator item is clicked', () => {
    const onSelectRecipeCalculator = vi.fn()
    renderWith(
      <SidebarMenuView
        onSelectRecipeCalculator={onSelectRecipeCalculator}
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Ad-Hoc Recipe Calculator'))
    expect(onSelectRecipeCalculator).toHaveBeenCalledTimes(1)
  })

  it('shows the Production Planner item only when the handler is provided', () => {
    const onSelectProductionPlanner = vi.fn()
    renderWith(
      <SidebarMenuView
        onSelectProductionPlanner={onSelectProductionPlanner}
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Production Planner'))
    expect(onSelectProductionPlanner).toHaveBeenCalledTimes(1)
  })

  it('hides the Production Planner item when no handler is provided', () => {
    renderWith(
      <SidebarMenuView
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    expect(screen.queryByText('Production Planner')).not.toBeInTheDocument()
  })

  it('invokes onSelectGameNews when the Game News menu item is clicked', () => {
    const onSelectGameNews = vi.fn()
    renderWith(
      <SidebarMenuView
        onSelectRecipeCalculator={() => {}}
        onSelectGameNews={onSelectGameNews}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Game News'))
    expect(onSelectGameNews).toHaveBeenCalledTimes(1)
  })

  it('renders a danger badge on Game News when there are unread Steam news items', async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/game-news')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              appnews: {
                newsitems: [
                  { gid: '1', title: 'A', date: 9_999_999_999 },
                  { gid: '2', title: 'B', date: 9_999_999_998 },
                ],
              },
            }),
            { status: 200 }
          )
        )
      }
      // GitHub releases — return empty so no About badge interferes.
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    })

    renderWith(
      <SidebarMenuView
        onSelectRecipeCalculator={() => {}}
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )

    await waitFor(() => {
      const newsAnchor = screen.getByText('Game News').closest('a')
      expect(newsAnchor?.querySelector('.p-badge')?.textContent).toBe('2')
    })
  })

  it('invokes onSelectCustomEntities when the Custom Recipes/Items menu item is clicked', () => {
    const onSelectCustomEntities = vi.fn()
    renderWith(
      <SidebarMenuView
        onSelectRecipeCalculator={() => {}}
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={onSelectCustomEntities}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Custom Recipes/Items'))
    expect(onSelectCustomEntities).toHaveBeenCalledTimes(1)
  })

  it('invokes onSelectAbout when the About menu item is clicked', () => {
    const onSelectAbout = vi.fn()
    renderWith(
      <SidebarMenuView
        onSelectRecipeCalculator={() => {}}
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectCustomEntities={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={onSelectAbout}
      />
    )
    fireEvent.click(screen.getByText('About this App'))
    expect(onSelectAbout).toHaveBeenCalledTimes(1)
  })
})
