import { fireEvent, render, screen } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { UiSettingsView } from '../UiSettingsView'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async () => {},
  } as unknown as IndexedDbPersister
}

function makeStores(initial?: { themeMode?: string; themeColor?: string; uiScale?: number }) {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  uiStore.setRow('uiState', 'main', {
    themeMode: initial?.themeMode ?? 'auto',
    themeColor: initial?.themeColor ?? 'blue',
    uiScale: initial?.uiScale ?? 14,
  })
  return { gameDataStore, buildStore, uiStore }
}

function renderView(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <UiSettingsView />
    </StoreContext.Provider>
  )
}

describe('UiSettingsView', () => {
  it('renders the three labelled sections', () => {
    renderView(makeStores())
    expect(screen.getByText('Theme Mode')).toBeInTheDocument()
    expect(screen.getByText('Theme Color')).toBeInTheDocument()
    expect(screen.getByText('UI Scale')).toBeInTheDocument()
  })

  it('updates uiStore.themeMode when a different mode is selected', () => {
    const stores = makeStores({ themeMode: 'auto' })
    renderView(stores)
    fireEvent.click(screen.getByTitle('Light'))
    expect(stores.uiStore.getCell('uiState', 'main', 'themeMode')).toBe('light')
  })

  it('updates uiStore.themeColor when a swatch is clicked', () => {
    const stores = makeStores({ themeColor: 'blue' })
    renderView(stores)
    fireEvent.click(screen.getByText('Cyan'))
    expect(stores.uiStore.getCell('uiState', 'main', 'themeColor')).toBe('cyan')
  })

  it('decreases uiScale via the minus button', () => {
    const stores = makeStores({ uiScale: 14 })
    renderView(stores)
    const minus = document.querySelector('.pi-minus')!.closest('button') as HTMLButtonElement
    fireEvent.click(minus)
    expect(stores.uiStore.getCell('uiState', 'main', 'uiScale')).toBe(13)
  })

  it('increases uiScale via the plus button', () => {
    const stores = makeStores({ uiScale: 14 })
    renderView(stores)
    const plus = document.querySelector('.pi-plus')!.closest('button') as HTMLButtonElement
    fireEvent.click(plus)
    expect(stores.uiStore.getCell('uiState', 'main', 'uiScale')).toBe(15)
  })

  it('disables the minus button at the minimum scale', () => {
    const stores = makeStores({ uiScale: 12 })
    renderView(stores)
    const minus = document.querySelector('.pi-minus')!.closest('button') as HTMLButtonElement
    expect(minus.disabled).toBe(true)
  })

  it('disables the plus button at the maximum scale', () => {
    const stores = makeStores({ uiScale: 18 })
    renderView(stores)
    const plus = document.querySelector('.pi-plus')!.closest('button') as HTMLButtonElement
    expect(plus.disabled).toBe(true)
  })
})
