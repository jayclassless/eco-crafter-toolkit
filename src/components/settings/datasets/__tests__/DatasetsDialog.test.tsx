import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'
import type { DatasetManifest } from '@/types/dataset-manifest'

import { DatasetsDialog } from '../DatasetsDialog'

import '@/i18n'

const manifest: DatasetManifest = {
  datasets: [
    {
      id: 'eco-v13',
      name: 'Eco v13.0.2',
      file: 'eco-v13.json',
      revision: 1,
      updatedAt: '2026-04-22',
      default: true,
    },
    {
      id: 'eco-v12',
      name: 'Eco v12.0.7',
      file: 'eco-v12.json',
      revision: 1,
      updatedAt: '2026-04-21',
    },
  ],
}

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async () => {},
  } as unknown as IndexedDbPersister
}

function makeStores(
  opts: { withLoadedV13?: boolean; withLoadedV12?: boolean; buildsForV13?: number } = {}
) {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  if (opts.withLoadedV13) {
    gameDataStore.setRow('datasets', 'ds-random-1', {
      id: 'ds-random-1',
      name: 'Eco v13.0.2',
      version: 1,
      bundledId: 'eco-v13',
      installedRevision: 1,
      importedAt: '2026-04-22',
      updatedAt: '2026-04-22',
      isCustom: false,
    })
    for (let i = 0; i < (opts.buildsForV13 ?? 0); i++) {
      buildStore.setRow('builds', `b${i}`, {
        id: `b${i}`,
        datasetId: 'ds-random-1',
        name: `Build ${i}`,
        createdAt: '2026-01-01',
      })
    }
  }
  if (opts.withLoadedV12) {
    gameDataStore.setRow('datasets', 'ds-random-2', {
      id: 'ds-random-2',
      name: 'Eco v12.0.7',
      version: 1,
      bundledId: 'eco-v12',
      installedRevision: 1,
      importedAt: '2026-04-21',
      updatedAt: '2026-04-21',
      isCustom: false,
    })
  }

  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store },
  opts: { activeDatasetId?: string; onSwitch?: (id: string) => void } = {}
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
      <DatasetsDialog
        visible={true}
        onHide={() => {}}
        activeDatasetId={opts.activeDatasetId ?? ''}
        onSwitch={opts.onSwitch ?? (() => {})}
      />
    </StoreContext.Provider>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('datasets-manifest.json')) {
        return { ok: true, json: async () => manifest } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DatasetsDialog', () => {
  it('renders one row per manifest entry with names and updatedAt', async () => {
    renderDialog(makeStores())
    await waitFor(() => expect(screen.getByText('Eco v13.0.2')).toBeInTheDocument())
    expect(screen.getByText('Eco v12.0.7')).toBeInTheDocument()
    expect(screen.getByText('2026-04-22')).toBeInTheDocument()
    expect(screen.getByText('2026-04-21')).toBeInTheDocument()
  })

  it('shows Download for unloaded datasets and Delete for loaded ones', async () => {
    renderDialog(makeStores({ withLoadedV13: true }))
    await waitFor(() => expect(screen.getByText('Eco v13.0.2')).toBeInTheDocument())

    const v13Row = screen.getByText('Eco v13.0.2').closest('tr')!
    const v12Row = screen.getByText('Eco v12.0.7').closest('tr')!
    expect(within(v13Row).getByRole('button', { name: /delete/i })).toBeInTheDocument()
    expect(within(v12Row).getByRole('button', { name: /download/i })).toBeInTheDocument()
  })

  it('shows the build count for loaded datasets and a dash for unloaded ones', async () => {
    renderDialog(makeStores({ withLoadedV13: true, buildsForV13: 3 }))
    await waitFor(() => expect(screen.getByText('Eco v13.0.2')).toBeInTheDocument())

    const v13Row = screen.getByText('Eco v13.0.2').closest('tr')!
    const v12Row = screen.getByText('Eco v12.0.7').closest('tr')!
    expect(within(v13Row).getByText('3')).toBeInTheDocument()
    expect(within(v12Row).getByText('—')).toBeInTheDocument()
  })

  it('shows a retry button when the manifest fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response)
    )
    renderDialog(makeStores())
    await waitFor(() =>
      expect(screen.getByText(/could not load dataset list/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('opens the delete confirmation when Delete is clicked', async () => {
    renderDialog(makeStores({ withLoadedV13: true, buildsForV13: 2 }))
    await waitFor(() => expect(screen.getByText('Eco v13.0.2')).toBeInTheDocument())

    const v13Row = screen.getByText('Eco v13.0.2').closest('tr')!
    fireEvent.click(within(v13Row).getByRole('button', { name: /delete/i }))

    expect(screen.getByText('Delete dataset?')).toBeInTheDocument()
    expect(
      screen.getByText(/2 builds tied to this dataset will also be deleted/i)
    ).toBeInTheDocument()
  })

  it('marks the active dataset with a badge and hides its Switch button', async () => {
    renderDialog(makeStores({ withLoadedV13: true, withLoadedV12: true }), {
      activeDatasetId: 'ds-random-1',
    })
    await waitFor(() => expect(screen.getByText('Eco v13.0.2')).toBeInTheDocument())

    const v13Row = screen.getByText('Eco v13.0.2').closest('tr')!
    const v12Row = screen.getByText('Eco v12.0.7').closest('tr')!
    expect(within(v13Row).getByText('Active')).toBeInTheDocument()
    expect(within(v13Row).queryByRole('button', { name: /switch/i })).not.toBeInTheDocument()
    expect(within(v12Row).queryByText('Active')).not.toBeInTheDocument()
    expect(within(v12Row).getByRole('button', { name: /switch/i })).toBeInTheDocument()
  })

  it('calls onSwitch with the loaded datasetId when Switch is clicked', async () => {
    const onSwitch = vi.fn()
    renderDialog(makeStores({ withLoadedV13: true, withLoadedV12: true }), {
      activeDatasetId: 'ds-random-1',
      onSwitch,
    })
    await waitFor(() => expect(screen.getByText('Eco v12.0.7')).toBeInTheDocument())

    const v12Row = screen.getByText('Eco v12.0.7').closest('tr')!
    fireEvent.click(within(v12Row).getByRole('button', { name: /switch/i }))
    expect(onSwitch).toHaveBeenCalledWith('ds-random-2')
  })
})
