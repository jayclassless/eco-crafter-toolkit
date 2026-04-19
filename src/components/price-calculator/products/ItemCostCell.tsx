import { memo } from 'react'

import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'

interface Props {
  signal: PriceSignal
  itemId: string
}

// Item-keyed price cell — used for flat (single-recipe) rows and the
// aggregated parent price.
export const ItemCostCell = memo(function ItemCostCell({ signal, itemId }: Props) {
  const value = usePriceCell(signal, itemId, 'costPrice')
  return <span className="text-right block">{value != null ? value.toFixed(2) : '-'}</span>
})
