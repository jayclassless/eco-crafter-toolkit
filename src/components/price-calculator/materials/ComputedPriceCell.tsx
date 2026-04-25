import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'

interface Props {
  itemOrTagId: string
  signal: PriceSignal
  showIcon?: boolean
  iconTooltip?: string
}

export const ComputedPriceCell = memo(function ComputedPriceCell({
  itemOrTagId,
  signal,
  showIcon = false,
  iconTooltip,
}: Props) {
  const { t } = useTranslation()
  const value = usePriceCell(signal, itemOrTagId, 'costPrice')
  const { formatPrice } = useLocalization()
  // Match PrimeReact .p-inputtext box model (0.75rem padding, 1px border,
  // 1rem font-size) so produced-item rows are the same height as rows with
  // an editable PriceField input.
  return (
    <div className="flex align-items-center gap-1">
      <div
        className="text-right"
        style={{
          opacity: 0.75,
          width: '5.5rem',
          padding: '0.75rem 0',
          border: '1px solid transparent',
          boxSizing: 'border-box',
          fontSize: '1rem',
          lineHeight: 1.2,
        }}
      >
        {value != null
          ? formatPrice(value)
          : t('priceCalculator.materials.priceMode.noComputedPrice')}
      </div>
      {showIcon && (
        <i
          className="pi pi-calculator text-xs text-color-secondary computed-price-icon"
          data-pr-tooltip={iconTooltip}
        />
      )}
    </div>
  )
})
