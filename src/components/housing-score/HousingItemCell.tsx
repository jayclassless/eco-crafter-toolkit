import { memo, type ReactNode } from 'react'

import { ItemIcon } from '@/components/common/ItemIcon'

interface Props {
  name: string
  /** Raw game name — the key ItemIcon uses to load the sprite. */
  rawName: string
  /** Optional adornment pinned after the name, on the same line — the
   * optimizer's alternatives badge. Sits inside this flex row rather than
   * beside the cell so a long name wraps against the badge instead of pushing
   * it out of the fixed-width column. */
  trailing?: ReactNode
}

// Icon + localized name, shared by both housing tables.
//
// Memoized because sorting reorders the *same* row objects rather than
// rebuilding them, so on a re-sort every cell's props are unchanged and the
// whole subtree (including the icon's image load) can bail out. The furnishings
// browser passes no `trailing`, so that bail-out survives — only the optimizer,
// which never re-sorts, hands in a fresh node per render.
function HousingItemCellImpl({ name, rawName, trailing }: Props) {
  return (
    <div className="flex align-items-center gap-2">
      {rawName && <ItemIcon item={{ name: rawName }} />}
      <span>{name}</span>
      {trailing}
    </div>
  )
}

export const HousingItemCell = memo(HousingItemCellImpl)
