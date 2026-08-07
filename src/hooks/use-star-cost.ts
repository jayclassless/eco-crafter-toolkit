import { useMemo } from 'react'

import { MODULE_SLOT_STAR_COSTS, SELF_IMPROVEMENT_SKILL_NAME } from '@/lib/game-constants'
import { MODULE_SLOT_BY_CELL, MODULE_SLOT_CELL_LIST } from '@/lib/module-slots'
import { useStores } from '@/stores/providers'

import { useStoreRevision } from './use-store-revision'

// `userCraftingTables` is watched too: installing a module changes the star
// total, and without it here the badge would not refresh on that edit.
const BUILD_TABLES = ['userSkills', 'userTalents', 'userCraftingTables'] as const

interface StarCost {
  total: number
  skillCost: number
  talentCost: number
  /** Stars spent on installed upgrade modules, across every crafting table in
   * the build. Always 0 on v11-v13: those modules all normalize to the
   * Specialty slot, which costs nothing — so no version check is needed. */
  moduleCost: number
  skillCount: number
  talentCount: number
  // True when the dataset behaves like v13: at least one skill carries a
  // per-skill SpecialtyCost > 1. Pre-v13 datasets uniformly default to 1, so
  // the presence of any non-default value is the definitive signal — we don't
  // rely on a game version number.
  isV13: boolean
}

export function useStarCost(buildId: string, datasetId: string): StarCost {
  const { buildStore, gameDataStore } = useStores()
  const rev = useStoreRevision(buildStore, BUILD_TABLES)

  const isV13 = useMemo(() => {
    for (const rowId of gameDataStore.getRowIds('skills')) {
      const skill = gameDataStore.getRow('skills', rowId)
      if (skill.datasetId !== datasetId) continue
      if (((skill.specialtyCost as number) ?? 1) > 1) return true
    }
    return false
  }, [datasetId, gameDataStore])

  return useMemo<StarCost>(() => {
    let skillCount = 0
    let specialtySum = 0
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId !== buildId) continue
      const skill = gameDataStore.getRow('skills', row.skillId as string)
      if (!skill || !skill.name) continue
      if (skill.name === SELF_IMPROVEMENT_SKILL_NAME) continue
      skillCount += 1
      specialtySum += (skill.specialtyCost as number) ?? 1
    }

    let talentCount = 0
    let talentCost = 0
    if (isV13) {
      for (const rowId of buildStore.getRowIds('userTalents')) {
        const row = buildStore.getRow('userTalents', rowId)
        if (row.buildId !== buildId) continue
        if (row.enabled !== true) continue
        const talent = gameDataStore.getRow('talents', row.talentId as string)
        if (!talent || !talent.id) continue
        talentCount += 1
        if (talent.isLevelable === true) {
          talentCost += (row.talentLevel as number) ?? 0
        } else {
          talentCost += 1
        }
      }
    }

    // Modules are charged per installed module, per Balance.eco.template. The
    // cost comes from the SLOT, so it is read off the cell rather than from the
    // module row — a legacy build only ever fills specialtyModuleId, which is
    // free, so this contributes 0 without any version branch.
    let moduleCost = 0
    for (const rowId of buildStore.getRowIds('userCraftingTables')) {
      const row = buildStore.getRow('userCraftingTables', rowId)
      if (row.buildId !== buildId) continue
      for (const cell of MODULE_SLOT_CELL_LIST) {
        if (!row[cell]) continue
        moduleCost += MODULE_SLOT_STAR_COSTS[MODULE_SLOT_BY_CELL[cell]]
      }
    }

    const skillCost = isV13 ? specialtySum + (skillCount * (skillCount - 1)) / 2 : skillCount
    // Module cost applies regardless of `isV13`, which gates only the
    // skill/talent star math for pre-v13 datasets. It is inherently 0 on those
    // datasets anyway, so adding it unconditionally keeps one code path.
    const total = (isV13 ? skillCost + talentCost : skillCount) + moduleCost

    return {
      total,
      skillCost,
      talentCost,
      moduleCost,
      skillCount,
      talentCount,
      isV13,
    }
    // rev is the invalidation key for any buildStore change in userSkills /
    // userTalents (including cell edits like talentLevel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, buildId, datasetId, buildStore, gameDataStore, isV13])
}
