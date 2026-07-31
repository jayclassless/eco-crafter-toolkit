import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import type { ParsedDataset } from '@/lib/import-dataset'
import { isQuotaExceeded, StorageQuotaError } from '@/lib/storage-quota'
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

    // One transaction = one persister save. Without this, every setRow ends
    // its own transaction and the IndexedDB persister rewrites the entire
    // store on each, queueing thousands of full-store writes that saturate
    // the main thread for many seconds after import completes.
    const rollback = () => {
      // Roll the in-memory store back to a consistent state. The TinyBase
      // auto-save will then push the rollback through to IDB; we can't await
      // it (the persister doesn't expose a save promise to callers here), but
      // an inconsistent store-vs-IDB snapshot is recoverable on next launch
      // because deleteDataset's gameData rows haven't been re-written yet.
      gameDataStore.transaction(() => {
        for (const table of [
          'skills',
          'talents',
          'talentBonuses',
          'items',
          'itemParts',
          'tagItems',
          'craftingTables',
          'pluginModules',
          'craftingTablePluginModules',
          'recipes',
          'recipeElements',
          'modifiers',
          'recipeUnlocks',
          'gatheringTools',
          'treeSpecies',
        ] as const) {
          for (const rowId of gameDataStore.getRowIds(table)) {
            if (gameDataStore.getCell(table, rowId, 'datasetId') === datasetId) {
              gameDataStore.delRow(table, rowId)
            }
          }
        }
        gameDataStore.delRow('datasets', datasetId)
      })
    }

    gameDataStore.transaction(() => {
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
      for (const ip of parsed.itemParts) {
        gameDataStore.setRow('itemParts', ip.id, { ...ip, datasetId })
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
      for (const gt of parsed.gatheringTools) {
        gameDataStore.setRow('gatheringTools', gt.id, { ...gt, datasetId })
      }
      for (const ts of parsed.treeSpecies) {
        gameDataStore.setRow('treeSpecies', ts.id, { ...ts, datasetId })
      }
    })

    try {
      await saveLocalizedNames(datasetId, parsed.localizedNames)
    } catch (err) {
      rollback()
      if (isQuotaExceeded(err)) {
        throw err instanceof StorageQuotaError ? err : new StorageQuotaError(err)
      }
      throw err
    }

    return datasetId
  }

  const deleteDataset = async (datasetId: string): Promise<void> => {
    const tables = [
      'skills',
      'talents',
      'talentBonuses',
      'items',
      'itemParts',
      'tagItems',
      'craftingTables',
      'pluginModules',
      'craftingTablePluginModules',
      'recipes',
      'recipeElements',
      'modifiers',
      'recipeUnlocks',
      'gatheringTools',
      'treeSpecies',
    ] as const

    gameDataStore.transaction(() => {
      for (const table of tables) {
        for (const rowId of gameDataStore.getRowIds(table)) {
          if (gameDataStore.getCell(table, rowId, 'datasetId') === datasetId) {
            gameDataStore.delRow(table, rowId)
          }
        }
      }
      gameDataStore.delRow('datasets', datasetId)
    })
    try {
      await deleteLocalizedNamesForDataset(datasetId)
    } catch (err) {
      // A delete that quota-fails is unusual but possible (IDB writes a
      // tombstone). Surface it the same way as import so the UI can warn.
      if (isQuotaExceeded(err)) {
        throw err instanceof StorageQuotaError ? err : new StorageQuotaError(err)
      }
      throw err
    }
  }

  return { getDatasets, importDataset, deleteDataset }
}

export function useGameData() {
  const { gameDataStore } = useStores()
  const ops = useMemo(() => createGameDataOps(gameDataStore), [gameDataStore])
  return { ...ops, store: gameDataStore }
}
