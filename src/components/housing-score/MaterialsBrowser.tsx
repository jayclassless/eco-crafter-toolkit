import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useCellValue, useStoreRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

import { buildMaterialRows, buildRoomTierMap } from './housing-data'
import { sortMaterials } from './housing-sort'
import type { HousingSortDir, MaterialSortField } from './housing-types'
import { MaterialsTable } from './MaterialsTable'

interface Props {
  datasetId: string
}

// Building materials browser: the blocks a room can be built from, with the
// soft/hard housing-value caps their tier imposes on that room.
export function MaterialsBrowser({ datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, uiStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()

  const sortField =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'housingMaterialSortField') as
      | MaterialSortField
      | undefined) ?? 'tier'
  const sortDir =
    (useCellValue<string>(uiStore, 'uiState', 'main', 'housingMaterialSortDir') as
      | HousingSortDir
      | undefined) ?? 'asc'

  const rev = useStoreRevision(gameDataStore, ['items', 'roomTiers', 'recipes'])

  const tiers = useMemo(
    () => buildRoomTierMap(gameDataStore, datasetId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, rev]
  )
  const allRows = useMemo(
    () => buildMaterialRows(gameDataStore, datasetId, getName, tiers, compare),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, datasetId, getName, tiers, compare, rev]
  )
  const rows = useMemo(
    () => sortMaterials(allRows, sortField, sortDir, compare),
    [allRows, sortField, sortDir, compare]
  )

  const onSortChange = useCallback(
    (nextField: MaterialSortField, nextDir: HousingSortDir) => {
      uiStore.transaction(() => {
        uiStore.setCell('uiState', 'main', 'housingMaterialSortField', nextField)
        uiStore.setCell('uiState', 'main', 'housingMaterialSortDir', nextDir)
      })
    },
    [uiStore]
  )

  if (allRows.length === 0) {
    return <div className="text-color-secondary p-4 text-center">{t('housingScore.empty')}</div>
  }

  return (
    <div className="flex flex-column flex-1" style={{ minHeight: 0 }}>
      <MaterialsTable
        rows={rows}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={onSortChange}
        emptyMessage={t('housingScore.emptyFiltered')}
      />
    </div>
  )
}
