import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import {
  __resetLocalizedNameStore,
  loadIndex,
  upsertLocalizedNames,
} from '@/stores/localized-name-store'
import { createUIStore } from '@/stores/ui-store'
import type { DatasetJson } from '@/types/dataset-json'
import type { ManifestEntry } from '@/types/dataset-manifest'

import { applyDatasetUpdate } from '../apply-dataset-update'
import { createCustomItem, createCustomRecipe, type CustomRecipeInput } from '../custom-entities'

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

  // Guards every buildStore column that stores a game-data row id. A column
  // missing from the sweep is orphaned permanently, because the old dataset is
  // purged right after — so each one gets an explicit assertion here.
  it('remaps every buildStore column that references a game-data id', async () => {
    const { stores, oldDatasetId } = await setupV1Install()

    const oldSkillId = findRowIdByCell(stores.game, 'skills', 'name', 'Mining')!
    const oldRecipeId = findRowIdByCell(stores.game, 'recipes', 'name', 'PlankRecipe')!
    const oldCtId = findRowIdByCell(stores.game, 'craftingTables', 'name', 'Workbench')!
    const oldPmId = findRowIdByCell(stores.game, 'pluginModules', 'name', 'BasicUpgrade')!
    const oldWoodId = findRowIdByCell(stores.game, 'items', 'name', 'Wood')!
    const oldPlankId = findRowIdByCell(stores.game, 'items', 'name', 'Plank')!
    const oldTagId = findRowIdByCell(stores.game, 'items', 'name', 'WoodTag')!
    const oldTalentId = findRowIdByCell(stores.game, 'talents', 'name', 'Sharp')!

    stores.build.setRow('builds', 'b1', {
      id: 'b1',
      datasetId: oldDatasetId,
      name: 'My Build',
      createdAt: '2026-01-01',
    })
    const rows: [string, string, Record<string, unknown>][] = [
      ['userSkills', 'skillId', { skillId: oldSkillId, level: 5 }],
      ['userTalents', 'talentId', { talentId: oldTalentId, enabled: true }],
      ['userCraftingTables', 'craftingTableId', { craftingTableId: oldCtId }],
      ['userCraftingTables', 'pluginModuleId', { pluginModuleId: oldPmId }],
      ['userRecipes', 'recipeId', { recipeId: oldRecipeId }],
      ['userPrices', 'itemOrTagId', { itemOrTagId: oldWoodId }],
      ['userPrices', 'primaryItemId', { primaryItemId: oldPlankId }],
      ['userProductMargins', 'itemOrTagId', { itemOrTagId: oldPlankId }],
      ['userProductShares', 'productItemOrTagId', { productItemOrTagId: oldPlankId }],
      ['userReintegratedProducts', 'productItemOrTagId', { productItemOrTagId: oldPlankId }],
      ['userPlantings', 'cropItemId', { cropItemId: oldWoodId }],
      ['hiddenSkills', 'skillId', { skillId: oldSkillId }],
      ['hiddenCraftingTables', 'craftingTableId', { craftingTableId: oldCtId }],
      ['hiddenTags', 'tagId', { tagId: oldTagId }],
      ['computedPrices', 'itemOrTagId', { itemOrTagId: oldWoodId }],
      ['computedPrices', 'recipeId', { recipeId: oldRecipeId }],
    ]
    rows.forEach(([table, field, cells], i) => {
      const rowId = `${table}-${field}-${i}`
      stores.build.setRow(table, rowId, { id: rowId, buildId: 'b1', ...cells })
    })

    stubFetch(minimalDataset())
    await applyDatasetUpdate(v2Entry, stores.game, stores.build, stores.ui)
    vi.unstubAllGlobals()

    const newIds: Record<string, string> = {
      [oldSkillId]: findRowIdByCell(stores.game, 'skills', 'name', 'Mining')!,
      [oldTalentId]: findRowIdByCell(stores.game, 'talents', 'name', 'Sharp')!,
      [oldCtId]: findRowIdByCell(stores.game, 'craftingTables', 'name', 'Workbench')!,
      [oldPmId]: findRowIdByCell(stores.game, 'pluginModules', 'name', 'BasicUpgrade')!,
      [oldRecipeId]: findRowIdByCell(stores.game, 'recipes', 'name', 'PlankRecipe')!,
      [oldWoodId]: findRowIdByCell(stores.game, 'items', 'name', 'Wood')!,
      [oldPlankId]: findRowIdByCell(stores.game, 'items', 'name', 'Plank')!,
      [oldTagId]: findRowIdByCell(stores.game, 'items', 'name', 'WoodTag')!,
    }

    rows.forEach(([table, field, cells], i) => {
      const rowId = `${table}-${field}-${i}`
      const oldValue = cells[field] as string
      const expected = newIds[oldValue]
      // The import must actually have minted fresh ids, or this proves nothing.
      expect(expected, `no new id for ${table}.${field}`).not.toBe(oldValue)
      expect(stores.build.getCell(table, rowId, field), `${table}.${field} was not remapped`).toBe(
        expected
      )
    })
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

  it('migrates custom items and recipes through update', async () => {
    const { stores, oldDatasetId } = await setupV1Install()

    const oldWoodId = findRowIdByCell(stores.game, 'items', 'name', 'Wood')!

    // Author a custom item, then a custom recipe that consumes Wood (standard
    // ingredient) AND the custom item, producing the custom item.
    const customItemId = await createCustomItem(stores.game, oldDatasetId, 'Refined Wood', 'en-US')
    const customInput: CustomRecipeInput = {
      name: 'Refine Wood',
      craftingTableId: findRowIdByCell(stores.game, 'craftingTables', 'name', 'Workbench')!,
      skillId: findRowIdByCell(stores.game, 'skills', 'name', 'Mining')!,
      requiredSkillLevel: 0,
      baseLaborCost: 25,
      baseCraftTime: 0,
      ingredients: [
        { itemId: oldWoodId, baseQuantity: 4, isReducedByModule: true },
        { itemId: customItemId, baseQuantity: 1, isReducedByModule: false },
      ],
      products: [{ itemId: customItemId, quantity: 1 }],
    }
    const customRecipeId = await createCustomRecipe(stores.game, oldDatasetId, customInput, 'en-US')

    // A build references the custom recipe and the custom item via userPrices,
    // which should keep working after the update.
    stores.build.setRow('builds', 'b1', {
      id: 'b1',
      datasetId: oldDatasetId,
      name: 'Build',
      createdAt: '2026-01-01',
    })
    stores.build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: 'b1',
      recipeId: customRecipeId,
      roundFactor: 0,
    })
    stores.build.setRow('userPrices', 'up-custom', {
      id: 'up-custom',
      buildId: 'b1',
      itemOrTagId: customItemId,
      price: 7,
    })

    stubFetch(minimalDataset())
    const result = await applyDatasetUpdate(v2Entry, stores.game, stores.build, stores.ui)
    vi.unstubAllGlobals()

    // Custom item retains its UUID but gets retagged to the new dataset.
    expect(stores.game.hasRow('items', customItemId)).toBe(true)
    expect(stores.game.getCell('items', customItemId, 'datasetId')).toBe(result.datasetId)
    expect(stores.game.getCell('items', customItemId, 'isCustom')).toBe(true)

    // Custom recipe retains its UUID and is retagged.
    expect(stores.game.hasRow('recipes', customRecipeId)).toBe(true)
    expect(stores.game.getCell('recipes', customRecipeId, 'datasetId')).toBe(result.datasetId)

    // Skill and crafting table refs are remapped to the new dataset's UUIDs.
    const newSkillId = findRowIdByCell(stores.game, 'skills', 'name', 'Mining')!
    const newCtId = findRowIdByCell(stores.game, 'craftingTables', 'name', 'Workbench')!
    expect(stores.game.getCell('recipes', customRecipeId, 'skillId')).toBe(newSkillId)
    expect(stores.game.getCell('recipes', customRecipeId, 'craftingTableId')).toBe(newCtId)

    // Ingredients: the standard "Wood" ref should be remapped to the new id;
    // the custom-item ref should be unchanged.
    const newWoodId = findRowIdByCell(stores.game, 'items', 'name', 'Wood')!
    expect(newWoodId).not.toBe(oldWoodId)
    const elementRows = stores.game
      .getRowIds('recipeElements')
      .map((id) => stores.game.getRow('recipeElements', id))
      .filter((r) => r.recipeId === customRecipeId)
    const ingredients = elementRows.filter((r) => !r.isProduct)
    const standardIng = ingredients.find((r) => r.baseQuantity === -4)!
    expect(standardIng.itemOrTagId).toBe(newWoodId)
    const customIng = ingredients.find((r) => r.baseQuantity === -1)!
    expect(customIng.itemOrTagId).toBe(customItemId)

    // Modifiers tied to the custom recipe / its elements survive with the new
    // datasetId.
    const elementIdSet = new Set(
      stores.game
        .getRowIds('recipeElements')
        .filter((id) => stores.game.getCell('recipeElements', id, 'recipeId') === customRecipeId)
    )
    const ownedModifiers = stores.game
      .getRowIds('modifiers')
      .map((id) => ({ id, row: stores.game.getRow('modifiers', id) }))
      .filter(
        ({ row }) => row.targetId === customRecipeId || elementIdSet.has(row.targetId as string)
      )
    expect(ownedModifiers.length).toBeGreaterThan(0)
    for (const m of ownedModifiers) {
      expect(m.row.datasetId).toBe(result.datasetId)
    }

    // Build references survive: the user's price for the custom item still
    // resolves because the UUID is preserved.
    expect(stores.build.getCell('userPrices', 'up-custom', 'itemOrTagId')).toBe(customItemId)
    expect(stores.build.getCell('userRecipes', 'ur1', 'recipeId')).toBe(customRecipeId)
  })

  it('moves custom localized names to the new dataset', async () => {
    const { stores, oldDatasetId } = await setupV1Install()

    const customItemId = await createCustomItem(stores.game, oldDatasetId, 'My Item', 'en-US')
    // Add a second-locale entry to verify it migrates too.
    await upsertLocalizedNames(oldDatasetId, [
      { id: '', entityType: 'item', entityId: customItemId, locale: 'fr-FR', name: 'Mon Objet' },
    ])

    stubFetch(minimalDataset())
    const result = await applyDatasetUpdate(v2Entry, stores.game, stores.build, stores.ui)
    vi.unstubAllGlobals()

    const enIndex = await loadIndex(result.datasetId, 'en-US')
    expect(enIndex.get(`item:${customItemId}`)).toBe('My Item')
    const frIndex = await loadIndex(result.datasetId, 'fr-FR')
    expect(frIndex.get(`item:${customItemId}`)).toBe('Mon Objet')
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
