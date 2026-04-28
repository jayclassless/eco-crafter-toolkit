import { beforeEach, describe, expect, it } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'

import {
  countCustomEntities,
  createCustomItem,
  createCustomRecipe,
  type CustomRecipeInput,
  deleteCustomItem,
  deleteCustomRecipe,
  DuplicateItemNameError,
  isItemReferencedByAnyRecipe,
  ItemInUseError,
  renameCustomItem,
  updateCustomRecipe,
} from '../custom-entities'

const DS_ID = 'ds-test'
const LOCALE = 'en-US'

beforeEach(async () => {
  await __resetLocalizedNameStore()
})

function setupBaseDataset() {
  const store = createGameDataStore()
  store.setRow('datasets', DS_ID, {
    id: DS_ID,
    name: 'Test',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
  store.setRow('skills', 'skill-mining', {
    datasetId: DS_ID,
    name: 'Mining',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[1,0.9]',
    specialtyCost: 1,
  })
  store.setRow('craftingTables', 'ct-bench', {
    datasetId: DS_ID,
    name: 'Workbench',
  })
  store.setRow('items', 'item-wood', {
    datasetId: DS_ID,
    name: 'Wood',
    isTag: false,
    isPart: false,
    isCustom: false,
  })
  return store
}

describe('createCustomItem', () => {
  it('inserts an item row with isCustom=true', async () => {
    const store = setupBaseDataset()
    const id = await createCustomItem(store, DS_ID, 'Test Ore', LOCALE)
    expect(store.getCell('items', id, 'name')).toBe('Test Ore')
    expect(store.getCell('items', id, 'isCustom')).toBe(true)
    expect(store.getCell('items', id, 'datasetId')).toBe(DS_ID)
  })

  it('rejects empty names', async () => {
    const store = setupBaseDataset()
    await expect(createCustomItem(store, DS_ID, '   ', LOCALE)).rejects.toThrow()
  })

  it('rejects duplicate names against any item in the dataset', async () => {
    const store = setupBaseDataset()
    await expect(createCustomItem(store, DS_ID, 'Wood', LOCALE)).rejects.toBeInstanceOf(
      DuplicateItemNameError
    )
    await createCustomItem(store, DS_ID, 'Test Ore', LOCALE)
    await expect(createCustomItem(store, DS_ID, 'test ore', LOCALE)).rejects.toBeInstanceOf(
      DuplicateItemNameError
    )
  })
})

describe('renameCustomItem', () => {
  it('updates the name', async () => {
    const store = setupBaseDataset()
    const id = await createCustomItem(store, DS_ID, 'Old', LOCALE)
    await renameCustomItem(store, id, 'New', LOCALE)
    expect(store.getCell('items', id, 'name')).toBe('New')
  })

  it('rejects rename to a colliding name', async () => {
    const store = setupBaseDataset()
    const id = await createCustomItem(store, DS_ID, 'A', LOCALE)
    await createCustomItem(store, DS_ID, 'B', LOCALE)
    await expect(renameCustomItem(store, id, 'B', LOCALE)).rejects.toBeInstanceOf(
      DuplicateItemNameError
    )
    // Renaming to its own current name is allowed.
    await renameCustomItem(store, id, 'A', LOCALE)
    expect(store.getCell('items', id, 'name')).toBe('A')
  })
})

describe('deleteCustomItem', () => {
  it('deletes when not in use', async () => {
    const store = setupBaseDataset()
    const id = await createCustomItem(store, DS_ID, 'Disposable', LOCALE)
    await deleteCustomItem(store, id)
    expect(store.hasRow('items', id)).toBe(false)
  })

  it('refuses to delete when an ingredient references the item', async () => {
    const store = setupBaseDataset()
    const itemId = await createCustomItem(store, DS_ID, 'Ore', LOCALE)
    store.setRow('recipeElements', 're-1', {
      datasetId: DS_ID,
      recipeId: 'fake-recipe',
      itemOrTagId: itemId,
      baseQuantity: -1,
      isProduct: false,
      index: 0,
    })
    expect(isItemReferencedByAnyRecipe(store, itemId)).toBe(true)
    await expect(deleteCustomItem(store, itemId)).rejects.toBeInstanceOf(ItemInUseError)
    expect(store.hasRow('items', itemId)).toBe(true)
  })
})

function buildBaseRecipeInput(itemId: string): CustomRecipeInput {
  return {
    name: 'Smelt Ore',
    craftingTableId: 'ct-bench',
    skillId: 'skill-mining',
    requiredSkillLevel: 0,
    baseLaborCost: 50,
    baseCraftTime: 0,
    ingredients: [{ itemId: 'item-wood', baseQuantity: 2, isDiscountedBySkill: true }],
    products: [{ itemId, quantity: 1 }],
  }
}

describe('createCustomRecipe', () => {
  it('writes recipe, elements, labor modifier, and ingredient discount modifier', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const recipeId = await createCustomRecipe(
      store,
      DS_ID,
      buildBaseRecipeInput(productItemId),
      LOCALE
    )

    const recipe = store.getRow('recipes', recipeId)
    expect(recipe.isCustom).toBe(true)
    expect(recipe.skillId).toBe('skill-mining')
    expect(recipe.craftingTableId).toBe('ct-bench')
    expect(recipe.baseLaborCost).toBe(50)

    const elements = store
      .getRowIds('recipeElements')
      .filter((id) => store.getCell('recipeElements', id, 'recipeId') === recipeId)
    expect(elements.length).toBe(2)

    const ingredient = elements.find(
      (id) => store.getCell('recipeElements', id, 'isProduct') === false
    )!
    expect(store.getCell('recipeElements', ingredient, 'baseQuantity')).toBe(-2)

    const product = elements.find(
      (id) => store.getCell('recipeElements', id, 'isProduct') === true
    )!
    expect(store.getCell('recipeElements', product, 'baseQuantity')).toBe(1)

    const modifiers = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter(
        (m) =>
          m.targetId === recipeId ||
          (typeof m.targetId === 'string' && elements.includes(m.targetId))
      )
    const laborMod = modifiers.find((m) => m.targetType === 'labor')
    expect(laborMod).toBeDefined()
    expect(laborMod!.refName).toBe('Mining')
    const elementMod = modifiers.find((m) => m.targetType === 'elementQuantity')
    expect(elementMod).toBeDefined()
    expect(elementMod!.refName).toBe('Mining')
    expect(elementMod!.targetId).toBe(ingredient)
  })

  it('skips the ingredient modifier when isDiscountedBySkill is false', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const input = buildBaseRecipeInput(productItemId)
    input.ingredients[0].isDiscountedBySkill = false
    const recipeId = await createCustomRecipe(store, DS_ID, input, LOCALE)

    const elementMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'elementQuantity')
    expect(elementMods.length).toBe(0)
    // Labor modifier is still present, regardless of ingredient discount.
    const laborMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'labor' && m.targetId === recipeId)
    expect(laborMods.length).toBe(1)
  })

  it('rejects empty ingredient or product lists', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const noIng = { ...buildBaseRecipeInput(productItemId), ingredients: [] }
    await expect(createCustomRecipe(store, DS_ID, noIng, LOCALE)).rejects.toThrow()
    const noProd = { ...buildBaseRecipeInput(productItemId), products: [] }
    await expect(createCustomRecipe(store, DS_ID, noProd, LOCALE)).rejects.toThrow()
  })
})

