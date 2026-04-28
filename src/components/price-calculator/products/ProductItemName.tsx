import { Button } from 'primereact/button'
import { memo } from 'react'
import type { Store } from 'tinybase'

import { ItemIcon } from '@/components/common/ItemIcon'
import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

interface Props {
  itemId: string
  displayName: string
  rawName: string
  isCustom?: boolean
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onOpenRecipe: (recipeId: string) => void
  bold?: boolean
}

// Product name cell that resolves the solver's winning recipe via the price
// signal's recipeId snapshot. In `avg` mode — or when no price has resolved
// yet — there is no single producer to route to, so the name is rendered as
// plain (non-clickable) text.
export const ProductItemName = memo(function ProductItemName({
  itemId,
  displayName,
  rawName,
  isCustom,
  userPriceId,
  buildStore,
  signal,
  onOpenRecipe,
  bold,
}: Props) {
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const cost = usePriceCell(signal, itemId, 'costPrice')

  const icon = rawName || isCustom ? <ItemIcon item={{ name: rawName, isCustom }} /> : null
  const boldClass = bold ? ' font-bold' : ''

  if (mode === 'avg' || cost === null) {
    return (
      <div className="flex align-items-center gap-2">
        {icon}
        <span className={`text-left${boldClass}`}>{displayName}</span>
      </div>
    )
  }

  return (
    <div className="flex align-items-center gap-2">
      {icon}
      <Button
        label={displayName}
        link
        className={`p-0${boldClass}`}
        pt={{ label: { style: { textAlign: 'left' } } }}
        onClick={() => {
          const winner = signal.getRecipeIdFor(itemId)
          if (winner) onOpenRecipe(winner)
        }}
      />
    </div>
  )
})
