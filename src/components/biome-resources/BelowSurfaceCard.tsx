import { Panel } from 'primereact/panel'
import { useTranslation } from 'react-i18next'

import type { Biome } from './biome-resources-types'
import { CrossSectionChart } from './CrossSectionChart'
import { OreDetailRow } from './OreDetailRow'
import { OreLegend } from './OreLegend'
import { RockChipList } from './RockChipList'
import { SectionSubhead } from './SectionSubhead'

import './BelowSurfaceCard.css'

interface Props {
  biome: Biome
}

export function BelowSurfaceCard({ biome }: Props) {
  const { t } = useTranslation()

  return (
    <Panel header={t('biomeResources.belowSurface.title')}>
      <div className="mb-2">
        <OreLegend />
      </div>
      <CrossSectionChart biome={biome} />
      <div className="flex gap-3 flex-wrap mt-2 text-xs text-color-secondary">
        <span>▨ {t('biomeResources.chart.legendDeposit')}</span>
        <span>■ {t('biomeResources.chart.legendSeam')}</span>
        <span>{t('biomeResources.chart.legendDepthNote')}</span>
      </div>
      <div className="flex flex-column mt-3">
        {biome.ores.length === 0 ? (
          <p className="text-sm text-color-secondary font-italic my-1">
            {t('biomeResources.belowSurface.noOres')}
          </p>
        ) : (
          biome.ores.map((ore) => <OreDetailRow key={ore.raw} ore={ore} />)
        )}
      </div>
      <SectionSubhead label={t('biomeResources.belowSurface.rocksHeading')} />
      <RockChipList rocks={biome.rocks} />
    </Panel>
  )
}
