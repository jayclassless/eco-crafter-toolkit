import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { createUIStore } from '@/stores/ui-store'
import type { DatasetJson } from '@/types/dataset-json'
import type { ManifestEntry } from '@/types/dataset-manifest'

import { applyDatasetUpdate } from '../apply-dataset-update'

const minimalDataset = (skillName = 'Mining', plankName = 'Plank'): DatasetJson =>
  ({
    Version: 1,
    Skills: [
      {
        Name: skillName,
        LocalizedName: { 'en-US': skillName },
        MaxLevel: 7,
        LaborReducePercent: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
        Talents: [
          {
            Name: 'Sharp',
            LocalizedName: { 'en-US': 'Sharp' },
            TalentGroupName: 'Precision',
            Value: 0.8,
            Level: 1,
          },
        ],
      },
    ],
    Items: [
      { Name: 'Wood', LocalizedName: { 'en-US': 'Wood' } },
      { Name: plankName, LocalizedName: { 'en-US': plankName } },
      {
        Name: 'BasicUpgrade',
        LocalizedName: { 'en-US': 'Basic Upgrade' },
        IsPluginModule: true,
        PluginType: 'Resource',
        PluginModulePercent: 0.9,
      },
      {
        Name: 'Workbench',
        LocalizedName: { 'en-US': 'Workbench' },
        IsCraftingTable: true,
        CraftingTablePluginModules: ['BasicUpgrade'],
      },
    ],
    Tags: [
      {
        Name: 'WoodTag',
        LocalizedName: { 'en-US': 'WoodTag' },
        AssociatedItems: ['Wood'],
      },
    ],
    Recipes: [
      {
        Name: 'PlankRecipe',
        LocalizedName: { 'en-US': 'PlankRecipe' },
        FamilyName: 'Plank',
        CraftMinutes: { BaseValue: 1, Modifiers: [] },
        RequiredSkill: skillName,
        RequiredSkillLevel: 1,
        IsBlueprint: false,
        IsDefault: true,
        Labor: { BaseValue: 100, Modifiers: [{ DynamicType: 'Skill', Item: skillName }] },
        CraftingTable: 'Workbench',
        Ingredients: [{ ItemOrTag: 'Wood', Quantity: { BaseValue: 4, Modifiers: [] } }],
        Products: [{ ItemOrTag: plankName, Quantity: { BaseValue: 2, Modifiers: [] } }],
      },
    ],
  }) as unknown as DatasetJson

const stubFetch = (dataset: DatasetJson) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => dataset }))
  )
}

const v1Entry: ManifestEntry = {
  id: 'eco-vtest',
  name: 'Eco vTest',
  file: 'eco-vtest.json',
  revision: 1,
  updatedAt: '2026-04-01',
}

const v2Entry: ManifestEntry = { ...v1Entry, revision: 2 }

