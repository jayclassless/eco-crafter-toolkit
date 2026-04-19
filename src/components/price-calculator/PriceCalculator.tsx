import { Button } from 'primereact/button'
import { useState, useEffect, useCallback } from 'react'

import { DatasetSelector } from '@/components/dataset/DatasetSelector'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { useBuild } from '@/hooks/use-build'
import { usePriceSolver } from '@/hooks/use-price-solver'
import { usePriceSignal } from '@/hooks/use-prices-signal'
import { useSolverSnapshot } from '@/hooks/use-solver-snapshot'
import { useStores } from '@/stores/providers'

import { BuildSelector } from './BuildSelector'
import { ConfigPanel } from './ConfigPanel'
import { Materials } from './Materials'
import { Products } from './Products'

export function PriceCalculator() {
  const { gameDataStore, buildStore, uiStore } = useStores()
  const { getBuilds, createBuild, deleteBuild } = useBuild()
  const { result, recalculate } = usePriceSolver()
  const { buildSnapshot } = useSolverSnapshot()
  // Holds the latest computed prices in an out-of-React store. ProductsImpl
  // and Materials' PriceCells subscribe individually, so solver results
  // update only the cells whose price actually changed — the Products
  // DataTable never re-renders on a new solver result.
  const priceSignal = usePriceSignal()

  const [activeDatasetId, setActiveDatasetId] = useState('')
  const [activeBuildId, setActiveBuildId] = useState('')
  const [settingsVisible, setSettingsVisible] = useState(false)

  // Initialize active dataset
  useEffect(() => {
    const stored = uiStore.getCell('uiState', 'main', 'activeDatasetId') as string
    if (stored) {
      setActiveDatasetId(stored)
    } else {
      const firstDataset = gameDataStore.getRowIds('datasets')[0]
      if (firstDataset) setActiveDatasetId(firstDataset)
    }
  }, [gameDataStore, uiStore])

  // Initialize active build when dataset changes
  useEffect(() => {
    if (!activeDatasetId) return

    const stored = uiStore.getCell('uiState', 'main', 'activeBuildId') as string
    const builds = getBuilds(activeDatasetId)

    if (stored && builds.some((b) => b.id === stored)) {
      setActiveBuildId(stored)
    } else if (builds.length > 0) {
      setActiveBuildId(builds[0].id as string)
    } else {
      const newId = createBuild(activeDatasetId, 'Build 1')
      setActiveBuildId(newId)
    }
  }, [activeDatasetId, getBuilds, createBuild, uiStore])

  // Persist selections
  useEffect(() => {
    if (activeDatasetId) uiStore.setCell('uiState', 'main', 'activeDatasetId', activeDatasetId)
  }, [activeDatasetId, uiStore])

  useEffect(() => {
    if (activeBuildId) uiStore.setCell('uiState', 'main', 'activeBuildId', activeBuildId)
  }, [activeBuildId, uiStore])

  // Trigger solver when build data changes. The snapshot build is expensive
  // (it reads thousands of rows) so we pass a thunk that `recalculate` will
  // invoke *after* its debounce window — collapsing bursts of mutations into
  // a single snapshot build off the click path.
  const triggerSolver = useCallback(() => {
    if (!activeBuildId || !activeDatasetId) return
    recalculate(() => buildSnapshot(activeBuildId, activeDatasetId))
  }, [activeBuildId, activeDatasetId, buildSnapshot, recalculate])

  useEffect(() => {
    if (!activeBuildId) return

    // Listen for any build store change and retrigger
    const listenerId = buildStore.addTablesListener(() => {
      triggerSolver()
    })

    // Initial calculation
    triggerSolver()

    return () => {
      buildStore.delListener(listenerId)
    }
  }, [activeBuildId, buildStore, triggerSolver])

  const handleDeleteBuild = useCallback(() => {
    const builds = getBuilds(activeDatasetId)
    deleteBuild(activeBuildId)
    const remaining = builds.filter((b) => b.id !== activeBuildId)
    if (remaining.length > 0) {
      setActiveBuildId(remaining[0].id as string)
    } else {
      const newId = createBuild(activeDatasetId, 'Build 1')
      setActiveBuildId(newId)
    }
  }, [activeBuildId, activeDatasetId, getBuilds, deleteBuild, createBuild])

  // Push new solver results into the out-of-React price signal. Cells that
  // subscribe via `usePriceCell` wake up individually; no React re-render
  // cascades through PriceCalculator → Products → DataTable here.
  useEffect(() => {
    priceSignal.set(result?.prices ?? {})
    priceSignal.setRecipe(result?.recipePrices ?? {})
  }, [result, priceSignal])

  if (!activeDatasetId || !activeBuildId) return null

  return (
    <div className="flex flex-column h-screen">
      <div className="flex align-items-center gap-3 p-2 surface-ground border-bottom-1 surface-border">
        <DatasetSelector activeDatasetId={activeDatasetId} onSelect={setActiveDatasetId} />
        <BuildSelector
          datasetId={activeDatasetId}
          activeBuildId={activeBuildId}
          onSelect={setActiveBuildId}
        />
        <Button
          icon="pi pi-bars"
          text
          className="ml-auto"
          onClick={() => setSettingsVisible(true)}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="col-3 overflow-y-auto p-3 border-right-1 surface-border">
          <ConfigPanel
            buildId={activeBuildId}
            datasetId={activeDatasetId}
            onDeleteBuild={handleDeleteBuild}
          />
        </div>
        <div
          className="col-4 p-3 border-right-1 surface-border flex flex-column"
          style={{ minHeight: 0 }}
        >
          <Materials
            buildId={activeBuildId}
            datasetId={activeDatasetId}
            priceSignal={priceSignal}
          />
        </div>
        <div className="col-5 p-3 flex flex-column" style={{ minHeight: 0 }}>
          <Products buildId={activeBuildId} datasetId={activeDatasetId} priceSignal={priceSignal} />
        </div>
      </div>
      <SettingsSidebar visible={settingsVisible} onHide={() => setSettingsVisible(false)} />
    </div>
  )
}
