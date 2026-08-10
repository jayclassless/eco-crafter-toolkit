import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import type { GatheringKind, GatheringResult } from '@/lib/gathering-calc'

interface Props {
  result: GatheringResult
  kind: GatheringKind
  /** Localized name of the item being priced, used in the per-item columns. */
  itemName: string
}

// Purely presentational. Deliberately shows BOTH the per-source figures (the
// swings a player can count in-game) and the per-item ones (what sets the
// price) — an amortized "0.09 actions to fell a tree" on its own reads as
// nonsense and hides that felling actually costs a full 7 swings.
export function GatheringCostBreakdown({ result, kind, itemName }: Props) {
  const { t } = useTranslation()
  const { formatPrice, formatNumber } = useLocalization()

  const num = (v: number) => formatNumber(v, { maximumFractionDigits: 2 })
  const sourceLabel = t(`settings.gatheringCalculator.sources.${kind}`)
  const totalActions = result.lines.reduce((s, l) => s + (l.caloriesPerSource > 0 ? l.count : 0), 0)
  const totalSourceCalories = result.lines.reduce((s, l) => s + l.caloriesPerSource, 0)

  return (
    <div className="flex flex-column gap-2">
      <div className="flex flex-wrap justify-content-between gap-3 text-sm text-color-secondary">
        <span>
          {t('settings.gatheringCalculator.perAction', { calories: num(result.caloriesPerAction) })}
        </span>
        <span>
          {t('settings.gatheringCalculator.damagePerHit', { damage: num(result.damagePerHit) })}
        </span>
        <span>
          {/*
            Named `qty`, not `count`: `count` is i18next's plural selector, and
            this value is fractional (0.14 items per source), which would drive
            plural selection off a rounded number in languages that have one.
          */}
          {t('settings.gatheringCalculator.yield', {
            qty: result.itemsPerSource,
            name: itemName,
            source: sourceLabel,
          })}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: '30rem' }}>
          <thead>
            <tr className="text-color-secondary">
              <th className="text-left font-normal pb-1">
                {t('settings.gatheringCalculator.lineHeader')}
              </th>
              <th className="text-right font-normal pb-1">
                {t('settings.gatheringCalculator.actionsHeader', { source: sourceLabel })}
              </th>
              <th className="text-right font-normal pb-1">
                {t('settings.gatheringCalculator.caloriesPerSourceHeader', { source: sourceLabel })}
              </th>
              <th className="text-right font-normal pb-1">
                {t('settings.gatheringCalculator.caloriesPerItemHeader', { name: itemName })}
              </th>
              <th className="text-right font-normal pb-1">
                {t('settings.gatheringCalculator.costHeader')}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((l) => (
              <tr key={l.key}>
                <td className="py-1">{t(`settings.gatheringCalculator.lines.${l.key}`)}</td>
                <td className="text-right py-1">{num(l.count)}</td>
                <td className="text-right py-1">
                  {l.caloriesPerSource > 0 ? num(l.caloriesPerSource) : '—'}
                </td>
                <td className="text-right py-1">{l.calories > 0 ? num(l.calories) : '—'}</td>
                <td className="text-right py-1">{formatPrice(l.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium border-top-1 surface-border">
              <td className="pt-2">
                {t('settings.gatheringCalculator.total', { source: sourceLabel })}
              </td>
              <td className="text-right pt-2">{num(totalActions)}</td>
              <td className="text-right pt-2">{num(totalSourceCalories)}</td>
              <td className="text-right pt-2">{num(result.caloriesPerItem)}</td>
              <td className="text-right pt-2">{formatPrice(result.pricePerItem)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
