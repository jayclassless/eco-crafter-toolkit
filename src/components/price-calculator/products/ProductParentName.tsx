import { memo } from 'react'
import type { Store } from 'tinybase'

import { ProductItemName } from '@/components/price-calculator/products/ProductItemName'
import type { PriceSignal } from '@/hooks/use-prices-signal'
import type { ProductParent } from '@/hooks/use-products'

interface Props {
  parent: ProductParent
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onOpenRecipe: (recipeId: string) => void
}

export const ProductParentName = memo(function ProductParentName({
  parent,
  userPriceId,
  buildStore,
  signal,
  onOpenRecipe,
}: Props) {
  return (
    <ProductItemName
      itemId={parent.primaryProductId}
      displayName={parent.primaryProductName}
      rawName={parent.primaryProductRawName}
      userPriceId={userPriceId}
      buildStore={buildStore}
      signal={signal}
      onOpenRecipe={onOpenRecipe}
      bold
    />
  )
})
