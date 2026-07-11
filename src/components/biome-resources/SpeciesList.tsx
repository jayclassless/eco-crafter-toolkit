import { useTranslation } from 'react-i18next'

import { EcoIcon } from '@/components/common/EcoIcon'

import type { BiomeSpecies } from './biome-resources-types'
import { speciesIconName } from './species-icons'

interface Props {
  species: BiomeSpecies[]
}

// Trees / harvestable plants. `locked` species are biome-native (world-gen
// places them only here); the rest are climate-driven and may also appear in
// neighbouring biomes.
export function SpeciesList({ species }: Props) {
  const { t } = useTranslation()

  if (species.length === 0) {
    return (
      <div className="text-sm text-color-secondary font-italic">{t('biomeResources.none')}</div>
    )
  }

  return (
    <div className="flex flex-column">
      {species.map((s, i) => {
        const icon = speciesIconName(s)
        return (
          <div
            key={s.name}
            className="flex align-items-center gap-2 py-1"
            style={{
              borderBottom: i < species.length - 1 ? '1px solid var(--surface-border)' : undefined,
            }}
          >
            <span
              className="flex-none border-circle"
              title={t(s.locked ? 'biomeResources.legend.native' : 'biomeResources.legend.climate')}
              style={{
                width: '0.5rem',
                height: '0.5rem',
                background: s.locked ? 'var(--primary-color)' : 'transparent',
                boxShadow: s.locked ? undefined : 'inset 0 0 0 1.5px var(--text-color-secondary)',
              }}
            />
            {icon ? (
              <EcoIcon name={icon} size={20} />
            ) : (
              <span className="flex-none" style={{ width: '20px' }} />
            )}
            <span className="font-medium text-sm white-space-nowrap">{s.name}</span>
            {s.yields.length > 0 && (
              <span className="ml-auto text-xs text-color-secondary text-right">
                {s.yields.join(', ')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
