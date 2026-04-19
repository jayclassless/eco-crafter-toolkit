import type {
  PriceMode,
  RecipeCostBreakdown,
  SolverInput,
  SolverOutput,
  SolverRecipe,
  SolverPrice,
  SolverError,
} from '@/types/solver'

import { resolveModifiers, applyRoundFactor, type ModifierContext } from './dynamic-values'
import { applyMargin } from './margins'

interface PreparedElement {
  itemOrTagId: string
  qty: number
}

interface PreparedProduct {
  itemOrTagId: string
  qty: number
  share: number
}

interface PreparedRecipe {
  recipe: SolverRecipe
  fixedCost: number
  costBreakdown: RecipeCostBreakdown
  ingredients: PreparedElement[]
  reintegrated: PreparedElement[]
  products: PreparedProduct[]
}

interface Candidate {
  costPrice: number
  salePrice: number
  recipeId: string
  skillId: string | undefined
}

interface ResolvedProduct {
  costPrice: number
  salePrice: number
  recipeId: string
  skillId: string | undefined
}

export function solve(input: SolverInput): SolverOutput {
  const {
    recipes,
    settings,
    margins,
    recipeMargins,
    productMargins,
    tagItems,
    primaryTagItems,
    primaryRecipeIds,
    priceModes,
  } = input
  const applyMarginBetweenSkills = settings.applyMarginBetweenSkills

  const costPrices: Record<string, number> = { ...input.prices, ...input.overrides }
  const salePrices: Record<string, number> = {}
  const producingSkills: Record<string, string | undefined> = {}
  const candidates: Record<string, Candidate[]> = {}
  const recipePrices: Record<string, { costPrice: number; salePrice: number }> = {}
  const recipeCosts: Record<string, RecipeCostBreakdown> = {}
  const errors: SolverError[] = []

  // ---- Precompute per-recipe, price-independent data ----
  const prepared: PreparedRecipe[] = Array.from<PreparedRecipe>({ length: recipes.length })
  for (let i = 0; i < recipes.length; i++) {
    prepared[i] = prepareRecipe(recipes[i], settings.calorieCost)
    recipeCosts[recipes[i].id] = prepared[i].costBreakdown
  }

  // ---- Iterative resolution over a shrinking unresolved list ----
  let unresolved = prepared
  while (unresolved.length > 0) {
    const next: PreparedRecipe[] = []
    let handledCount = 0

    for (let i = 0; i < unresolved.length; i++) {
      const p = unresolved[i]
      const recipe = p.recipe
      const recipeSkillId = recipe.skillId

      const ingredientTotal = sumElementCost(
        p.ingredients,
        recipeSkillId,
        costPrices,
        salePrices,
        producingSkills,
        tagItems,
        primaryTagItems,
        priceModes,
        applyMarginBetweenSkills,
        -1
      )
      if (ingredientTotal === null) {
        next.push(p)
        continue
      }

      const reintegratedTotal = sumElementCost(
        p.reintegrated,
        recipeSkillId,
        costPrices,
        salePrices,
        producingSkills,
        tagItems,
        primaryTagItems,
        priceModes,
        applyMarginBetweenSkills,
        1
      )
      if (reintegratedTotal === null) {
        next.push(p)
        continue
      }

      const totalCost = p.fixedCost + ingredientTotal - reintegratedTotal

      for (let pi = 0; pi < p.products.length; pi++) {
        const prod = p.products[pi]
        if (prod.qty === 0) continue
        const costPrice = (totalCost * prod.share) / prod.qty

        // Per-product margin override beats the recipe-level margin; the
        // override is only set when the user picks a margin on a multi-recipe
        // product group's parent row (see userProductMargins).
        const marginId = productMargins[prod.itemOrTagId] || recipeMargins[recipe.id]
        const marginPercent = marginId ? (margins[marginId]?.percent ?? null) : null
        const salePrice =
          marginPercent !== null
            ? applyMargin(costPrice, marginPercent, settings.marginType)
            : costPrice

        let list = candidates[prod.itemOrTagId]
        if (!list) {
          list = []
          candidates[prod.itemOrTagId] = list
        }
        list.push({ costPrice, salePrice, recipeId: recipe.id, skillId: recipeSkillId })
        // Key per-recipe-per-product — a single recipe can have multiple
        // products, and each child UI row wants its own specific price.
        recipePrices[`${recipe.id}::${prod.itemOrTagId}`] = { costPrice, salePrice }

        // Collapse the current candidates per mode so downstream recipes that
        // consume this product see the mode-resolved price during iteration.
        // This replaces the old "first-producer wins" short-circuit.
        const mode = priceModes[prod.itemOrTagId] ?? 'min'
        const primaryRecipeId = primaryRecipeIds[prod.itemOrTagId] ?? ''
        const resolved = resolveProductCost(list, mode, primaryRecipeId)
        costPrices[prod.itemOrTagId] = resolved.costPrice
        salePrices[prod.itemOrTagId] = resolved.salePrice
        producingSkills[prod.itemOrTagId] = resolved.skillId
      }

      handledCount++
    }

    if (handledCount === 0) {
      unresolved = next
      break
    }
    unresolved = next
  }

  for (let i = 0; i < unresolved.length; i++) {
    errors.push({
      recipeId: unresolved[i].recipe.id,
      message: 'Could not resolve all ingredient prices',
    })
  }

  const outputPrices: Record<string, SolverPrice> = {}
  for (const productId in candidates) {
    const list = candidates[productId]
    const mode = priceModes[productId] ?? 'min'
    const primaryRecipeId = primaryRecipeIds[productId] ?? ''
    const resolved = resolveProductCost(list, mode, primaryRecipeId)
    outputPrices[productId] = {
      costPrice: resolved.costPrice,
      salePrice: resolved.salePrice,
      recipeId: resolved.recipeId,
    }
  }

  // Emit tag prices so the UI can display them. Tags aren't produced by any
  // recipe, so they never land in `candidates`; resolve each one on demand
  // using its mode (manual/min/max/avg/mirror).
  for (const tagId in tagItems) {
    if (tagId in outputPrices) continue
    const resolved = resolvePrices(
      tagId,
      costPrices,
      salePrices,
      tagItems,
      primaryTagItems,
      priceModes
    )
    if (resolved === null) continue
    outputPrices[tagId] = {
      costPrice: resolved.cost,
      salePrice: resolved.sale ?? resolved.cost,
      recipeId: '',
    }
  }

  return { prices: outputPrices, recipePrices, recipeCosts, elementPrices: {}, errors }
}

