import { SelectButton } from 'primereact/selectbutton'
import { useTranslation } from 'react-i18next'

import type { HousingView } from './housing-types'

interface Props {
  value: HousingView
  onChange: (next: HousingView) => void
}

// Sub-navigation for the Housing Score section, rendered into the NavBar's
// children slot alongside the tool switcher (the slot BiomeSelector uses).
export function HousingViewSelector({ value, onChange }: Props) {
  const { t } = useTranslation()

  const options = [
    { value: 'furnishings' as HousingView, label: t('housingScore.view.furnishings') },
    { value: 'materials' as HousingView, label: t('housingScore.view.materials') },
  ]

  return (
    <SelectButton
      value={value}
      options={options}
      optionValue="value"
      optionLabel="label"
      allowEmpty={false}
      aria-label={t('housingScore.viewSwitcher')}
      onChange={(e) => {
        const next = e.value as HousingView | null
        if (next) onChange(next)
      }}
    />
  )
}
