import { memo } from 'react'
import type { Store } from 'tinybase'

import { ManualPriceCell } from '@/components/price-calculator/materials/ManualPriceCell'
import { useCellValue } from '@/hooks/use-store-revision'

interface Props {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  isTag: boolean
  isProduced: boolean
  unitPrice: number | null
  onChange: (itemOrTagId: string, userPriceId: string, value: number | null) => void
}

// Mirrors the Materials-list rules: items produced by some build recipe are
// solver-owned (read-only); tags are editable only when their priceMode is
// 'manual'; everything else falls through to an editable ManualPriceCell.
export const IngredientPriceCell = memo(function IngredientPriceCell({
  itemOrTagId,
  userPriceId,
  buildStore,
  isTag,
  isProduced,
  unitPrice,
  onChange,
}: Props) {
  // Called unconditionally to keep hook order stable; harmless when the row
  // is non-tag or has no userPrices row yet (useCellValue returns null).
  const priceMode = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')

  const readOnly = isProduced || (isTag && priceMode !== 'manual')
  if (readOnly) {
    // Mirror the `.p-inputtext` box model (see ComputedPriceCell) so read-only
    // rows are the same height as rows rendering an editable PriceField.
    return (
      <div
        className="text-right"
        style={{
          width: '5.5rem',
          padding: '0.75rem 0',
          border: '1px solid transparent',
          boxSizing: 'border-box',
          fontSize: '1rem',
          lineHeight: 1.2,
        }}
      >
        {unitPrice != null ? unitPrice.toFixed(2) : '-'}
      </div>
    )
  }

  return (
    <div style={{ width: '5.5rem' }}>
      <ManualPriceCell
        itemOrTagId={itemOrTagId}
        userPriceId={userPriceId}
        buildStore={buildStore}
        onChange={onChange}
      />
    </div>
  )
})
