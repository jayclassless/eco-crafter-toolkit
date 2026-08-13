import type { Store } from 'tinybase'

import { generateId } from '@/lib/ids'
import {
  removeLocalizedName as removeLocalizedNameFromIdb,
  upsertLocalizedNames,
} from '@/stores/localized-name-store'

/**
 * Every validation failure this module can raise. Each code is also the leaf
 * key under `settings.customEntities.errors` in the message catalog, so the UI
 * maps one to the other without a lookup table
 * (`validationErrorMessage` in `components/settings/datasets`).
 *
 * Adding a code here without adding the matching catalog key will surface the
 * raw code to the user, so do both.
 */
export type ValidationCode =
  | 'itemNameRequired'
  | 'itemNotFound'
  | 'duplicateItemName'
  | 'itemInUse'
  | 'recipeNotFound'
  | 'nameRequired'
  | 'craftingTableRequired'
  | 'skillRequired'
  | 'laborNonNegative'
  | 'craftTimeNonNegative'
  | 'skillLevelNonNegative'
  | 'ingredientRequired'
  | 'productRequired'
  | 'ingredientItemRequired'
  | 'ingredientQty'
  | 'duplicateIngredient'
  | 'productItemRequired'
  | 'productQty'
  | 'duplicateProduct'

/**
 * A user-facing validation failure. The `message` is a developer-facing
 * fallback (it shows up in stack traces and test output); anything rendered to
 * the user must go through `code` + `params` so the copy stays translatable.
 */
export class ValidationError extends Error {
  constructor(
    public readonly code: ValidationCode,
    public readonly params?: Record<string, string | number>
  ) {
    super(`Custom entity validation failed: ${code}`)
    this.name = 'ValidationError'
  }
}

export class ItemInUseError extends ValidationError {
  constructor(public readonly itemId: string) {
    super('itemInUse')
    this.name = 'ItemInUseError'
  }
}

export class DuplicateItemNameError extends ValidationError {
  // Deliberately NOT `name` — that is `Error.name`, and a parameter property
  // by that name would be clobbered by the `this.name = ...` below.
  constructor(public readonly itemName: string) {
    super('duplicateItemName', { name: itemName })
    this.name = 'DuplicateItemNameError'
  }
}

interface CustomRecipeIngredient {
  itemId: string
  baseQuantity: number
  isReducedByModule: boolean
}

interface CustomRecipeProduct {
  itemId: string
  quantity: number
}

export interface CustomRecipeInput {
  name: string
  craftingTableId: string
  skillId: string
  requiredSkillLevel: number
  baseLaborCost: number
  baseCraftTime: number
  ingredients: CustomRecipeIngredient[]
  products: CustomRecipeProduct[]
}

function findItemNameCollision(
  store: Store,
  datasetId: string,
  name: string,
  excludeItemId?: string
): boolean {
  const lower = name.toLowerCase()
  for (const id of store.getRowIds('items')) {
    if (excludeItemId && id === excludeItemId) continue
    if (store.getCell('items', id, 'datasetId') !== datasetId) continue
    const existing = store.getCell('items', id, 'name') as string
    if (existing.toLowerCase() === lower) return true
  }
  return false
}

function getSkillName(store: Store, skillId: string): string {
  return (store.getCell('skills', skillId, 'name') as string) ?? ''
}

export async function createCustomItem(
  store: Store,
  datasetId: string,
  name: string,
  locale: string
): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new ValidationError('itemNameRequired')
  if (findItemNameCollision(store, datasetId, trimmed)) {
    throw new DuplicateItemNameError(trimmed)
  }
  const itemId = generateId()
  store.setRow('items', itemId, {
    datasetId,
    name: trimmed,
    isTag: false,
    isPart: false,
    isCustom: true,
  })
  await upsertLocalizedNames(datasetId, [
    { id: '', entityType: 'item', entityId: itemId, locale, name: trimmed },
  ])
  return itemId
}

export async function renameCustomItem(
  store: Store,
  itemId: string,
  name: string,
  locale: string
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new ValidationError('itemNameRequired')
  const datasetId = store.getCell('items', itemId, 'datasetId') as string
  if (!datasetId) throw new ValidationError('itemNotFound')
  if (findItemNameCollision(store, datasetId, trimmed, itemId)) {
    throw new DuplicateItemNameError(trimmed)
  }
  store.setCell('items', itemId, 'name', trimmed)
  await upsertLocalizedNames(datasetId, [
    { id: '', entityType: 'item', entityId: itemId, locale, name: trimmed },
  ])
}

