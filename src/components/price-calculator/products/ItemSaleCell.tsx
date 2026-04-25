import { memo } from 'react'

import { useLocalization } from '@/hooks/use-localization'
import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'

interface Props {
  signal: PriceSignal
  itemId: string
}

export const ItemSaleCell = memo(function ItemSaleCell({ signal, itemId }: Props) {
  const value = usePriceCell(signal, itemId, 'salePrice')
  const { formatPrice } = useLocalization()
  return <span className="text-right block">{value != null ? formatPrice(value) : '-'}</span>
})
