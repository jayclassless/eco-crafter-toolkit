import { useTranslation } from 'react-i18next'

import { ItemIcon } from '@/components/common/ItemIcon'
import { useLocalization } from '@/hooks/use-localization'
import type { GarbageQuantity } from '@/lib/recipe-garbage'

export interface GarbageAmountRow extends GarbageQuantity {
  name: string
  rawName: string
  isCustom: boolean
}

interface Props {
  amount: GarbageAmountRow
}

/**
 * One garbage output: icon, name, and either an exact quantity or a range.
 *
 * The range case exists for a tag ingredient whose items carry different
 * salvage values and which the build has not pinned to one item — printing a
 * single number there would look authoritative while being wrong most of the
 * time, so the bounds are shown instead. Shared by the Cost Components summary
 * and the Waste tab so the two can never format the same figure differently.
 */
export function GarbageAmount({ amount }: Props) {
  const { t } = useTranslation()
  const { formatNumber } = useLocalization()
  const fmt = (v: number) => formatNumber(v, { maximumFractionDigits: 3 })

  return (
    <span className="flex align-items-center gap-2">
      <ItemIcon
        item={{ name: amount.rawName, isCustom: amount.isCustom }}
        size={20}
        alt={amount.name}
      />
      <span>{amount.name}</span>
      <span className="ml-auto white-space-nowrap">
        {amount.min === amount.max ? (
          fmt(amount.max)
        ) : (
          <>
            {fmt(amount.min)} – {fmt(amount.max)}
            <span className="text-color-secondary ml-1">
              ({t('priceCalculator.recipe.garbageVaries')})
            </span>
          </>
        )}
      </span>
    </span>
  )
}
