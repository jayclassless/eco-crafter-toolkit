import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import type { ParsedDataset } from '@/lib/import-dataset'
import { deleteLocalizedNamesForDataset, saveLocalizedNames } from '@/stores/localized-name-store'
import { useStores } from '@/stores/providers'

export function createGameDataOps(gameDataStore: Store) {
  const getDatasets = () => {
    const rowIds = gameDataStore.getRowIds('datasets')
    return rowIds.map((id) => gameDataStore.getRow('datasets', id))
  }

  const importDataset = async (
    parsed: ParsedDataset,
    name: string,
    bundledId?: string,
    revision?: number
  ): Promise<string> => {
    const datasetId = generateId()
    const now = new Date().toISOString()

    gameDataStore.setRow('datasets', datasetId, {
      id: datasetId,
      name,
      version: 1,
      bundledId: bundledId ?? '',
      installedRevision: revision ?? 0,
      importedAt: now,
      updatedAt: now,
      isCustom: !bundledId,
    })

    for (const skill of parsed.skills) {
      gameDataStore.setRow('skills', skill.id, {
        ...skill,
        datasetId,
        laborReducePercent: JSON.stringify(skill.laborReducePercent),
      })
    }
    for (const talent of parsed.talents) {
      gameDataStore.setRow('talents', talent.id, { ...talent, datasetId })
    }
    for (const bonus of parsed.talentBonuses) {
      gameDataStore.setRow('talentBonuses', bonus.id, { ...bonus, datasetId })
    }
    for (const item of parsed.items) {
      gameDataStore.setRow('items', item.id, { ...item, datasetId })
    }
    for (const tagItem of parsed.tagItems) {
      gameDataStore.setRow('tagItems', tagItem.id, { ...tagItem, datasetId })
    }
    for (const ct of parsed.craftingTables) {
      gameDataStore.setRow('craftingTables', ct.id, { ...ct, datasetId })
    }
    for (const pm of parsed.pluginModules) {
      gameDataStore.setRow('pluginModules', pm.id, {
        ...pm,
        datasetId,
        skillId: pm.skillId ?? '',
        skillPercent: pm.skillPercent ?? 0,
      })
    }
    for (const ctpm of parsed.craftingTablePluginModules) {
      gameDataStore.setRow('craftingTablePluginModules', ctpm.id, { ...ctpm, datasetId })
    }
    for (const recipe of parsed.recipes) {
      gameDataStore.setRow('recipes', recipe.id, {
        ...recipe,
        datasetId,
        skillId: recipe.skillId ?? '',
      })
    }
    for (const elem of parsed.recipeElements) {
      gameDataStore.setRow('recipeElements', elem.id, { ...elem, datasetId })
    }
    for (const mod of parsed.modifiers) {
      gameDataStore.setRow('modifiers', mod.id, { ...mod, datasetId })
    }
    for (const ru of parsed.recipeUnlocks) {
      gameDataStore.setRow('recipeUnlocks', ru.id, { ...ru, datasetId })
    }

    await saveLocalizedNames(datasetId, parsed.localizedNames)

    return datasetId
  }

  const deleteDataset = async (datasetId: string): Promise<void> => {
    const tables = [
      'skills',
      'talents',
      'talentBonuses',
      'items',
      'tagItems',
      'craftingTables',
      'pluginModules',
      'craftingTablePluginModules',
      'recipes',
      'recipeElements',
      'modifiers',
      'recipeUnlocks',
    ] as const

    for (const table of tables) {
      for (const rowId of gameDataStore.getRowIds(table)) {
        if (gameDataStore.getCell(table, rowId, 'datasetId') === datasetId) {
          gameDataStore.delRow(table, rowId)
        }
      }
    }

    gameDataStore.delRow('datasets', datasetId)
    await deleteLocalizedNamesForDataset(datasetId)
  }

  return { getDatasets, importDataset, deleteDataset }
}

export function useGameData() {
  const { gameDataStore } = useStores()
  const ops = useMemo(() => createGameDataOps(gameDataStore), [gameDataStore])
  return { ...ops, store: gameDataStore }
}
