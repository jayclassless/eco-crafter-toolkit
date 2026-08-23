import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { NavBar } from '@/components/common/NavBar'
import { AboutDialog } from '@/components/settings/AboutDialog'
import { CustomEntitiesDialog } from '@/components/settings/datasets/CustomEntitiesDialog'
import { DatasetsDialog } from '@/components/settings/datasets/DatasetsDialog'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { useCellValue } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

import { FurnishingsBrowser } from './FurnishingsBrowser'
import type { HousingView } from './housing-types'
import { HousingViewSelector } from './HousingViewSelector'
import { MaterialsBrowser } from './MaterialsBrowser'
import { OptimizerView } from './OptimizerView'

// Housing Score: reference browsers for the data behind Eco's housing value
// (which is XP per day for a property's residents), plus an optimizer that
// builds the best-scoring house out of them. Dataset-scoped (no build) — the
// optimizer's assumptions persist in uiStore, not per-build state.
export function HousingScore() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const navigate = useNavigate()
  const { gameDataStore, uiStore } = useStores()

  // Persisted, like the browsers' sort fields: a stable enum that stays
  // meaningful across a dataset switch, so the tool reopens where it was left.
  const view =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'housingView') as HousingView | undefined) ??
    'furnishings'
  const setView = useCallback(
    (next: HousingView) => uiStore.setCell('uiState', 'main', 'housingView', next),
    [uiStore]
  )
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [datasetsDialogVisible, setDatasetsDialogVisible] = useState(false)
  const [customEntitiesVisible, setCustomEntitiesVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)

  // URL is the source of truth; mirror the other tools' validation.
  const datasetValid = !!datasetId && gameDataStore.hasRow('datasets', datasetId)

  // Record the dataset hint only (the dataset-scoped slice of
  // useTrackActiveBuild) — this page has no build to track.
  useEffect(() => {
    if (!datasetValid || !datasetId) return
    uiStore.setCell('uiState', 'main', 'activeDatasetId', datasetId)
  }, [datasetValid, datasetId, uiStore])

  if (!datasetId || !datasetValid) return <Navigate to="/" replace />

  return (
    <div className="flex flex-column h-screen">
      <NavBar tool="housing" datasetId={datasetId} onOpenSettings={() => setSettingsVisible(true)}>
        <HousingViewSelector value={view} onChange={setView} />
      </NavBar>

      <div className="flex flex-column flex-1 p-3" style={{ minHeight: 0 }}>
        {renderHousingView(view, datasetId)}
      </div>

      <SettingsSidebar
        visible={settingsVisible}
        onHide={() => setSettingsVisible(false)}
        onOpenGameNews={() => navigate('/game-news')}
        onOpenDatasets={() => setDatasetsDialogVisible(true)}
        onOpenCustomEntities={() => setCustomEntitiesVisible(true)}
        onOpenAbout={() => setAboutVisible(true)}
      />
      <DatasetsDialog
        visible={datasetsDialogVisible}
        onHide={() => setDatasetsDialogVisible(false)}
        activeDatasetId={datasetId}
        onSwitch={(id) => {
          setDatasetsDialogVisible(false)
          navigate(`/${id}/housing`)
        }}
      />
      <CustomEntitiesDialog
        visible={customEntitiesVisible}
        onHide={() => setCustomEntitiesVisible(false)}
        datasetId={datasetId}
      />
      <AboutDialog visible={aboutVisible} onHide={() => setAboutVisible(false)} />
    </div>
  )
}

// Not a component — a plain switch, so the file still defines exactly one.
// Exhaustive over HousingView: adding a view fails to compile until handled.
function renderHousingView(view: HousingView, datasetId: string) {
  switch (view) {
    case 'furnishings':
      return <FurnishingsBrowser datasetId={datasetId} />
    case 'materials':
      return <MaterialsBrowser datasetId={datasetId} />
    case 'optimizer':
      return <OptimizerView datasetId={datasetId} />
  }
}
