import type {
  PriceMode,
  RecipeCostBreakdown,
  SolverInput,
  SolverOutput,
  SolverRecipe,
  SolverPrice,
  SolverError,
} from '@/types/solver'

import { moduleFactor, resolveModifiers, type ModifierContext } from './dynamic-values'
import { applyMargin } from './margins'
import { getEffectiveRecipeQuantities } from './recipe-quantities'

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

export interface SolveOptions {
  /** Override for the iteration cap. Test seam — production callers should
   * leave this unset and let the solver use its default of `2N+8` passes,
   * which is well above any real convergence depth. */
  maxPasses?: number
}

export function solve(input: SolverInput, options: SolveOptions = {}): SolverOutput {
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

  // Items the user has supplied a price for (typed manual price OR moved-to-
  // materials override). These are authoritative — recipes that also produce
  // them still record per-recipe candidates / recipePrices for the dialog,
  // but must not clobber the cost flow. Without this, a downstream recipe
  // that consumes a user-priced item gets the recipe-derived price instead of
  // the user's, and the dialog's product Unit Price diverges from its Cost
  // Components total (which displays the user's typed value).
  const userPricedItems = new Set<string>()
  for (const id in input.prices) userPricedItems.add(id)
  for (const id in input.overrides) userPricedItems.add(id)

  // ---- Precompute per-recipe, price-independent data ----
  const prepared: PreparedRecipe[] = Array.from<PreparedRecipe>({ length: recipes.length })
  for (let i = 0; i < recipes.length; i++) {
    prepared[i] = prepareRecipe(recipes[i], settings.calorieCost)
    recipeCosts[recipes[i].id] = prepared[i].costBreakdown
  }

  // ---- Fixed-point resolution ----
  // Each pass walks every recipe whose ingredients are currently resolvable,
  // recomputes its product costs from the current `costPrices`, and updates
  // (replaces) that recipe's entry in `candidates`. After each pass we re-
  // aggregate `costPrices`/`salePrices` from the candidates. Repeat until a
  // pass produces no costPrices change.
  //
  // Why iterate to a fixed point: a product can be made by several recipes
  // (e.g. Iron Concentrate has 4 producers in v13). The first producer
  // processed in a pass writes one candidate; downstream consumers run with
  // *that* one candidate as the resolved price. When later producers add
  // cheaper candidates, the resolved price falls — but the consumer already
  // computed its own products against the stale value. A second pass picks up
  // the new ingredient price and rewrites the consumer's candidate / recipe-
  // keyed price. Without this, the consumer's per-recipe Unit Price in the
  // dialog disagrees with the same recipe's ingredient totals.
  const handledIds = new Set<string>()
  // Index of each recipe's candidate within `candidates[productId]`, keyed by
  // `${recipeId}::${productId}` — lets us replace in O(1) on subsequent
  // passes instead of pushing duplicates or doing findIndex.
  const candidateIndex = new Map<string, number>()
  // Bound passes defensively. Convergence depth is the longest dependency
  // chain in the build; 2N is well above that even pathologically. The
  // override is a test seam so the non-convergence path can be exercised.
  const maxPasses = options.maxPasses ?? prepared.length * 2 + 8
  let pass = 0
  let changed = true
  // Recipe ids that wrote a new costPrice during the *last* pass. When the
  // pass cap exhausts (i.e. `changed` is still true), these are the recipes
  // that were still oscillating — most likely participants in a dependency
  // cycle. Reset at the top of each pass so we only retain the final pass.
  let lastPassChangedRecipes = new Set<string>()
  while (changed && pass < maxPasses) {
    changed = false
    pass++
    lastPassChangedRecipes = new Set<string>()

    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i]
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
      if (ingredientTotal === null) continue

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
      if (reintegratedTotal === null) continue

      const totalCost = p.fixedCost + ingredientTotal - reintegratedTotal
      handledIds.add(recipe.id)

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
        const candidateKey = `${recipe.id}::${prod.itemOrTagId}`
        const existingIdx = candidateIndex.get(candidateKey)
        const newCandidate: Candidate = {
          costPrice,
          salePrice,
          recipeId: recipe.id,
          skillId: recipeSkillId,
        }
        if (existingIdx !== undefined) {
          list[existingIdx] = newCandidate
        } else {
          candidateIndex.set(candidateKey, list.length)
          list.push(newCandidate)
        }
        // Key per-recipe-per-product — a single recipe can have multiple
        // products, and each child UI row wants its own specific price.
        recipePrices[candidateKey] = { costPrice, salePrice }

        // Re-aggregate costPrices/salePrices for this product. User-priced
        // items keep their seeded value (see userPricedItems comment above).
        if (!userPricedItems.has(prod.itemOrTagId)) {
          const mode = priceModes[prod.itemOrTagId] ?? 'min'
          const primaryRecipeId = primaryRecipeIds[prod.itemOrTagId] ?? ''
          const resolved = resolveProductCost(list, mode, primaryRecipeId)
          if (costPrices[prod.itemOrTagId] !== resolved.costPrice) {
            changed = true
            lastPassChangedRecipes.add(recipe.id)
          }
          costPrices[prod.itemOrTagId] = resolved.costPrice
          salePrices[prod.itemOrTagId] = resolved.salePrice
          producingSkills[prod.itemOrTagId] = resolved.skillId
        }
      }
    }
  }

  for (let i = 0; i < prepared.length; i++) {
    if (!handledIds.has(prepared[i].recipe.id)) {
      errors.push({
        code: 'unresolved',
        recipeId: prepared[i].recipe.id,
        message: 'Could not resolve all ingredient prices',
      })
    }
  }

  // The loop exits when (a) a pass produced no changes (converged) or
  // (b) the pass cap was hit while changes were still happening. Case (b)
  // means the prices we return are whatever the last partial pass wrote —
  // not a stable fixed point. Surface the offending recipes so consumers
  // know the result is suspect; otherwise the UI shows oscillating numbers
  // with no indication anything is wrong.
  if (changed) {
    for (const recipeId of lastPassChangedRecipes) {
      errors.push({
        code: 'non-convergent',
        recipeId,
        message: 'Solver did not converge — recipe likely participates in a dependency cycle',
      })
    }
  }

  const outputPrices: Record<string, SolverPrice> = {}
  for (const productId in candidates) {
    if (userPricedItems.has(productId)) {
      // User's typed price wins over any recipe candidate. Sale follows the
      // product-level margin (recipe margin doesn't apply — there's no single
      // recipe attribution for a user-set price).
      const userCost = costPrices[productId]
      const marginId = productMargins[productId]
      const marginPercent = marginId ? (margins[marginId]?.percent ?? null) : null
      const userSale =
        marginPercent !== null
          ? applyMargin(userCost, marginPercent, settings.marginType)
          : userCost
      outputPrices[productId] = { costPrice: userCost, salePrice: userSale, recipeId: '' }
      continue
    }
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

  return { prices: outputPrices, recipePrices, recipeCosts, errors }
}

