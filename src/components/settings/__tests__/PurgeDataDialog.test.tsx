import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { PurgeDataDialog } from '../PurgeDataDialog'

import '@/i18n' // initialize react-i18next

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

  gameDataStore.setRow('datasets', 'ds1', {
    id: 'ds1',
    name: 'Dataset One',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: true,
  })
  gameDataStore.setRow('datasets', 'ds2', {
    id: 'ds2',
    name: 'Dataset Two',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: true,
  })
  buildStore.setRow('builds', 'b1', {
    id: 'b1',
    datasetId: 'ds1',
    name: 'Build One',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('builds', 'b2', {
    id: 'b2',
    datasetId: 'ds2',
    name: 'Build Two',
    createdAt: '2026-01-01',
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <PurgeDataDialog visible={true} onHide={() => {}} />
    </StoreContext.Provider>
  )
}

describe('PurgeDataDialog — Phase 1 selection', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(() => {
    stores = makeStores()
  })

  it('Continue button is disabled when nothing is selected', () => {
    renderDialog(stores)
    const continueBtn = screen.getByRole('button', { name: /continue/i })
    expect(continueBtn).toBeDisabled()
  })

  it('Continue button enables after selecting a dataset', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Dataset One'))
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
  })

  it('Continue button enables when "Purge all builds" is checked', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText(/purge all builds/i))
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
  })

  it('master "select all datasets" toggles all children', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Purge all datasets'))
    expect((screen.getByLabelText('Dataset One') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Dataset Two') as HTMLInputElement).checked).toBe(true)
  })

  it('shows a tied-builds warning for a selected dataset that has builds', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Dataset One'))
    expect(
      screen.getByText(/1 build tied to this dataset will also be purged/i)
    ).toBeInTheDocument()
  })
})

describe('PurgeDataDialog — Phase 2 confirmation', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(() => {
    stores = makeStores()
  })

  it('shows a damage summary reflecting selected datasets and cascaded builds', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Dataset One'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    // Title switches to confirm title
    expect(screen.getByText(/confirm purge/i)).toBeInTheDocument()
    // Summary: 1 dataset, and 1 build (b1 was tied to ds1)
    expect(screen.getByText(/1 dataset/i)).toBeInTheDocument()
    expect(screen.getByText(/Dataset One/)).toBeInTheDocument()
    expect(screen.getByText(/1 build/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('shows both datasets and all builds when everything is selected', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Purge all datasets'))
    fireEvent.click(screen.getByLabelText(/purge all builds/i))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText(/2 datasets/i)).toBeInTheDocument()
    expect(screen.getByText(/Dataset One, Dataset Two/)).toBeInTheDocument()
    expect(screen.getByText(/2 builds/i)).toBeInTheDocument()
  })

  it('Back button returns to Phase 1 with selection preserved', () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Dataset One'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText(/confirm purge/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))

    // Back to Phase 1 — the Dataset One checkbox is still checked
    expect((screen.getByLabelText('Dataset One') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled()
  })
})

describe('PurgeDataDialog — purge execution', () => {
  let stores: ReturnType<typeof makeStores>
  let reloadSpy: ReturnType<typeof vi.fn>
  let originalLocation: Location

  beforeEach(() => {
    stores = makeStores()
    reloadSpy = vi.fn()
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('calls purgeData and reloads on successful purge', async () => {
    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Dataset One'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /^purge$/i }))

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1))

    // Dataset One rows in gameDataStore should have been deleted
    expect(stores.gameDataStore.getRowIds('datasets')).toEqual(['ds2'])
    // Build b1 (tied to ds1) should be gone
    expect(stores.buildStore.getRowIds('builds')).toEqual(['b2'])
  })

  it('keeps the dialog open and shows a toast when purgeData throws', async () => {
    const { purgeData: mockedPurgeData } = await import('@/lib/purge-data')
    ;(mockedPurgeData as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom')
    )

    renderDialog(stores)
    fireEvent.click(screen.getByLabelText('Dataset One'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /^purge$/i }))

    await waitFor(() => expect(document.body.textContent ?? '').toMatch(/purge failed/i))
    // Dialog still in Phase 2
    expect(screen.getByText(/confirm purge/i)).toBeInTheDocument()
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