export function isItemReferencedByAnyRecipe(store: Store, itemId: string): boolean {
  for (const reId of store.getRowIds('recipeElements')) {
    if (store.getCell('recipeElements', reId, 'itemOrTagId') === itemId) return true
  }
  return false
}

export async function deleteCustomItem(store: Store, itemId: string): Promise<void> {
  if (isItemReferencedByAnyRecipe(store, itemId)) throw new ItemInUseError(itemId)
  const datasetId = store.getCell('items', itemId, 'datasetId') as string
  store.delRow('items', itemId)
  if (datasetId) await removeLocalizedNameFromIdb(datasetId, 'item', itemId)
}

function validateRecipeInput(input: CustomRecipeInput): void {
  if (!input.name.trim()) throw new ValidationError('nameRequired')
  if (!input.craftingTableId) throw new ValidationError('craftingTableRequired')
  if (!input.skillId) throw new ValidationError('skillRequired')
  if (input.baseLaborCost < 0) throw new ValidationError('laborNonNegative')
  if (input.baseCraftTime < 0) throw new ValidationError('craftTimeNonNegative')
  if (input.requiredSkillLevel < 0) throw new ValidationError('skillLevelNonNegative')
  if (input.ingredients.length === 0) throw new ValidationError('ingredientRequired')
  if (input.products.length === 0) throw new ValidationError('productRequired')
  const ingItems = new Set<string>()
  for (const ing of input.ingredients) {
    if (!ing.itemId) throw new ValidationError('ingredientItemRequired')
    if (ing.baseQuantity <= 0) throw new ValidationError('ingredientQty')
    if (ingItems.has(ing.itemId)) throw new ValidationError('duplicateIngredient')
    ingItems.add(ing.itemId)
  }
  const prodItems = new Set<string>()
  for (const prod of input.products) {
    if (!prod.itemId) throw new ValidationError('productItemRequired')
    if (prod.quantity <= 0) throw new ValidationError('productQty')
    if (prodItems.has(prod.itemId)) throw new ValidationError('duplicateProduct')
    prodItems.add(prod.itemId)
  }
}

function writeRecipeElementsAndModifiers(
  store: Store,
  datasetId: string,
  recipeId: string,
  skillName: string,
  input: CustomRecipeInput
): void {
  // Labor scales with the recipe's skill via a `targetType: 'labor'` modifier.
  // Without this, custom recipes ignore the user's skill level entirely.
  //
  // Deliberately no `Module` entry, in BOTH dataset versions — but for different
  // reasons, so don't "fix" this by adding one:
  //   - v11-v13: modules never reduced labor at all.
  //   - v14: modules DO reduce labor, but the effect is applied at the recipe
  //     level in solver.ts (scoped against the recipe's skill, Rule A) rather
  //     than through a Module modifier. Vanilla v14 emits no Module modifier on
  //     a recipe's Labor value either, so custom recipes match vanilla here.
  // Adding one would double-count the labor discount on v14.
  store.setRow('modifiers', generateId(), {
    datasetId,
    targetType: 'labor',
    targetId: recipeId,
    dynamicType: 'Skill',
    refName: skillName,
  })

  // Craft time is reduced by the crafting table's installed (speed) upgrade module.
  // A `targetType: 'craftMinutes'`, Module modifier is the hook the solver keys on
  // (`resolveModifiers`); without it an installed module never touches craft time.
  store.setRow('modifiers', generateId(), {
    datasetId,
    targetType: 'craftMinutes',
    targetId: recipeId,
    dynamicType: 'Module',
    refName: skillName,
  })

  let index = 0
  for (const ing of input.ingredients) {
    const elementId = generateId()
    store.setRow('recipeElements', elementId, {
      datasetId,
      recipeId,
      itemOrTagId: ing.itemId,
      // Negative quantity is the convention for ingredients; matches imports.
      baseQuantity: -ing.baseQuantity,
      isProduct: false,
      index: index++,
    })
    // A Module elementQuantity modifier lets the table's (resource) upgrade module
    // reduce this ingredient. Static items (tools/molds) should be left untoggled,
    // mirroring how vanilla recipes omit the Module entry on non-reducible slots.
    if (ing.isReducedByModule) {
      store.setRow('modifiers', generateId(), {
        datasetId,
        targetType: 'elementQuantity',
        targetId: elementId,
        dynamicType: 'Module',
        refName: skillName,
      })
    }
  }
  for (const prod of input.products) {
    store.setRow('recipeElements', generateId(), {
      datasetId,
      recipeId,
      itemOrTagId: prod.itemId,
      baseQuantity: prod.quantity,
      isProduct: true,
      index: index++,
    })
  }
}

