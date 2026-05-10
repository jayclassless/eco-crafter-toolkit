import { Toast } from 'primereact/toast'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { AboutDialog } from '@/components/settings/AboutDialog'
import { DatasetsDialog } from '@/components/settings/datasets/DatasetsDialog'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { useIsTablet } from '@/hooks/use-is-tablet'
import { usePriceSolver } from '@/hooks/use-price-solver'
import { usePriceSignal } from '@/hooks/use-prices-signal'
import { useSolverSnapshot } from '@/hooks/use-solver-snapshot'
import { useStores } from '@/stores/providers'

import { ConfigPanel } from './build-options/ConfigPanel'
import { ConfigPanelDrawer } from './build-options/ConfigPanelDrawer'
import { Materials } from './materials/Materials'
import { NavBar } from './NavBar'
import { Products } from './products/Products'

export function PriceCalculator() {
  const { datasetId, buildId } = useParams<{ datasetId: string; buildId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { gameDataStore, buildStore, uiStore } = useStores()
  const { result, recalculate } = usePriceSolver()
  const { buildSnapshot } = useSolverSnapshot()
  const solverToastRef = useRef<Toast>(null)
  // Signature of the last error set we surfaced; lets the effect skip re-
  // toasting when the solver re-runs and produces the same errors. Using a
  // ref (not state) because changing it must not trigger another render.
  const lastErrorSignatureRef = useRef<string>('')
  // Holds the latest computed prices in an out-of-React store. ProductsImpl
  // and Materials' PriceCells subscribe individually, so solver results
  // update only the cells whose price actually changed — the Products
  // DataTable never re-renders on a new solver result.
  const priceSignal = usePriceSignal()

  const [settingsVisible, setSettingsVisible] = useState(false)
  const [datasetsDialogVisible, setDatasetsDialogVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false)
  const isTablet = useIsTablet()

  // Auto-close the drawer when crossing back to the desktop breakpoint
  // (e.g. iPad rotation, window resize) so it doesn't reopen unexpectedly
  // the next time the viewport shrinks.
  useEffect(() => {
    if (!isTablet) setConfigDrawerVisible(false)
  }, [isTablet])

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

  // Surface non-convergent solver errors as a toast. `unresolved` errors are
  // intentionally NOT toasted — recipes whose ingredients haven't been priced
  // yet are the default state of the app (users price materials over time),
  // so toasting them would be constant noise. Non-convergence means the math
  // is unstable and the displayed prices are suspect, which is genuinely
  // worth interrupting for. Dedup by a signature of the offending recipe ids
  // so the same error set across solver re-runs doesn't re-toast on every
  // unrelated edit.
  useEffect(() => {
    const nonConvergent = (result?.errors ?? []).filter((e) => e.code === 'non-convergent')
    const signature = nonConvergent
      .map((e) => e.recipeId)
      .sort()
      .join('|')
    if (signature === lastErrorSignatureRef.current) return
    lastErrorSignatureRef.current = signature
    solverToastRef.current?.clear()
    if (nonConvergent.length === 0) return

    solverToastRef.current?.show({
      severity: 'error',
      summary: t('priceCalculator.solverError.nonConvergentSummary'),
      detail: t('priceCalculator.solverError.nonConvergentDetail', {
        count: nonConvergent.length,
      }),
      sticky: true,
      closable: true,
    })
  }, [result, t])

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
        onOpenConfig={isTablet ? () => setConfigDrawerVisible(true) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        {!isTablet && (
          <div className="col-3">
            <ConfigPanel buildId={buildId} datasetId={datasetId} />
          </div>
        )}
        <div
          className={`${isTablet ? 'col-5' : 'col-4'} p-3 flex flex-column`}
          style={{ minHeight: 0 }}
        >
          <Materials buildId={buildId} datasetId={datasetId} priceSignal={priceSignal} />
        </div>
        <div
          className={`${isTablet ? 'col-7' : 'col-5'} p-3 flex flex-column`}
          style={{ minHeight: 0 }}
        >
          <Products buildId={buildId} datasetId={datasetId} priceSignal={priceSignal} />
        </div>
      </div>
      <ConfigPanelDrawer
        visible={configDrawerVisible}
        onHide={() => setConfigDrawerVisible(false)}
        buildId={buildId}
        datasetId={datasetId}
      />
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
      <Toast ref={solverToastRef} position="top-right" />
    </div>
  )
}
