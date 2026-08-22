import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useCellValue, useStoreRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

import { FurnishingFilters } from './FurnishingFilters'
import { FurnishingsTable } from './FurnishingsTable'
import {
  applyFurnishingFilters,
  buildFurnishingRows,
  buildRoomCategoryViews,
  collectFurnishingFilterOptions,
} from './housing-data'
import { sortFurnishings } from './housing-sort'
import {
  ALL_SELECTED,
  type FurnishingFilterState,
  type FurnishingSortField,
  type HousingSortDir,
} from './housing-types'

interface Props {
  datasetId: string
}

// Furnishings browser: every item that contributes housing value, minus the
// categories that zero a room (Industrial).
export function FurnishingsBrowser({ datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, uiStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()

  // Filters are component state on purpose: their values are dataset-scoped
  // ids/names, so a persisted filter would silently hide rows (or everything)
  // after switching datasets.
  const [filters, setFilters] = useState<FurnishingFilterState>(ALL_SELECTED)

  // Sort, unlike the filters, is a stable enum and survives a dataset switch,
  // so it persists — mirroring the Crop Tracker.
  const sortField =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'housingFurnishingSortField') as
      | FurnishingSortField
      | undefined) ?? 'baseValue'
  const sortDir =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'housingFurnishingSortDir') as
      | HousingSortDir
      | undefined) ?? 'desc'

  const rev = useStoreRevision(gameDataStore, ['items', 'roomCategories', 'recipes'])

  const categories = useMemo(
    () => buildRoomCategoryViews(gameDataStore, datasetId, getName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, getName, rev]
  )
  const allRows = useMemo(
    () => buildFurnishingRows(gameDataStore, datasetId, getName, categories, compare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, getName, categories, compare, rev]
  )
  const options = useMemo(
    () => collectFurnishingFilterOptions(allRows, categories, compare),
    [allRows, categories, compare]
  )
  const rows = useMemo(
    () => sortFurnishings(applyFurnishingFilters(allRows, filters), sortField, sortDir, compare),
    [allRows, filters, sortField, sortDir, compare]
  )

  const onSortChange = useCallback(
    (nextField: FurnishingSortField, nextDir: HousingSortDir) => {
      uiStore.transaction(() => {
        uiStore.setCell('uiState', 'main', 'housingFurnishingSortField', nextField)
        uiStore.setCell('uiState', 'main', 'housingFurnishingSortDir', nextDir)
      })
    },
    [uiStore]
  )

  if (allRows.length === 0) {
    return <div className="text-color-secondary p-4 text-center">{t('housingScore.empty')}</div>
  }

  return (
    <div className="flex flex-column flex-1" style={{ minHeight: 0 }}>
      <FurnishingFilters options={options} value={filters} onChange={setFilters} />
      <FurnishingsTable
        rows={rows}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={onSortChange}
        emptyMessage={t('housingScore.emptyFiltered')}
      />
    </div>
  )
}
