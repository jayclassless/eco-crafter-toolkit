import { memo } from 'react'

interface Props {
  displayName: string
  /** '#RRGGBB', or ''. Not every category has a color, so the empty case is
   * expected and falls back to the default text color. */
  color: string
}

// The room category, tinted with the color the game itself uses for it.
// Memoized for the same reason as HousingItemCell.
function RoomCategoryLabelImpl({ displayName, color }: Props) {
  return <span style={color ? { color } : undefined}>{displayName}</span>
}

export const RoomCategoryLabel = memo(RoomCategoryLabelImpl)