function deleteRecipeElements(store: Store, recipeId: string): void {
  for (const reId of store.getRowIds('recipeElements')) {
    if (store.getCell('recipeElements', reId, 'recipeId') === recipeId) {
      store.delRow('recipeElements', reId)
    }
  }
}

// Modifiers may target the recipe itself (labor / craftMinutes) or one of its
// recipeElements (elementQuantity). Callers must capture these ids BEFORE
// deleting recipeElements, otherwise the element-targeted lookup is lost.
function collectRecipeOwnedModifierIds(store: Store, recipeId: string): string[] {
  const elementIds = new Set<string>()
  for (const reId of store.getRowIds('recipeElements')) {
    if (store.getCell('recipeElements', reId, 'recipeId') === recipeId) elementIds.add(reId)
  }
  const out: string[] = []
  for (const mId of store.getRowIds('modifiers')) {
    const targetId = store.getCell('modifiers', mId, 'targetId') as string
    if (targetId === recipeId || elementIds.has(targetId)) out.push(mId)
  }
  return out
}

export async function createCustomRecipe(
  store: Store,
  datasetId: string,
  input: CustomRecipeInput,
  locale: string
): Promise<string> {
  validateRecipeInput(input)
  const skillName = getSkillName(store, input.skillId)
  const trimmedName = input.name.trim()
  const recipeId = generateId()

  store.transaction(() => {
    store.setRow('recipes', recipeId, {
      datasetId,
      name: trimmedName,
      familyName: trimmedName,
      skillId: input.skillId,
      requiredSkillLevel: input.requiredSkillLevel,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: input.craftingTableId,
      baseCraftTime: input.baseCraftTime,
      baseLaborCost: input.baseLaborCost,
      isCustom: true,
    })
    writeRecipeElementsAndModifiers(store, datasetId, recipeId, skillName, input)
  })

  await upsertLocalizedNames(datasetId, [
    { id: '', entityType: 'recipe', entityId: recipeId, locale, name: trimmedName },
  ])

  return recipeId
}

export async function updateCustomRecipe(
  store: Store,
  recipeId: string,
  input: CustomRecipeInput,
  locale: string
): Promise<void> {
  validateRecipeInput(input)
  const datasetId = store.getCell('recipes', recipeId, 'datasetId') as string
  if (!datasetId) throw new ValidationError('recipeNotFound')
  const skillName = getSkillName(store, input.skillId)
  const trimmedName = input.name.trim()

  const ownedModifierIds = collectRecipeOwnedModifierIds(store, recipeId)

  store.transaction(() => {
    for (const mId of ownedModifierIds) store.delRow('modifiers', mId)
    deleteRecipeElements(store, recipeId)
    store.setRow('recipes', recipeId, {
      datasetId,
      name: trimmedName,
      familyName: trimmedName,
      skillId: input.skillId,
      requiredSkillLevel: input.requiredSkillLevel,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: input.craftingTableId,
      baseCraftTime: input.baseCraftTime,
      baseLaborCost: input.baseLaborCost,
      isCustom: true,
    })
    writeRecipeElementsAndModifiers(store, datasetId, recipeId, skillName, input)
  })

  await upsertLocalizedNames(datasetId, [
    { id: '', entityType: 'recipe', entityId: recipeId, locale, name: trimmedName },
  ])
}

export async function deleteCustomRecipe(store: Store, recipeId: string): Promise<void> {
  const datasetId = store.getCell('recipes', recipeId, 'datasetId') as string
  const ownedModifierIds = collectRecipeOwnedModifierIds(store, recipeId)
  store.transaction(() => {
    for (const mId of ownedModifierIds) store.delRow('modifiers', mId)
    deleteRecipeElements(store, recipeId)
    store.delRow('recipes', recipeId)
  })
  if (datasetId) await removeLocalizedNameFromIdb(datasetId, 'recipe', recipeId)
}

interface CustomCounts {
  items: number
  recipes: number
}

export function countCustomEntities(store: Store, datasetId: string): CustomCounts {
  let items = 0
  let recipes = 0
  for (const id of store.getRowIds('items')) {
    if (
      store.getCell('items', id, 'datasetId') === datasetId &&
      store.getCell('items', id, 'isCustom')
    ) {
      items++
    }
  }
  for (const id of store.getRowIds('recipes')) {
    if (
      store.getCell('recipes', id, 'datasetId') === datasetId &&
      store.getCell('recipes', id, 'isCustom')
    ) {
      recipes++
    }
  }
  return { items, recipes }
}
