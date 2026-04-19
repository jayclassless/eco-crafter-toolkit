import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

import { ensureUserCraftingTable } from './use-crafting-table-management'

export interface UseSkillManagement {
  addSkill: (skillId: string) => void
  removeSkill: (userSkillId: string, skillId: string, skillName: string) => void
  setSkillLevel: (userSkillId: string, level: number) => void
  toggleTalent: (talentId: string, userTalentId: string, enabled: boolean) => void
  setTalentLevel: (talentId: string, userTalentId: string, level: number) => void
}

export function createSkillManagement(
  buildStore: Store,
  gameDataStore: Store,
  buildId: string,
  datasetId: string
): UseSkillManagement {
  const findDefaultMarginId = (): string => {
    for (const mId of buildStore.getRowIds('userMargins')) {
      const m = buildStore.getRow('userMargins', mId)
      if (m.buildId === buildId && m.isDefault) return mId
    }
    return ''
  }

  const addSkill = (skillId: string) => {
    buildStore.transaction(() => {
      const id = generateId()
      buildStore.setRow('userSkills', id, { id, buildId, skillId, level: 1 })

      const defaultMarginId = findDefaultMarginId()

      const existingRecipeIds = new Set<string>()
      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId === buildId) existingRecipeIds.add(ur.recipeId as string)
      }

      // Collect the crafting tables used by the recipes we add so we can
      // auto-add each one to the build exactly once.
      const craftingTableIdsToEnsure = new Set<string>()

      for (const rId of gameDataStore.getRowIds('recipes')) {
        const recipe = gameDataStore.getRow('recipes', rId)
        if (
          recipe.skillId === skillId &&
          recipe.datasetId === datasetId &&
          !existingRecipeIds.has(rId)
        ) {
          const urId = generateId()
          buildStore.setRow('userRecipes', urId, {
            id: urId,
            buildId,
            recipeId: rId,
            roundFactor: 0,
          })
          if (defaultMarginId) {
            const urmId = generateId()
            buildStore.setRow('userRecipeMargins', urmId, {
              id: urmId,
              buildId,
              userRecipeId: urId,
              userMarginId: defaultMarginId,
            })
          }
          const ctId = recipe.craftingTableId as string | undefined
          if (ctId) craftingTableIdsToEnsure.add(ctId)
        }
      }

      for (const ctId of craftingTableIdsToEnsure) {
        ensureUserCraftingTable(buildStore, buildId, ctId)
      }
    })
  }

  const removeSkill = (userSkillId: string, skillId: string, skillName: string) => {
    buildStore.transaction(() => {
      for (const rowId of buildStore.getRowIds('hiddenSkills')) {
        const row = buildStore.getRow('hiddenSkills', rowId)
        if (row.buildId === buildId && row.skillName === skillName) {
          buildStore.delRow('hiddenSkills', rowId)
        }
      }

      const skillRecipeIds = new Set<string>()
      for (const rId of gameDataStore.getRowIds('recipes')) {
        const recipe = gameDataStore.getRow('recipes', rId)
        if (recipe.skillId === skillId) skillRecipeIds.add(rId)
      }

      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId === buildId && skillRecipeIds.has(ur.recipeId as string)) {
          for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
            const urm = buildStore.getRow('userRecipeMargins', urmId)
            if (urm.userRecipeId === urId) {
              buildStore.delRow('userRecipeMargins', urmId)
            }
          }
          buildStore.delRow('userRecipes', urId)
        }
      }

      // Remove talents associated with this skill
      const skillTalentIds = new Set<string>()
      for (const tId of gameDataStore.getRowIds('talents')) {
        const talent = gameDataStore.getRow('talents', tId)
        if (talent.skillId === skillId) skillTalentIds.add(tId)
      }
      for (const utId of buildStore.getRowIds('userTalents')) {
        const ut = buildStore.getRow('userTalents', utId)
        if (ut.buildId === buildId && skillTalentIds.has(ut.talentId as string)) {
          buildStore.delRow('userTalents', utId)
        }
      }

      buildStore.delRow('userSkills', userSkillId)
    })
  }

  const setSkillLevel = (userSkillId: string, level: number) => {
    buildStore.transaction(() => {
      const skillId = buildStore.getCell('userSkills', userSkillId, 'skillId') as string
      buildStore.setCell('userSkills', userSkillId, 'level', level)

      // Disable talents that are now above the skill level
      const overLevelTalentIds = new Set<string>()
      for (const tId of gameDataStore.getRowIds('talents')) {
        const talent = gameDataStore.getRow('talents', tId)
        if (talent.skillId === skillId && (talent.level as number) > level) {
          overLevelTalentIds.add(tId)
        }
      }
      for (const utId of buildStore.getRowIds('userTalents')) {
        const ut = buildStore.getRow('userTalents', utId)
        if (ut.buildId === buildId && overLevelTalentIds.has(ut.talentId as string)) {
          // Reset both enabled and talentLevel so levelable talents don't
          // keep their stored level once the skill drops below their group.
          if (ut.enabled) buildStore.setCell('userTalents', utId, 'enabled', false)
          if ((ut.talentLevel as number) > 0) {
            buildStore.setCell('userTalents', utId, 'talentLevel', 0)
          }
        }
      }
    })
  }

  // Shared guts: enable one talent (optionally at a chosen level for levelable
  // talents) and disable all siblings at the same skill level. Used by both
  // toggleTalent and setTalentLevel so the one-per-level invariant is enforced
  // regardless of entry point.
  const disableSiblings = (talentId: string) => {
    const talent = gameDataStore.getRow('talents', talentId)
    const skillId = talent.skillId as string
    const level = talent.level as number

    const siblingTalentIds = new Set<string>()
    for (const tId of gameDataStore.getRowIds('talents')) {
      if (tId === talentId) continue
      const sib = gameDataStore.getRow('talents', tId)
      if (sib.skillId === skillId && (sib.level as number) === level) {
        siblingTalentIds.add(tId)
      }
    }

    for (const utId of buildStore.getRowIds('userTalents')) {
      const ut = buildStore.getRow('userTalents', utId)
      if (ut.buildId !== buildId) continue
      if (!siblingTalentIds.has(ut.talentId as string)) continue
      if (ut.enabled) buildStore.setCell('userTalents', utId, 'enabled', false)
      if ((ut.talentLevel as number) > 0) {
        buildStore.setCell('userTalents', utId, 'talentLevel', 0)
      }
    }
  }

  const upsertUserTalent = (
    talentId: string,
    userTalentId: string,
    enabled: boolean,
    talentLevel: number
  ) => {
    if (userTalentId) {
      buildStore.setCell('userTalents', userTalentId, 'enabled', enabled)
      buildStore.setCell('userTalents', userTalentId, 'talentLevel', talentLevel)
    } else {
      const id = generateId()
      buildStore.setRow('userTalents', id, { id, buildId, talentId, enabled, talentLevel })
    }
  }

  const toggleTalent = (talentId: string, userTalentId: string, enabled: boolean) => {
    buildStore.transaction(() => {
      const talent = gameDataStore.getRow('talents', talentId)
      const isLevelable = (talent.isLevelable as boolean) ?? false
      if (enabled) {
        disableSiblings(talentId)
        // Levelable talents default to level 1 on toggle-on; non-levelable
        // stay at 0 (their value comes from the talent row, not the level).
        upsertUserTalent(talentId, userTalentId, true, isLevelable ? 1 : 0)
      } else {
        upsertUserTalent(talentId, userTalentId, false, 0)
      }
    })
  }

  const setTalentLevel = (talentId: string, userTalentId: string, level: number) => {
    buildStore.transaction(() => {
      const talent = gameDataStore.getRow('talents', talentId)
      const maxLevel = (talent.maxTalentLevel as number) ?? 0
      const clamped = Math.max(0, Math.min(level, maxLevel || level))
      if (clamped > 0) {
        disableSiblings(talentId)
        upsertUserTalent(talentId, userTalentId, true, clamped)
      } else {
        upsertUserTalent(talentId, userTalentId, false, 0)
      }
    })
  }

  return { addSkill, removeSkill, setSkillLevel, toggleTalent, setTalentLevel }
}

export function useSkillManagement(buildId: string, datasetId: string): UseSkillManagement {
  const { buildStore, gameDataStore } = useStores()
  return useMemo(
    () => createSkillManagement(buildStore, gameDataStore, buildId, datasetId),
    [buildStore, gameDataStore, buildId, datasetId]
  )
}
