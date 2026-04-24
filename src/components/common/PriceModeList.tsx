import { RadioButton } from 'primereact/radiobutton'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import type { PriceMode } from '@/types/solver'

export const PRICE_MODE_ICON: Record<PriceMode, string> = {
  manual: 'pi pi-pencil',
  min: 'pi pi-sort-amount-down',
  max: 'pi pi-sort-amount-up',
  avg: 'pi pi-calculator',
  mirror: 'pi pi-link',
}

interface Props {
  /** Domain id used for radio input id namespacing — keeps inputs unique
   * when several pickers are mounted simultaneously. */
  inputIdPrefix: string
  modes: PriceMode[]
  activeMode: PriceMode
  onSelectMode: (mode: PriceMode) => void
}

// The radio-button list that lives inside the price-mode picker overlay.
// Extracted so both the standalone `PriceModeButton` and the per-row action
// menus can render the same control without duplicating layout/i18n.
export const PriceModeList = memo(function PriceModeList({
  inputIdPrefix,
  modes,
  activeMode,
  onSelectMode,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-column gap-2">
      {modes.map((m) => {
        const inputId = `${inputIdPrefix}-${m}`
        return (
          <div key={m} className="flex align-items-center gap-2">
            <RadioButton
              inputId={inputId}
              checked={activeMode === m}
              onChange={() => onSelectMode(m)}
            />
            <label htmlFor={inputId} className="text-sm cursor-pointer">
              <i className={`${PRICE_MODE_ICON[m]} mr-2`} />
              {t(`priceCalculator.materials.priceMode.${m}`)}
            </label>
          </div>
        )
      })}
    </div>
  )
})