function prepareRecipe(recipe: SolverRecipe, calorieCost: number): PreparedRecipe {
  const ctx: ModifierContext = {
    skillLevel: recipe.skillLevel,
    laborReducePercent: recipe.laborReducePercent,
    activeTalents: recipe.activeTalents,
    pluginModule: recipe.pluginModule,
    speedPluginModule: recipe.speedPluginModule,
    recipeSkillId: recipe.skillId,
  }
  // Mirror solver.ts:71-74 — speedPluginModule overrides pluginModule for craft
  // time resolution, falling back to pluginModule when null.
  const craftCtx: ModifierContext =
    recipe.speedPluginModule !== ctx.pluginModule
      ? { ...ctx, pluginModule: recipe.speedPluginModule ?? ctx.pluginModule }
      : ctx

  const laborMultiplier = resolveModifiers(recipe.laborModifiers, ctx)
  const craftMultiplier = resolveModifiers(recipe.craftMinutesModifiers, craftCtx)
  const craftTime = recipe.baseCraftTime * craftMultiplier
  const laborAmount = recipe.baseLaborCost * laborMultiplier
  const craftTimeCost = craftTime * recipe.costPerMinute
  const laborCost = (laborAmount * calorieCost) / 1000
  const fixedCost = laborCost + craftTimeCost
  const costBreakdown: RecipeCostBreakdown = {
    craftTime,
    craftTimeCost,
    laborAmount,
    laborCost,
    costPerMinute: recipe.costPerMinute,
    calorieCost,
  }

  const ingredients: PreparedElement[] = Array.from<PreparedElement>({
    length: recipe.ingredients.length,
  })
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i]
    ingredients[i] = {
      itemOrTagId: ing.itemOrTagId,
      qty: applyRoundFactor(
        ing.baseQuantity * resolveModifiers(ing.modifiers, ctx),
        recipe.roundFactor
      ),
    }
  }

  const reintegrated: PreparedElement[] = []
  const products: PreparedProduct[] = []

  for (let i = 0; i < recipe.products.length; i++) {
    const prod = recipe.products[i]
    const qty = applyRoundFactor(
      prod.baseQuantity * resolveModifiers(prod.modifiers, ctx),
      recipe.roundFactor
    )
    if (prod.isReintegrated) {
      reintegrated.push({ itemOrTagId: prod.itemOrTagId, qty })
    } else {
      products.push({
        itemOrTagId: prod.itemOrTagId,
        qty,
        share: prod.share,
      })
    }
  }

  return { recipe, fixedCost, costBreakdown, ingredients, reintegrated, products }
}

