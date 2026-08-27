import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { MultiSelect } from 'primereact/multiselect'
import { Tooltip } from 'primereact/tooltip'
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
import {
  HOUSING_PRESETS,
  housingPresetPatch,
  type HousingPresetId,
  matchHousingPreset,
} from './housing-presets'
import { FIELD_TIP_CLASS, OptimizerField } from './OptimizerField'
import { OptimizerPresetSelector } from './OptimizerPresetSelector'

interface Props {
  config: OptimizerConfig
  skills: SkillSelectOption[]
  tiers: RoomTier[]
  onChange: (patch: Partial<OptimizerConfig>) => void
}

/** Wide enough for the longest tier label ("Tier 5 (Ashlar Stone, Composite
 * Lumber)") without crowding the summary beside it. */
const PROGRESSION_WIDTH = '17rem'

/** The pruning column holds only numeric inputs, so it is sized by its longest
 * label rather than its controls. */
const LIMITS_WIDTH = '13rem'

// The optimizer's input constraints, in the two columns left of the summary:
// what the world has unlocked, then the limits on what to suggest.
//
// Takes one config object and emits patches rather than a prop per field: at
// eight inputs the flat form is unmaintainable, and this keeps the panel
// testable on its own.
function OptimizerConfigPanelImpl({ config, skills, tiers, onChange }: Props) {
  const { t } = useTranslation()

  const tierOptions = useMemo(
    () =>
      tiers.map((tier) => {
        // Tiers are named by the blocks they cover, which reads far better than
        // the raw caps. A dataset tier with no entry of its own (a future tier
        // 6, or tier 0, whose blocks are not a meaningful build choice) falls
        // back to the bare number rather than an empty list.
        const materials = t(`housingScore.optimizer.config.tierMaterials.${tier.tierVal}`, {
          defaultValue: '',
        })
        return {
          value: tier.tierVal,
          label: materials
            ? t('housingScore.optimizer.config.tierOption', { tier: tier.tierVal, materials })
            : t('housingScore.optimizer.config.tierOptionBare', { tier: tier.tierVal }),
        }
      }),
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

  // Derived rather than stored, so editing the constraints back into a stage's
  // shape re-activates that stage.
  const activePreset = useMemo(() => matchHousingPreset(config, skills), [config, skills])

  const onPresetSelect = useCallback(
    (id: HousingPresetId) => {
      const preset = HOUSING_PRESETS.find((p) => p.id === id)
      if (preset) onChange(housingPresetPatch(preset, skills))
    },
    [onChange, skills]
  )

  // A null/blank commit means the user cleared the field; keep the last good
  // value rather than pushing NaN into the solver.
  const numeric = (key: keyof OptimizerConfig, min: number) => (value: number | null) => {
    if (value == null) return
    onChange({ [key]: Math.max(min, value) } as Partial<OptimizerConfig>)
  }

  return (
    <div className="flex flex-column gap-3" style={{ flex: '0 0 auto' }}>
      {/* One Tooltip for every field's icon rather than one per field. The
          fields are mounted together and never virtualized, so a selector-based
          bind is safe here. */}
      <Tooltip target={`.${FIELD_TIP_CLASS}`} position="right" />

      <div className="flex align-items-start gap-3 flex-wrap">
        {/* What the world has unlocked. */}
        <div className="flex flex-column gap-3" style={{ width: PROGRESSION_WIDTH }}>
          <OptimizerField
            label={t('housingScore.optimizer.preset.label')}
            tooltip={t('housingScore.optimizer.preset.tooltip')}
          >
            <OptimizerPresetSelector value={activePreset} onSelect={onPresetSelect} />
          </OptimizerField>

          <OptimizerField
            label={t('housingScore.optimizer.config.tier')}
            tooltip={t('housingScore.optimizer.config.tierTooltip')}
          >
            <Dropdown
              value={config.tier}
              options={tierOptions}
              optionValue="value"
              optionLabel="label"
              onChange={(e) => onChange({ tier: e.value as number })}
              className="w-full"
            />
          </OptimizerField>

          <OptimizerField
            label={t('housingScore.optimizer.config.skills')}
            tooltip={t('housingScore.optimizer.config.skillsTooltip')}
          >
            <SkillMultiSelect
              options={skills}
              value={config.skillIds}
              onChange={onSkillsChange}
              placeholder={t('housingScore.optimizer.config.skillsPlaceholder')}
              ariaLabel={t('housingScore.optimizer.config.skills')}
              style={{ width: '100%' }}
            />
          </OptimizerField>

          <OptimizerField
            label={t('housingScore.optimizer.config.power')}
            tooltip={t('housingScore.optimizer.config.powerTooltip')}
          >
            <MultiSelect
              value={config.power}
              options={powerOptions}
              optionValue="value"
              optionLabel="label"
              onChange={(e) => onChange({ power: e.value as PowerType[] })}
              placeholder={t('housingScore.optimizer.config.powerPlaceholder')}
              aria-label={t('housingScore.optimizer.config.power')}
              display="chip"
              className="w-full"
            />
          </OptimizerField>
        </div>

        {/* Limits on what the solver may suggest. */}
        <div className="flex flex-column gap-3">
          <div style={{ width: LIMITS_WIDTH }}>
            <OptimizerField
              label={t('housingScore.optimizer.config.residents')}
              tooltip={t('housingScore.optimizer.config.residentsTooltip')}
            >
              <NumericField
                value={config.residents}
                onChange={numeric('residents', 1)}
                min={1}
                maxFractionDigits={0}
                className="w-full"
              />
            </OptimizerField>
          </div>

          {/* Each "max" sits beside the "min value" that prunes the same thing:
              furnishings on the first row, rooms on the second. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(2, ${LIMITS_WIDTH})`,
              gap: '1rem',
            }}
          >
            <OptimizerField
              label={t('housingScore.optimizer.config.maxRepeats')}
              tooltip={t('housingScore.optimizer.config.maxRepeatsTooltip')}
            >
              <NumericField
                value={config.maxFurnishingRepeats}
                onChange={numeric('maxFurnishingRepeats', 1)}
                min={1}
                maxFractionDigits={0}
                className="w-full"
              />
            </OptimizerField>

            <OptimizerField
              label={t('housingScore.optimizer.config.minContribution')}
              tooltip={t('housingScore.optimizer.config.minContributionTooltip')}
            >
              <NumericField
                value={config.minFurnishingContribution}
                onChange={numeric('minFurnishingContribution', 0)}
                min={0}
                maxFractionDigits={2}
                className="w-full"
              />
            </OptimizerField>

            <OptimizerField
              label={t('housingScore.optimizer.config.maxRoomRepeat')}
              tooltip={t('housingScore.optimizer.config.maxRoomRepeatTooltip')}
            >
              <NumericField
                value={config.maxRoomRepeat}
                onChange={numeric('maxRoomRepeat', 0)}
                min={0}
                maxFractionDigits={0}
                className="w-full"
              />
            </OptimizerField>

            <OptimizerField
              label={t('housingScore.optimizer.config.minRoomValue')}
              tooltip={t('housingScore.optimizer.config.minRoomValueTooltip')}
            >
              <NumericField
                value={config.minRoomContribution}
                onChange={numeric('minRoomContribution', 0)}
                min={0}
                maxFractionDigits={2}
                className="w-full"
              />
            </OptimizerField>
          </div>
        </div>
      </div>

      {/* Below both columns rather than inside one: it resets every assumption,
          not just that column's. */}
      {isModified && (
        <Button
          text
          icon="pi pi-filter-slash"
          label={t('housingScore.optimizer.config.reset')}
          onClick={() => onChange(DEFAULT_OPTIMIZER_CONFIG)}
          className="align-self-start"
        />
      )}
    </div>
  )
}

export const OptimizerConfigPanel = memo(OptimizerConfigPanelImpl)
