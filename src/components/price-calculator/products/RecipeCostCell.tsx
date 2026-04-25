import { memo } from 'react'

import { useLocalization } from '@/hooks/use-localization'
import { useRecipePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'

interface Props {
  signal: PriceSignal
  recipeId: string
}

// Recipe-keyed price cell — used for child rows under a multi-recipe group
// so each child shows its own producer's cost.
export const RecipeCostCell = memo(function RecipeCostCell({ signal, recipeId }: Props) {
  const value = useRecipePriceCell(signal, recipeId, 'costPrice')
  const { formatPrice } = useLocalization()
  return <span className="text-right block">{value != null ? formatPrice(value) : '-'}</span>
})
