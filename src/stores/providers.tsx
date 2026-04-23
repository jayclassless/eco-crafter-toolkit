import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

import { markStoresReady } from '@/lib/app-ready'

import { createPersistedBuildStore } from './build-store'
import { createPersistedGameDataStore } from './game-data-store'
import { loadIndex } from './localized-name-store'
import { createPersistedUIStore } from './ui-store'

interface StoreContextValue {
  gameDataStore: Store
  buildStore: Store
  uiStore: Store
  gameDataPersister: IndexedDbPersister
  buildPersister: IndexedDbPersister
  uiPersister: IndexedDbPersister
}

export const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<StoreContextValue | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const [gameData, build, ui] = await Promise.all([
        createPersistedGameDataStore(),
        createPersistedBuildStore(),
        createPersistedUIStore(),
      ])

      // Warm the localized-name cache for the dataset the app will show first.
      // Without this, every component that calls `useLocalizedName` kicks off
      // its own async IDB read after mount and renders empty names until it
      // lands. Prefetching into the module cache lets `useLocalizedName`
      // initialize synchronously on first render. A miss (stale uiStore id,
      // or no datasets yet) is harmless — the hook will still load on demand.
      const activeDatasetId =
        (ui.store.getCell('uiState', 'main', 'activeDatasetId') as string) ||
        gameData.store.getRowIds('datasets')[0]
      if (activeDatasetId) {
        try {
          await loadIndex(activeDatasetId, 'en-US')
        } catch {
          // Non-fatal: fall back to the hook's on-mount load path.
        }
      }

      if (!cancelled) {
        const value: StoreContextValue = {
          gameDataStore: gameData.store,
          buildStore: build.store,
          uiStore: ui.store,
          gameDataPersister: gameData.persister,
          buildPersister: build.persister,
          uiPersister: ui.persister,
        }
        setStores(value)
        if (typeof window !== 'undefined') {
          ;(window as unknown as { __stores: unknown }).__stores = value
        }
        markStoresReady()
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  if (!stores) return null

  return <StoreContext.Provider value={stores}>{children}</StoreContext.Provider>
}

export function useStores(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStores must be used within StoreProvider')
  return ctx
}
