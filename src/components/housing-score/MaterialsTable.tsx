import { Column } from 'primereact/column'
import { DataTable, type DataTableSortEvent } from 'primereact/datatable'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { useTableVirtualScroll } from '@/hooks/use-table-virtual-scroll'

import type { HousingSortDir, MaterialRow, MaterialSortField } from './housing-types'
import { HousingItemCell } from './HousingItemCell'
import { SkillCell } from './SkillCell'

const ROW_REM_HEIGHT = 3.6

const CELL_STYLE = {
  height: `${ROW_REM_HEIGHT}rem`,
  paddingTop: 0,
  paddingBottom: 0,
} as const

interface Props {
  rows: MaterialRow[]
  sortField: MaterialSortField
  sortDir: HousingSortDir
  onSortChange: (field: MaterialSortField, dir: HousingSortDir) => void
  emptyMessage: string
}

function MaterialsTableImpl({ rows, sortField, sortDir, onSortChange, emptyMessage }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()
  // 46 materials in every shipped dataset, so this returns undefined and the
  // table renders classically. Kept for symmetry if the set ever grows.
  const virtualScrollerOptions = useTableVirtualScroll(rows.length, ROW_REM_HEIGHT)

  const onSort = (e: DataTableSortEvent) => {
    onSortChange(
      (e.sortField as MaterialSortField) ?? sortField,
      e.sortOrder === -1 ? 'desc' : 'asc'
    )
  }

  const capBody = (value: number | null) =>
    value == null ? (
      <span className="text-color-secondary">{t('housingScore.none')}</span>
    ) : (
      formatNumber(value)
    )

  return (
    <DataTable
      value={rows}
      dataKey="itemId"
      size="small"
      scrollable
      scrollHeight="flex"
      // See FurnishingsTable: fixed layout keeps the columns from re-measuring
      // as rows scroll in and out.
      tableStyle={{ tableLayout: 'fixed', width: '100%' }}
      virtualScrollerOptions={virtualScrollerOptions}
      emptyMessage={emptyMessage}
      // See FurnishingsTable: `lazy` is what preserves our secondary sort.
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
        body={(row: MaterialRow) => <HousingItemCell name={row.name} rawName={row.rawName} />}
      />
      <Column
        sortable
        field="tier"
        header={t('housingScore.columns.tier')}
        headerClassName="p-align-right"
        style={{ width: '7rem' }}
        bodyStyle={{ ...CELL_STYLE, textAlign: 'right' }}
        body={(row: MaterialRow) => formatNumber(row.tier)}
      />
      <Column
        sortable
        field="softCap"
        header={t('housingScore.columns.softCap')}
        headerClassName="p-align-right"
        style={{ width: '10rem' }}
        bodyStyle={{ ...CELL_STYLE, textAlign: 'right' }}
        body={(row: MaterialRow) => capBody(row.softCap)}
      />
      <Column
        sortable
        field="hardCap"
        header={t('housingScore.columns.hardCap')}
        headerClassName="p-align-right"
        style={{ width: '10rem' }}
        bodyStyle={{ ...CELL_STYLE, textAlign: 'right' }}
        body={(row: MaterialRow) => capBody(row.hardCap)}
      />
      <Column
        sortable
        field="skill"
        header={t('housingScore.columns.skill')}
        style={{ width: '14rem' }}
        bodyStyle={CELL_STYLE}
        body={(row: MaterialRow) => (
          <SkillCell skillNames={row.skillNames} skillRawNames={row.skillRawNames} />
        )}
      />
    </DataTable>
  )
}

export const MaterialsTable = memo(MaterialsTableImpl)
