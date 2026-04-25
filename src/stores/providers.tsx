import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

import { defaultLocale } from '@/i18n/config'
import { markFirstRenderReady, markStoresReady, markThemeReady } from '@/lib/app-ready'
import { autoImportDefaultDataset } from '@/lib/auto-import-default-dataset'
import { markLoaderMilestone } from '@/lib/loader-progress'

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
  const [initError, setInitError] = useState<string | null>(null)

  // Dev StrictMode runs the init effect twice with separate store instances
  // backing the same IndexedDB. If both runs execute, the second instance
  // races the first and may load empty (before the first instance's writes
  // flush) — so the app renders against an empty store and shows a blank
  // page. Gating with a ref ensures only the first mount initializes; the
  // setStores call on the live instance updates the rendered view. Refs
  // persist across StrictMode's simulated unmount, so the second mount
  // short-circuits cleanly.
  const didInitRef = useRef(false)

  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true

    async function init() {
      try {
        markLoaderMilestone('storeProviderMounted')

        // Each persister announces its own completion so the loader bar
        // advances at three discrete points instead of one big jump after
        // Promise.all. The gameData store dominates total time (~3.9 MB from
        // IDB), so giving it its own milestone is what makes the bar feel
        // honest rather than stalling at "stores: 0/1".
        const buildPromise = createPersistedBuildStore()
        const uiPromise = createPersistedUIStore()
        void Promise.all([buildPromise, uiPromise]).then(() => {
          markLoaderMilestone('persistersSmall')
        })

        // First-launch path: when the persisted gameData store loads empty,
        // fetch the manifest and import the dataset marked `default`. We fold
        // the import into the same milestone as the persister load so the
        // splash loader's wall-clock estimator drives the bar through both
        // phases without a second loading screen.
        const gameDataPromise = createPersistedGameDataStore().then(async (s) => {
          if (s.store.getRowIds('datasets').length === 0) {
            await autoImportDefaultDataset(s.store)
          }
          markLoaderMilestone('persisterGameData')
          return s
        })

        const [gameData, build, ui] = await Promise.all([gameDataPromise, buildPromise, uiPromise])

        // Warm the localized-name cache for the dataset the app will show first.
        // Without this, every component that calls `useLocalizedName` kicks off
        // its own async IDB read after mount and renders empty names until it
        // lands. Prefetching into the module cache lets `useLocalizedName`
        // initialize synchronously on first render. A miss (stale uiStore id)
        // is harmless — the hook will still load on demand.
        const activeDatasetId =
          (ui.store.getCell('uiState', 'main', 'activeDatasetId') as string) ||
          gameData.store.getRowIds('datasets')[0]
        if (activeDatasetId) {
          try {
            await loadIndex(activeDatasetId, defaultLocale)
          } catch {
            // Non-fatal: fall back to the hook's on-mount load path.
          }
        }
        markLoaderMilestone('localizedNames')

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
      } catch (err) {
        setInitError(err instanceof Error ? err.message : String(err))
      }
    }

    init()
  }, [])

  if (initError) return <InitError message={initError} />
  if (!stores) return null

  return <StoreContext.Provider value={stores}>{children}</StoreContext.Provider>
}

function InitError({ message }: { message: string }) {
  const { t } = useTranslation()

  // Force the splash to reveal so the error UI is visible. Stores never
  // initialized, so the normal stores-gate hand-off won't fire on its own.
  useEffect(() => {
    markStoresReady()
    markThemeReady()
    markFirstRenderReady()
  }, [])

  return (
    <div
      className="flex flex-column align-items-center justify-content-center gap-3 p-4"
      style={{ minHeight: '80vh', maxWidth: '600px', margin: '0 auto' }}
    >
      <h2>{t('dataset.autoImport.errorTitle')}</h2>
      <Message severity="error" text={message} className="w-full" />
      <Button
        label={t('dataset.autoImport.retry')}
        icon="pi pi-refresh"
        onClick={() => window.location.reload()}
      />
    </div>
  )
}

export function useStores(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStores must be used within StoreProvider')
  return ctx
}
