import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'
import type { ManifestEntry } from '@/types/dataset-manifest'

import { DatasetActionsMenu } from '../DatasetActionsMenu'
import type { DatasetRow } from '../types'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

const baseEntry: ManifestEntry = {
  id: 'eco-v13',
  name: 'Eco v13.0.2',
  file: 'eco-v13.json',
  revision: 1,
  updatedAt: '2026-04-22',
}

function makeRow(overrides: Partial<DatasetRow> = {}): DatasetRow {
  return {
    manifestId: 'eco-v13',
    name: 'Eco v13.0.2',
    updatedAt: '2026-04-22',
    loadedDatasetId: 'ds-random-1',
    isActive: false,
    buildCount: 0,
    customItemCount: 0,
    customRecipeCount: 0,
    entry: baseEntry,
    ...overrides,
  }
}

function renderMenu(
  row: DatasetRow,
  callbacks: Partial<React.ComponentProps<typeof DatasetActionsMenu>> = {}
) {
  const stores = {
    gameDataStore: createGameDataStore(),
    buildStore: createBuildStore(),
    uiStore: createUIStore(),
  }
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <DatasetActionsMenu
        row={row}
        onSwitch={callbacks.onSwitch ?? (() => {})}
        onManageCustom={callbacks.onManageCustom ?? (() => {})}
        onDelete={callbacks.onDelete ?? (() => {})}
        onDownloadError={callbacks.onDownloadError ?? (() => {})}
        onUpdateError={callbacks.onUpdateError ?? (() => {})}
        onUpdateSuccess={callbacks.onUpdateSuccess ?? (() => {})}
      />
    </StoreContext.Provider>
  )
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /dataset actions/i }))

// PrimeReact's popup Menu wraps items in a `display: none` overlay until the
// CSSTransition's `entered` callback runs; in jsdom the layout is never
// hidden by display so the items ARE in the DOM, but RTL's role queries
// filter them out as inaccessible. Querying by text bypasses that.
const findItem = (re: RegExp) =>
  waitFor(() => {
    const links = Array.from(document.querySelectorAll('a.p-menuitem-link'))
    const link = links.find((el) => re.test(el.textContent ?? ''))
    if (!link) throw new Error(`menu item matching ${re} not found`)
    return link as HTMLElement
  })

const queryItem = (re: RegExp): HTMLElement | null => {
  const links = Array.from(document.querySelectorAll('a.p-menuitem-link'))
  return (links.find((el) => re.test(el.textContent ?? '')) as HTMLElement) ?? null
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response)
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DatasetActionsMenu', () => {
  it('not-installed row exposes only Download', async () => {
    renderMenu(makeRow({ loadedDatasetId: null }))
    openMenu()
    expect(await findItem(/download/i)).toBeInTheDocument()
    expect(queryItem(/delete/i)).toBeNull()
    expect(queryItem(/switch/i)).toBeNull()
    expect(queryItem(/custom recipes\/items/i)).toBeNull()
  })

  it('installed-non-active row exposes Manage, Switch, and Delete', async () => {
    renderMenu(makeRow({ isActive: false }))
    openMenu()
    expect(await findItem(/custom recipes\/items/i)).toBeInTheDocument()
    expect(queryItem(/switch/i)).not.toBeNull()
    expect(queryItem(/delete/i)).not.toBeNull()
    // No Update Now menu item without availableRevision.
    expect(queryItem(/update now/i)).toBeNull()
  })

  it('hides Switch on the active dataset', async () => {
    renderMenu(makeRow({ isActive: true }))
    openMenu()
    expect(await findItem(/delete/i)).toBeInTheDocument()
    expect(queryItem(/switch/i)).toBeNull()
  })

  it('shows Update Now when an availableRevision is set', async () => {
    renderMenu(makeRow({ availableRevision: 5 }))
    openMenu()
    expect(await findItem(/update now/i)).toBeInTheDocument()
  })

  it('Switch menu item invokes onSwitch with the loaded dataset id', async () => {
    const onSwitch = vi.fn()
    renderMenu(makeRow({ loadedDatasetId: 'ds-x' }), { onSwitch })
    openMenu()
    fireEvent.click(await findItem(/switch/i))
    expect(onSwitch).toHaveBeenCalledWith('ds-x')
  })

  it('Manage menu item invokes onManageCustom with the row', async () => {
    const onManageCustom = vi.fn()
    const row = makeRow({ loadedDatasetId: 'ds-x' })
    renderMenu(row, { onManageCustom })
    openMenu()
    fireEvent.click(await findItem(/custom recipes\/items/i))
    expect(onManageCustom).toHaveBeenCalledWith(row)
  })

  it('Delete menu item invokes onDelete with the row', async () => {
    const onDelete = vi.fn()
    const row = makeRow()
    renderMenu(row, { onDelete })
    openMenu()
    fireEvent.click(await findItem(/delete/i))
    expect(onDelete).toHaveBeenCalledWith(row)
  })

  it('Download menu item triggers an import and reports errors via onDownloadError', async () => {
    const onDownloadError = vi.fn()
    renderMenu(makeRow({ loadedDatasetId: null }), { onDownloadError })
    openMenu()
    fireEvent.click(await findItem(/download/i))
    // Stub fetch returns ok:false so the download fails — the error callback
    // should fire with the dataset's display name and the underlying error.
    await waitFor(() =>
      expect(onDownloadError).toHaveBeenCalledWith('Eco v13.0.2', expect.any(Error))
    )
  })

  it('outside click closes the menu', async () => {
    renderMenu(makeRow())
    openMenu()
    expect(await findItem(/delete/i)).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(queryItem(/delete/i)).toBeNull())
  })
})
