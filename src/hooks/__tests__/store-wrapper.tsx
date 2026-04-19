import type { ReactNode } from 'react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

export interface TestStores {
  buildStore: Store
  gameDataStore: Store
  uiStore: Store
}

function stubPersister(): IndexedDbPersister {
  return { save: async () => {} } as unknown as IndexedDbPersister
}

export function createTestStores(): TestStores {
  return {
    buildStore: createBuildStore(),
    gameDataStore: createGameDataStore(),
    uiStore: createUIStore(),
  }
}

export function makeWrapper(stores: TestStores) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        {children}
      </StoreContext.Provider>
    )
  }
}
