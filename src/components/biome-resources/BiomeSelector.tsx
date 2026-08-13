import { Dropdown } from 'primereact/dropdown'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'

import './BiomeSelector.css'

import { BIOME_ATLAS, BIOME_GROUPS } from './biome-atlas'

interface Props {
  selected: string
  onSelect: (key: string) => void
}

// Biome picker rendered inside the NavBar, grouped Land / Coast / Sea with
// the biomes alphabetized (by label) within each group.
export function BiomeSelector({ selected, onSelect }: Props) {
  const { t } = useTranslation()
  const { compare } = useLocalization()

  const options = BIOME_GROUPS.map(({ groupKey, keys }) => ({
    label: t(`biomeResources.groups.${groupKey}`),
    items: keys
      .map((key) => ({ label: BIOME_ATLAS.biomes[key].label, value: key }))
      .sort((a, b) => compare(a.label, b.label)),
  }))

  return (
    <Dropdown
      className="biome-selector-dropdown"
      value={selected}
      options={options}
      optionLabel="label"
      optionValue="value"
      optionGroupLabel="label"
      optionGroupChildren="items"
      aria-label={t('biomeResources.title')}
      onChange={(e) => onSelect(e.value as string)}
    />
  )
}