describe('updateCustomRecipe', () => {
  it('replaces elements and modifiers and writes new recipe values', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const recipeId = await createCustomRecipe(
      store,
      DS_ID,
      buildBaseRecipeInput(productItemId),
      LOCALE
    )
    const otherProduct = await createCustomItem(store, DS_ID, 'Slag', LOCALE)

    await updateCustomRecipe(
      store,
      recipeId,
      {
        name: 'Smelt Ore (revised)',
        craftingTableId: 'ct-bench',
        skillId: 'skill-mining',
        requiredSkillLevel: 3,
        baseLaborCost: 80,
        baseCraftTime: 5,
        ingredients: [{ itemId: 'item-wood', baseQuantity: 4, isDiscountedBySkill: false }],
        products: [
          { itemId: productItemId, quantity: 2 },
          { itemId: otherProduct, quantity: 1 },
        ],
      },
      LOCALE
    )

    expect(store.getCell('recipes', recipeId, 'name')).toBe('Smelt Ore (revised)')
    expect(store.getCell('recipes', recipeId, 'baseLaborCost')).toBe(80)
    expect(store.getCell('recipes', recipeId, 'requiredSkillLevel')).toBe(3)

    const elements = store
      .getRowIds('recipeElements')
      .filter((id) => store.getCell('recipeElements', id, 'recipeId') === recipeId)
    // 1 ingredient + 2 products
    expect(elements.length).toBe(3)

    const ingredientMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'elementQuantity')
    // No discount on the new ingredient, so no elementQuantity modifier survives.
    expect(ingredientMods.length).toBe(0)
  })
})

describe('deleteCustomRecipe', () => {
  it('removes recipe, elements, and modifiers', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const recipeId = await createCustomRecipe(
      store,
      DS_ID,
      buildBaseRecipeInput(productItemId),
      LOCALE
    )

    await deleteCustomRecipe(store, recipeId)
    expect(store.hasRow('recipes', recipeId)).toBe(false)
    const orphanElements = store
      .getRowIds('recipeElements')
      .filter((id) => store.getCell('recipeElements', id, 'recipeId') === recipeId)
    expect(orphanElements.length).toBe(0)
    const orphanModifiers = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetId === recipeId)
    expect(orphanModifiers.length).toBe(0)
  })
})

describe('countCustomEntities', () => {
  it('counts only custom rows in the given dataset', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    await createCustomItem(store, DS_ID, 'Test Ore', LOCALE)
    await createCustomRecipe(store, DS_ID, buildBaseRecipeInput(productItemId), LOCALE)

    const counts = countCustomEntities(store, DS_ID)
    expect(counts.items).toBe(2)
    expect(counts.recipes).toBe(1)

    const otherCounts = countCustomEntities(store, 'unknown-dataset')
    expect(otherCounts).toEqual({ items: 0, recipes: 0 })
  })
})
