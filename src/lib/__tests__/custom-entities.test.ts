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
  ValidationError,
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
    ingredients: [{ itemId: 'item-wood', baseQuantity: 2, isReducedByModule: true }],
    products: [{ itemId, quantity: 1 }],
  }
}

describe('createCustomRecipe', () => {
  it('writes recipe, elements, labor + craftMinutes modifiers, and ingredient module modifier', async () => {
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
    expect(laborMod!.dynamicType).toBe('Skill')
    expect(laborMod!.refName).toBe('Mining')
    // Craft time is module-reduced (so an installed speed upgrade can apply).
    const craftMod = modifiers.find((m) => m.targetType === 'craftMinutes')
    expect(craftMod).toBeDefined()
    expect(craftMod!.dynamicType).toBe('Module')
    expect(craftMod!.refName).toBe('Mining')
    expect(craftMod!.targetId).toBe(recipeId)
    // Toggled-on ingredient is module-reduced (resource upgrade applies).
    const elementMod = modifiers.find((m) => m.targetType === 'elementQuantity')
    expect(elementMod).toBeDefined()
    expect(elementMod!.dynamicType).toBe('Module')
    expect(elementMod!.refName).toBe('Mining')
    expect(elementMod!.targetId).toBe(ingredient)
  })

  it('skips the ingredient modifier when isReducedByModule is false', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const input = buildBaseRecipeInput(productItemId)
    input.ingredients[0].isReducedByModule = false
    const recipeId = await createCustomRecipe(store, DS_ID, input, LOCALE)

    const elementMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'elementQuantity')
    expect(elementMods.length).toBe(0)
    // Labor (Skill) and craftMinutes (Module) modifiers are still present,
    // regardless of whether the ingredient is module-reduced.
    const laborMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'labor' && m.targetId === recipeId)
    expect(laborMods.length).toBe(1)
    const craftMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'craftMinutes' && m.targetId === recipeId)
    expect(craftMods.length).toBe(1)
    expect(craftMods[0].dynamicType).toBe('Module')
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
        ingredients: [{ itemId: 'item-wood', baseQuantity: 4, isReducedByModule: false }],
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
    // New ingredient is not module-reduced, so no elementQuantity modifier survives.
    expect(ingredientMods.length).toBe(0)
    // The recipe-level craftMinutes Module modifier is rewritten on update.
    const craftMods = store
      .getRowIds('modifiers')
      .map((id) => store.getRow('modifiers', id))
      .filter((m) => m.targetType === 'craftMinutes' && m.targetId === recipeId)
    expect(craftMods.length).toBe(1)
    expect(craftMods[0].dynamicType).toBe('Module')
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

describe('validation error codes', () => {
  // The UI renders these by mapping `code` onto a catalog key, so the codes are
  // part of the contract — a renamed code silently breaks the message.
  async function codeOf(op: () => Promise<unknown>): Promise<string> {
    try {
      await op()
    } catch (e) {
      if (e instanceof ValidationError) return e.code
      throw e
    }
    throw new Error('expected the operation to reject')
  }

  it('tags item validation failures', async () => {
    const store = setupBaseDataset()
    const itemId = await createCustomItem(store, DS_ID, 'Ore', LOCALE)

    expect(await codeOf(() => createCustomItem(store, DS_ID, '  ', LOCALE))).toBe(
      'itemNameRequired'
    )
    expect(await codeOf(() => renameCustomItem(store, itemId, '  ', LOCALE))).toBe(
      'itemNameRequired'
    )
    expect(await codeOf(() => renameCustomItem(store, 'no-such-item', 'X', LOCALE))).toBe(
      'itemNotFound'
    )
    expect(await codeOf(() => createCustomItem(store, DS_ID, 'Wood', LOCALE))).toBe(
      'duplicateItemName'
    )

    store.setRow('recipeElements', 're-1', {
      datasetId: DS_ID,
      recipeId: 'fake-recipe',
      itemOrTagId: itemId,
      baseQuantity: -1,
      isProduct: false,
      index: 0,
    })
    expect(await codeOf(() => deleteCustomItem(store, itemId))).toBe('itemInUse')
  })

  it('carries the colliding name as an interpolation param', async () => {
    const store = setupBaseDataset()
    await expect(createCustomItem(store, DS_ID, 'Wood', LOCALE)).rejects.toMatchObject({
      code: 'duplicateItemName',
      params: { name: 'Wood' },
      itemName: 'Wood',
    })
  })

  it('tags every recipe validation failure', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    const base = () => buildBaseRecipeInput(productItemId)

    const cases: [string, CustomRecipeInput][] = [
      ['nameRequired', { ...base(), name: '  ' }],
      ['craftingTableRequired', { ...base(), craftingTableId: '' }],
      ['skillRequired', { ...base(), skillId: '' }],
      ['laborNonNegative', { ...base(), baseLaborCost: -1 }],
      ['craftTimeNonNegative', { ...base(), baseCraftTime: -1 }],
      ['skillLevelNonNegative', { ...base(), requiredSkillLevel: -1 }],
      ['ingredientRequired', { ...base(), ingredients: [] }],
      ['productRequired', { ...base(), products: [] }],
      [
        'ingredientItemRequired',
        { ...base(), ingredients: [{ itemId: '', baseQuantity: 1, isReducedByModule: false }] },
      ],
      [
        'ingredientQty',
        {
          ...base(),
          ingredients: [{ itemId: 'item-wood', baseQuantity: 0, isReducedByModule: false }],
        },
      ],
      [
        'duplicateIngredient',
        {
          ...base(),
          ingredients: [
            { itemId: 'item-wood', baseQuantity: 1, isReducedByModule: false },
            { itemId: 'item-wood', baseQuantity: 2, isReducedByModule: false },
          ],
        },
      ],
      ['productItemRequired', { ...base(), products: [{ itemId: '', quantity: 1 }] }],
      ['productQty', { ...base(), products: [{ itemId: productItemId, quantity: 0 }] }],
      [
        'duplicateProduct',
        {
          ...base(),
          products: [
            { itemId: productItemId, quantity: 1 },
            { itemId: productItemId, quantity: 2 },
          ],
        },
      ],
    ]

    for (const [expected, input] of cases) {
      expect(await codeOf(() => createCustomRecipe(store, DS_ID, input, LOCALE))).toBe(expected)
    }
  })

  it('tags an update against a missing recipe', async () => {
    const store = setupBaseDataset()
    const productItemId = await createCustomItem(store, DS_ID, 'Refined Ore', LOCALE)
    expect(
      await codeOf(() =>
        updateCustomRecipe(store, 'no-such-recipe', buildBaseRecipeInput(productItemId), LOCALE)
      )
    ).toBe('recipeNotFound')
  })

  it('keeps a developer-readable message for stack traces', () => {
    expect(new ValidationError('productQty').message).toBe(
      'Custom entity validation failed: productQty'
    )
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
