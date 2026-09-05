import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

import { __resetLocalizedNameStore, saveLocalizedNames } from '@/stores/localized-name-store'

import { useBuild } from '../use-build'
import { useCraftingTableManagement } from '../use-crafting-table-management'
import { useGameData } from '../use-game-data'
import { useLocalizedName } from '../use-localized-name'
import { useMarginManagement } from '../use-margin-management'
import { usePriceManagement } from '../use-price-management'
import { useProducts } from '../use-products'
import { useRecipeManagement } from '../use-recipe-management'
import { useSettings } from '../use-settings'
import { useSkillManagement } from '../use-skill-management'
import { useSolverSnapshot } from '../use-solver-snapshot'
import { createTestStores, makeWrapper, type TestStores } from './store-wrapper'

const BUILD = 'b1'
const DATASET = 'ds1'

let stores: TestStores
let wrapper: ReturnType<typeof makeWrapper>

async function deleteLocalizedNameDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  stores = createTestStores()
  wrapper = makeWrapper(stores)
  await __resetLocalizedNameStore()
  await deleteLocalizedNameDb()
})

const setupBuild = () => {
  stores.buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DATASET,
    name: 'T',
    createdAt: 'now',
  })
  stores.buildStore.setRow('userSettings', 'st1', {
    id: 'st1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 0,
    showUnskilledRecipes: false,
    onlyLevelAccessible: false,
    applyMarginBetweenSkills: false,
  })
  stores.buildStore.setRow('userMargins', 'm-default', {
    id: 'm-default',
    buildId: BUILD,
    name: 'Default',
    percent: 15,
    isDefault: true,
  })
}

