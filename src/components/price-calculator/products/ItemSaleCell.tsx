import { memo } from 'react'

import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'

interface Props {
  signal: PriceSignal
  itemId: string
}

export const ItemSaleCell = memo(function ItemSaleCell({ signal, itemId }: Props) {
  const value = usePriceCell(signal, itemId, 'salePrice')
  return <span className="text-right block">{value != null ? value.toFixed(2) : '-'}</span>
})