/**
 * Collapse a product's per-recipe candidates into one {cost, sale, recipeId}
 * per the requested mode:
 *   - min/max: pick the extreme cost; its sale/recipeId/skill ride along.
 *   - avg: arithmetic mean of cost and sale; recipeId='', skillId=undefined.
 *   - mirror: the candidate whose recipeId matches primaryRecipeId; falls
 *     through to min when the primary isn't found in the candidate list
 *     (e.g. the user hasn't picked one yet, or picked a recipe that hasn't
 *     resolved this pass).
 */
export function resolveProductCost(
  candidates: Candidate[],
  mode: PriceMode,
  primaryRecipeId: string
): ResolvedProduct {
  if (candidates.length === 1) {
    const c = candidates[0]
    return {
      costPrice: c.costPrice,
      salePrice: c.salePrice,
      recipeId: c.recipeId,
      skillId: c.skillId,
    }
  }

  if (mode === 'mirror' && primaryRecipeId) {
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].recipeId === primaryRecipeId) {
        const c = candidates[i]
        return {
          costPrice: c.costPrice,
          salePrice: c.salePrice,
          recipeId: c.recipeId,
          skillId: c.skillId,
        }
      }
    }
    // Fall through to min so the UI shows a plausible value before the user
    // picks a recipe or while the chosen recipe is still resolving.
  }

  if (mode === 'max') {
    let best = candidates[0]
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].costPrice > best.costPrice) best = candidates[i]
    }
    return {
      costPrice: best.costPrice,
      salePrice: best.salePrice,
      recipeId: best.recipeId,
      skillId: best.skillId,
    }
  }

  if (mode === 'avg') {
    let costSum = 0
    let saleSum = 0
    for (let i = 0; i < candidates.length; i++) {
      costSum += candidates[i].costPrice
      saleSum += candidates[i].salePrice
    }
    const n = candidates.length
    return {
      costPrice: costSum / n,
      salePrice: saleSum / n,
      recipeId: '',
      skillId: undefined,
    }
  }

  // Default and 'min'.
  let best = candidates[0]
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].costPrice < best.costPrice) best = candidates[i]
  }
  return {
    costPrice: best.costPrice,
    salePrice: best.salePrice,
    recipeId: best.recipeId,
    skillId: best.skillId,
  }
}

/**
 * Resolve a tag-or-item against both cost and sale price maps in a single
 * walk. Returns null if the cost price cannot be resolved. The sale price
 * may be null even when cost is resolvable (e.g. when no recipe has produced
 * the item yet — only the override/seed cost map has it).
 */
