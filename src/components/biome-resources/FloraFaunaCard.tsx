import { Panel } from 'primereact/panel'
import { useTranslation } from 'react-i18next'

import type { Biome } from './biome-resources-types'
import { FaunaList } from './FaunaList'
import { SectionSubhead } from './SectionSubhead'
import { SpeciesLegend } from './SpeciesLegend'
import { SpeciesList } from './SpeciesList'

interface Props {
  biome: Biome
}

export function FloraFaunaCard({ biome }: Props) {
  const { t } = useTranslation()

  return (
    <Panel header={t('biomeResources.floraFauna.title')}>
      <SpeciesLegend />
      <SectionSubhead label={t('biomeResources.floraFauna.trees')} />
      <SpeciesList species={biome.trees} />
      <SectionSubhead label={t('biomeResources.floraFauna.plants')} />
      <SpeciesList species={biome.harvest} />
      <SectionSubhead label={t('biomeResources.floraFauna.wildlife')} />
      <FaunaList fauna={biome.fauna} />
    </Panel>
  )
}
