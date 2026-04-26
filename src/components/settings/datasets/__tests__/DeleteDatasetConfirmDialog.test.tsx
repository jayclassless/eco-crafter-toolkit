import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { DeleteDatasetConfirmDialog } from '../DeleteDatasetConfirmDialog'
import type { DatasetRow } from '../types'

import '@/i18n'

vi.mock('@/lib/purge-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/purge-data')>()
  return {
    ...actual,
    purgeData: vi.fn(actual.purgeData),
  }
})

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async (...actions: Array<() => Promise<unknown>>) => {
      for (const action of actions) await action()
    },
  } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  gameDataStore.setRow('datasets', 'ds-loaded', {
    id: 'ds-loaded',
    name: 'Eco v13',
    version: 1,
    bundledId: 'eco-v13',
    installedRevision: 1,
    importedAt: '2026-04-22',
    updatedAt: '2026-04-22',
    isCustom: false,
  })
  return { gameDataStore, buildStore, uiStore }
}

function makeRow(overrides: Partial<DatasetRow> = {}): DatasetRow {
  return {
    manifestId: 'eco-v13',
    name: 'Eco v13',
    updatedAt: '2026-04-22',
    loadedDatasetId: 'ds-loaded',
    isActive: false,
    buildCount: 0,
    entry: {
      id: 'eco-v13',
      name: 'Eco v13',
      file: 'eco-v13.json',
      revision: 1,
      updatedAt: '2026-04-22',
    },
    ...overrides,
  }
}

function renderDialog(opts: {
  target: DatasetRow | null
  onHide?: () => void
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
      <DeleteDatasetConfirmDialog target={opts.target} onHide={opts.onHide ?? (() => {})} />
    </StoreContext.Provider>
  )
}

describe('DeleteDatasetConfirmDialog — display', () => {
  it('hides the cascade warning when buildCount is 0', () => {
    renderDialog({ target: makeRow({ buildCount: 0 }) })
    expect(screen.queryByText(/tied to this dataset/i)).not.toBeInTheDocument()
  })

  it('shows the singular cascade warning for 1 tied build', () => {
    renderDialog({ target: makeRow({ buildCount: 1 }) })
    expect(
      screen.getByText('1 build tied to this dataset will also be deleted')
    ).toBeInTheDocument()
  })

  it('shows the plural cascade warning for multiple tied builds', () => {
    renderDialog({ target: makeRow({ buildCount: 4 }) })
    expect(
      screen.getByText('4 builds tied to this dataset will also be deleted')
    ).toBeInTheDocument()
  })
})

describe('DeleteDatasetConfirmDialog — execution', () => {
  let reloadSpy: ReturnType<typeof vi.fn>
  let originalLocation: Location

  beforeEach(() => {
    reloadSpy = vi.fn()
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy, hash: '#/foo' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('calls purgeData with the loaded datasetId then reloads on success', async () => {
    const stores = makeStores()
    renderDialog({ target: makeRow(), stores })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1))
    expect(stores.gameDataStore.getRowIds('datasets')).toEqual([])
  })

  it('keeps the dialog open and shows a toast when purgeData throws', async () => {
    const { purgeData: mockedPurgeData } = await import('@/lib/purge-data')
    ;(mockedPurgeData as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom')
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderDialog({ target: makeRow() })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(document.body.textContent ?? '').toMatch(/delete failed/i))
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('Failed to delete dataset', expect.any(Error))
    errorSpy.mockRestore()
  })
})
