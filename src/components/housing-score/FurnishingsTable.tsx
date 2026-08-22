import { Column } from 'primereact/column'
import { DataTable, type DataTableSortEvent } from 'primereact/datatable'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useTableVirtualScroll } from '@/hooks/use-table-virtual-scroll'

import type { FurnishingRow, FurnishingSortField, HousingSortDir } from './housing-types'
import { HousingItemCell } from './HousingItemCell'
import { RoomCategoryLabel } from './RoomCategoryLabel'
import { SkillCell } from './SkillCell'

// Every row must render at EXACTLY this height — the virtual scroller places
// rows at index × itemSize, so drift desyncs rows from the scrollbar. The
// skill column can wrap to two lines on multi-skill items, which sets the
// floor here.
const ROW_REM_HEIGHT = 3.6

const CELL_STYLE = {
  height: `${ROW_REM_HEIGHT}rem`,
  paddingTop: 0,
  paddingBottom: 0,
} as const

interface Props {
  rows: FurnishingRow[]
  sortField: FurnishingSortField
  sortDir: HousingSortDir
  onSortChange: (field: FurnishingSortField, dir: HousingSortDir) => void
  emptyMessage: string
}

function FurnishingsTableImpl({ rows, sortField, sortDir, onSortChange, emptyMessage }: Props) {
  const { t } = useTranslation()
  const { formatNumber, formatPercent } = useLocalization()
  const virtualScrollerOptions = useTableVirtualScroll(rows.length, ROW_REM_HEIGHT)

  const onSort = (e: DataTableSortEvent) => {
    onSortChange(
      (e.sortField as FurnishingSortField) ?? sortField,
      e.sortOrder === -1 ? 'desc' : 'asc'
    )
  }

  return (
    <DataTable
      value={rows}
      dataKey="itemId"
      size="small"
      scrollable
      scrollHeight="flex"
      // Fixed layout pins the columns to the widths below. With the default
      // auto layout the browser re-measures from whatever rows are currently
      // mounted, so the virtual scroller swapping its row window mid-scroll
      // makes the columns visibly jump.
      tableStyle={{ tableLayout: 'fixed', width: '100%' }}
      virtualScrollerOptions={virtualScrollerOptions}
      emptyMessage={emptyMessage}
      // `lazy` is load-bearing, not an optimization: it makes PrimeReact hand
      // `value` through untouched instead of re-sorting it internally, so the
      // always-ascending secondary name sort in housing-sort.ts survives.
      // Drop it and the table still works and still sorts — the tie-break just
      // silently disappears. FurnishingsTable.test.tsx guards this.
      lazy
      sortField={sortField}
      sortOrder={sortDir === 'desc' ? -1 : 1}
      onSort={onSort}
    >
      <Column
        sortable
        field="name"
        header={t('housingScore.columns.item')}
        bodyStyle={CELL_STYLE}
        body={(row: FurnishingRow) => <HousingItemCell name={row.name} rawName={row.rawName} />}
      />
      <Column
        sortable
        field="category"
        header={t('housingScore.columns.category')}
        style={{ width: '11rem' }}
        bodyStyle={CELL_STYLE}
        body={(row: FurnishingRow) => (
          <RoomCategoryLabel displayName={row.categoryDisplayName} color={row.categoryColor} />
        )}
      />
      <Column
        sortable
        field="type"
        header={t('housingScore.columns.type')}
        style={{ width: '10rem' }}
        bodyStyle={CELL_STYLE}
        body={(row: FurnishingRow) =>
          row.typeForRoomLimit || (
            <span className="text-color-secondary">{t('housingScore.none')}</span>
          )
        }
      />
      <Column
        sortable
        field="baseValue"
        header={t('housingScore.columns.baseValue')}
        headerClassName="p-align-right"
        style={{ width: '7rem' }}
        bodyStyle={{ ...CELL_STYLE, textAlign: 'right' }}
        body={(row: FurnishingRow) => formatNumber(row.baseValue)}
      />
      <Column
        sortable
        field="repeatReduction"
        header={t('housingScore.columns.repeatReduction')}
        headerClassName="p-align-right"
        style={{ width: '9rem' }}
        bodyStyle={{ ...CELL_STYLE, textAlign: 'right' }}
        body={(row: FurnishingRow) =>
          row.repeatReduction == null ? (
            <span className="text-color-secondary">{t('housingScore.none')}</span>
          ) : (
            formatPercent(-row.repeatReduction)
          )
        }
      />
      <Column
        sortable
        field="skill"
        header={t('housingScore.columns.skill')}
        style={{ width: '14rem' }}
        bodyStyle={CELL_STYLE}
        body={(row: FurnishingRow) => (
          <SkillCell skillNames={row.skillNames} skillRawNames={row.skillRawNames} />
        )}
      />
    </DataTable>
  )
}

export const FurnishingsTable = memo(FurnishingsTableImpl)
