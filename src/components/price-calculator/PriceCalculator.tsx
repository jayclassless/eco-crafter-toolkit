import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { AboutDialog } from '@/components/settings/AboutDialog'
import { DatasetsDialog } from '@/components/settings/datasets/DatasetsDialog'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { usePriceSolver } from '@/hooks/use-price-solver'
import { usePriceSignal } from '@/hooks/use-prices-signal'
import { useSolverSnapshot } from '@/hooks/use-solver-snapshot'
import { useStores } from '@/stores/providers'

import { ConfigPanel } from './build-options/ConfigPanel'
import { Materials } from './materials/Materials'
import { NavBar } from './NavBar'
import { Products } from './products/Products'

export function PriceCalculator() {
  const { datasetId, buildId } = useParams<{ datasetId: string; buildId: string }>()
  const navigate = useNavigate()
  const { gameDataStore, buildStore, uiStore } = useStores()
  const { result, recalculate } = usePriceSolver()
  const { buildSnapshot } = useSolverSnapshot()
  // Holds the latest computed prices in an out-of-React store. ProductsImpl
  // and Materials' PriceCells subscribe individually, so solver results
  // update only the cells whose price actually changed — the Products
  // DataTable never re-renders on a new solver result.
  const priceSignal = usePriceSignal()

  const [settingsVisible, setSettingsVisible] = useState(false)
  const [datasetsDialogVisible, setDatasetsDialogVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)

  // URL is the source of truth. Stale or hand-edited segments are caught
  // here and redirected; the BuildRedirect / RootRedirect routes pick
  // sensible defaults from there.
  const datasetValid = !!datasetId && gameDataStore.hasRow('datasets', datasetId)
  const buildExists = !!buildId && buildStore.hasRow('builds', buildId)
  const buildDatasetId = buildExists
    ? (buildStore.getCell('builds', buildId, 'datasetId') as string)
    : null
  const buildValid = datasetValid && buildExists && buildDatasetId === datasetId

  // Persist last-used ids. RootRedirect uses activeDatasetId to pick a
  // landing page next visit; purge-data clears activeBuildId when its
  // build is deleted (src/lib/purge-data.ts).
  useEffect(() => {
    if (buildValid && datasetId) {
      uiStore.setCell('uiState', 'main', 'activeDatasetId', datasetId)
    }
  }, [buildValid, datasetId, uiStore])

  useEffect(() => {
    if (buildValid && buildId) {
      uiStore.setCell('uiState', 'main', 'activeBuildId', buildId)
    }
  }, [buildValid, buildId, uiStore])

  // Show the About dialog the first time the calculator renders for a valid
  // build. The flag is persisted in uiStore so subsequent visits stay quiet.
  useEffect(() => {
    if (!buildValid) return
    const seen = uiStore.getCell('uiState', 'main', 'hasSeenAboutDialog') as boolean
    if (!seen) {
      setAboutVisible(true)
      uiStore.setCell('uiState', 'main', 'hasSeenAboutDialog', true)
    }
  }, [buildValid, uiStore])

  // Trigger solver when build data changes. The snapshot build is expensive
  // (it reads thousands of rows) so we pass a thunk that `recalculate` will
  // invoke *after* its debounce window — collapsing bursts of mutations into
  // a single snapshot build off the click path.
  const triggerSolver = useCallback(() => {
    if (!buildValid || !buildId || !datasetId) return
    recalculate(() => buildSnapshot(buildId, datasetId))
  }, [buildValid, buildId, datasetId, buildSnapshot, recalculate])

  useEffect(() => {
    if (!buildValid || !buildId) return

    // Only re-run the solver on tables it actually reads. Filter-only tables
    // (`hiddenSkills`, `hiddenCraftingTables`) purely affect which Products
    // rows are shown and are intentionally excluded — a listener on them
    // would pay a full snapshot+worker roundtrip (~500ms) on every filter
    // checkbox toggle for no change in result.
    const SOLVER_TABLES = [
      'userRecipes',
      'userRecipeMargins',
      'userProductMargins',
      'userProductShares',
      'userPrices',
      'userSettings',
      'userSkills',
      'userTalents',
      'userCraftingTables',
    ]
    const listenerIds = SOLVER_TABLES.map((t) =>
      buildStore.addTableListener(t, () => triggerSolver())
    )

    // userMargins is handled granularly: only `percent` affects solver output,
    // and row adds/removes matter. Name and `isDefault` are display-only for
    // the solver, so editing a margin name must not trigger a snapshot build.
    listenerIds.push(buildStore.addRowIdsListener('userMargins', () => triggerSolver()))
    listenerIds.push(
      buildStore.addCellListener('userMargins', null, 'percent', () => triggerSolver())
    )

    // Custom recipe edits mutate game-data tables in place (the recipe row,
    // its recipeElements, and its modifiers all get rewritten by
    // updateCustomRecipe). The build store doesn't change, so without these
    // listeners the solver wouldn't re-run after a save and prices would stay
    // stale. The 200ms debounce in `usePriceSolver` collapses the burst of
    // writes inside a single transaction into one snapshot.
    const gameDataListenerIds: string[] = []
    for (const table of ['recipes', 'recipeElements', 'modifiers']) {
      gameDataListenerIds.push(gameDataStore.addTableListener(table, () => triggerSolver()))
    }

    // Initial calculation
    triggerSolver()

    return () => {
      for (const id of listenerIds) buildStore.delListener(id)
      for (const id of gameDataListenerIds) gameDataStore.delListener(id)
    }
  }, [buildValid, buildId, buildStore, gameDataStore, triggerSolver])

  const handleBuildDeleted = useCallback(
    (deletedBuildId: string) => {
      if (deletedBuildId === buildId && datasetId) {
        navigate(`/${datasetId}/calculator`)
      }
    },
    [buildId, datasetId, navigate]
  )

  // Push new solver results into the out-of-React price signal. Cells that
  // subscribe via `usePriceCell` wake up individually; no React re-render
  // cascades through PriceCalculator → Products → DataTable here. The single
  // `setAll` call batches the three namespaces into one notification sweep
  // so `subscribeAny` listeners don't fire three times per solver result.
  useEffect(() => {
    priceSignal.setAll(result?.prices ?? {}, result?.recipePrices ?? {}, result?.recipeCosts ?? {})
  }, [result, priceSignal])

  if (!datasetId || !datasetValid) return <Navigate to="/" replace />
  if (!buildId || !buildValid) return <Navigate to={`/${datasetId}/calculator`} replace />

  return (
    <div className="flex flex-column h-screen">
      <NavBar
        datasetId={datasetId}
        buildId={buildId}
        onSelectBuild={(id) => navigate(`/${datasetId}/calculator/${id}`)}
        onDeletedBuild={handleBuildDeleted}
        onOpenSettings={() => setSettingsVisible(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="col-3 overflow-y-auto p-3">
          <ConfigPanel buildId={buildId} datasetId={datasetId} />
        </div>
        <div className="col-4 p-3 flex flex-column" style={{ minHeight: 0 }}>
          <Materials buildId={buildId} datasetId={datasetId} priceSignal={priceSignal} />
        </div>
        <div className="col-5 p-3 flex flex-column" style={{ minHeight: 0 }}>
          <Products buildId={buildId} datasetId={datasetId} priceSignal={priceSignal} />
        </div>
      </div>
      <SettingsSidebar
        visible={settingsVisible}
        onHide={() => setSettingsVisible(false)}
        onOpenGameNews={() => navigate('/game-news')}
        onOpenDatasets={() => setDatasetsDialogVisible(true)}
        onOpenAbout={() => setAboutVisible(true)}
      />
      <DatasetsDialog
        visible={datasetsDialogVisible}
        onHide={() => setDatasetsDialogVisible(false)}
        activeDatasetId={datasetId}
        onSwitch={(id) => {
          setDatasetsDialogVisible(false)
          navigate(`/${id}/calculator`)
        }}
      />
      <AboutDialog visible={aboutVisible} onHide={() => setAboutVisible(false)} />
    </div>
  )
}