function resolvePrices(
  itemOrTagId: string,
  costPrices: Record<string, number>,
  salePrices: Record<string, number>,
  tagItems: Record<string, string[]>,
  primaryTagItems: Record<string, string>,
  priceModes: Record<string, PriceMode>
): { cost: number; sale: number | null } | null {
  if (itemOrTagId in costPrices) {
    return {
      cost: costPrices[itemOrTagId],
      sale: itemOrTagId in salePrices ? salePrices[itemOrTagId] : null,
    }
  }

  const items = tagItems[itemOrTagId]
  if (!items) return null

  const mode = priceModes[itemOrTagId] ?? 'min'

  if (mode === 'mirror') {
    const primaryId = primaryTagItems[itemOrTagId]
    if (primaryId && primaryId in costPrices) {
      return {
        cost: costPrices[primaryId],
        sale: primaryId in salePrices ? salePrices[primaryId] : null,
      }
    }
    // Fall through to min walk so the UI doesn't show null mid-edit.
  }

  if (mode === 'max') {
    let maxCost: number | null = null
    let maxSale: number | null = null
    let pricedCount = 0
    for (let i = 0; i < items.length; i++) {
      const id = items[i]
      if (!(id in costPrices)) continue
      pricedCount++
      const c = costPrices[id]
      if (maxCost === null || c > maxCost) {
        maxCost = c
        maxSale = id in salePrices ? salePrices[id] : null
      }
    }
    if (pricedCount === 0) return null
    return { cost: maxCost as number, sale: maxSale }
  }

  if (mode === 'avg') {
    let costSum = 0
    let costCount = 0
    let saleSum = 0
    let saleCount = 0
    for (let i = 0; i < items.length; i++) {
      const id = items[i]
      if (id in costPrices) {
        costSum += costPrices[id]
        costCount++
      }
      if (id in salePrices) {
        saleSum += salePrices[id]
        saleCount++
      }
    }
    if (costCount === 0) return null
    const sale = saleCount === items.length ? saleSum / saleCount : null
    return { cost: costSum / costCount, sale }
  }

  // Default / 'manual'-with-no-price / 'min': walk priced items, pick lowest.
  let minCost: number | null = null
  let minSale: number | null = null
  let pricedCount = 0
  for (let i = 0; i < items.length; i++) {
    const id = items[i]
    if (!(id in costPrices)) continue
    pricedCount++
    const c = costPrices[id]
    if (minCost === null || c < minCost) {
      minCost = c
      minSale = id in salePrices ? salePrices[id] : null
    }
  }
  if (pricedCount === 0) return null
  return { cost: minCost as number, sale: minSale }
}

function getIngredientPrice(
  itemOrTagId: string,
  currentRecipeSkillId: string | undefined,
  costPrices: Record<string, number>,
  salePrices: Record<string, number>,
  producingSkills: Record<string, string | undefined>,
  tagItems: Record<string, string[]>,
  primaryTagItems: Record<string, string>,
  priceModes: Record<string, PriceMode>,
  applyMarginBetweenSkills: boolean
): number | null {
  const resolved = resolvePrices(
    itemOrTagId,
    costPrices,
    salePrices,
    tagItems,
    primaryTagItems,
    priceModes
  )
  if (resolved === null) return null

  if (!applyMarginBetweenSkills || resolved.sale === null) return resolved.cost

  const producingSkill = producingSkills[itemOrTagId]
  if (producingSkill && producingSkill !== currentRecipeSkillId) {
    return resolved.sale
  }
  return resolved.cost
}

function sumElementCost(
  elements: PreparedElement[],
  recipeSkillId: string | undefined,
  costPrices: Record<string, number>,
  salePrices: Record<string, number>,
  producingSkills: Record<string, string | undefined>,
  tagItems: Record<string, string[]>,
  primaryTagItems: Record<string, string>,
  priceModes: Record<string, PriceMode>,
  applyMarginBetweenSkills: boolean,
  sign: number
): number | null {
  let total = 0
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const price = getIngredientPrice(
      el.itemOrTagId,
      recipeSkillId,
      costPrices,
      salePrices,
      producingSkills,
      tagItems,
      primaryTagItems,
      priceModes,
      applyMarginBetweenSkills
    )
    if (price === null) return null
    total += sign * price * el.qty
  }
  return total
}
