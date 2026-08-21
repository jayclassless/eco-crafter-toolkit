export type PriceMode = 'manual' | 'min' | 'max' | 'avg' | 'mirror'

export interface SolverInput {
  recipes: SolverRecipe[]
  prices: Record<string, number>
  overrides: Record<string, number>
  settings: {
    marginType: 'markup' | 'grossMargin'
    calorieCost: number
    applyMarginBetweenSkills: boolean
  }
  margins: Record<string, { name: string; percent: number }>
  recipeMargins: Record<string, string>
  /** Per-product margin override (wins over recipeMargins when present). */
  productMargins: Record<string, string>
  tagItems: Record<string, string[]>
  primaryTagItems: Record<string, string>
  /** Recipe chosen by the user when a multi-recipe product is in `mirror` mode. */
  primaryRecipeIds: Record<string, string>
  priceModes: Record<string, PriceMode>
}

export interface SolverRecipe {
  id: string
  skillId?: string
  skillLevel: number
  laborReducePercent: number[]
  activeTalents: SolverTalent[]
  /** Every effect from every module installed on this recipe's crafting table,
   * UNFILTERED. Scope is resolved at apply time (see `moduleFactor`), so
   * `skillIds` must survive into the solver rather than being pre-filtered. */
  /** `readonly` because the snapshot builder ALIASES one array across every
   * recipe sharing a crafting table (see `assembleSolverRecipe`). Mutating it
   * would silently alter every other recipe on that table. */
  moduleEffects: readonly SolverModuleEffect[]
  baseCraftTime: number
  baseLaborCost: number
  costPerMinute: number
  roundFactor: number
  ingredients: SolverElement[]
  products: SolverProduct[]
  craftMinutesModifiers: SolverModifier[]
  laborModifiers: SolverModifier[]
}

export interface SolverTalent {
  name: string
  value: number
  /** True when the talent adds a flat amount rather than scaling: `value` is
   * then a delta in the target metric's units (Mineral Baking's +1 Quicklime),
   * not a multiplier. Applied after every scaling effect. */
  isAdditive?: boolean
}

/** One module effect, already normalized out of whichever dataset version it
 * came from. Both v11-v13 and v14 modules land in this shape. */
export interface SolverModuleEffect {
  /** Which module this came from. Effects are grouped by module inside
   * `moduleFactor`, because the scoped-supersedes-unscoped precedence rule
   * applies WITHIN a module, not across the whole installed set. */
  moduleId: string
  action: 'ResourceCost' | 'LaborCost' | 'CraftTime'
  effectType: 'AdditivePercent' | 'Multiplicative'
  value: number
  /** Skill ids this effect is scoped to; empty means unscoped. */
  skillIds: string[]
}

interface SolverElement {
  itemOrTagId: string
  baseQuantity: number
  modifiers: SolverModifier[]
}

interface SolverProduct {
  itemOrTagId: string
  baseQuantity: number
  share: number
  isReintegrated: boolean
  modifiers: SolverModifier[]
}

export interface SolverModifier {
  dynamicType: 'Skill' | 'Talent' | 'Module'
  refName: string
  /** For Module-type modifiers whose refName resolves to a skill, the
   * game-data skill row id. Used to match the plugin module's own skill
   * binding — a skill-bound module applies its `skillPercent` only when
   * the modifier references that specific skill, not the recipe's skill
   * (they can differ). */
  skillId?: string
}

export interface SolverOutput {
  prices: Record<string, SolverPrice>
  /** Per-recipe-per-product cost and sale price, keyed `${recipeId}::${productId}`.
   * Used by the UI to show each child recipe's own price under a multi-recipe
   * product group, and by RecipeDialog to show the specific recipe's price for
   * each of its products (instead of the aggregated group price). */
  recipePrices: Record<string, { costPrice: number; salePrice: number }>
  /** Per-recipe fixed-cost breakdown (craft time + labor), keyed by recipeId.
   * RecipeDialog reads this to render the "Additional Costs" section with
   * values that match the solver exactly. */
  recipeCosts: Record<string, RecipeCostBreakdown>
  errors: SolverError[]
}

export interface RecipeCostBreakdown {
  /** Effective craft time in minutes (after speed modifiers). */
  craftTime: number
  /** craftTime × costPerMinute (the table's $/min rate). */
  craftTimeCost: number
  /** Effective labor in calories (after labor-reduce modifiers). */
  laborAmount: number
  /** laborAmount × calorieCost / 1000. */
  laborCost: number
  /** Pass-through of the table's $/min rate so the UI can display it. */
  costPerMinute: number
  /** Pass-through of settings.calorieCost ($/1000 cal). */
  calorieCost: number
}

export interface SolverPrice {
  costPrice: number
  salePrice: number
  recipeId: string
}

export interface SolverError {
  code: 'unresolved' | 'non-convergent'
  recipeId: string
  message: string
}

/** Message posted from the price-solver worker back to the main thread. A
 * thrown `solve()` is reported as `{ type: 'error' }` rather than swallowed,
 * so the hook can stop "solving" and surface the failure. */
export type SolverWorkerMessage =
  | { type: 'result'; result: SolverOutput }
  | { type: 'error'; message: string }
