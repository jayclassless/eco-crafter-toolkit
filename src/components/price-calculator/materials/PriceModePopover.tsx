import { OverlayPanel } from 'primereact/overlaypanel'
import { type RefObject, memo } from 'react'
import type { Store } from 'tinybase'

import { PriceModeList } from '@/components/common/PriceModeList'
import { useOverlayScrollDismiss } from '@/hooks/use-overlay-scroll-dismiss'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

interface Props {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  modes: PriceMode[]
  onSelect: (itemOrTagId: string, mode: PriceMode, userPriceId: string) => void
  modeOp: RefObject<OverlayPanel | null>
  parentOp: RefObject<OverlayPanel | null>
}

// The sub-popover that opens off the "Price mode" menu entry. Renders the
// shared radio list and forwards selections to the row's setter, then hides
// both the picker and its parent action menu so the row settles in one
// click.
export const PriceModePopover = memo(function PriceModePopover({
  itemOrTagId,
  userPriceId,
  buildStore,
  modes,
  onSelect,
  modeOp,
  parentOp,
}: Props) {
  const dismiss = useOverlayScrollDismiss(modeOp)
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const rawMode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const activeMode: PriceMode = modes.includes(rawMode) ? rawMode : modes[0]

  return (
    <OverlayPanel ref={modeOp} onShow={dismiss.onShow} onHide={dismiss.onHide}>
      <PriceModeList
        inputIdPrefix={`mode-${userPriceId || itemOrTagId}`}
        modes={modes}
        activeMode={activeMode}
        onSelectMode={(m) => {
          onSelect(itemOrTagId, m, userPriceId)
          modeOp.current?.hide()
          parentOp.current?.hide()
        }}
      />
    </OverlayPanel>
  )
})
