import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { type PriceSignal } from '@/hooks/use-prices-signal'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

import { ComputedPriceCell } from './ComputedPriceCell'
import { ManualPriceCell } from './ManualPriceCell'

interface Props {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onPriceChange: (itemOrTagId: string, userPriceId: string, value: number | null) => void
}

// Subscribes to the tag's `priceMode` cell so switching mode re-renders only
// this cell — not the DataTable or the view-model. The mode picker itself
// lives in the row's actions menu (see RowActionsMenu); this cell only
// renders the price input or computed value.
export const TagPriceCell = memo(function TagPriceCell({
  itemOrTagId,
  userPriceId,
  buildStore,
  signal,
  onPriceChange,
}: Props) {
  const { t } = useTranslation()
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'

  return (
    <div className="flex align-items-center justify-content-end">
      {mode === 'manual' ? (
        <div style={{ width: '5.5rem' }}>
          <ManualPriceCell
            itemOrTagId={itemOrTagId}
            userPriceId={userPriceId}
            buildStore={buildStore}
            onChange={onPriceChange}
          />
        </div>
      ) : (
        <ComputedPriceCell
          itemOrTagId={itemOrTagId}
          signal={signal}
          showIcon
          iconTooltip={t('priceCalculator.materials.calculatedFromTagTooltip')}
        />
      )}
    </div>
  )
})
