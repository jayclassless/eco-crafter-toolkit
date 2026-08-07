import { useTranslation } from 'react-i18next'

import { GarbageAmount, type GarbageAmountRow } from './GarbageAmount'

interface Props {
  totals: GarbageAmountRow[]
}

/**
 * The per-craft garbage summary, rendered in the Cost Components tab beneath
 * the products list.
 *
 * Deliberately a plain list rather than a priced table: garbage has no price
 * and does not participate in the recipe's cost at all, so giving it the same
 * columns as the ingredient/product tables would imply it does. The Waste tab
 * carries the per-ingredient derivation.
 *
 * Renders nothing when there is no garbage — which covers all of v11–v13 (no
 * salvage data at all) and most v14 recipes, with no version check.
 */
export function GarbageOutputTable({ totals }: Props) {
  const { t } = useTranslation()
  if (totals.length === 0) return null

  return (
    <div>
      <h4 className="mt-4 mb-2">{t('priceCalculator.recipe.garbage')}</h4>
      <ul className="list-none p-0 m-0 flex flex-column gap-2 ml-3">
        {totals.map((row) => (
          <li key={row.itemId}>
            <GarbageAmount amount={row} />
          </li>
        ))}
      </ul>
    </div>
  )
}
