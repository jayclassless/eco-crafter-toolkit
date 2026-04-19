import { Button } from 'primereact/button'
import { OverlayPanel } from 'primereact/overlaypanel'
import { RadioButton } from 'primereact/radiobutton'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'
import type { PriceMode } from '@/types/solver'

const MODE_ICON: Record<PriceMode, string> = {
  manual: 'pi pi-pencil',
  min: 'pi pi-sort-amount-down',
  max: 'pi pi-sort-amount-up',
  avg: 'pi pi-calculator',
  mirror: 'pi pi-link',
}

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
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const activeMode: PriceMode = modes.includes(mode) ? mode : modes[0]

  return (
    <>
      <Button
        icon={MODE_ICON[activeMode]}
        text
        size="small"
        aria-label={t('priceCalculator.materials.priceMode.label')}
        tooltip={t('priceCalculator.materials.priceMode.modeTooltip', {
          mode: t(`priceCalculator.materials.priceMode.${activeMode}`),
        })}
        tooltipOptions={{ position: 'top' }}
        onClick={(e) => op.current?.toggle(e)}
        style={{ width: '1rem', minWidth: '1rem', padding: 0 }}
      />
      <OverlayPanel ref={op}>
        <div className="flex flex-column gap-2">
          {modes.map((m) => {
            const inputId = `${inputIdPrefix}-${userPriceId || entityId}-${m}`
            return (
              <div key={m} className="flex align-items-center gap-2">
                <RadioButton
                  inputId={inputId}
                  checked={activeMode === m}
                  onChange={() => {
                    onSelectMode(entityId, m, userPriceId)
                    op.current?.hide()
                  }}
                />
                <label htmlFor={inputId} className="text-sm cursor-pointer">
                  <i className={`${MODE_ICON[m]} mr-2`} />
                  {t(`priceCalculator.materials.priceMode.${m}`)}
                </label>
              </div>
            )
          })}
        </div>
      </OverlayPanel>
    </>
  )
})
