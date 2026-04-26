import { Toast } from 'primereact/toast'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { HashRouter } from 'react-router-dom'

import { AppRoutes } from '@/components/routing/AppRoutes'
import { ThemeProvider } from '@/components/settings/ThemeProvider'
import { markFirstRenderReady } from '@/lib/app-ready'
import { fetchDatasetManifest } from '@/lib/fetch-manifest'
import { findAvailableUpdates } from '@/lib/find-available-updates'
import { markLoaderMilestone } from '@/lib/loader-progress'
import { showUpdateToast } from '@/lib/update-toast'
import { StoreProvider, useStores } from '@/stores/providers'

function AppInner() {
  const stores = useStores()
  const { t } = useTranslation()
  const updateToastRef = useRef<Toast>(null)

  // StoreProvider gates rendering on a populated game-data store, so by the
  // time AppInner mounts the app has real content to show. Hand off the
  // splash loader's firstRender gate now.
  useEffect(() => {
    markFirstRenderReady()
    markLoaderMilestone('firstRender')
  }, [])

  // Background-check the bundled manifest for dataset updates. Runs once on
  // mount; if the network is offline the dialog still surfaces updates the
  // next time it opens, so swallow failures here.
  useEffect(() => {
    let cancelled = false
    void fetchDatasetManifest()
      .then((manifest) => {
        if (cancelled) return
        const updates = findAvailableUpdates(manifest, stores.gameDataStore)
        for (const update of updates) {
          showUpdateToast(updateToastRef, update, stores, t)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Only run once on mount; the stores object identity is stable for the
    // app's lifetime once StoreProvider has populated it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Toast ref={updateToastRef} position="top-right" />
      <AppRoutes />
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <StoreProvider>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </StoreProvider>
    </HashRouter>
  )
}
