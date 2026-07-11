import { Tag } from 'primereact/tag'
import { useTranslation } from 'react-i18next'

import { EcoIcon } from '@/components/common/EcoIcon'

import { ORE_COLOR } from './biome-atlas'
import type { BiomeOre } from './biome-resources-types'
import { oreTags } from './cross-section-layout'

interface Props {
  ore: BiomeOre
}

export function OreDetailRow({ ore }: Props) {
  const { t } = useTranslation()

  return (
    <div className="ore-detail-row flex align-items-center gap-2 py-2">
      <span
        className="flex-none border-round-sm"
        style={{ width: '0.8rem', height: '0.8rem', background: ORE_COLOR[ore.raw] }}
      />
      <EcoIcon name={`${ore.raw}Item`} size={20} />
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div className="font-semibold text-sm">{ore.name}</div>
        <div className="flex gap-1 flex-wrap mt-1">
          {oreTags(ore).map((tag) => (
            <Tag key={tag} severity="secondary" value={t(`biomeResources.tags.${tag}`)} />
          ))}
        </div>
      </div>
      <span className="text-sm white-space-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {ore.onlyCrushed
          ? t('biomeResources.surfaceOnly')
          : t('biomeResources.depthRange', { min: ore.minDepth, max: ore.maxDepth })}
      </span>
    </div>
  )
}
