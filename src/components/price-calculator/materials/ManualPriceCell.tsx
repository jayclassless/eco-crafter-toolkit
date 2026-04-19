import { memo } from 'react'
import type { Store } from 'tinybase'

import { PriceField } from '@/components/common/PriceField'
import { useCellValue } from '@/hooks/use-store-revision'

interface Props {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  onChange: (itemOrTagId: string, userPriceId: string, value: number | null) => void
}

// The price cell subscribes directly to its own `userPrices` row cell, so an
// edit to one price only re-renders the one InputNumber — the DataTable, the
// view-model, and every other row are untouched. Memoized so unchanged cells
// also bail out when the parent re-renders for unrelated reasons (e.g.
// filtering).
export const ManualPriceCell = memo(function ManualPriceCell({
  itemOrTagId,
  userPriceId,
  buildStore,
  onChange,
}: Props) {
  const price = useCellValue<number>(buildStore, 'userPrices', userPriceId, 'price')
  // An unset price row collapses to null so the InputNumber shows the
  // placeholder rather than "0".
  const value = price && price > 0 ? price : null
  return <PriceField value={value} onChange={(v) => onChange(itemOrTagId, userPriceId, v)} />
})
