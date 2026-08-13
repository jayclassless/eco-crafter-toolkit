/**
 * Garbage output for a single craft.
 *
 * Pure and store-free so the arithmetic can be pinned against the extracted
 * dataset without a React tree — the same treatment `build-product-rows.ts` and
 * `share-defaults.ts` get.
 *
 * Two things this deliberately does NOT do:
 *
 *  - **It does not participate in pricing.** Garbage stays out of `SolverOutput`
 *    and out of the price signal entirely, so a wrong number here cannot move a
 *    single price.
 *  - **It does not see modifier-adjusted quantities.** Garbage is computed from
 *    a recipe's BASE ingredient quantities. Confirmed on a live v14 server:
 *    installing upgrade modules reduced the ingredients consumed but left the
 *    garbage produced unchanged. Feeding it `elementModifiedQuantities` would
 *    under-report garbage on every upgraded table.
 */

import { compareKeys } from '@/lib/collator'

/**
 * An amount of one garbage item.
 *
 * `min === max` whenever the amount is exact, which is every case except one: a
 * tag ingredient whose candidate items carry different `SalvageCost` values and
 * which the build has not pinned to a single item. Callers should render a
 * range only when the two differ.
 */
export interface GarbageQuantity {
  itemId: string
  min: number
  max: number
}

interface GarbageBreakdownRow {
  /** The ingredient this garbage derives from, or `null` for the recipe's own
   * explicit `GarbageOutputs` list. */
  sourceItemOrTagId: string | null
  /** Base quantity consumed. 0 on the explicit row, which has no source. */
  sourceQuantity: number
  /** For a tag source, the concrete item the build pinned — `null` when the tag
   * is unpinned (and the outputs are therefore a range) or when the source is
   * already a concrete item. */
  resolvedItemId: string | null
  /** True when any output on this row is a range rather than a fixed amount. */
  isRange: boolean
  outputs: GarbageQuantity[]
}

export interface RecipeGarbage {
  /** Aggregated across every row, largest first. Empty on v11–v13, which have
   * no garbage data at all, and on the many v14 recipes whose ingredients carry
   * no `SalvageCost`. */
  totals: GarbageQuantity[]
  breakdown: GarbageBreakdownRow[]
}

interface Quantity {
  itemId: string
  quantity: number
}

export interface ComputeRecipeGarbageInput {
  /** The recipe's own `GarbageOutputs`. LITERAL quantities — these are **not**
   * scaled by `ratio`, unlike the salvage-derived half. Verified against the
   * game UI for `AdvancedCircuitRecipe`. */
  explicit: readonly Quantity[]
  /** Base ingredient quantities. Sign is ignored — the store holds ingredient
   * quantities as negatives. */
  ingredients: readonly { itemOrTagId: string; quantity: number }[]
  salvageByItemId: ReadonlyMap<string, readonly Quantity[]>
  /** Items that satisfy a tag. Return undefined/empty for a concrete item. */
  tagItemIds: (itemOrTagId: string) => readonly string[] | undefined
  /** The item the build pinned for a tag (its `userPrices.primaryItemId`), or
   * null when the user has not chosen one. */
  resolveTagItem: (tagId: string) => string | null
  /** `CRAFT_GARBAGE_RATIO`. */
  ratio: number
}

/** Sum by item id, dropping anything that rounds to nothing on both bounds. */
function aggregate(parts: readonly GarbageQuantity[]): GarbageQuantity[] {
  const byItem = new Map<string, GarbageQuantity>()
  for (const p of parts) {
    const existing = byItem.get(p.itemId)
    if (existing) {
      existing.min += p.min
      existing.max += p.max
    } else {
      byItem.set(p.itemId, { itemId: p.itemId, min: p.min, max: p.max })
    }
  }
  return (
    [...byItem.values()]
      .filter((q) => q.max > 0)
      // The itemId tiebreak only makes the result deterministic; it is never
      // read, so it must not follow the display locale.
      .sort((a, b) => b.max - a.max || b.min - a.min || compareKeys(a.itemId, b.itemId))
  )
}

