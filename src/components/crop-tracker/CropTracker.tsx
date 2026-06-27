import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { NavBar } from '@/components/common/NavBar'
import { NumericField } from '@/components/common/NumericField'
import { AboutDialog } from '@/components/settings/AboutDialog'
import { CustomEntitiesDialog } from '@/components/settings/datasets/CustomEntitiesDialog'
import { DatasetsDialog } from '@/components/settings/datasets/DatasetsDialog'
import { SettingsSidebar } from '@/components/settings/SettingsSidebar'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useNowTick } from '@/hooks/use-now-tick'
import { useSettings } from '@/hooks/use-settings'
import { useCellValue, useStoreRevision, useTableRowIdsRevision } from '@/hooks/use-store-revision'
import { useTrackActiveBuild } from '@/hooks/use-track-active-build'
import { computeHarvestDate } from '@/lib/crop-growth'
import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

import {
  type CropSortDir,
  type CropSortField,
  type SortablePlanting,
  sortPlantings,
} from './crop-sort'
import type { Crop } from './crop-tracker-types'
import { PlantingRow } from './PlantingRow'

export function CropTracker() {
  const { datasetId, buildId } = useParams<{ datasetId: string; buildId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { gameDataStore, buildStore, uiStore } = useStores()
  const { getName } = useLocalizedName(datasetId ?? '')
  const now = useNowTick()

  const [settingsVisible, setSettingsVisible] = useState(false)
  const [datasetsDialogVisible, setDatasetsDialogVisible] = useState(false)
  const [customEntitiesVisible, setCustomEntitiesVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)

  // URL is the source of truth; mirror PriceCalculator's validation.
  const datasetValid = !!datasetId && gameDataStore.hasRow('datasets', datasetId)
  const buildExists = !!buildId && buildStore.hasRow('builds', buildId)
  const buildDatasetId = buildExists
    ? (buildStore.getCell('builds', buildId, 'datasetId') as string)
    : null
  const buildValid = datasetValid && buildExists && buildDatasetId === datasetId

  // Persist last-used ids (global hints + per-dataset last-viewed build).
  useTrackActiveBuild(uiStore, datasetId, buildId, buildValid)

  // Eligible crops: items in this dataset carrying growth data. Rebuilt only
  // when the items table changes (datasets are immutable in normal use).
  const itemsRev = useStoreRevision(gameDataStore, ['items'])
  const crops = useMemo<Crop[]>(() => {
    if (!datasetId) return []
    const out: Crop[] = []
    for (const rowId of gameDataStore.getRowIds('items')) {
      const item = gameDataStore.getRow('items', rowId)
      if (item.datasetId !== datasetId) continue
      const maturity = (item.maturityAgeDays as number) ?? 0
      if (!(maturity > 0)) continue
      const rawName = item.name as string
      out.push({
        id: rowId,
        // Prefer the in-world species name ('plant'); fall back to the item name.
        name: getName('plant', rowId) || getName('item', rowId) || rawName,
        rawName,
        isTree: (item.isTree as boolean) ?? false,
        maturityAgeDays: maturity,
        postHarvestingGrowth: (item.postHarvestingGrowth as number) ?? 0,
        pickableAtPercent: (item.pickableAtPercent as number) ?? 0,
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, gameDataStore, getName, itemsRev])
  const cropsById = useMemo(() => new Map(crops.map((c) => [c.id, c])), [crops])
  // Read the latest crop map inside the sort memo via a ref so the memo can use
  // current crop data WITHOUT re-sorting merely because `cropsById` got a new
  // identity. Its identity changes whenever `getName` reloads (the localized-
  // name index resolves async), and treating that as a re-sort trigger yanked
  // rows out from under the user mid-edit — the exact thing the memo prevents.
  const cropsByIdRef = useRef(cropsById)
  cropsByIdRef.current = cropsById

  // Per-build growth-rate multiplier.
  const settings = useSettings(buildId ?? '')
  const settingsRowId = settings.getSettingsRowId()
  const growthRateModifier =
    useCellValue<number>(buildStore, 'userSettings', settingsRowId, 'growthRateModifier') ?? 1

  // Field sort preference (persisted app-wide in uiStore).
  const sortField =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'cropSortField') as CropSortField) ?? 'name'
  const sortDir =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'cropSortDir') as CropSortDir) ?? 'asc'

  // Plantings for this build, ordered by the chosen sort. We re-sort only when
  // the set of rows changes (add/remove) or the sort settings change — NOT on
  // every cell edit. Re-sorting live would yank the row out from under the user
  // the moment they pick a plant (and leave its dropdown overlay orphaned). The
  // order is computed from current cell values at each of those trigger points.
  const rowIdsRev = useTableRowIdsRevision(buildStore, ['userPlantings'])
  const plantingIds = useMemo(() => {
    if (!buildId) return []
    const rows: SortablePlanting[] = buildStore
      .getRowIds('userPlantings')
      .filter((id) => buildStore.getCell('userPlantings', id, 'buildId') === buildId)
      .map((id) => {
        const cropItemId = (buildStore.getCell('userPlantings', id, 'cropItemId') as string) ?? ''
        const plantedAt = (buildStore.getCell('userPlantings', id, 'plantedAt') as string) ?? ''
        const hasRegrown =
          (buildStore.getCell('userPlantings', id, 'hasRegrown') as boolean) ?? false
        const name = (buildStore.getCell('userPlantings', id, 'name') as string) ?? ''
        const crop = cropItemId ? cropsByIdRef.current.get(cropItemId) : undefined
        const harvest =
          crop && plantedAt
            ? computeHarvestDate(plantedAt, crop, growthRateModifier, hasRegrown)
            : null
        return {
          id,
          fieldName: name || crop?.name || '',
          plantName: crop?.name ?? '',
          plantedAtMs: plantedAt ? Date.parse(plantedAt) : null,
          harvestMs: harvest ? harvest.getTime() : null,
        }
      })
    return sortPlantings(rows, sortField, sortDir).map((r) => r.id)
    // cropsById is read via a ref (see above) so its identity changes don't
    // trigger a live re-sort; the real triggers are row add/remove and the
    // sort/growth settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId, buildStore, growthRateModifier, sortField, sortDir, rowIdsRev])

  const sortFieldOptions = useMemo(
    () => [
      { label: t('cropTracker.sortField.name'), value: 'name' },
      { label: t('cropTracker.sortField.plant'), value: 'plant' },
      { label: t('cropTracker.sortField.planted'), value: 'planted' },
      { label: t('cropTracker.sortField.harvest'), value: 'harvest' },
    ],
    [t]
  )

  const handleAddField = useCallback(() => {
    if (!buildId) return
    const id = generateId()
    buildStore.setRow('userPlantings', id, { id, buildId, cropItemId: '' })
  }, [buildId, buildStore])

  const handleRemove = useCallback(
    (plantingId: string) => buildStore.delRow('userPlantings', plantingId),
    [buildStore]
  )

  const handleBuildDeleted = useCallback(
    (deletedBuildId: string) => {
      if (deletedBuildId === buildId && datasetId) navigate(`/${datasetId}/crops`)
    },
    [buildId, datasetId, navigate]
  )

  if (!datasetId || !datasetValid) return <Navigate to="/" replace />
  if (!buildId || !buildValid) return <Navigate to={`/${datasetId}/crops`} replace />

  return (
    <div className="flex flex-column h-screen">
      <NavBar
        tool="crops"
        datasetId={datasetId}
        buildId={buildId}
        onSelectBuild={(id) => navigate(`/${datasetId}/crops/${id}`)}
        onDeletedBuild={handleBuildDeleted}
        onOpenSettings={() => setSettingsVisible(true)}
      />

      <div className="flex-1 overflow-auto p-3">
        {crops.length === 0 ? (
          <div className="text-color-secondary p-4 text-center">{t('cropTracker.empty')}</div>
        ) : (
          <div className="mx-auto" style={{ maxWidth: '60rem' }}>
            <div className="flex align-items-center justify-content-between gap-3 mb-3 flex-wrap">
              <div className="flex align-items-center gap-3 flex-wrap">
                <div
                  className="flex align-items-center gap-2"
                  title={t('cropTracker.growthRateTooltip')}
                >
                  <span className="font-semibold">{t('cropTracker.growthRate')}</span>
                  <NumericField
                    value={growthRateModifier}
                    onChange={(v) => settings.setSetting('growthRateModifier', v && v > 0 ? v : 1)}
                    min={0.1}
                    maxFractionDigits={2}
                    className="w-6rem"
                  />
                </div>
                <div className="flex align-items-center gap-2">
                  <span className="font-semibold">{t('cropTracker.sortBy')}</span>
                  <Dropdown
                    value={sortField}
                    options={sortFieldOptions}
                    onChange={(e) =>
                      uiStore.setCell('uiState', 'main', 'cropSortField', e.value as string)
                    }
                  />
                  <Button
                    icon={sortDir === 'asc' ? 'pi pi-sort-amount-up-alt' : 'pi pi-sort-amount-down'}
                    text
                    aria-label={t(
                      sortDir === 'asc' ? 'cropTracker.sortAsc' : 'cropTracker.sortDesc'
                    )}
                    title={t(sortDir === 'asc' ? 'cropTracker.sortAsc' : 'cropTracker.sortDesc')}
                    onClick={() =>
                      uiStore.setCell(
                        'uiState',
                        'main',
                        'cropSortDir',
                        sortDir === 'asc' ? 'desc' : 'asc'
                      )
                    }
                  />
                </div>
              </div>
              <Button
                label={t('cropTracker.addField')}
                icon="pi pi-plus"
                onClick={handleAddField}
              />
            </div>

            {plantingIds.map((id) => (
              <PlantingRow
                key={id}
                buildStore={buildStore}
                plantingId={id}
                crops={crops}
                cropsById={cropsById}
                growthRateModifier={growthRateModifier}
                now={now}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
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
          navigate(`/${id}/crops`)
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
