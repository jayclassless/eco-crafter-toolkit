import type { SolverRecipe } from '@/types/solver'

import {
  applyModifierEffect,
  applyRoundFactor,
  resolveModifiers,
  type ModifierContext,
} from './dynamic-values'

interface EffectiveElement {
  itemOrTagId: string
  /** Effective per-craft quantity after modifiers and round-factor. Carries
   * the same sign as the recipe's base quantity (ingredients are typically
   * negative, products positive — matching the dataset convention). */
  qty: number
}

interface EffectiveProduct extends EffectiveElement {
  share: number
  isReintegrated: boolean
}

export interface EffectiveRecipeQuantities {
  ingredients: EffectiveElement[]
  products: EffectiveProduct[]
}

/** Build the modifier context a recipe's elements resolve against. */
function recipeModifierContext(recipe: SolverRecipe): ModifierContext {
  return {
    skillLevel: recipe.skillLevel,
    laborReducePercent: recipe.laborReducePercent,
    activeTalents: recipe.activeTalents,
    moduleEffects: recipe.moduleEffects,
  }
}

/** Resolve a recipe's ingredient and product quantities for a single craft,
 * applying skill/talent/module modifiers and the round factor exactly as the
 * price solver's `prepareRecipe` does. Products keep their `share` and
 * `isReintegrated` flags so callers can split them as needed. */
export function getEffectiveRecipeQuantities(recipe: SolverRecipe): EffectiveRecipeQuantities {
  const ctx = recipeModifierContext(recipe)

  const ingredients: EffectiveElement[] = Array.from<EffectiveElement>({
    length: recipe.ingredients.length,
  })
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i]
    ingredients[i] = {
      itemOrTagId: ing.itemOrTagId,
      qty: applyRoundFactor(
        applyModifierEffect(ing.baseQuantity, resolveModifiers(ing.modifiers, ctx)),
        recipe.roundFactor
      ),
    }
  }

  const products: EffectiveProduct[] = Array.from<EffectiveProduct>({
    length: recipe.products.length,
  })
  for (let i = 0; i < recipe.products.length; i++) {
    const prod = recipe.products[i]
    products[i] = {
      itemOrTagId: prod.itemOrTagId,
      qty: applyRoundFactor(
        applyModifierEffect(prod.baseQuantity, resolveModifiers(prod.modifiers, ctx)),
        recipe.roundFactor
      ),
      share: prod.share,
      isReintegrated: prod.isReintegrated,
    }
  }

  return { ingredients, products }
}
