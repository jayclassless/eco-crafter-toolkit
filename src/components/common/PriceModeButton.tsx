import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { useOverlayScrollDismiss } from '@/hooks/use-overlay-scroll-dismiss'
import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

import { PRICE_MODE_ICON, PriceModeList } from './PriceModeList'

interface Props {
  entityId: string
  userPriceId: string
  buildStore: Store
  modes: PriceMode[]
  inputIdPrefix: string
  onSelectMode: (entityId: string, mode: PriceMode, userPriceId: string) => void
}

// Subscribes to its own `priceMode` cell so mode edits on one row only
// re-render that row's button — the DataTable and view-model are untouched.
// When the stored mode isn't in `modes` (e.g. 'manual' on a product, where
// overrides are set from the Materials list), the first allowed mode shows
// as active instead.
export const PriceModeButton = memo(function PriceModeButton({
  entityId,
  userPriceId,
  buildStore,
  modes,
  inputIdPrefix,
  onSelectMode,
}: Props) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const dismiss = useOverlayScrollDismiss(op)
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const activeMode: PriceMode = modes.includes(mode) ? mode : modes[0]

  return (
    <>
      <Button
        icon={PRICE_MODE_ICON[activeMode]}
        text
        size="small"
        aria-label={t('priceCalculator.materials.priceMode.label')}
        // Native title — see RecipeFavoriteStar for why not PrimeReact tooltip.
        title={t('priceCalculator.materials.priceMode.modeTooltip', {
          mode: t(`priceCalculator.materials.priceMode.${activeMode}`),
        })}
        onClick={(e) => op.current?.toggle(e)}
        style={{ width: '1rem', minWidth: '1rem', padding: 0 }}
      />
      <OverlayPanel ref={op} onShow={dismiss.onShow} onHide={dismiss.onHide}>
        <PriceModeList
          inputIdPrefix={`${inputIdPrefix}-${userPriceId || entityId}`}
          modes={modes}
          activeMode={activeMode}
          onSelectMode={(m) => {
            onSelectMode(entityId, m, userPriceId)
            op.current?.hide()
          }}
        />
      </OverlayPanel>
    </>
  )
})
