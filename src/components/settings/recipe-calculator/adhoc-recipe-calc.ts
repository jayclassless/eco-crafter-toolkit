import type { Store } from 'tinybase'

import type { PriceSignal } from '@/hooks/use-prices-signal'
import type { RecipeBuildState } from '@/hooks/use-solver-snapshot'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { resolveRecipeModifiers, type GetNameFn } from '@/lib/recipe-modifiers'
import { solve } from '@/lib/solver'
import type { SolverInput, SolverOutput } from '@/types/solver'

/** Per-talent toggle state, keyed by talent row id. Absence means "not applied". */
export type AdHocTalentStates = Record<string, { enabled: boolean; level: number }>

export interface AdHocControls {
  skillLevel: number
  pluginModuleId: string
  talentStates: AdHocTalentStates
  /** Editable unit prices, keyed by ingredient item-or-tag id. */
  ingredientPrices: Record<string, number>
}

export interface AdHocResult {
  /** Resolved modifiers — used for modified quantities and the applied-bonuses list. */
  mods: NonNullable<ReturnType<typeof resolveRecipeModifiers>>
  output: SolverOutput
}

/**
 * Compute the cost of a single recipe in isolation from any build. The
 * dialog's local controls are assembled into a synthetic `RecipeBuildState`
 * and fed through the same `resolveRecipeModifiers` + `solve` path the main
 * calculator uses, so the numbers match exactly. Crafting-table $/min is
 * deliberately fixed at 0 (craft-time cost is excluded for this tool);
 * calorie cost still applies to labor.
 */
export function computeAdHocRecipe(
  gameDataStore: Store,
  datasetId: string,
  getName: GetNameFn,
  recipeId: string,
  controls: AdHocControls,
  calorieCost: number,
  defaultShareForSecondaryItems: number
): AdHocResult | null {
  const recipe = gameDataStore.getRow('recipes', recipeId)
  if (!recipe) return null

  const skillId = recipe.skillId as string
  const craftingTableId = recipe.craftingTableId as string
  const indexes = getGameDataIndexes(gameDataStore).recipeIndexes

  const buildState: RecipeBuildState = {
    userRecipesById: new Map(),
    userSkillsBySkillId: skillId ? new Map([[skillId, { level: controls.skillLevel }]]) : new Map(),
    userTalentsByTalentId: new Map(Object.entries(controls.talentStates)),
    userCraftingTablesByCTId: new Map([
      [craftingTableId, { pluginModuleId: controls.pluginModuleId, costPerMinute: 0 }],
    ]),
    userProductSharesByUserRecipeId: new Map(),
    userReintegratedProductsByUserRecipeId: new Map(),
    defaultShareForSecondaryItems,
  }

  const mods = resolveRecipeModifiers(
    gameDataStore,
    recipeId,
    '',
    0,
    datasetId,
    indexes,
    buildState,
    getName
  )
  if (!mods) return null

  const input: SolverInput = {
    recipes: [mods.solverRecipe],
    prices: { ...controls.ingredientPrices },
    overrides: {},
    settings: {
      marginType: 'markup',
      calorieCost,
      applyMarginBetweenSkills: false,
    },
    margins: {},
    recipeMargins: {},
    productMargins: {},
    tagItems: {},
    primaryTagItems: {},
    primaryRecipeIds: {},
    priceModes: {},
  }

  return { mods, output: solve(input) }
}

/**
 * Seed initial editable prices for every ingredient of a recipe from the
 * build's current prices: the user's manual price if set, else the build's
 * solver-computed cost price, else 0. The returned map is a starting point —
 * the dialog owns it locally afterward and never writes back to the build.
 */
export function seedIngredientPrices(
  gameDataStore: Store,
  buildStore: Store,
  priceSignal: PriceSignal,
  buildId: string,
  recipeId: string
): Record<string, number> {
  const manualPriceFor = (itemId: string): number | null => {
    for (const upId of buildStore.getRowIds('userPrices')) {
      const up = buildStore.getRow('userPrices', upId)
      if (up.buildId === buildId && up.itemOrTagId === itemId && up.price) {
        return up.price as number
      }
    }
    return null
  }

  const prices: Record<string, number> = {}
  const elems = getGameDataIndexes(gameDataStore).recipeIndexes.elementsByRecipeId.get(recipeId)
  if (!elems) return prices
  for (const { row } of elems) {
    if (row.isProduct) continue
    const itemOrTagId = row.itemOrTagId as string
    if (itemOrTagId in prices) continue
    const seeded = manualPriceFor(itemOrTagId) ?? priceSignal.get(itemOrTagId, 'costPrice') ?? 0
    prices[itemOrTagId] = seeded
  }
  return prices
}
