import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { useOverlayScrollDismiss } from '@/hooks/use-overlay-scroll-dismiss'
import type { PriceMode } from '@/types/solver'

import { PriceModeMenuItem } from './PriceModeMenuItem'
import { PriceModePopover } from './PriceModePopover'

interface PriceModeAction {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  modes: PriceMode[]
  onSelect: (itemOrTagId: string, mode: PriceMode, userPriceId: string) => void
}

interface Props {
  onMoveToProducts?: () => void
  /** When provided, the menu shows a "Price mode: {mode}" entry that opens
   * a sub-picker with the same radio list `PriceModeButton` uses. */
  priceMode?: PriceModeAction
}

// Vertical-ellipsis trigger that opens a popup menu with the row's
// available actions. Mirrors the Products RowActionsMenu pattern but with
// Materials-specific actions (return-to-products, price-mode picker).
//
// Returns null when no actions apply, so callers can render this in a
// dedicated column without padding rows that have nothing to offer.
export const RowActionsMenu = memo(function RowActionsMenu({ onMoveToProducts, priceMode }: Props) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const modeOp = useRef<OverlayPanel>(null)
  const dismiss = useOverlayScrollDismiss(op)

  const hasMove = !!onMoveToProducts
  const hasMode = !!priceMode
  if (!hasMove && !hasMode) return null

  return (
    <>
      <Button
        icon="pi pi-ellipsis-v"
        text
        size="small"
        aria-label={t('priceCalculator.materials.rowActions')}
        onClick={(e) => op.current?.toggle(e)}
        style={{ width: '1rem', minWidth: '1rem', padding: 0 }}
      />
      <OverlayPanel
        ref={op}
        onShow={dismiss.onShow}
        onHide={dismiss.onHide}
        pt={{ content: { className: 'p-1' } }}
      >
        <div className="flex flex-column">
          {hasMove && (
            <Button
              label={t('priceCalculator.materials.moveToProducts')}
              icon="pi pi-list"
              text
              size="small"
              className="w-full"
              pt={{ label: { className: 'text-left flex-1' } }}
              onClick={() => {
                onMoveToProducts?.()
                op.current?.hide()
              }}
            />
          )}
          {priceMode && (
            <PriceModeMenuItem
              buildStore={priceMode.buildStore}
              userPriceId={priceMode.userPriceId}
              modes={priceMode.modes}
              modeOp={modeOp}
            />
          )}
        </div>
      </OverlayPanel>
      {priceMode && (
        <PriceModePopover
          itemOrTagId={priceMode.itemOrTagId}
          userPriceId={priceMode.userPriceId}
          buildStore={priceMode.buildStore}
          modes={priceMode.modes}
          onSelect={priceMode.onSelect}
          modeOp={modeOp}
          parentOp={op}
        />
      )}
    </>
  )
})
