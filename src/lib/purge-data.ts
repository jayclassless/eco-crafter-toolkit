import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

import { deleteLocalizedNamesForDataset } from '@/stores/localized-name-store'

export type PurgeSelection = {
  /** Dataset ids to purge. May be empty. */
  datasetIds: string[]
  /** If true, purge every build regardless of dataset. */
  purgeAllBuilds: boolean
}

export type PurgeStores = {
  gameDataStore: Store
  buildStore: Store
  uiStore: Store
}

export type PurgePersisters = {
  gameData: IndexedDbPersister
  build: IndexedDbPersister
  ui: IndexedDbPersister
}

const BUILD_SCOPED_TABLES = [
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

const DATASET_SCOPED_TABLES = [
  'skills',
  'talents',
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

/**
 * Compute the full set of buildIds that must be deleted, given a selection.
 * This is the union of:
 *   - every build (if purgeAllBuilds)
 *   - every build whose datasetId is in selection.datasetIds (forced cascade)
 */
function computeDeletedBuildIds(buildStore: Store, selection: PurgeSelection): Set<string> {
  const deleted = new Set<string>()
  const datasetIdSet = new Set(selection.datasetIds)
  for (const buildId of buildStore.getRowIds('builds')) {
    if (selection.purgeAllBuilds) {
      deleted.add(buildId)
      continue
    }
    const datasetId = buildStore.getCell('builds', buildId, 'datasetId') as string
    if (datasetIdSet.has(datasetId)) deleted.add(buildId)
  }
  return deleted
}

function deleteBuilds(buildStore: Store, deletedBuildIds: Set<string>): void {
  buildStore.transaction(() => {
    // Child tables first, then the builds row itself
    for (const table of BUILD_SCOPED_TABLES) {
      for (const rowId of buildStore.getRowIds(table)) {
        const buildId = buildStore.getCell(table, rowId, 'buildId') as string
        if (deletedBuildIds.has(buildId)) buildStore.delRow(table, rowId)
      }
    }
    for (const buildId of deletedBuildIds) {
      buildStore.delRow('builds', buildId)
    }
  })
}

function deleteDatasets(gameDataStore: Store, datasetIds: string[]): void {
  if (datasetIds.length === 0) return
  const datasetIdSet = new Set(datasetIds)
  gameDataStore.transaction(() => {
    for (const table of DATASET_SCOPED_TABLES) {
      for (const rowId of gameDataStore.getRowIds(table)) {
        const datasetId = gameDataStore.getCell(table, rowId, 'datasetId') as string
        if (datasetIdSet.has(datasetId)) gameDataStore.delRow(table, rowId)
      }
    }
    for (const datasetId of datasetIds) {
      gameDataStore.delRow('datasets', datasetId)
    }
  })
}

function cleanupUiStore(
  uiStore: Store,
  deletedBuildIds: Set<string>,
  deletedDatasetIds: string[]
): void {
  const datasetIdSet = new Set(deletedDatasetIds)
  uiStore.transaction(() => {
    const activeBuildId = uiStore.getCell('uiState', 'main', 'activeBuildId') as string
    if (activeBuildId && deletedBuildIds.has(activeBuildId)) {
      uiStore.setCell('uiState', 'main', 'activeBuildId', '')
    }
    const activeDatasetId = uiStore.getCell('uiState', 'main', 'activeDatasetId') as string
    if (activeDatasetId && datasetIdSet.has(activeDatasetId)) {
      uiStore.setCell('uiState', 'main', 'activeDatasetId', '')
    }
  })
}

export async function purgeData(
  selection: PurgeSelection,
  stores: PurgeStores,
  persisters: PurgePersisters
): Promise<void> {
  const deletedBuildIds = computeDeletedBuildIds(stores.buildStore, selection)
  deleteBuilds(stores.buildStore, deletedBuildIds)
  deleteDatasets(stores.gameDataStore, selection.datasetIds)
  cleanupUiStore(stores.uiStore, deletedBuildIds, selection.datasetIds)

  await Promise.all(selection.datasetIds.map(deleteLocalizedNamesForDataset))

  // Wait for each persister's schedule queue to drain before returning.
  //
  // Each transaction above commits via its store's didFinishTransactionListener,
  // which fires a floating `save(changes)` installed by startAutoSave. That
  // call pushes a save action into the persister's schedule queue and starts
  // the run loop (suspending on the first IndexedDB await).
  //
  // We can't reliably `await persister.save()` here: tinybase's `save()`
  // resolves as soon as its action is enqueued, and if another save is
  // already running on the same persister its internal `run()` early-returns
  // without awaiting. The caller reloads the page immediately after purge,
  // aborting in-flight IDB writes before they commit — so the purge never
  // reaches disk.
  //
  // A no-op barrier pushed via `persister.schedule()` runs strictly after
  // every previously-queued action, so resolving a promise from inside the
  // barrier's body is a reliable signal that the save (and every other
  // action queued before it) has flushed.
  await Promise.all([
    waitForScheduleDrain(persisters.gameData),
    waitForScheduleDrain(persisters.build),
    waitForScheduleDrain(persisters.ui),
  ])
}

function waitForScheduleDrain(persister: IndexedDbPersister): Promise<void> {
  return new Promise<void>((resolve) => {
    persister.schedule(async () => {
      resolve()
    })
  })
}
