import { beforeEach, describe, it, expect, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import {
  __resetLocalizedNameStore,
  loadIndex,
  saveLocalizedNames,
} from '@/stores/localized-name-store'
import { createUIStore } from '@/stores/ui-store'

import { purgeData, type PurgePersisters } from '../purge-data'

async function deleteLocalizedNameDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await deleteLocalizedNameDb()
})

/**
 * Build a populated fixture with two datasets (ds1, ds2), two builds —
 * b1 tied to ds1, b2 tied to ds2 — and enough child rows to prove
 * cascading deletion works across all tables that reference datasetId
 * or buildId.
 */
function makeFixture() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  // Datasets
  gameDataStore.setRow('datasets', 'ds1', {
    id: 'ds1',
    name: 'Dataset One',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: true,
  })
  gameDataStore.setRow('datasets', 'ds2', {
    id: 'ds2',
    name: 'Dataset Two',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: true,
  })

  // A sampling of rows in every datasetId-scoped table, one per dataset
  const datasetScopedTables = [
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
  ] as const
  for (const table of datasetScopedTables) {
    gameDataStore.setRow(table, `${table}-ds1`, { id: `${table}-ds1`, datasetId: 'ds1' })
    gameDataStore.setRow(table, `${table}-ds2`, { id: `${table}-ds2`, datasetId: 'ds2' })
  }

  // Builds — b1 tied to ds1, b2 tied to ds2
  buildStore.setRow('builds', 'b1', {
    id: 'b1',
    datasetId: 'ds1',
    name: 'Build One',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('builds', 'b2', {
    id: 'b2',
    datasetId: 'ds2',
    name: 'Build Two',
    createdAt: '2026-01-01',
  })

  // A sampling of rows in every buildId-scoped table, one per build
  const buildScopedTables = [
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
  ] as const
  for (const table of buildScopedTables) {
    buildStore.setRow(table, `${table}-b1`, { id: `${table}-b1`, buildId: 'b1' })
    buildStore.setRow(table, `${table}-b2`, { id: `${table}-b2`, buildId: 'b2' })
  }

  // hiddenSkills, one row per build (lives in buildStore)
  buildStore.setRow('hiddenSkills', 'csg-b1', { buildId: 'b1', skillName: 'Mining' })
  buildStore.setRow('hiddenSkills', 'csg-b2', { buildId: 'b2', skillName: 'Farming' })

  // Stub persisters: tinybase's real persister.schedule pushes actions to
  // an internal queue and drains them via an async run loop. For tests we
  // invoke the action immediately, which is equivalent from purgeData's
  // perspective — the barrier's resolve() fires and waitForScheduleDrain
  // resolves.
  const makeSchedule = () =>
    vi.fn(async (...actions: Array<() => Promise<unknown>>) => {
      for (const action of actions) await action()
    })
  const persisters: PurgePersisters = {
    gameData: {
      schedule: makeSchedule(),
    } as unknown as PurgePersisters['gameData'],
    build: {
      schedule: makeSchedule(),
    } as unknown as PurgePersisters['build'],
    ui: {
      schedule: makeSchedule(),
    } as unknown as PurgePersisters['ui'],
  }

  return { gameDataStore, buildStore, uiStore, persisters }
}

describe('purgeData', () => {
  it('purgeAllBuilds=true deletes all builds and all build-scoped rows, leaves datasets intact', async () => {
    const f = makeFixture()

    await purgeData(
      { datasetIds: [], purgeAllBuilds: true },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    // All builds gone
    expect(f.buildStore.getRowIds('builds')).toEqual([])

    // Every build-scoped table is empty
    for (const table of [
      'userSkills',
      'userTalents',
      'userCraftingTables',
      'userRecipes',
      'userPrices',
      'userMargins',
      'userRecipeMargins',
      'userSettings',
      'computedPrices',
    ]) {
      expect(f.buildStore.getRowIds(table)).toEqual([])
    }

    // Datasets untouched
    expect(f.gameDataStore.getRowIds('datasets').sort()).toEqual(['ds1', 'ds2'])
    expect(f.gameDataStore.getRowIds('recipes').sort()).toEqual(['recipes-ds1', 'recipes-ds2'])
  })

  it('purging one of two datasets deletes its rows and cascades to its builds, leaving the other untouched', async () => {
    const f = makeFixture()

    await purgeData(
      { datasetIds: ['ds1'], purgeAllBuilds: false },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    // ds1 gone, ds2 intact
    expect(f.gameDataStore.getRowIds('datasets')).toEqual(['ds2'])

    // Every dataset-scoped table: only ds2 rows remain
    for (const table of [
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
    ]) {
      expect(f.gameDataStore.getRowIds(table)).toEqual([`${table}-ds2`])
    }

    // b1 (tied to ds1) is gone; b2 (tied to ds2) survives
    expect(f.buildStore.getRowIds('builds')).toEqual(['b2'])

    // Every build-scoped table: only b2 rows remain
    for (const table of [
      'userSkills',
      'userTalents',
      'userCraftingTables',
      'userRecipes',
      'userPrices',
      'userMargins',
      'userRecipeMargins',
      'userSettings',
      'computedPrices',
    ]) {
      expect(f.buildStore.getRowIds(table)).toEqual([`${table}-b2`])
    }
  })

  it('clears activeBuildId when the active build is deleted', async () => {
    const f = makeFixture()
    f.uiStore.setCell('uiState', 'main', 'activeBuildId', 'b1')
    f.uiStore.setCell('uiState', 'main', 'activeDatasetId', 'ds2')

    await purgeData(
      { datasetIds: [], purgeAllBuilds: true },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    expect(f.uiStore.getCell('uiState', 'main', 'activeBuildId')).toBe('')
    // Not touched — ds2 survived
    expect(f.uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe('ds2')
  })

  it('clears activeDatasetId when the active dataset is deleted', async () => {
    const f = makeFixture()
    f.uiStore.setCell('uiState', 'main', 'activeBuildId', 'b2')
    f.uiStore.setCell('uiState', 'main', 'activeDatasetId', 'ds1')

    await purgeData(
      { datasetIds: ['ds1'], purgeAllBuilds: false },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    expect(f.uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe('')
    // activeBuildId was b2 (tied to surviving ds2) — should be untouched
    expect(f.uiStore.getCell('uiState', 'main', 'activeBuildId')).toBe('b2')
  })

  it('leaves activeBuildId untouched when it points to a surviving build', async () => {
    const f = makeFixture()
    f.uiStore.setCell('uiState', 'main', 'activeBuildId', 'b2')

    await purgeData(
      { datasetIds: ['ds1'], purgeAllBuilds: false },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    expect(f.uiStore.getCell('uiState', 'main', 'activeBuildId')).toBe('b2')
  })

  it('removes hiddenSkills rows tied to deleted builds', async () => {
    const f = makeFixture()

    await purgeData(
      { datasetIds: ['ds1'], purgeAllBuilds: false },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    // csg-b1 tied to deleted b1 → gone; csg-b2 tied to surviving b2 → kept
    expect(f.buildStore.getRowIds('hiddenSkills')).toEqual(['csg-b2'])
  })

  it('drains each persister schedule queue before returning', async () => {
    const f = makeFixture()

    await purgeData(
      { datasetIds: ['ds1'], purgeAllBuilds: true },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    // Every persister got a barrier action via schedule() and waited for it.
    expect(f.persisters.gameData.schedule).toHaveBeenCalledTimes(1)
    expect(f.persisters.build.schedule).toHaveBeenCalledTimes(1)
    expect(f.persisters.ui.schedule).toHaveBeenCalledTimes(1)
  })

  it('purges localized names for the targeted datasets and leaves others intact', async () => {
    const f = makeFixture()
    await saveLocalizedNames('ds1', [
      { id: 'a', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron (ds1)' },
    ])
    await saveLocalizedNames('ds2', [
      { id: 'b', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron (ds2)' },
    ])

    await purgeData(
      { datasetIds: ['ds1'], purgeAllBuilds: false },
      { gameDataStore: f.gameDataStore, buildStore: f.buildStore, uiStore: f.uiStore },
      f.persisters
    )

    const gone = await loadIndex('ds1', 'en-US')
    expect(gone.size).toBe(0)
    const kept = await loadIndex('ds2', 'en-US')
    expect(kept.get('item:iron')).toBe('Iron (ds2)')
  })
})
