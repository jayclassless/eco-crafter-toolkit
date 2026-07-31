import { Checkbox } from 'primereact/checkbox'
import { useTranslation } from 'react-i18next'

import { NumericField } from '@/components/common/NumericField'
import { PriceField } from '@/components/common/PriceField'
import type { GatheringKind } from '@/lib/gathering-calc'

import type { GatheringSpeciesOption } from './gathering-data'

interface Props {
  kind: GatheringKind
  /** rock */
  caloriesPerRubblePickup: number
  onCaloriesPerRubblePickup: (value: number) => void
  /** log */
  logsPerTree: number
  onLogsPerTree: (value: number) => void
  species: GatheringSpeciesOption | null
  /** carcass */
  hitRate: number
  onHitRate: (value: number) => void
  headshot: boolean
  onHeadshot: (value: boolean) => void
  arrowPrice: number
  onArrowPrice: (value: number) => void
}

// The inputs the game data can't supply. Rendered per kind so the user only
// sees assumptions that actually affect their number.
export function GatheringAssumptionsPanel({
  kind,
  caloriesPerRubblePickup,
  onCaloriesPerRubblePickup,
  logsPerTree,
  onLogsPerTree,
  species,
  hitRate,
  onHitRate,
  headshot,
  onHeadshot,
  arrowPrice,
  onArrowPrice,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap align-items-end gap-4">
      {kind === 'rock' && (
        <div>
          <label className="block mb-1 text-sm">
            {t('settings.gatheringCalculator.rubblePickupCalories')}
          </label>
          <NumericField
            value={caloriesPerRubblePickup}
            onChange={(v) => onCaloriesPerRubblePickup(v ?? 0)}
            min={0}
            style={{ width: '7rem' }}
          />
        </div>
      )}

      {kind === 'log' && (
        <div>
          <label className="block mb-1 text-sm">
            {t('settings.gatheringCalculator.logsPerTree')}
          </label>
          <NumericField
            value={logsPerTree}
            onChange={(v) => onLogsPerTree(v ?? 0)}
            min={1}
            maxFractionDigits={0}
            style={{ width: '7rem' }}
          />
          {species && (
            // The felling share is the only estimated term in the log result,
            // so the extracted range is shown rather than hidden.
            <div className="text-xs text-color-secondary mt-1">
              {t('settings.gatheringCalculator.logsPerTreeRange', {
                min: species.logsPerTreeMin,
                max: species.logsPerTreeMax,
              })}
            </div>
          )}
        </div>
      )}

      {kind === 'carcass' && (
        <>
          <div>
            <label className="block mb-1 text-sm">
              {t('settings.gatheringCalculator.hitRate')}
            </label>
            <NumericField
              value={Math.round(hitRate * 100)}
              onChange={(v) => onHitRate(Math.min(100, Math.max(1, v ?? 100)) / 100)}
              min={1}
              max={100}
              maxFractionDigits={0}
              suffix="%"
              containerStyle={{ width: '8rem' }}
            />
          </div>
          <div className="flex align-items-center gap-2 pb-2">
            <Checkbox
              inputId="gathering-headshot"
              checked={headshot}
              onChange={(e) => onHeadshot(!!e.checked)}
            />
            <label htmlFor="gathering-headshot" className="text-sm cursor-pointer">
              {t('settings.gatheringCalculator.headshot')}
            </label>
          </div>
          <div>
            <label className="block mb-1 text-sm">
              {t('settings.gatheringCalculator.arrowPrice')}
            </label>
            <div style={{ width: '9rem' }}>
              <PriceField value={arrowPrice} onChange={(v) => onArrowPrice(v ?? 0)} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
