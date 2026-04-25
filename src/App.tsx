import { useEffect } from 'react'
import { HashRouter } from 'react-router-dom'

import { AppRoutes } from '@/components/routing/AppRoutes'
import { ThemeProvider } from '@/components/settings/ThemeProvider'
import { markFirstRenderReady } from '@/lib/app-ready'
import { markLoaderMilestone } from '@/lib/loader-progress'
import { StoreProvider } from '@/stores/providers'

function AppInner() {
  // StoreProvider gates rendering on a populated game-data store, so by the
  // time AppInner mounts the app has real content to show. Hand off the
  // splash loader's firstRender gate now.
  useEffect(() => {
    markFirstRenderReady()
    markLoaderMilestone('firstRender')
  }, [])

  return <AppRoutes />
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