beforeEach(async () => {
  await __resetLocalizedNameStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

interface TestStores {
  game: ReturnType<typeof createGameDataStore>
  build: ReturnType<typeof createBuildStore>
  ui: ReturnType<typeof createUIStore>
}

async function setupV1Install(): Promise<{ stores: TestStores; oldDatasetId: string }> {
  const game = createGameDataStore()
  const build = createBuildStore()
  const ui = createUIStore()

  stubFetch(minimalDataset())
  const { importDatasetFromManifestEntry } = await import('../import-dataset-from-manifest')
  const oldDatasetId = await importDatasetFromManifestEntry(v1Entry, game)
  vi.unstubAllGlobals()

  return { stores: { game, build, ui }, oldDatasetId }
}

const findRowIdByCell = (
  store: ReturnType<typeof createGameDataStore>,
  table: string,
  cell: string,
  value: unknown
) => {
  for (const id of store.getRowIds(table)) {
    if (store.getCell(table, id, cell) === value) return id
  }
  return undefined
}

describe('applyDatasetUpdate', () => {
  it('throws when no dataset matching the bundledId is installed', async () => {
    const game = createGameDataStore()
    const build = createBuildStore()
    const ui = createUIStore()
    await expect(applyDatasetUpdate(v1Entry, game, build, ui)).rejects.toThrow(/not installed/)
  })

  it('returns the existing datasetId when no upgrade is needed', async () => {
    const { stores, oldDatasetId } = await setupV1Install()
    const result = await applyDatasetUpdate(v1Entry, stores.game, stores.build, stores.ui)
    expect(result.datasetId).toBe(oldDatasetId)
    // The dataset should still be installed (not replaced)
    expect(stores.game.hasRow('datasets', oldDatasetId)).toBe(true)
  })

  it('imports the new dataset, remaps build entity ids by name, and deletes the old dataset', async () => {
    const { stores, oldDatasetId } = await setupV1Install()

    const oldSkillId = findRowIdByCell(stores.game, 'skills', 'name', 'Mining')!
    const oldRecipeId = findRowIdByCell(stores.game, 'recipes', 'name', 'PlankRecipe')!
    const oldCtId = findRowIdByCell(stores.game, 'craftingTables', 'name', 'Workbench')!
    const oldPmId = findRowIdByCell(stores.game, 'pluginModules', 'name', 'BasicUpgrade')!
    const oldWoodId = findRowIdByCell(stores.game, 'items', 'name', 'Wood')!
    const oldPlankId = findRowIdByCell(stores.game, 'items', 'name', 'Plank')!
    const oldTalentId = findRowIdByCell(stores.game, 'talents', 'name', 'Sharp')!

    // Build that references old ids
    stores.build.setRow('builds', 'b1', {
      id: 'b1',
      datasetId: oldDatasetId,
      name: 'My Build',
      createdAt: '2026-01-01',
    })
    stores.build.setRow('userSkills', 'us1', {
      id: 'us1',
      buildId: 'b1',
      skillId: oldSkillId,
      level: 5,
    })
    stores.build.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: 'b1',
      talentId: oldTalentId,
      enabled: true,
    })
    stores.build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: 'b1',
      craftingTableId: oldCtId,
      pluginModuleId: oldPmId,
      costPerMinute: 0.1,
    })
    stores.build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: 'b1',
      recipeId: oldRecipeId,
      roundFactor: 0,
    })
    stores.build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b1',
      itemOrTagId: oldWoodId,
      price: 5,
    })
    stores.ui.setCell('uiState', 'main', 'activeDatasetId', oldDatasetId)

    // Stub fetch for v2 import
    stubFetch(minimalDataset())
    const result = await applyDatasetUpdate(v2Entry, stores.game, stores.build, stores.ui)
    vi.unstubAllGlobals()

    // Old dataset removed; new one created
    expect(stores.game.hasRow('datasets', oldDatasetId)).toBe(false)
    expect(stores.game.hasRow('datasets', result.datasetId)).toBe(true)

    // Build was reattached to the new dataset
    expect(stores.build.getCell('builds', 'b1', 'datasetId')).toBe(result.datasetId)
    // UI active dataset moved over
    expect(stores.ui.getCell('uiState', 'main', 'activeDatasetId')).toBe(result.datasetId)

    // Find new ids
    const newSkillId = findRowIdByCell(stores.game, 'skills', 'name', 'Mining')!
    const newRecipeId = findRowIdByCell(stores.game, 'recipes', 'name', 'PlankRecipe')!
    const newCtId = findRowIdByCell(stores.game, 'craftingTables', 'name', 'Workbench')!
    const newPmId = findRowIdByCell(stores.game, 'pluginModules', 'name', 'BasicUpgrade')!
    const newWoodId = findRowIdByCell(stores.game, 'items', 'name', 'Wood')!
    const newTalentId = findRowIdByCell(stores.game, 'talents', 'name', 'Sharp')!

    expect(newSkillId).not.toBe(oldSkillId)
    expect(stores.build.getCell('userSkills', 'us1', 'skillId')).toBe(newSkillId)
    expect(stores.build.getCell('userTalents', 'ut1', 'talentId')).toBe(newTalentId)
    expect(stores.build.getCell('userCraftingTables', 'uct1', 'craftingTableId')).toBe(newCtId)
    expect(stores.build.getCell('userCraftingTables', 'uct1', 'pluginModuleId')).toBe(newPmId)
    expect(stores.build.getCell('userRecipes', 'ur1', 'recipeId')).toBe(newRecipeId)
    expect(stores.build.getCell('userPrices', 'up1', 'itemOrTagId')).toBe(newWoodId)

    // Old plank id (used to verify cleanup) should no longer exist as a row
    expect(stores.game.hasRow('items', oldPlankId)).toBe(false)
  })

  it('does not touch builds attached to other datasets', async () => {
    const { stores } = await setupV1Install()
    const otherDatasetId = 'other-ds'
    stores.game.setRow('datasets', otherDatasetId, {
      id: otherDatasetId,
      name: 'Other',
      version: 1,
      bundledId: '',
      installedRevision: 0,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: true,
    })
    stores.build.setRow('builds', 'b-other', {
      id: 'b-other',
      datasetId: otherDatasetId,
      name: 'Other',
      createdAt: '2026-01-01',
    })

    stubFetch(minimalDataset())
    await applyDatasetUpdate(v2Entry, stores.game, stores.build, stores.ui)
    vi.unstubAllGlobals()

    expect(stores.build.getCell('builds', 'b-other', 'datasetId')).toBe(otherDatasetId)
    // Old (non-target) dataset is untouched
    expect(stores.game.hasRow('datasets', otherDatasetId)).toBe(true)
  })

  it('cleans up after a previously failed mid-flight update by reusing the existing new install', async () => {
    const { stores, oldDatasetId } = await setupV1Install()

    // Simulate a stranded post-import / pre-sweep state: a second dataset row
    // with the same bundledId already installed at the target revision.
    stubFetch(minimalDataset())
    const { importDatasetFromManifestEntry } = await import('../import-dataset-from-manifest')
    const strandedNewId = await importDatasetFromManifestEntry(v2Entry, stores.game)
    vi.unstubAllGlobals()

    expect(stores.game.hasRow('datasets', oldDatasetId)).toBe(true)
    expect(stores.game.hasRow('datasets', strandedNewId)).toBe(true)

    const result = await applyDatasetUpdate(v2Entry, stores.game, stores.build, stores.ui)

    // Returned id should match the existing pre-imported new dataset row.
    expect(result.datasetId).toBe(strandedNewId)
    expect(stores.game.hasRow('datasets', oldDatasetId)).toBe(false)
    expect(stores.game.hasRow('datasets', strandedNewId)).toBe(true)
  })
})