/** One concrete item's salvage, scaled to `quantity` units of it. */
function salvageOf(
  itemId: string,
  quantity: number,
  salvageByItemId: ComputeRecipeGarbageInput['salvageByItemId'],
  ratio: number
): GarbageQuantity[] {
  const salvage = salvageByItemId.get(itemId)
  if (!salvage) return []
  return salvage.map((s) => {
    const amount = quantity * s.quantity * ratio
    return { itemId: s.itemId, min: amount, max: amount }
  })
}

/**
 * Bounds across every item a tag accepts.
 *
 * 23 of v14's 46 ingredient tags genuinely disagree — `WoodBoard` spans
 * WoodScrap 0.3 / 0.4 / 0.5, `Fabric` has five distinct salvage profiles — and
 * they appear in 347 recipes, so picking one item and printing its figure as
 * fact would be wrong more often than right.
 *
 * A candidate that produces none of a given output contributes 0 to that
 * output's minimum, so a tag mixing salvage-bearing and salvage-free items
 * reads "0 – x". Callers pass the app's `tagItems` candidate list, which the
 * importer has already filtered to names that resolve to real items — the same
 * list the price solver walks for min/max pricing, so a tag's waste range and
 * its cost describe the same set. (This filtering is load-bearing: `Wood` lists
 * 50 associated names but only 10 are items, and those 10 all carry BioResidue
 * 0.25, so `Wood` is exact. Ranging over the raw list would show a bogus
 * "0 – x" for it.)
 */
function salvageRange(
  candidates: readonly string[],
  quantity: number,
  salvageByItemId: ComputeRecipeGarbageInput['salvageByItemId'],
  ratio: number
): GarbageQuantity[] {
  const outputIds = new Set<string>()
  for (const c of candidates) {
    for (const s of salvageByItemId.get(c) ?? []) outputIds.add(s.itemId)
  }
  if (outputIds.size === 0) return []

  const out: GarbageQuantity[] = []
  for (const outputId of outputIds) {
    let min = Infinity
    let max = 0
    for (const c of candidates) {
      const found = (salvageByItemId.get(c) ?? []).find((s) => s.itemId === outputId)
      const per = found ? found.quantity : 0
      if (per < min) min = per
      if (per > max) max = per
    }
    out.push({
      itemId: outputId,
      min: quantity * min * ratio,
      max: quantity * max * ratio,
    })
  }
  return out
}

export function computeRecipeGarbage({
  explicit,
  ingredients,
  salvageByItemId,
  tagItemIds,
  resolveTagItem,
  ratio,
}: ComputeRecipeGarbageInput): RecipeGarbage {
  const breakdown: GarbageBreakdownRow[] = []

  if (explicit.length > 0) {
    breakdown.push({
      sourceItemOrTagId: null,
      sourceQuantity: 0,
      resolvedItemId: null,
      isRange: false,
      outputs: aggregate(
        explicit.map((e) => ({ itemId: e.itemId, min: e.quantity, max: e.quantity }))
      ),
    })
  }

  for (const ing of ingredients) {
    const quantity = Math.abs(ing.quantity)
    if (quantity === 0) continue

    const candidates = tagItemIds(ing.itemOrTagId)
    const isTag = candidates != null && candidates.length > 0

    let outputs: GarbageQuantity[]
    let resolvedItemId: string | null = null
    if (!isTag) {
      outputs = salvageOf(ing.itemOrTagId, quantity, salvageByItemId, ratio)
    } else {
      // A pinned tag behaves exactly like a concrete ingredient. Using the
      // build's own choice keeps the Waste figures consistent with the price
      // the Cost Components tab shows for the same tag.
      const pinned = resolveTagItem(ing.itemOrTagId)
      if (pinned && candidates.includes(pinned)) {
        resolvedItemId = pinned
        outputs = salvageOf(pinned, quantity, salvageByItemId, ratio)
      } else {
        outputs = salvageRange(candidates, quantity, salvageByItemId, ratio)
      }
    }

    // An ingredient with no salvage anywhere (raw ores, crushed rock, the scrap
    // items themselves) correctly contributes nothing and gets no row.
    if (outputs.length === 0) continue

    breakdown.push({
      sourceItemOrTagId: ing.itemOrTagId,
      sourceQuantity: quantity,
      resolvedItemId,
      isRange: outputs.some((o) => o.min !== o.max),
      outputs: aggregate(outputs),
    })
  }

  return {
    totals: aggregate(breakdown.flatMap((r) => r.outputs)),
    breakdown,
  }
}
