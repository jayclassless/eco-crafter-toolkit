import { useTranslation } from 'react-i18next'

import type { Biome } from './biome-resources-types'
import { ClimateChip } from './ClimateChip'

interface Props {
  biome: Biome
}

const NO_VALUE = '—'

export function BiomeHeader({ biome }: Props) {
  const { t } = useTranslation()

  return (
    <div className="mb-3">
      <h2 className="m-0">{biome.label}</h2>
      <div className="flex gap-2 flex-wrap mt-2">
        {biome.climate.temp !== NO_VALUE && (
          <ClimateChip label={t('biomeResources.climate.temp')} value={biome.climate.temp} />
        )}
        {biome.climate.moist !== NO_VALUE && (
          <ClimateChip label={t('biomeResources.climate.moisture')} value={biome.climate.moist} />
        )}
        <ClimateChip value={biome.climate.type} />
        <ClimateChip
          value={t('biomeResources.counts', {
            trees: biome.trees.length,
            plants: biome.harvest.length,
            animals: biome.fauna.length,
          })}
        />
      </div>
      <p className="mt-2 mb-0 text-color-secondary">{biome.desc}</p>
    </div>
  )
}
