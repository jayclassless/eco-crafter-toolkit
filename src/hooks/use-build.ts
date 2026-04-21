import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

import { createSkillManagement } from './use-skill-management'

export function createBuildOps(buildStore: Store, gameDataStore: Store) {
  const getBuilds = (datasetId: string) => {
    const rowIds = buildStore.getRowIds('builds')
    return rowIds
      .map((id) => buildStore.getRow('builds', id))
      .filter((b) => b.datasetId === datasetId)
  }

  const createBuild = (datasetId: string, name: string) => {
    const buildId = generateId()
    const settingsId = generateId()

    buildStore.transaction(() => {
      buildStore.setRow('builds', buildId, {
        id: buildId,
        datasetId,
        name,
        createdAt: new Date().toISOString(),
      })

      buildStore.setRow('userSettings', settingsId, {
        id: settingsId,
        buildId,
        marginType: 'markup',
        calorieCost: 0,
        showUnskilledRecipes: true,
        onlyLevelAccessible: false,
        applyMarginBetweenSkills: false,
        showParts: true,
        showUntagged: true,
      })

      // Default margin — must exist before addSkill runs, because addSkill
      // links each auto-added recipe to the default margin.
      const marginId = generateId()
      buildStore.setRow('userMargins', marginId, {
        id: marginId,
        buildId,
        name: 'Default',
        percent: 15,
        isDefault: true,
      })

      // Auto-add the Self Improvement skill via the skill-management helper
      // so its recipes — and their crafting tables — come along automatically,
      // matching what happens when a user adds a skill from the UI.
      for (const rowId of gameDataStore.getRowIds('skills')) {
        const skill = gameDataStore.getRow('skills', rowId)
        if (skill.datasetId === datasetId && skill.name === 'SelfImprovementSkill') {
          createSkillManagement(buildStore, gameDataStore, buildId, datasetId).addSkill(rowId)
          break
        }
      }
    })

    return buildId
  }

  const deleteBuild = (buildId: string) => {
    buildStore.transaction(() => {
      const tables = [
        'userSkills',
        'userTalents',
        'userCraftingTables',
        'userRecipes',
        'userPrices',
        'userMargins',
        'userRecipeMargins',
        'userProductMargins',
        'userSettings',
        'computedPrices',
        'hiddenSkills',
      ] as const

      for (const table of tables) {
        for (const rowId of buildStore.getRowIds(table)) {
          if (buildStore.getCell(table, rowId, 'buildId') === buildId) {
            buildStore.delRow(table, rowId)
          }
        }
      }

      buildStore.delRow('builds', buildId)
    })
  }

  return { getBuilds, createBuild, deleteBuild }
}

export function useBuild() {
  const { buildStore, gameDataStore } = useStores()
  const ops = useMemo(() => createBuildOps(buildStore, gameDataStore), [buildStore, gameDataStore])
  return { ...ops, store: buildStore }
}
