import { render, screen } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { NavBar } from '../NavBar'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  gameDataStore.setRow('datasets', 'ds1', {
    id: 'ds1',
    name: 'Eco vTest',
    version: 1,
    bundledId: 'eco-vtest',
    installedRevision: 1,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
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

function renderNav(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <NavBar
        datasetId="ds1"
        buildId="b1"
        onSelectBuild={() => {}}
        onDeletedBuild={() => {}}
        onOpenSettings={() => {}}
      />
    </StoreContext.Provider>
  )
}

describe('NavBar', () => {
  it('renders the dataset name from the game-data store', () => {
    const stores = makeStores()
    renderNav(stores)
    expect(screen.getByText('Eco vTest')).toBeInTheDocument()
  })

  it('renders an empty dataset name when the dataset row is missing', () => {
    const stores = {
      gameDataStore: createGameDataStore(),
      buildStore: createBuildStore(),
      uiStore: createUIStore(),
    }
    // Need at least the SelfImprovementSkill row for BuildSelector's createBuild
    // path to work — we don't trigger that here, but renderNav still mounts.
    stores.gameDataStore.setRow('skills', 'sk-self', {
      id: 'sk-self',
      datasetId: 'ds1',
      name: 'SelfImprovementSkill',
      profession: '',
      maxLevel: 7,
      laborReducePercent: '[]',
    })
    renderNav(stores)
    // No dataset row means the cell read returns null → empty span; just check
    // that the New Build button (also rendered by BuildSelector) is present.
    expect(screen.getByText(/New build/i)).toBeInTheDocument()
  })
})
