import { memo } from 'react'

import { ItemIcon } from '@/components/common/ItemIcon'

interface Props {
  name: string
  /** Raw game name — the key ItemIcon uses to load the sprite. */
  rawName: string
}

// Icon + localized name, shared by both housing tables.
//
// Memoized because sorting reorders the *same* row objects rather than
// rebuilding them, so on a re-sort every cell's props are unchanged and the
// whole subtree (including the icon's image load) can bail out.
function HousingItemCellImpl({ name, rawName }: Props) {
  return (
    <div className="flex align-items-center gap-2">
      {rawName && <ItemIcon item={{ name: rawName }} />}
      <span>{name}</span>
    </div>
  )
}

export const HousingItemCell = memo(HousingItemCellImpl)
