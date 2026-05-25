import { useMemo } from 'react'
import type { Row, Store } from 'tinybase'

import { SELF_IMPROVEMENT_SKILL_NAME } from '@/lib/game-constants'
import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'

import { createSkillManagement } from './use-skill-management'

// Every table in build-store that has a buildId column. Used by both
// deleteBuild (to wipe a build) and cloneBuild (to duplicate it).
const PER_BUILD_TABLES = [
  'userSkills',
  'userTalents',
  'userCraftingTables',
  'userRecipes',
  'userPrices',
  'userMargins',
  'userRecipeMargins',
  'userProductMargins',
  'userProductShares',
  'userReintegratedProducts',
  'userSettings',
  'userPlantings',
  'computedPrices',
  'hiddenSkills',
  'hiddenCraftingTables',
  'hiddenTags',
] as const

// Subset of PER_BUILD_TABLES whose row schema includes an `id` cell.
// The `hidden*` tables are keyed by row id only, with no separate id column.
const TABLES_WITH_ID_CELL = new Set([
  'userSkills',
  'userTalents',
  'userCraftingTables',
  'userRecipes',
  'userPrices',
  'userMargins',
  'userRecipeMargins',
  'userProductMargins',
  'userProductShares',
  'userReintegratedProducts',
  'userSettings',
  'userPlantings',
  'computedPrices',
])

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
        showOnlyFavorites: false,
        defaultShareForSecondaryItems: 20,
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
        if (skill.datasetId === datasetId && skill.name === SELF_IMPROVEMENT_SKILL_NAME) {
          createSkillManagement(buildStore, gameDataStore, buildId, datasetId).addSkill(rowId)
          break
        }
      }
    })

    return buildId
  }

  const deleteBuild = (buildId: string) => {
    buildStore.transaction(() => {
      for (const table of PER_BUILD_TABLES) {
        for (const rowId of buildStore.getRowIds(table)) {
          if (buildStore.getCell(table, rowId, 'buildId') === buildId) {
            buildStore.delRow(table, rowId)
          }
        }
      }

      buildStore.delRow('builds', buildId)
    })
  }

  const cloneBuild = (sourceBuildId: string) => {
    const source = buildStore.getRow('builds', sourceBuildId)
    if (!source.id) return null

    const newBuildId = generateId()

    buildStore.transaction(() => {
      buildStore.setRow('builds', newBuildId, {
        id: newBuildId,
        datasetId: source.datasetId,
        name: `${source.name} (Copy)`,
        createdAt: new Date().toISOString(),
      })

      for (const table of PER_BUILD_TABLES) {
        // computedPrices is a solver cache — the solver will rebuild it for
        // the new build; copying it would just be wasted work.
        if (table === 'computedPrices') continue

        for (const rowId of buildStore.getRowIds(table)) {
          if (buildStore.getCell(table, rowId, 'buildId') !== sourceBuildId) continue

          const sourceRow = buildStore.getRow(table, rowId)
          const newRowId = generateId()
          const newRow: Row = { ...sourceRow, buildId: newBuildId }
          if (TABLES_WITH_ID_CELL.has(table)) {
            newRow.id = newRowId
          }
          buildStore.setRow(table, newRowId, newRow)
        }
      }
    })

    return newBuildId
  }

  return { getBuilds, createBuild, deleteBuild, cloneBuild }
}

export function useBuild() {
  const { buildStore, gameDataStore } = useStores()
  const ops = useMemo(() => createBuildOps(buildStore, gameDataStore), [buildStore, gameDataStore])
  return { ...ops, store: buildStore }
}