describe('hook wrappers (provider-backed)', () => {
  it('useBuild returns store and ops via provider', () => {
    stores.buildStore.setRow('builds', BUILD, {
      id: BUILD,
      datasetId: DATASET,
      name: 'T',
      createdAt: 'now',
    })
    const { result } = renderHook(() => useBuild(), { wrapper })
    expect(result.current.store).toBe(stores.buildStore)
    expect(result.current.getBuilds(DATASET)).toHaveLength(1)
  })

  it('useBuild memoizes ops across re-renders with stable stores', () => {
    const { result, rerender } = renderHook(() => useBuild(), { wrapper })
    const first = result.current
    rerender()
    expect(result.current.getBuilds).toBe(first.getBuilds)
  })

  it('useCraftingTableManagement returns a working ops object', () => {
    setupBuild()
    const { result } = renderHook(() => useCraftingTableManagement(BUILD, DATASET), { wrapper })
    const id = result.current.addTable('ct1')
    expect(stores.buildStore.getCell('userCraftingTables', id, 'craftingTableId')).toBe('ct1')
  })

  it('useGameData exposes ops bound to the gameDataStore', async () => {
    const { result } = renderHook(() => useGameData(), { wrapper })
    expect(result.current.store).toBe(stores.gameDataStore)
    expect(result.current.getDatasets()).toEqual([])
    const id = await result.current.importDataset(
      {
        skills: [],
        talents: [],
        talentBonuses: [],
        items: [],
        itemParts: [],
        tagItems: [],
        craftingTables: [],
        pluginModules: [],
        pluginModuleBonuses: [],
        craftingTablePluginModules: [],
        itemSalvage: [],
        recipeGarbage: [],
        recipes: [],
        recipeElements: [],
        modifiers: [],
        recipeUnlocks: [],
        gatheringTools: [],
        treeSpecies: [],
        roomCategories: [],
        roomTiers: [],
        gatheringConstants: [],
        localizedNames: [],
      },
      'X'
    )
    expect(stores.gameDataStore.getCell('datasets', id, 'name')).toBe('X')
  })

  it('useMarginManagement returns ops bound to the buildStore', () => {
    setupBuild()
    const { result } = renderHook(() => useMarginManagement(BUILD), { wrapper })
    const id = result.current.createMargin('Custom', 7)
    expect(stores.buildStore.getCell('userMargins', id, 'name')).toBe('Custom')
    expect(stores.buildStore.getCell('userMargins', id, 'percent')).toBe(7)
  })

  it('usePriceManagement persists prices via the wrapper', () => {
    setupBuild()
    const { result } = renderHook(() => usePriceManagement(BUILD), { wrapper })
    result.current.setPrice('iron', 11)
    const ids = stores.buildStore.getRowIds('userPrices')
    expect(ids).toHaveLength(1)
    expect(stores.buildStore.getCell('userPrices', ids[0], 'price')).toBe(11)
  })

  it('useRecipeManagement persists recipes via the wrapper', () => {
    setupBuild()
    const { result } = renderHook(() => useRecipeManagement(BUILD), { wrapper })
    const id = result.current.addRecipe('r1')
    expect(stores.buildStore.getCell('userRecipes', id, 'recipeId')).toBe('r1')
  })

  it('useSettings reads and writes the singleton settings row', () => {
    setupBuild()
    const { result } = renderHook(() => useSettings(BUILD), { wrapper })
    expect(result.current.getSettingsRowId()).toBe('st1')
    result.current.setSetting('calorieCost', 9)
    expect(stores.buildStore.getCell('userSettings', 'st1', 'calorieCost')).toBe(9)
  })

  it('useSkillManagement persists skills via the wrapper', () => {
    setupBuild()
    stores.gameDataStore.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DATASET,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[]',
    })
    const { result } = renderHook(() => useSkillManagement(BUILD, DATASET), { wrapper })
    result.current.addSkill('sk1')
    expect(stores.buildStore.getRowIds('userSkills')).toHaveLength(1)
  })

  it('useSolverSnapshot returns a snapshot through the provider', () => {
    setupBuild()
    const { result } = renderHook(() => useSolverSnapshot(), { wrapper })
    const snap = result.current.buildSnapshot(BUILD, DATASET)
    expect(snap).not.toBeNull()
    expect(snap!.recipes).toEqual([])
  })

  it('useProducts composes localized names with build/game data', async () => {
    setupBuild()
    stores.gameDataStore.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DATASET,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[]',
    })
    stores.gameDataStore.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: DATASET,
      name: 'IronOre',
      familyName: 'Iron',
      skillId: 'sk1',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    stores.gameDataStore.setRow('items', 'iron', {
      id: 'iron',
      datasetId: DATASET,
      name: 'Iron',
      isTag: false,
    })
    stores.gameDataStore.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DATASET,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    await saveLocalizedNames(DATASET, [
      { id: 'ln-r', entityType: 'recipe', entityId: 'r1', locale: 'en-US', name: 'Iron Recipe' },
      { id: 'ln-i', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])
    stores.buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })

    const { result } = renderHook(() => useProducts(BUILD), { wrapper })
    await waitFor(() => {
      expect(result.current.groups[0]?.children[0]?.recipeName).toBe('Iron Recipe')
    })
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].parent).toBeNull()
    expect(result.current.groups[0].children[0].primaryProductName).toBe('Iron')
    expect(result.current.margins).toHaveLength(1)
  })

  it('useLocalizedName resolves names once the async index loads', async () => {
    await saveLocalizedNames(DATASET, [
      { id: 'ln1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])
    const { result, rerender } = renderHook(() => useLocalizedName(DATASET), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    const first = result.current.getName('item', 'iron')
    rerender()
    const second = result.current.getName('item', 'iron')
    expect(first).toBe('Iron')
    expect(second).toBe('Iron')
  })

  it('useLocalizedName picks up a re-saved index on the next load', async () => {
    await saveLocalizedNames(DATASET, [
      { id: 'ln1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])

    const { result, unmount } = renderHook(() => useLocalizedName(DATASET), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.getName('item', 'iron')).toBe('Iron')
    unmount()

    // Re-save with a different name; mount a fresh hook and verify the cache was invalidated.
    await saveLocalizedNames(DATASET, [
      { id: 'ln1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron Ore' },
    ])
    const { result: result2 } = renderHook(() => useLocalizedName(DATASET), { wrapper })
    await waitFor(() => expect(result2.current.ready).toBe(true))
    expect(result2.current.getName('item', 'iron')).toBe('Iron Ore')
  })

  it('useStores throws when used outside StoreProvider', async () => {
    const { useStores } = await import('@/stores/providers')
    expect(() => renderHook(() => useStores())).toThrow(/StoreProvider/)
  })
})
