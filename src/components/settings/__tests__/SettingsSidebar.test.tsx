import { fireEvent, render, screen } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  onOpenDatasets?: () => void
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
        onOpenDatasets={opts.onOpenDatasets ?? (() => {})}
      />
    </StoreContext.Provider>
  )
}

describe('SettingsSidebar', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
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

  it('calls onHide and onOpenDatasets when Game Datasets is clicked', () => {
    const onHide = vi.fn()
    const onOpenDatasets = vi.fn()
    renderSidebar({ onHide, onOpenDatasets })
    fireEvent.click(screen.getByText('Game Datasets'))
    expect(onHide).toHaveBeenCalledTimes(1)
    expect(onOpenDatasets).toHaveBeenCalledTimes(1)
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
        <SettingsSidebar visible={false} onHide={() => {}} onOpenDatasets={() => {}} />
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
        <SettingsSidebar visible={true} onHide={() => {}} onOpenDatasets={() => {}} />
      </StoreContext.Provider>
    )

    expect(screen.getByText('Game Datasets')).toBeInTheDocument()
    expect(screen.queryByText('Theme Mode')).not.toBeInTheDocument()
  })
})
