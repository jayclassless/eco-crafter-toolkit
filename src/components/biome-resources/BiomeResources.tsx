import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { NavBar } from '@/components/common/NavBar'
import { AboutDialog } from '@/components/settings/AboutDialog'
import { CustomEntitiesDialog } from '@/components/settings/datasets/CustomEntitiesDialog'
import { DatasetsDialog } from '@/components/settings/datasets/DatasetsDialog'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { useStores } from '@/stores/providers'

import { BelowSurfaceCard } from './BelowSurfaceCard'
import { BIOME_ATLAS, BIOME_KEYS } from './biome-atlas'
import { BiomeHeader } from './BiomeHeader'
import { BiomeResourcesFooter } from './BiomeResourcesFooter'
import { BiomeSelector } from './BiomeSelector'
import { FloraFaunaCard } from './FloraFaunaCard'

// Static reference page describing the Eco v13 default world: what each biome
// offers above and below ground. Dataset-scoped (no build) — the data is
// bundled, not part of any dataset; the :datasetId only anchors the NavBar.
export function BiomeResources() {
  const { datasetId } = useParams<{ datasetId: string }>()
  const navigate = useNavigate()
  const { gameDataStore, uiStore } = useStores()

  const [selectedBiome, setSelectedBiome] = useState(BIOME_KEYS[0])
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

  const biome = BIOME_ATLAS.biomes[selectedBiome]

  return (
    <div className="flex flex-column h-screen">
      <NavBar
        tool="resources"
        datasetId={datasetId}
        onOpenSettings={() => setSettingsVisible(true)}
      >
        <BiomeSelector selected={selectedBiome} onSelect={setSelectedBiome} />
      </NavBar>

      <div className="flex-1 overflow-auto p-3">
        <div className="mx-auto" style={{ maxWidth: '75rem' }}>
          <BiomeHeader biome={biome} />
          <div className="grid">
            <div className="col-12 lg:col-6">
              <BelowSurfaceCard biome={biome} />
            </div>
            <div className="col-12 lg:col-6">
              <FloraFaunaCard biome={biome} />
            </div>
          </div>
          <BiomeResourcesFooter />
        </div>
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
          navigate(`/${id}/resources`)
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
