import { SelectButton } from 'primereact/selectbutton'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { HOUSING_PRESETS, type HousingPresetId } from './housing-presets'

/** Sentinel for "these constraints match no stage". Never a `HousingPresetId`,
 * so it cannot be confused for one. */
const CUSTOM = '_custom'

interface Props {
  /** null when the constraints match no stage. */
  value: HousingPresetId | null
  onSelect: (id: HousingPresetId) => void
}

// Progression-stage picker for the optimizer's tier/skills/power constraints.
//
// The Custom segment is appended only while it is the active one: its appearance
// IS the feedback that the constraints have diverged from a stage, and with
// `allowEmpty={false}` clicking the active segment is a no-op, so the user can
// never select it deliberately.
function OptimizerPresetSelectorImpl({ value, onSelect }: Props) {
  const { t } = useTranslation()

  const options = useMemo(() => {
    const items = HOUSING_PRESETS.map((preset) => ({
      value: preset.id as string,
      label: t(`housingScore.optimizer.preset.${preset.id}`),
    }))
    if (value === null) {
      items.push({ value: CUSTOM, label: t('housingScore.optimizer.preset.custom') })
    }
    return items
  }, [value, t])

  return (
    <SelectButton
      value={value ?? CUSTOM}
      options={options}
      optionValue="value"
      optionLabel="label"
      allowEmpty={false}
      aria-label={t('housingScore.optimizer.preset.label')}
      onChange={(e) => {
        const next = e.value as string | null
        if (next && next !== CUSTOM) onSelect(next as HousingPresetId)
      }}
    />
  )
}

export const OptimizerPresetSelector = memo(OptimizerPresetSelectorImpl)
