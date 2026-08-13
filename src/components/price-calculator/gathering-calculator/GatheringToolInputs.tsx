import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { InputNumber, type InputNumberChangeEvent } from 'primereact/inputnumber'
import { MultiSelect, type MultiSelectChangeEvent } from 'primereact/multiselect'
import { useTranslation } from 'react-i18next'

import { ItemIcon } from '@/components/common/ItemIcon'
import { useLocalization } from '@/hooks/use-localization'
import { TOOL_CALORIE_STRATEGY } from '@/lib/game-constants'

import type { GatheringClothingOption, GatheringToolOption } from './gathering-data'

interface Props {
  tools: GatheringToolOption[]
  selectedToolId: string
  onSelectTool: (itemId: string) => void
  skillName: string
  skillLevel: number
  onSkillLevel: (level: number) => void
  clothing: GatheringClothingOption[]
  selectedClothingIds: string[]
  onSelectClothing: (ids: string[]) => void
  /** 1 + the sum of the selected clothing rates, shown so the stacking is
   * visible (boots and the backpack occupy different slots). */
  clothingMultiplier: number
}

export function GatheringToolInputs({
  tools,
  selectedToolId,
  onSelectTool,
  skillName,
  skillLevel,
  onSkillLevel,
  clothing,
  selectedClothingIds,
  onSelectClothing,
  clothingMultiplier,
}: Props) {
  const { t } = useTranslation()
  const { formatPercent } = useLocalization()
  // The tool curves are 8 entries long and clamp past the end, so this is the
  // highest level that still changes anything.
  const maxSkillLevel = TOOL_CALORIE_STRATEGY.length - 1

  const toolTemplate = (opt: GatheringToolOption | null) =>
    opt ? (
      <div className="flex align-items-center gap-2">
        <ItemIcon item={{ name: opt.rawName }} />
        <span>{opt.name}</span>
      </div>
    ) : (
      // Dropdown only falls back to its own placeholder when valueTemplate is
      // absent, so an empty selection has to render the text itself.
      <span className="text-color-secondary">{t('settings.gatheringCalculator.noTool')}</span>
    )

  const clothingTemplate = (opt: GatheringClothingOption) =>
    opt ? (
      <div className="flex align-items-center gap-2">
        <ItemIcon item={{ name: opt.rawName }} />
        <span>{opt.name}</span>
        <span className="text-color-secondary text-sm ml-auto">
          {formatPercent(opt.calorieRate)}
        </span>
      </div>
    ) : null

  return (
    <div className="flex flex-column gap-3">
      <div className="flex flex-wrap align-items-center gap-4">
        <div className="flex align-items-center gap-2">
          <label className="text-sm font-medium">{t('settings.gatheringCalculator.tool')}</label>
          <Dropdown
            value={selectedToolId}
            options={tools}
            optionLabel="name"
            optionValue="itemId"
            onChange={(e: DropdownChangeEvent) => onSelectTool(e.value ?? '')}
            aria-label={t('settings.gatheringCalculator.tool')}
            itemTemplate={toolTemplate}
            valueTemplate={toolTemplate}
            placeholder={t('settings.gatheringCalculator.noTool')}
            disabled={tools.length === 0}
            style={{ minWidth: '14rem' }}
          />
        </div>

        {skillName && (
          <div className="flex align-items-center gap-2">
            <label className="text-sm font-medium">{skillName}</label>
            <InputNumber
              value={skillLevel}
              onChange={(e: InputNumberChangeEvent) => onSkillLevel(e.value ?? 0)}
              min={0}
              max={maxSkillLevel}
              showButtons
              inputStyle={{ width: '3rem', textAlign: 'center' }}
            />
          </div>
        )}
      </div>

      <div className="flex align-items-center gap-2 flex-wrap">
        <label className="text-sm font-medium">{t('settings.gatheringCalculator.clothing')}</label>
        <MultiSelect
          value={selectedClothingIds}
          options={clothing}
          optionLabel="name"
          optionValue="itemId"
          onChange={(e: MultiSelectChangeEvent) => onSelectClothing((e.value as string[]) ?? [])}
          itemTemplate={clothingTemplate}
          placeholder={t('settings.gatheringCalculator.noClothing')}
          display="chip"
          style={{ minWidth: '20rem', maxWidth: '100%' }}
        />
        <span className="text-sm text-color-secondary">
          {t('settings.gatheringCalculator.clothingMultiplier', {
            percent: formatPercent(clothingMultiplier),
          })}
        </span>
      </div>
    </div>
  )
}
