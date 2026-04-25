import { useEffect } from 'react'

import { PriceCalculator } from '@/components/price-calculator/PriceCalculator'
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

  return <PriceCalculator />
}

export function App() {
  return (
    <StoreProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </StoreProvider>
  )
}
