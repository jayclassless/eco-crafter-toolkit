import { Button } from 'primereact/button'
import { useState, useEffect, useCallback } from 'react'

import { DatasetSetup } from '@/components/dataset/DatasetSetup'
import { ImportView } from '@/components/import/ImportView'
import { PriceCalculator } from '@/components/price-calculator/PriceCalculator'
import { ThemeProvider } from '@/components/settings/ThemeProvider'
import { markFirstRenderReady } from '@/lib/app-ready'
import { StoreProvider, useStores } from '@/stores/providers'

type View = 'main' | 'import'

function AppInner() {
  const { gameDataStore } = useStores()
  const [hasDatasets, setHasDatasets] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('main')

  const checkDatasets = useCallback(() => {
    const rowIds = gameDataStore.getRowIds('datasets')
    setHasDatasets(rowIds.length > 0)
  }, [gameDataStore])

  useEffect(() => {
    checkDatasets()
  }, [checkDatasets])

  // Signal app-ready once real content is about to paint. Firing on the
  // transition from `hasDatasets === null` (the transient blank state)
  // ensures the loader stays up through that beat.
  useEffect(() => {
    if (hasDatasets !== null) {
      markFirstRenderReady()
    }
  }, [hasDatasets])

  if (view === 'import') {
    return (
      <ImportView
        onDone={() => {
          checkDatasets()
          setView('main')
        }}
      />
    )
  }

  if (hasDatasets === null) return null
  if (!hasDatasets) {
    return (
      <>
        <DatasetSetup onComplete={checkDatasets} />
        <div className="flex justify-content-center mt-3">
          <Button
            label="Import Dataset"
            icon="pi pi-upload"
            text
            onClick={() => setView('import')}
          />
        </div>
      </>
    )
  }

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
