// Single source of truth for "is product P of recipe R reintegrated?". A
// reintegrated product is credited against the recipe's cost (subtracted, like
// an ingredient) instead of being treated as a sellable co-product that absorbs
// a share of cost. The solver, the share math, the recipe dialog, and the
// Products/Materials view-models all derive the same answer from this helper so
// they never disagree.

import type { Store } from 'tinybase'

export interface ReintegrationInput {
  /** Product item/tag IDs in recipeElement `index` order. The first entry is
   * the primary product. */
  orderedProductItemIds: string[]
  /** Item/tag IDs consumed by this recipe (its ingredients). */
  ingredientItemIds: Set<string>
  /** Item IDs whose raw name is in `AUTO_REINTEGRATE_SECONDARY_ITEM_NAMES`
   * (e.g. Barrel). A non-primary product in this set defaults to reintegrated. */
  autoReintegrateSecondaryItemIds: Set<string>
  /** Explicit per-product user overrides (itemOrTagId → isReintegrated). When
   * present for an item, the override wins over the default rule. */
  userOverrides?: Map<string, boolean>
}

// Returns the set of product item/tag IDs that are reintegrated for this recipe.
export function computeReintegratedProductIds(input: ReintegrationInput): Set<string> {
  const {
    orderedProductItemIds,
    ingredientItemIds,
    autoReintegrateSecondaryItemIds,
    userOverrides,
  } = input

  const result = new Set<string>()
  orderedProductItemIds.forEach((itemId, index) => {
    const override = userOverrides?.get(itemId)
    if (override !== undefined) {
      if (override) result.add(itemId)
      return
    }
    // Default rule: a product is reintegrated when it's also an ingredient of
    // this recipe (a returned tool/scrap), or when it's a curated container
    // item produced as a non-primary product (index > 0).
    const isAlsoIngredient = ingredientItemIds.has(itemId)
    const isNonPrimaryContainer = index > 0 && autoReintegrateSecondaryItemIds.has(itemId)
    if (isAlsoIngredient || isNonPrimaryContainer) result.add(itemId)
  })
  return result
}

// Reads the build's explicit per-product reintegration overrides into a map
// keyed by userRecipeId, then productItemOrTagId. Used by every consumer that
// resolves reintegration so the override-loading boilerplate lives in one place.
export function buildReintegrationOverrides(
  buildStore: Store,
  buildId: string
): Map<string, Map<string, boolean>> {
  const byUserRecipe = new Map<string, Map<string, boolean>>()
  for (const urpId of buildStore.getRowIds('userReintegratedProducts')) {
    const urp = buildStore.getRow('userReintegratedProducts', urpId)
    if (urp.buildId !== buildId) continue
    const urId = urp.userRecipeId as string
    let inner = byUserRecipe.get(urId)
    if (!inner) {
      inner = new Map()
      byUserRecipe.set(urId, inner)
    }
    inner.set(urp.productItemOrTagId as string, urp.isReintegrated as boolean)
  }
  return byUserRecipe
}
