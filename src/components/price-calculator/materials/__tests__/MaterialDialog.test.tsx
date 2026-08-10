import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore, saveLocalizedNames } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { MaterialDialog } from '../MaterialDialog'

import '@/i18n'

const BUILD_ID = 'b1'
const DS = 'ds1'
const SKILL_A = 'skill-mining'
const SKILL_B = 'skill-smelting'
const RECIPE_USES_ITEM = 'recipe-uses-stone'
const RECIPE_USES_TAG = 'recipe-uses-rocks'
const RECIPE_PRODUCES_ITEM = 'recipe-produces-stone'
const RECIPE_OUT_OF_BUILD = 'recipe-not-in-build'
const RECIPE_PRODUCES_NOT_IN_BUILD = 'recipe-wild-mining'
const RECIPE_REINTEGRATES = 'recipe-stone-refining'
const ITEM_STONE = 'stone'
const ITEM_INGOT = 'ingot'
const TAG_ROCKS = 'tag-rocks'

async function deleteLocalizedNameDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

async function seedNames(): Promise<void> {
  await saveLocalizedNames(DS, [
    { id: '1', entityType: 'item', entityId: ITEM_STONE, locale: 'en-US', name: 'Stone' },
    { id: '2', entityType: 'item', entityId: ITEM_INGOT, locale: 'en-US', name: 'Ingot' },
    { id: '3', entityType: 'item', entityId: TAG_ROCKS, locale: 'en-US', name: 'Rocks' },
    { id: '4', entityType: 'skill', entityId: SKILL_A, locale: 'en-US', name: 'Mining' },
    { id: '5', entityType: 'skill', entityId: SKILL_B, locale: 'en-US', name: 'Smelting' },
    {
      id: '6',
      entityType: 'recipe',
      entityId: RECIPE_USES_ITEM,
      locale: 'en-US',
      name: 'Stone Crusher',
    },
    {
      id: '7',
      entityType: 'recipe',
      entityId: RECIPE_USES_TAG,
      locale: 'en-US',
      name: 'Rock Smelting',
    },
    {
      id: '8',
      entityType: 'recipe',
      entityId: RECIPE_PRODUCES_ITEM,
      locale: 'en-US',
      name: 'Stone Quarry',
    },
    {
      id: '9',
      entityType: 'recipe',
      entityId: RECIPE_OUT_OF_BUILD,
      locale: 'en-US',
      name: 'Excluded Recipe',
    },
    {
      id: '10',
      entityType: 'recipe',
      entityId: RECIPE_PRODUCES_NOT_IN_BUILD,
      locale: 'en-US',
      name: 'Wild Mining',
    },
    {
      id: '11',
      entityType: 'recipe',
      entityId: RECIPE_REINTEGRATES,
      locale: 'en-US',
      name: 'Stone Refining',
    },
  ])
}

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async (...actions: Array<() => Promise<unknown>>) => {
      for (const a of actions) await a()
    },
  } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  gameDataStore.setRow('datasets', DS, {
    id: DS,
    name: 'DS',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
  gameDataStore.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
  gameDataStore.setRow('skills', SKILL_A, {
    id: SKILL_A,
    datasetId: DS,
    name: 'Mining',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('skills', SKILL_B, {
    id: SKILL_B,
    datasetId: DS,
    name: 'Smelting',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('items', ITEM_STONE, {
    id: ITEM_STONE,
    datasetId: DS,
    name: 'Stone',
    isTag: false,
  })
  gameDataStore.setRow('items', ITEM_INGOT, {
    id: ITEM_INGOT,
    datasetId: DS,
    name: 'Ingot',
    isTag: false,
  })
  gameDataStore.setRow('items', TAG_ROCKS, {
    id: TAG_ROCKS,
    datasetId: DS,
    name: 'Rocks',
    isTag: true,
  })
  gameDataStore.setRow('tagItems', 'ti-stone-rocks', {
    id: 'ti-stone-rocks',
    datasetId: DS,
    tagId: TAG_ROCKS,
    itemId: ITEM_STONE,
  })

  // Recipe that uses Stone directly as an ingredient and produces Ingot.
  gameDataStore.setRow('recipes', RECIPE_USES_ITEM, {
    id: RECIPE_USES_ITEM,
    datasetId: DS,
    name: 'Stone Crusher',
    familyName: 'Stone',
    skillId: SKILL_A,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 'sc-in', {
    id: 'sc-in',
    datasetId: DS,
    recipeId: RECIPE_USES_ITEM,
    itemOrTagId: ITEM_STONE,
    baseQuantity: -5,
    isProduct: false,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 'sc-out', {
    id: 'sc-out',
    datasetId: DS,
    recipeId: RECIPE_USES_ITEM,
    itemOrTagId: ITEM_INGOT,
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })

  // Recipe that uses the Rocks tag (Stone satisfies Rocks).
  gameDataStore.setRow('recipes', RECIPE_USES_TAG, {
    id: RECIPE_USES_TAG,
    datasetId: DS,
    name: 'Rock Smelting',
    familyName: 'Rocks',
    skillId: SKILL_B,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 'rs-in', {
    id: 'rs-in',
    datasetId: DS,
    recipeId: RECIPE_USES_TAG,
    itemOrTagId: TAG_ROCKS,
    baseQuantity: -3,
    isProduct: false,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 'rs-out', {
    id: 'rs-out',
    datasetId: DS,
    recipeId: RECIPE_USES_TAG,
    itemOrTagId: ITEM_INGOT,
    baseQuantity: 2,
    isProduct: true,
    index: 0,
  })

  // Recipe that PRODUCES stone — must NOT appear in the dialog (we only list
  // ingredient uses).
  gameDataStore.setRow('recipes', RECIPE_PRODUCES_ITEM, {
    id: RECIPE_PRODUCES_ITEM,
    datasetId: DS,
    name: 'Stone Quarry',
    familyName: 'Quarry',
    skillId: SKILL_A,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 'sq-out', {
    id: 'sq-out',
    datasetId: DS,
    recipeId: RECIPE_PRODUCES_ITEM,
    itemOrTagId: ITEM_STONE,
    baseQuantity: 4,
    isProduct: true,
    index: 0,
  })

  // Recipe that uses Stone but is NOT in the build — must be excluded from
  // the "Used in Recipes" tab.
  gameDataStore.setRow('recipes', RECIPE_OUT_OF_BUILD, {
    id: RECIPE_OUT_OF_BUILD,
    datasetId: DS,
    name: 'Excluded Recipe',
    familyName: 'Excluded',
    skillId: SKILL_A,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 'er-in', {
    id: 'er-in',
    datasetId: DS,
    recipeId: RECIPE_OUT_OF_BUILD,
    itemOrTagId: ITEM_STONE,
    baseQuantity: -1,
    isProduct: false,
    index: 0,
  })

  // Recipe that PRODUCES Stone but is NOT in the build — must still appear
  // in the "Produced by Recipes" tab (that tab is whole-game).
  gameDataStore.setRow('recipes', RECIPE_PRODUCES_NOT_IN_BUILD, {
    id: RECIPE_PRODUCES_NOT_IN_BUILD,
    datasetId: DS,
    name: 'Wild Mining',
    familyName: 'Mining',
    skillId: SKILL_A,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 'wm-out', {
    id: 'wm-out',
    datasetId: DS,
    recipeId: RECIPE_PRODUCES_NOT_IN_BUILD,
    itemOrTagId: ITEM_STONE,
    baseQuantity: 6,
    isProduct: true,
    index: 0,
  })

  // Reintegration: a recipe that BOTH consumes and produces Stone — must be
  // excluded from "Produced by Recipes".
  gameDataStore.setRow('recipes', RECIPE_REINTEGRATES, {
    id: RECIPE_REINTEGRATES,
    datasetId: DS,
    name: 'Stone Refining',
    familyName: 'Refining',
    skillId: SKILL_B,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipeElements', 'sr-in', {
    id: 'sr-in',
    datasetId: DS,
    recipeId: RECIPE_REINTEGRATES,
    itemOrTagId: ITEM_STONE,
    baseQuantity: -3,
    isProduct: false,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 'sr-out', {
    id: 'sr-out',
    datasetId: DS,
    recipeId: RECIPE_REINTEGRATES,
    itemOrTagId: ITEM_STONE,
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })

  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: DS,
    name: 'Build',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userRecipes', 'ur-1', {
    id: 'ur-1',
    buildId: BUILD_ID,
    recipeId: RECIPE_USES_ITEM,
    roundFactor: 0,
  })
  buildStore.setRow('userRecipes', 'ur-2', {
    id: 'ur-2',
    buildId: BUILD_ID,
    recipeId: RECIPE_USES_TAG,
    roundFactor: 0,
  })
  buildStore.setRow('userRecipes', 'ur-3', {
    id: 'ur-3',
    buildId: BUILD_ID,
    recipeId: RECIPE_PRODUCES_ITEM,
    roundFactor: 0,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(
  stores: ReturnType<typeof makeStores>,
  itemId: string | null,
  onOpenRecipe: (id: string) => void = () => {}
) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <MaterialDialog
        itemId={itemId}
        buildId={BUILD_ID}
        datasetId={DS}
        onHide={() => {}}
        onOpenRecipe={onOpenRecipe}
      />
    </StoreContext.Provider>
  )
}

describe('MaterialDialog', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(async () => {
    await __resetLocalizedNameStore()
    await deleteLocalizedNameDb()
    await seedNames()
    stores = makeStores()
  })

  it('renders nothing when itemId is null', () => {
    const { container } = renderDialog(stores, null)
    expect(container.textContent).toBe('')
  })

  it('defaults to in-build recipes that use the item as an ingredient (direct + via tag), excluding producers and out-of-build recipes', async () => {
    renderDialog(stores, ITEM_STONE)

    await waitFor(() => {
      expect(screen.getByText('Stone Crusher')).toBeTruthy()
      expect(screen.getByText('Rock Smelting')).toBeTruthy()
    })

    expect(screen.queryByText('Stone Quarry')).toBeNull()
    expect(screen.queryByText('Excluded Recipe')).toBeNull()

    const rows = screen.getAllByRole('row')
    const rowTexts = rows.map((r) => r.textContent ?? '')
    const stoneCrusherRow = rowTexts.find((t) => t.includes('Stone Crusher'))
    const rockSmeltingRow = rowTexts.find((t) => t.includes('Rock Smelting'))
    expect(stoneCrusherRow).toBeTruthy()
    expect(rockSmeltingRow).toBeTruthy()
    expect(stoneCrusherRow).toContain('5')
    expect(rockSmeltingRow).toContain('3')
    expect(rockSmeltingRow).toContain('Rocks')
  })

  it('scope toggle switches the used-in list between in-build, out-of-build and all recipes', async () => {
    renderDialog(stores, ITEM_STONE)

    // Defaults to "Mine".
    await waitFor(() => {
      expect(screen.getByText('Stone Crusher')).toBeTruthy()
    })
    expect(screen.queryByText('Excluded Recipe')).toBeNull()

    fireEvent.click(screen.getByText('Other'))
    await waitFor(() => {
      expect(screen.getByText('Excluded Recipe')).toBeTruthy()
    })
    // Stone Refining consumes Stone and isn't in the build — also "other".
    expect(screen.getByText('Stone Refining')).toBeTruthy()
    expect(screen.queryByText('Stone Crusher')).toBeNull()
    expect(screen.queryByText('Rock Smelting')).toBeNull()

    fireEvent.click(screen.getByText('All'))
    await waitFor(() => {
      expect(screen.getByText('Stone Crusher')).toBeTruthy()
    })
    expect(screen.getByText('Rock Smelting')).toBeTruthy()
    expect(screen.getByText('Excluded Recipe')).toBeTruthy()
    expect(screen.getByText('Stone Refining')).toBeTruthy()
    // Producers still never show up here.
    expect(screen.queryByText('Stone Quarry')).toBeNull()
  })

  it('shows a scope-specific empty message when no recipes match', async () => {
    renderDialog(stores, ITEM_INGOT)

    // Ingot is produced by both in-build recipes but consumed by none.
    await waitFor(() => {
      expect(screen.getByText('No recipes in this build use this item.')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Other'))
    await waitFor(() => {
      expect(screen.getByText('No recipes outside this build use this item.')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('All'))
    await waitFor(() => {
      expect(screen.getByText('No recipes use this item.')).toBeTruthy()
    })
  })

  it('invokes onOpenRecipe when a recipe name is clicked', async () => {
    const onOpenRecipe = vi.fn()
    renderDialog(stores, ITEM_STONE, onOpenRecipe)

    await waitFor(() => {
      expect(screen.getByText('Stone Crusher')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Stone Crusher'))
    expect(onOpenRecipe).toHaveBeenCalledWith(RECIPE_USES_ITEM)
  })

  it('lists recipes that use the tag directly when opened on a tag entity', async () => {
    renderDialog(stores, TAG_ROCKS)

    await waitFor(() => {
      expect(screen.getByText('Rock Smelting')).toBeTruthy()
    })

    expect(screen.queryByText('Stone Crusher')).toBeNull()
  })

  it('hides the "Produced by Recipes" tab when the entity is a tag', () => {
    renderDialog(stores, TAG_ROCKS)
    expect(screen.queryByText('Produced by Recipes')).toBeNull()
    expect(screen.getByText('Used in Recipes')).toBeTruthy()
  })

  it('shows a "Dependency Graph" tab when the item has a producing recipe with ingredients', () => {
    // Ingot is produced by RECIPE_USES_ITEM (Stone Crusher), which consumes
    // Stone — non-empty graph. Tab should appear.
    renderDialog(stores, ITEM_INGOT)
    expect(screen.getByText('Dependency Graph')).toBeTruthy()
  })

  it('hides the "Dependency Graph" tab for tags', () => {
    renderDialog(stores, TAG_ROCKS)
    expect(screen.queryByText('Dependency Graph')).toBeNull()
  })

  it('hides the "Dependency Graph" tab when no producing recipe has ingredients', () => {
    // Stone's only producers (Stone Quarry, Wild Mining, Stone Refining) have
    // no ingredients (or only reintegrated ones), so the graph would be a
    // single node — no point in surfacing the tab.
    renderDialog(stores, ITEM_STONE)
    expect(screen.queryByText('Dependency Graph')).toBeNull()
  })

  it('produced-by tab lists every in-game producer regardless of build, and excludes reintegrators', async () => {
    renderDialog(stores, ITEM_STONE)

    fireEvent.click(screen.getByText('Produced by Recipes'))

    // Stone Quarry is in the build and produces Stone — listed.
    // Wild Mining is NOT in the build but produces Stone — still listed
    // because the Produced-by tab is whole-game.
    await waitFor(() => {
      expect(screen.getByText('Stone Quarry')).toBeTruthy()
      expect(screen.getByText('Wild Mining')).toBeTruthy()
    })

    // Stone Refining produces AND consumes Stone — reintegration, excluded.
    expect(screen.queryByText('Stone Refining')).toBeNull()
    // Recipes that only consume Stone are not producers.
    expect(screen.queryByText('Stone Crusher')).toBeNull()
    expect(screen.queryByText('Excluded Recipe')).toBeNull()
  })

  it('clicking a recipe in the produced-by tab fires onOpenRecipe', async () => {
    const onOpenRecipe = vi.fn()
    renderDialog(stores, ITEM_STONE, onOpenRecipe)

    fireEvent.click(screen.getByText('Produced by Recipes'))

    await waitFor(() => {
      expect(screen.getByText('Wild Mining')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Wild Mining'))
    expect(onOpenRecipe).toHaveBeenCalledWith(RECIPE_PRODUCES_NOT_IN_BUILD)
  })
})
