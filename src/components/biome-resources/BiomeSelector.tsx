import { Dropdown } from 'primereact/dropdown'
import { useTranslation } from 'react-i18next'

import { BIOME_ATLAS, BIOME_GROUPS } from './biome-atlas'

import './BiomeSelector.css'

interface Props {
  selected: string
  onSelect: (key: string) => void
}

// Biome picker rendered inside the NavBar, grouped Land / Coast / Sea with
// the biomes alphabetized (by label) within each group.
export function BiomeSelector({ selected, onSelect }: Props) {
  const { t } = useTranslation()

  const options = BIOME_GROUPS.map(({ groupKey, keys }) => ({
    label: t(`biomeResources.groups.${groupKey}`),
    items: keys
      .map((key) => ({ label: BIOME_ATLAS.biomes[key].label, value: key }))
      .sort((a, b) => a.label.localeCompare(b.label)),
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
