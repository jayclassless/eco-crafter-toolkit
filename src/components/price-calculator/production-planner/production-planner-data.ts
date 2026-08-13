import type { Store } from 'tinybase'

import type { Compare } from '@/lib/collator'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { type PlannerRecipe } from '@/lib/production-planner'
import type { GetNameFn } from '@/lib/recipe-modifiers'
import { getEffectiveRecipeQuantities } from '@/lib/recipe-quantities'
import type { SolverInput, SolverOutput } from '@/types/solver'

export interface PlannerItemOption {
  id: string
  name: string
  rawName: string
  isCustom: boolean
}

export interface PlannerData {
  /** Build-chosen recipe producing `itemId`, or null when it's a raw input. */
  recipeForItem: (itemId: string) => PlannerRecipe | null
  tagMembers: (tagId: string) => string[] | null
  isTag: (id: string) => boolean
  /** Items producible by a recipe in the build — valid planning targets. */
  targetOptions: PlannerItemOption[]
  /** Every concrete (non-tag) item — inventory candidates. */
  itemOptions: PlannerItemOption[]
}

/**
 * Assemble the inputs the production planner needs from the build snapshot, the
 * live solver output (for the recipe each product currently resolves to), and
 * the game-data store. Per-craft quantities come from the same
 * `getEffectiveRecipeQuantities` the price solver uses, so the plan's numbers
 * match the calculator exactly.
 */
export function buildPlannerData(
  gameDataStore: Store,
  datasetId: string,
  snapshot: SolverInput,
  solverOutput: SolverOutput | null,
  getName: GetNameFn,
  compare: Compare
): PlannerData {
  const indexes = getGameDataIndexes(gameDataStore)

  // recipeId -> planner recipe with positive consumed/produced amounts.
  // Reintegrated products are cost credits, not physical outputs, so drop them.
  const plannerRecipes = new Map<string, PlannerRecipe>()
  const buildRecipeIds = new Set<string>()
  for (const recipe of snapshot.recipes) {
    buildRecipeIds.add(recipe.id)
    const eff = getEffectiveRecipeQuantities(recipe)
    plannerRecipes.set(recipe.id, {
      recipeId: recipe.id,
      ingredients: eff.ingredients
        .filter((e) => e.qty !== 0)
        .map((e) => ({ itemId: e.itemOrTagId, qty: Math.abs(e.qty) })),
      products: eff.products
        .filter((p) => !p.isReintegrated && p.qty > 0)
        .map((p) => ({ itemId: p.itemOrTagId, qty: p.qty })),
    })
  }

  // The recipe the price calculator currently uses for this product, falling
  // back to the build's default/first producer.
  const chosenRecipeFor = (itemId: string): string | null => {
    const fromSolver = solverOutput?.prices[itemId]?.recipeId
    if (fromSolver && buildRecipeIds.has(fromSolver)) return fromSolver
    const candidates = (indexes.primaryRecipeIdsByItemId.get(itemId) ?? []).filter((id) =>
      buildRecipeIds.has(id)
    )
    if (candidates.length === 0) return null
    const preferred = candidates.find((id) => !!gameDataStore.getRow('recipes', id)?.isDefault)
    return preferred ?? candidates[0]
  }

  const recipeForItem = (itemId: string): PlannerRecipe | null => {
    const recipeId = chosenRecipeFor(itemId)
    return recipeId ? (plannerRecipes.get(recipeId) ?? null) : null
  }

  const tagMembers = (tagId: string): string[] | null => indexes.itemIdsByTagId.get(tagId) ?? null
  const isTag = (id: string): boolean => !!gameDataStore.getRow('items', id)?.isTag

  const toOption = (id: string): PlannerItemOption | null => {
    const row = gameDataStore.getRow('items', id)
    if (!row) return null
    return {
      id,
      name: getName('item', id) || (row.name as string) || id,
      rawName: (row.name as string) ?? '',
      isCustom: !!row.isCustom,
    }
  }

  const targetIds = new Set<string>()
  // Tags referenced as ingredients by build recipes — the only tags worth
  // offering as "materials on hand" (a stocked tag is consumed as a raw pool
  // by recipes that call for that exact tag; see makeTagResolver).
  const ingredientTagIds = new Set<string>()
  for (const recipe of plannerRecipes.values()) {
    for (const p of recipe.products) targetIds.add(p.itemId)
    for (const ing of recipe.ingredients) {
      if (isTag(ing.itemId)) ingredientTagIds.add(ing.itemId)
    }
  }
  const targetOptions = [...targetIds]
    .map(toOption)
    .filter((o): o is PlannerItemOption => o != null)
    .sort((a, b) => compare(a.name, b.name))

  // Concrete items plus the ingredient tags, so the user can stock either.
  const itemOptions: PlannerItemOption[] = []
  for (const id of gameDataStore.getRowIds('items')) {
    const row = gameDataStore.getRow('items', id)
    if (row.datasetId !== datasetId) continue
    if (row.isTag && !ingredientTagIds.has(id)) continue
    const option = toOption(id)
    if (option) itemOptions.push(option)
  }
  itemOptions.sort((a, b) => compare(a.name, b.name))

  return { recipeForItem, tagMembers, isTag, targetOptions, itemOptions }
}
