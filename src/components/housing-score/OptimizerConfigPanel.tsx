import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { MultiSelect } from 'primereact/multiselect'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { NumericField } from '@/components/common/NumericField'
import { SkillMultiSelect } from '@/components/common/SkillMultiSelect'
import type { SkillSelectOption } from '@/lib/skill-options'
import type { RoomTier } from '@/types/game-data'

import {
  DEFAULT_OPTIMIZER_CONFIG,
  type OptimizerConfig,
  POWER_TYPES,
  type PowerType,
} from './housing-optimizer-types'
import { OptimizerField } from './OptimizerField'

interface Props {
  config: OptimizerConfig
  skills: SkillSelectOption[]
  tiers: RoomTier[]
  onChange: (patch: Partial<OptimizerConfig>) => void
}

// The optimizer's input constraints.
//
// Takes one config object and emits patches rather than a prop per field: at
// eight inputs the flat form is unmaintainable, and this keeps the panel
// testable on its own.
function OptimizerConfigPanelImpl({ config, skills, tiers, onChange }: Props) {
  const { t } = useTranslation()

  const tierOptions = useMemo(
    () =>
      tiers.map((tier) => ({
        value: tier.tierVal,
        label: t('housingScore.optimizer.config.tierOption', {
          tier: tier.tierVal,
          soft: tier.softCap,
          hard: tier.hardCap,
        }),
      })),
    [tiers, t]
  )

  const powerOptions = useMemo(
    () =>
      POWER_TYPES.map((type) => ({
        value: type,
        label: t(`housingScore.optimizer.power.${type}`),
      })),
    [t]
  )

  const isModified = useMemo(
    () =>
      config.skillIds !== null ||
      POWER_TYPES.some(
        (p) => config.power.includes(p) !== DEFAULT_OPTIMIZER_CONFIG.power.includes(p)
      ) ||
      config.tier !== DEFAULT_OPTIMIZER_CONFIG.tier ||
      config.maxFurnishingRepeats !== DEFAULT_OPTIMIZER_CONFIG.maxFurnishingRepeats ||
      config.minFurnishingContribution !== DEFAULT_OPTIMIZER_CONFIG.minFurnishingContribution ||
      config.residents !== DEFAULT_OPTIMIZER_CONFIG.residents ||
      config.maxRoomRepeat !== DEFAULT_OPTIMIZER_CONFIG.maxRoomRepeat ||
      config.minRoomContribution !== DEFAULT_OPTIMIZER_CONFIG.minRoomContribution,
    [config]
  )

  const onSkillsChange = useCallback(
    (skillIds: string[] | null) => onChange({ skillIds }),
    [onChange]
  )

  // A null/blank commit means the user cleared the field; keep the last good
  // value rather than pushing NaN into the solver.
  const numeric = (key: keyof OptimizerConfig, min: number) => (value: number | null) => {
    if (value == null) return
    onChange({ [key]: Math.max(min, value) } as Partial<OptimizerConfig>)
  }

  return (
    <div className="flex align-items-end gap-3 flex-wrap mb-3">
      <OptimizerField label={t('housingScore.optimizer.config.tier')}>
        <Dropdown
          value={config.tier}
          options={tierOptions}
          optionValue="value"
          optionLabel="label"
          onChange={(e) => onChange({ tier: e.value as number })}
          style={{ width: '15rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.skills')}>
        <SkillMultiSelect
          options={skills}
          value={config.skillIds}
          onChange={onSkillsChange}
          placeholder={t('housingScore.optimizer.config.skillsPlaceholder')}
          ariaLabel={t('housingScore.optimizer.config.skills')}
          style={{ width: '13rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.power')}>
        <MultiSelect
          value={config.power}
          options={powerOptions}
          optionValue="value"
          optionLabel="label"
          onChange={(e) => onChange({ power: e.value as PowerType[] })}
          placeholder={t('housingScore.optimizer.config.powerPlaceholder')}
          aria-label={t('housingScore.optimizer.config.power')}
          display="chip"
          style={{ width: '15rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.residents')}>
        <NumericField
          value={config.residents}
          onChange={numeric('residents', 1)}
          min={1}
          maxFractionDigits={0}
          style={{ width: '6rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.maxRepeats')}>
        <NumericField
          value={config.maxFurnishingRepeats}
          onChange={numeric('maxFurnishingRepeats', 1)}
          min={1}
          maxFractionDigits={0}
          style={{ width: '6rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.minContribution')}>
        <NumericField
          value={config.minFurnishingContribution}
          onChange={numeric('minFurnishingContribution', 0)}
          min={0}
          maxFractionDigits={2}
          style={{ width: '6rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.maxRoomRepeat')}>
        <NumericField
          value={config.maxRoomRepeat}
          onChange={numeric('maxRoomRepeat', 0)}
          min={0}
          maxFractionDigits={0}
          style={{ width: '6rem' }}
        />
      </OptimizerField>

      <OptimizerField label={t('housingScore.optimizer.config.minRoomValue')}>
        <NumericField
          value={config.minRoomContribution}
          onChange={numeric('minRoomContribution', 0)}
          min={0}
          maxFractionDigits={2}
          style={{ width: '6rem' }}
        />
      </OptimizerField>

      {isModified && (
        <Button
          text
          icon="pi pi-filter-slash"
          label={t('housingScore.optimizer.config.reset')}
          onClick={() => onChange(DEFAULT_OPTIMIZER_CONFIG)}
        />
      )}
    </div>
  )
}

export const OptimizerConfigPanel = memo(OptimizerConfigPanelImpl)
