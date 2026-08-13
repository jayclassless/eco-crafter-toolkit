import { Tag } from 'primereact/tag'
import { useTranslation } from 'react-i18next'

import { EcoIcon } from '@/components/common/EcoIcon'
import { useLocalization } from '@/hooks/use-localization'

import type { BiomeFauna } from './biome-resources-types'
import { faunaIconName } from './species-icons'

interface Props {
  fauna: BiomeFauna[]
}

export function FaunaList({ fauna }: Props) {
  const { t } = useTranslation()
  const { compare } = useLocalization()

  if (fauna.length === 0) {
    return (
      <div className="text-sm text-color-secondary font-italic">
        {t('biomeResources.noWildlife')}
      </div>
    )
  }

  // The data comes sorted by category, then name; a single name sort reads
  // better in a flat list.
  const sorted = [...fauna].sort((a, b) => compare(a.name, b.name))

  return (
    <div className="flex flex-column">
      {sorted.map((animal, i) => {
        const icon = faunaIconName(animal)
        return (
          <div
            key={animal.name}
            className="flex align-items-center gap-2 py-1"
            style={{
              borderBottom: i < sorted.length - 1 ? '1px solid var(--surface-border)' : undefined,
            }}
          >
            {icon ? (
              <EcoIcon name={icon} size={20} />
            ) : (
              <span className="flex-none" style={{ width: '20px' }} />
            )}
            <span className="font-medium text-sm">{animal.name}</span>
            <Tag className="ml-auto" severity="secondary" value={animal.cat} />
          </div>
        )
      })}
    </div>
  )
}
