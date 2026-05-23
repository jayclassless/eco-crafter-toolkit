import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { InputNumber, type InputNumberChangeEvent } from 'primereact/inputnumber'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { CraftingTableIcon } from '@/components/common/CraftingTableIcon'
import { PluginModuleIcon } from '@/components/common/PluginModuleIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import type { GetNameFn } from '@/lib/recipe-modifiers'

import type { AdHocTalentStates } from './adhoc-recipe-calc'
import { AdHocTalentsCell } from './AdHocTalentsCell'

interface ModuleOption {
  id: string
  name: string
  rawName: string
}

interface Props {
  gameDataStore: Store
  skillId: string
  craftingTableId: string
  getName: GetNameFn
  skillLevel: number
  onSkillLevel: (level: number) => void
  pluginModuleId: string
  onPluginModule: (id: string) => void
  talentStates: AdHocTalentStates
  onTalentChange: (talentId: string, state: { enabled: boolean; level: number }) => void
}

export function AdHocRecipeInputs({
  gameDataStore,
  skillId,
  craftingTableId,
  getName,
  skillLevel,
  onSkillLevel,
  pluginModuleId,
  onPluginModule,
  talentStates,
  onTalentChange,
}: Props) {
  const { t } = useTranslation()

  const skillRawName = skillId
    ? ((gameDataStore.getRow('skills', skillId)?.name as string) ?? '')
    : ''
  const skillName = skillId ? getName('skill', skillId) || skillRawName : ''
  const tableRawName = craftingTableId
    ? ((gameDataStore.getRow('craftingTables', craftingTableId)?.name as string) ?? '')
    : ''
  const tableName = craftingTableId ? getName('craftingTable', craftingTableId) || tableRawName : ''

  const maxSkillLevel = useMemo(() => {
    if (!skillId) return 0
    const skill = getGameDataIndexes(gameDataStore).recipeIndexes.getSkill(skillId)
    const len = skill?.laborReducePercent.length ?? 1
    return Math.max(0, len - 1)
  }, [gameDataStore, skillId])

  const moduleOptions = useMemo<ModuleOption[]>(() => {
    const out: ModuleOption[] = []
    for (const joinId of gameDataStore.getRowIds('craftingTablePluginModules')) {
      const join = gameDataStore.getRow('craftingTablePluginModules', joinId)
      if (join.craftingTableId !== craftingTableId) continue
      const pmId = join.pluginModuleId as string
      const pm = gameDataStore.getRow('pluginModules', pmId)
      if (!pm?.name) continue
      out.push({
        id: pmId,
        name: getName('pluginModule', pmId) || (pm.name as string),
        rawName: pm.name as string,
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [gameDataStore, craftingTableId, getName])

  const moduleItemTemplate = (opt: ModuleOption) =>
    opt.id ? (
      <div className="flex align-items-center gap-2">
        <PluginModuleIcon module={{ name: opt.rawName }} />
        <span>{opt.name}</span>
      </div>
    ) : (
      <span className="text-color-secondary">{opt.name}</span>
    )

  const noneOption: ModuleOption = { id: '', name: t('common.none'), rawName: '' }

  return (
    <div className="flex flex-column gap-3">
      <div className="flex flex-wrap align-items-center gap-4">
        {skillId && (
          <div className="flex align-items-center gap-2">
            <SkillIcon skill={{ name: skillRawName }} />
            <span className="font-medium">{skillName}</span>
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

        {skillId && (
          <AdHocTalentsCell
            gameDataStore={gameDataStore}
            skillId={skillId}
            skillLevel={skillLevel}
            getName={getName}
            talentStates={talentStates}
            onTalentChange={onTalentChange}
          />
        )}
      </div>

      {moduleOptions.length > 0 && (
        <div className="flex align-items-center gap-2">
          <CraftingTableIcon table={{ name: tableRawName }} />
          <span className="font-medium">{tableName}</span>
          <Dropdown
            value={pluginModuleId || ''}
            options={[noneOption, ...moduleOptions]}
            optionLabel="name"
            optionValue="id"
            onChange={(e: DropdownChangeEvent) => onPluginModule(e.value ?? '')}
            itemTemplate={moduleItemTemplate}
            style={{ minWidth: '14rem' }}
          />
        </div>
      )}
    </div>
  )
}
