import { Button } from 'primereact/button'
import { memo } from 'react'
import type { Store } from 'tinybase'

import { ItemIcon } from '@/components/common/ItemIcon'
import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'
import type { ProductParent } from '@/hooks/use-products'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

interface Props {
  parent: ProductParent
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onOpenRecipe: (recipeId: string) => void
}

// Parent name cell. In avg mode — or when no price has resolved yet — the
// name is plain text (no single producer to route to). Otherwise it's a link
// that opens the winning recipe's dialog, with the winner read from the
// signal's recipeId snapshot.
export const ProductParentName = memo(function ProductParentName({
  parent,
  userPriceId,
  buildStore,
  signal,
  onOpenRecipe,
}: Props) {
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const cost = usePriceCell(signal, parent.primaryProductId, 'costPrice')

  const icon = parent.primaryProductRawName ? (
    <ItemIcon item={{ name: parent.primaryProductRawName }} />
  ) : null

  if (mode === 'avg' || cost === null) {
    return (
      <div className="flex align-items-center gap-2">
        {icon}
        <span className="font-bold text-left">{parent.primaryProductName}</span>
      </div>
    )
  }

  return (
    <div className="flex align-items-center gap-2">
      {icon}
      <Button
        label={parent.primaryProductName}
        link
        className="p-0 font-bold"
        pt={{ label: { style: { textAlign: 'left' } } }}
        onClick={() => {
          const winner = signal.getRecipeIdFor(parent.primaryProductId)
          if (winner) onOpenRecipe(winner)
        }}
      />
    </div>
  )
})
