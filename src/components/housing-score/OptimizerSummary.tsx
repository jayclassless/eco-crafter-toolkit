import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'

import { CategoryDonut } from './CategoryDonut'
import type { DonutDatum } from './housing-donut-layout'

interface Props {
  perResident: number
  houseTotal: number
  residents: number
  segments: DonutDatum[]
}

// Headline score plus the per-category split.
//
// Both totals are shown on purpose. The occupancy multiplier is applied PER
// RESIDENT, so two roommates each receive 60% of the house's raw value while
// the house as a whole yields 120% — showing one number alone invites reading
// it as the other.
function OptimizerSummaryImpl({ perResident, houseTotal, residents, segments }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()
  const format = (value: number) => formatNumber(value, { maximumFractionDigits: 2 })

  return (
    <div className="flex flex-column gap-3">
      <div>
        <div className="text-color-secondary text-sm">{t('housingScore.optimizer.total')}</div>
        <div className="flex align-items-baseline gap-2">
          <span className="text-4xl font-bold">{format(perResident)}</span>
          <span className="text-color-secondary">{t('housingScore.optimizer.totalUnit')}</span>
        </div>
        {residents > 1 && (
          <div className="text-color-secondary text-sm mt-1">
            {t('housingScore.optimizer.perResidentNote', { value: format(houseTotal) })}
          </div>
        )}
      </div>
      <CategoryDonut data={segments} />
    </div>
  )
}

export const OptimizerSummary = memo(OptimizerSummaryImpl)
