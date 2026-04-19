import { Checkbox } from 'primereact/checkbox'
import { memo } from 'react'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

interface Props {
  parentProductId: string
  parentUserPriceId: string
  childRecipeId: string
  buildStore: Store
  onSelect: (parentProductId: string, childRecipeId: string, parentUserPriceId: string) => void
}

export const MirrorChildCheckbox = memo(function MirrorChildCheckbox({
  parentProductId,
  parentUserPriceId,
  childRecipeId,
  buildStore,
  onSelect,
}: Props) {
  const storedMode = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'priceMode')
  const mode: PriceMode = ((storedMode ?? 'min') as PriceMode) || 'min'
  const primary = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'primaryItemId')

  if (mode !== 'mirror') return null
  return (
    <Checkbox
      checked={primary === childRecipeId}
      onChange={() => onSelect(parentProductId, childRecipeId, parentUserPriceId)}
    />
  )
})
