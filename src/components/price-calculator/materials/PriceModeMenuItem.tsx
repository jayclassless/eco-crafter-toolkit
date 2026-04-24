import { Button } from 'primereact/button'
import type { OverlayPanel } from 'primereact/overlaypanel'
import { type RefObject, memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { PRICE_MODE_ICON } from '@/components/common/PriceModeList'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

interface Props {
  buildStore: Store
  userPriceId: string
  modes: PriceMode[]
  modeOp: RefObject<OverlayPanel | null>
}

// Single menu entry that shows "Price mode: {mode}" with the current mode's
// icon. Subscribes to the row's `userPrices.priceMode` cell directly so a
// mode change re-renders only this entry — not the surrounding RowActionsMenu
// or the DataTable.
export const PriceModeMenuItem = memo(function PriceModeMenuItem({
  buildStore,
  userPriceId,
  modes,
  modeOp,
}: Props) {
  const { t } = useTranslation()
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const rawMode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const activeMode: PriceMode = modes.includes(rawMode) ? rawMode : modes[0]

  return (
    <Button
      label={t('priceCalculator.materials.priceMode.modeTooltip', {
        mode: t(`priceCalculator.materials.priceMode.${activeMode}`),
      })}
      icon={PRICE_MODE_ICON[activeMode]}
      text
      size="small"
      className="w-full"
      pt={{ label: { className: 'text-left flex-1' } }}
      onClick={(e) => modeOp.current?.toggle(e)}
    />
  )
})
