import * as Sentry from '@sentry/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toast } from 'primereact/toast'
import { createRef } from 'react'
import type { Store } from 'tinybase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { createUIStore } from '@/stores/ui-store'
import type { ManifestEntry } from '@/types/dataset-manifest'

import type { AvailableUpdate } from '../find-available-updates'
import { showUpdateToast } from '../update-toast'

import '@/i18n'

const v2Entry: ManifestEntry = {
  id: 'eco-vtest',
  name: 'Eco vTest',
  file: 'eco-vtest.json',
  revision: 2,
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

function makeStores(installedRevision: number) {
  const gameDataStore = createGameDataStore()
  gameDataStore.setRow('datasets', 'ds-old', {
    id: 'ds-old',
    name: 'Eco v13',
    version: 1,
    bundledId: 'eco-vtest',
    installedRevision,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
  return {
    gameDataStore: gameDataStore as Store,
    buildStore: createBuildStore() as Store,
    uiStore: createUIStore() as Store,
  }
}

function makeUpdate(_stores: ReturnType<typeof makeStores>): AvailableUpdate {
  return {
    entry: v2Entry,
    datasetId: 'ds-old',
    installedRevision: 1,
    availableRevision: 2,
  }
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('showUpdateToast', () => {
  it('renders an update prompt with the locally-installed dataset name', async () => {
    const stores = makeStores(1)
    const ref = createRef<Toast>()
    render(<Toast ref={ref} />)
    // PrimeReact Toast.show() triggers an internal setState; wrap to keep
    // React's act() warnings quiet.
    act(() => {
      showUpdateToast(ref, makeUpdate(stores), stores, (key) => key)
    })
    // The toast detail interpolates `{name}` which equals the locally-stored
    // dataset row's name ("Eco v13"), not the manifest name.
    expect(
      await screen.findByText((text) => text.includes('Eco v13 has a newer revision'))
    ).toBeInTheDocument()
  })

  it('clicking the Update button kicks off applyDatasetUpdate and shows a success toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => minimalDataset() }))
    )
    const stores = makeStores(1)
    const ref = createRef<Toast>()
    render(<Toast ref={ref} />)
    act(() => {
      showUpdateToast(ref, makeUpdate(stores), stores, (key) => key)
    })
    const updateBtn = await screen.findByRole('button', { name: /Update Now/i })
    fireEvent.click(updateBtn)
    await waitFor(() => {
      expect(stores.gameDataStore.hasRow('datasets', 'ds-old')).toBe(false)
    })
  })

  it('clicking Update when the import fails surfaces an error toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    )
    const stores = makeStores(1)
    const ref = createRef<Toast>()
    render(<Toast ref={ref} />)
    act(() => {
      showUpdateToast(ref, makeUpdate(stores), stores, (key) => key)
    })
    const updateBtn = await screen.findByRole('button', { name: /Update Now/i })
    fireEvent.click(updateBtn)
    await waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.anything())
    })
  })
})
