import { InputNumber, type InputNumberChangeEvent } from 'primereact/inputnumber'
import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { CraftingTableIcon } from '@/components/common/CraftingTableIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import type { ModuleSlotRow } from '@/components/price-calculator/build-options/crafting-table-modules-types'
import { CraftingTableModulesCell } from '@/components/price-calculator/build-options/CraftingTableModulesCell'
import { craftingTableModules, getGameDataIndexes } from '@/lib/game-data-indexes'
import { deriveTableModuleSlots, type SlotSelection } from '@/lib/module-slots'
import type { GetNameFn } from '@/lib/recipe-modifiers'
import type { ModuleSlot } from '@/types/game-data'

import type { AdHocTalentStates } from './adhoc-recipe-calc'
import { AdHocTalentsCell } from './AdHocTalentsCell'

interface Props {
  gameDataStore: Store
  datasetId: string
  skillId: string
  craftingTableId: string
  getName: GetNameFn
  skillLevel: number
  onSkillLevel: (level: number) => void
  /** Installed module per slot — the same shape the build's crafting-table rows
   * use, so this dialog and the Crafting Tables panel share one picker. */
  moduleIdsBySlot: SlotSelection
  onModuleChange: (slot: ModuleSlot, pluginModuleId: string) => void
  talentStates: AdHocTalentStates
  onTalentChange: (talentId: string, state: { enabled: boolean; level: number }) => void
}

export function AdHocRecipeInputs({
  gameDataStore,
  datasetId,
  skillId,
  craftingTableId,
  getName,
  skillLevel,
  onSkillLevel,
  moduleIdsBySlot,
  onModuleChange,
  talentStates,
  onTalentChange,
}: Props) {
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

  // Same derivation as the Crafting Tables panel, off the same shared index —
  // the two pickers must offer identical slots or a recipe would price
  // differently here than in the build.
  const slots = useMemo<ModuleSlotRow[]>(
    () =>
      deriveTableModuleSlots(
        craftingTableModules(gameDataStore, datasetId, craftingTableId).map((m) => ({
          ...m,
          name: getName('pluginModule', m.id) || m.name,
          rawName: m.name,
        }))
      ).map((s) => ({
        ...s,
        candidates: s.candidates
          .map(({ id, name, rawName }) => ({ id, name, rawName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
    [gameDataStore, datasetId, craftingTableId, getName]
  )

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

      {slots.length > 0 && (
        <div className="flex align-items-center gap-2">
          <CraftingTableIcon table={{ name: tableRawName }} />
          <span className="font-medium">{tableName}</span>
          <CraftingTableModulesCell
            slots={slots}
            selected={moduleIdsBySlot}
            onSelect={onModuleChange}
            idPrefix="adhoc"
          />
        </div>
      )}
    </div>
  )
}
