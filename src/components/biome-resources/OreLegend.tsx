import { useTranslation } from 'react-i18next'

import { ORE_COLOR } from './biome-atlas'

const ORE_LEGEND: Array<{ raw: string; labelKey: string }> = [
  { raw: 'IronOre', labelKey: 'iron' },
  { raw: 'CopperOre', labelKey: 'copper' },
  { raw: 'GoldOre', labelKey: 'gold' },
  { raw: 'Coal', labelKey: 'coal' },
  { raw: 'Sulfur', labelKey: 'sulfur' },
]

export function OreLegend() {
  const { t } = useTranslation()

  return (
    <div className="flex gap-3 flex-wrap align-items-center text-xs text-color-secondary">
      {ORE_LEGEND.map(({ raw, labelKey }) => (
        <span key={raw} className="inline-flex align-items-center gap-1">
          <span
            className="border-round-sm"
            style={{ width: '0.7rem', height: '0.7rem', background: ORE_COLOR[raw] }}
          />
          {t(`biomeResources.legend.${labelKey}`)}
        </span>
      ))}
    </div>
  )
}
