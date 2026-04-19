import { Checkbox } from 'primereact/checkbox'
import { memo } from 'react'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

interface Props {
  parentTagId: string
  parentUserPriceId: string
  childItemId: string
  buildStore: Store
  onSelect: (parentTagId: string, childItemId: string, parentUserPriceId: string) => void
}

// Shown on child rows when the parent tag's mode is 'mirror'. Subscribes to
// the parent tag's `priceMode` and `primaryItemId` so changes on either
// re-render only this checkbox.
export const MirrorCheckbox = memo(function MirrorCheckbox({
  parentTagId,
  parentUserPriceId,
  childItemId,
  buildStore,
  onSelect,
}: Props) {
  const storedMode = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'priceMode')
  const mode: PriceMode = ((storedMode ?? 'min') as PriceMode) || 'min'
  const primary = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'primaryItemId')

  if (mode !== 'mirror') return null
  return (
    <Checkbox
      checked={primary === childItemId}
      onChange={() => onSelect(parentTagId, childItemId, parentUserPriceId)}
    />
  )
})
