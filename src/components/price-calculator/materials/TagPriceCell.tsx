import { memo } from 'react'
import type { Store } from 'tinybase'

import { PriceModeButton } from '@/components/common/PriceModeButton'
import { type PriceSignal } from '@/hooks/use-prices-signal'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

import { ComputedPriceCell } from './ComputedPriceCell'
import { ManualPriceCell } from './ManualPriceCell'

const MODE_ORDER: PriceMode[] = ['manual', 'min', 'max', 'avg', 'mirror']

interface Props {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onPriceChange: (itemOrTagId: string, userPriceId: string, value: number | null) => void
  onSelectMode: (itemOrTagId: string, mode: PriceMode, userPriceId: string) => void
}

// Subscribes to the tag's `priceMode` cell so switching mode re-renders only
// this cell — not the DataTable or the view-model.
export const TagPriceCell = memo(function TagPriceCell({
  itemOrTagId,
  userPriceId,
  buildStore,
  signal,
  onPriceChange,
  onSelectMode,
}: Props) {
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'

  return (
    <div className="flex align-items-center justify-content-end gap-1">
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
        <ComputedPriceCell itemOrTagId={itemOrTagId} signal={signal} />
      )}
      <PriceModeButton
        entityId={itemOrTagId}
        userPriceId={userPriceId}
        buildStore={buildStore}
        modes={MODE_ORDER}
        inputIdPrefix="mode"
        onSelectMode={onSelectMode}
      />
    </div>
  )
})