function prepareRecipe(recipe: SolverRecipe, calorieCost: number): PreparedRecipe {
  const ctx: ModifierContext = {
    skillLevel: recipe.skillLevel,
    laborReducePercent: recipe.laborReducePercent,
    activeTalents: recipe.activeTalents,
    moduleEffects: recipe.moduleEffects,
  }

  // Labor is the one action that does NOT hang off a `Module` modifier: neither
  // v13 nor v14 emits one on a recipe's Labor dynamic value (verified — Labor
  // modifiers are only ever Skill/Talent). So the module factor is applied at
  // the recipe level here, scoped against the RECIPE's skill (Rule A) rather
  // than an ingredient's (Rule B, used for resource and craft time).
  //
  // The two rules never collide: legacy modules produce no LaborCost effects at
  // all, so this multiplies by exactly 1 on every v11-v13 build.
  const laborMultiplier =
    resolveModifiers(recipe.laborModifiers, ctx, 'labor') *
    moduleFactor(recipe.moduleEffects, 'labor', recipe.skillId)
  const craftMultiplier = resolveModifiers(recipe.craftMinutesModifiers, ctx, 'speed')
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

  const effective = getEffectiveRecipeQuantities(recipe)
  const ingredients: PreparedElement[] = effective.ingredients

  const reintegrated: PreparedElement[] = []
  const products: PreparedProduct[] = []

  for (const prod of effective.products) {
    if (prod.isReintegrated) {
      reintegrated.push({ itemOrTagId: prod.itemOrTagId, qty: prod.qty })
    } else {
      products.push({
        itemOrTagId: prod.itemOrTagId,
        qty: prod.qty,
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
