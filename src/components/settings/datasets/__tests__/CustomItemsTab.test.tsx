import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { CustomItemsTab } from '../CustomItemsTab'

import '@/i18n'

const DS = 'ds1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  gameDataStore.setRow('datasets', DS, {
    id: DS,
    name: 'Test',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-04-01',
    updatedAt: '2026-04-01',
    isCustom: false,
  })
  // A standard item — used to exercise duplicate-name detection.
  gameDataStore.setRow('items', 'item-wood', {
    datasetId: DS,
    name: 'Wood',
    isTag: false,
    isPart: false,
    isCustom: false,
  })
  return { gameDataStore, buildStore, uiStore }
}

function renderTab(stores: ReturnType<typeof makeStores>) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <CustomItemsTab datasetId={DS} />
    </StoreContext.Provider>
  )
}

const customItemIdsIn = (store: Store): string[] =>
  store.getRowIds('items').filter((id) => store.getCell('items', id, 'isCustom') === true)

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await deleteDb()
})

afterEach(async () => {
  await __resetLocalizedNameStore()
})

describe('CustomItemsTab', () => {
  it('shows the empty-state message when no custom items exist', () => {
    renderTab(makeStores())
    expect(screen.getByText(/no custom items yet/i)).toBeInTheDocument()
  })

  it('adds a new item via the input + button', async () => {
    const stores = makeStores()
    renderTab(stores)

    fireEvent.change(screen.getByPlaceholderText(/new item name/i), {
      target: { value: 'Test Ore' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(customItemIdsIn(stores.gameDataStore)).toHaveLength(1))
    expect(screen.getByText('Test Ore')).toBeInTheDocument()
  })

  it('rejects a name that duplicates an existing item in the dataset', async () => {
    const stores = makeStores()
    renderTab(stores)

    fireEvent.change(screen.getByPlaceholderText(/new item name/i), {
      target: { value: 'Wood' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(screen.getByText(/already exists in this dataset/i)).toBeInTheDocument()
    )
    expect(customItemIdsIn(stores.gameDataStore)).toHaveLength(0)
  })

  it('renames an item via the rename dialog', async () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('items', 'custom-1', {
      datasetId: DS,
      name: 'Old Name',
      isTag: false,
      isPart: false,
      isCustom: true,
    })
    renderTab(stores)

    // Click pencil button on the row.
    const pencil = document.querySelector('button .pi.pi-pencil')!.closest('button')!
    fireEvent.click(pencil)

    // The rename dialog opens with the input prefilled.
    const input = await screen.findByDisplayValue('Old Name')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(stores.gameDataStore.getCell('items', 'custom-1', 'name')).toBe('New Name')
    )
  })

  it('disables the trash button when the item is referenced by a recipe', () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('items', 'custom-1', {
      datasetId: DS,
      name: 'In Use',
      isTag: false,
      isPart: false,
      isCustom: true,
    })
    stores.gameDataStore.setRow('recipeElements', 're-1', {
      datasetId: DS,
      recipeId: 'r-1',
      itemOrTagId: 'custom-1',
      baseQuantity: -1,
      isProduct: false,
      index: 0,
    })
    renderTab(stores)

    const trashButton = document
      .querySelector('button .pi.pi-trash')!
      .closest('button') as HTMLButtonElement
    expect(trashButton).toBeDisabled()
  })

  it('deletes an unreferenced item after the user confirms', async () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('items', 'custom-1', {
      datasetId: DS,
      name: 'Disposable',
      isTag: false,
      isPart: false,
      isCustom: true,
    })
    renderTab(stores)

    const trashButton = document
      .querySelector('button .pi.pi-trash')!
      .closest('button') as HTMLButtonElement
    expect(trashButton).not.toBeDisabled()
    fireEvent.click(trashButton)

    // Confirm dialog appears.
    expect(screen.getByText(/delete custom item\?/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(stores.gameDataStore.hasRow('items', 'custom-1')).toBe(false))
  })
})
