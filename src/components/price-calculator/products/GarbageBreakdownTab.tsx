import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { useTranslation } from 'react-i18next'

import { ItemIcon } from '@/components/common/ItemIcon'
import { useLocalization } from '@/hooks/use-localization'

import { GarbageAmount, type GarbageAmountRow } from './GarbageAmount'

export interface GarbageBreakdownViewRow {
  key: string
  /** Null for the recipe's own explicit garbage, which has no source item. */
  source: { name: string; rawName: string; isCustom: boolean } | null
  /** Base quantity consumed. Modules and talents deliberately do not scale it. */
  sourceQuantity: number
  /** The concrete item an unpinned tag could not be narrowed to. */
  isRange: boolean
  outputs: GarbageAmountRow[]
}

interface Props {
  rows: GarbageBreakdownViewRow[]
  totals: GarbageAmountRow[]
}

/**
 * The Waste tab: where each piece of a craft's garbage comes from.
 *
 * Only rendered when the recipe produces garbage at all, so it is absent on
 * v11–v13 and on the many v14 recipes whose ingredients carry no `SalvageCost`.
 */
export function GarbageBreakdownTab({ rows, totals }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()

  const sourceTemplate = (row: GarbageBreakdownViewRow) => {
    if (!row.source) {
      return (
        <span className="text-color-secondary">{t('priceCalculator.recipe.garbageExplicit')}</span>
      )
    }
    return (
      <span className="flex align-items-center gap-2">
        <ItemIcon
          item={{ name: row.source.rawName, isCustom: row.source.isCustom }}
          alt={row.source.name}
        />
        <span>{row.source.name}</span>
        {row.isRange && (
          <span
            className="text-color-secondary"
            title={t('priceCalculator.recipe.garbageVariesTooltip', { name: row.source.name })}
          >
            ({t('priceCalculator.recipe.garbageVaries')})
          </span>
        )}
      </span>
    )
  }

  // The explicit row has no source quantity — the recipe emits it outright
  // rather than deriving it from an ingredient.
  const quantityTemplate = (row: GarbageBreakdownViewRow) =>
    row.source ? formatNumber(row.sourceQuantity, { maximumFractionDigits: 2 }) : '—'

  const outputsTemplate = (row: GarbageBreakdownViewRow) => (
    <ul className="list-none p-0 m-0 flex flex-column gap-1">
      {row.outputs.map((o) => (
        <li key={o.itemId}>
          <GarbageAmount amount={o} />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex flex-column gap-3">
      <DataTable value={rows} dataKey="key" size="small">
        <Column
          header={t('priceCalculator.recipe.garbageSource')}
          body={sourceTemplate}
          style={{ width: '45%' }}
        />
        <Column
          header={t('priceCalculator.recipe.quantity')}
          body={quantityTemplate}
          style={{ width: '10%' }}
        />
        <Column
          header={t('priceCalculator.recipe.garbageProduced')}
          body={outputsTemplate}
          style={{ width: '45%' }}
        />
      </DataTable>
      <div className="surface-border pt-3">
        <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.totalCost')}</h4>
        <ul className="list-none p-0 m-0 flex flex-column gap-2 ml-3">
          {totals.map((o) => (
            <li key={o.itemId}>
              <GarbageAmount amount={o} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
