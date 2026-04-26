import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { BuildSelector } from '../BuildSelector'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(): {
  gameDataStore: Store
  buildStore: Store
  uiStore: Store
} {
  const gameDataStore = createGameDataStore()
  // SelfImprovementSkill is required because createBuild auto-adds it.
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

function renderSelector(
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store },
  overrides: {
    activeBuildId?: string
    onSelect?: (id: string) => void
    onDeleted?: (id: string) => void
  } = {}
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
      <BuildSelector
        datasetId="ds1"
        activeBuildId={overrides.activeBuildId ?? ''}
        onSelect={overrides.onSelect ?? (() => {})}
        onDeleted={overrides.onDeleted}
      />
    </StoreContext.Provider>
  )
}

function preloadBuild(buildStore: Store, id: string, name: string) {
  buildStore.setRow('builds', id, {
    id,
    datasetId: 'ds1',
    name,
    createdAt: '2026-01-01',
  })
}

describe('BuildSelector', () => {
  it('renders one button per build for the dataset', () => {
    const stores = makeStores()
    preloadBuild(stores.buildStore, 'b1', 'Alpha')
    preloadBuild(stores.buildStore, 'b2', 'Beta')
    renderSelector(stores)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('clicking a build button calls onSelect with that id', () => {
    const stores = makeStores()
    preloadBuild(stores.buildStore, 'b1', 'Alpha')
    const onSelect = vi.fn()
    renderSelector(stores, { onSelect })
    fireEvent.click(screen.getByText('Alpha'))
    expect(onSelect).toHaveBeenCalledWith('b1')
  })

  it('the New build button creates a new build and selects it', () => {
    const stores = makeStores()
    const onSelect = vi.fn()
    renderSelector(stores, { onSelect })
    fireEvent.click(screen.getByText(/New Build/i))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(stores.buildStore.getRowIds('builds')).toHaveLength(1)
  })

  it('renames a build via the rename menu and Enter key', async () => {
    const stores = makeStores()
    preloadBuild(stores.buildStore, 'b1', 'Alpha')
    renderSelector(stores)
    const splitToggle = document.querySelectorAll(
      'button.p-splitbutton-menubutton'
    )[0] as HTMLElement
    fireEvent.click(splitToggle)
    const renameItem = await screen.findByText('Rename')
    fireEvent.click(renameItem)
    // The label is replaced by an InputText auto-focused with the current name.
    const input = document.querySelector('input.p-inputtext') as HTMLInputElement
    expect(input.value).toBe('Alpha')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(stores.buildStore.getCell('builds', 'b1', 'name')).toBe('Renamed')
  })

  it('clones a build and selects the new id', async () => {
    const stores = makeStores()
    preloadBuild(stores.buildStore, 'b1', 'Alpha')
    const onSelect = vi.fn()
    renderSelector(stores, { onSelect })
    const splitToggle = document.querySelectorAll(
      'button.p-splitbutton-menubutton'
    )[0] as HTMLElement
    fireEvent.click(splitToggle)
    const cloneItem = await screen.findByText('Clone')
    fireEvent.click(cloneItem)
    expect(onSelect).toHaveBeenCalled()
    expect(stores.buildStore.getRowIds('builds').length).toBe(2)
  })

  it('opens a confirm dialog and deletes the build when confirmed', async () => {
    const stores = makeStores()
    preloadBuild(stores.buildStore, 'b1', 'Alpha')
    const onDeleted = vi.fn()
    renderSelector(stores, { onDeleted })
    // Open the SplitButton menu and click delete. The split toggle is the
    // second button in the SplitButton group.
    const splitToggle = document.querySelectorAll(
      'button.p-splitbutton-menubutton'
    )[0] as HTMLElement
    fireEvent.click(splitToggle)
    const deleteItem = await screen.findByText('Delete')
    fireEvent.click(deleteItem)
    // Confirm in the dialog (look for the danger-styled Delete button by icon)
    const confirmBtn = await waitFor(() => {
      const btns = Array.from(document.body.querySelectorAll('button.p-button-danger'))
      expect(btns.length).toBeGreaterThan(0)
      return btns[0] as HTMLElement
    })
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('b1'))
    expect(stores.buildStore.hasRow('builds', 'b1')).toBe(false)
  })
})
