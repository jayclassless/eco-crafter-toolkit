import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'
import type { ManifestEntry } from '@/types/dataset-manifest'

import { DownloadDatasetButton } from '../DownloadDatasetButton'
import { UpdateDatasetButton } from '../UpdateDatasetButton'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async () => {},
  } as unknown as IndexedDbPersister
}

function makeStores() {
  return {
    gameDataStore: createGameDataStore(),
    buildStore: createBuildStore(),
    uiStore: createUIStore(),
  }
}

function renderWith(stores: ReturnType<typeof makeStores>, ui: React.ReactNode) {
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

const v1Entry: ManifestEntry = {
  id: 'eco-v13',
  name: 'Eco v13',
  file: 'eco-v13.json',
  revision: 1,
  updatedAt: '2026-04-01',
}

const minimalDataset = () =>
  ({
    Version: 1,
    Skills: [],
    Items: [],
    Tags: [],
    Recipes: [],
  }) as unknown as object

function stubFetch(ok: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      json: async () => minimalDataset(),
    }))
  )
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DownloadDatasetButton', () => {
  it('imports the dataset on click', async () => {
    stubFetch(true)
    const stores = makeStores()
    renderWith(stores, <DownloadDatasetButton entry={v1Entry} onError={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /download/i }))
    await waitFor(() => {
      expect(stores.gameDataStore.getRowIds('datasets')).toHaveLength(1)
    })
  })

  it('calls onError when the import fails', async () => {
    stubFetch(false)
    const stores = makeStores()
    const onError = vi.fn()
    renderWith(stores, <DownloadDatasetButton entry={v1Entry} onError={onError} />)
    fireEvent.click(screen.getByRole('button', { name: /download/i }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Eco v13'))
  })
})

describe('UpdateDatasetButton', () => {
  function makeStoresWithInstall() {
    const stores = makeStores()
    stores.gameDataStore.setRow('datasets', 'ds-old', {
      id: 'ds-old',
      name: 'Eco v13',
      version: 1,
      bundledId: 'eco-v13',
      installedRevision: 0,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: false,
    })
    return stores
  }

  it('calls onSuccess after a successful update', async () => {
    stubFetch(true)
    const stores = makeStoresWithInstall()
    const onSuccess = vi.fn()
    renderWith(
      stores,
      <UpdateDatasetButton entry={v1Entry} onSuccess={onSuccess} onError={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /update/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Eco v13', 1))
  })

  it('calls onError when the update fails', async () => {
    stubFetch(false)
    const stores = makeStoresWithInstall()
    const onError = vi.fn()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWith(
      stores,
      <UpdateDatasetButton entry={v1Entry} onSuccess={() => {}} onError={onError} />
    )
    fireEvent.click(screen.getByRole('button', { name: /update/i }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Eco v13'))
    errSpy.mockRestore()
  })
})
