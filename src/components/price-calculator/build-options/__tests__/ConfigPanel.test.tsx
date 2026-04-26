import { render } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { ConfigPanel } from '../ConfigPanel'

import '@/i18n'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(): { gameDataStore: Store; buildStore: Store; uiStore: Store } {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  buildStore.setRow('builds', 'b1', {
    id: 'b1',
    datasetId: 'ds1',
    name: 'B',
    createdAt: '2026-01-01',
  })
  return { gameDataStore, buildStore, uiStore }
}

describe('ConfigPanel', () => {
  it('renders without errors', () => {
    const stores = makeStores()
    const { container } = render(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        <ConfigPanel buildId="b1" datasetId="ds1" />
      </StoreContext.Provider>
    )
    // Three sub-panels mount (Skills, Crafting Tables, Options); at minimum
    // two PrimeReact Panel containers are rendered (OptionsPanel doesn't use
    // a Panel wrapper).
    expect(container.querySelectorAll('.p-panel').length).toBeGreaterThanOrEqual(2)
  })
})
