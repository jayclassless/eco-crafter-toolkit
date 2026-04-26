/**
 * Auto-default share allocation for a multi-product recipe — shared by the
 * solver snapshot, the RecipeDialog display, and the userProductShares
 * bootstrap so all three agree.
 *
 * Allocation rule (config = build's `defaultShareForSecondaryItems`, 0–100):
 * - Primary (first non-reintegrated product, by recipeElements.index) →
 *   `100 − config%`
 * - Each non-zero secondary (not in `zeroShareItemIds`) → `config% / N` where
 *   N is the count of non-zero secondaries
 * - Zero-share secondaries (Slag, Tailings, WetTailings) → `0%`
 *
 * If N === 0 (only zero-share secondaries exist) primary stays at 100%. Sum
 * is always exactly 100.
 *
 * Returns fractional values when N doesn't divide config evenly. Callers that
 * need integers (the `setProductShare` bootstrap) should round-and-correct
 * via the existing dollar-split logic before persisting to the store.
 */
export function computeAutoShares(
  nonReintegratedProductIds: string[],
  zeroShareItemIds: Set<string>,
  configPercent: number
): Map<string, number> {
  const out = new Map<string, number>()
  if (nonReintegratedProductIds.length === 0) return out

  const primaryId = nonReintegratedProductIds[0]
  const config = Math.max(0, Math.min(100, configPercent))

  if (nonReintegratedProductIds.length === 1) {
    out.set(primaryId, 100)
    return out
  }

  const nonZeroSecondaries: string[] = []
  for (let i = 1; i < nonReintegratedProductIds.length; i++) {
    const id = nonReintegratedProductIds[i]
    if (!zeroShareItemIds.has(id)) nonZeroSecondaries.push(id)
  }

  if (nonZeroSecondaries.length === 0) {
    out.set(primaryId, 100)
    for (let i = 1; i < nonReintegratedProductIds.length; i++) {
      out.set(nonReintegratedProductIds[i], 0)
    }
    return out
  }

  const perSecondary = config / nonZeroSecondaries.length
  out.set(primaryId, 100 - config)
  for (let i = 1; i < nonReintegratedProductIds.length; i++) {
    const id = nonReintegratedProductIds[i]
    out.set(id, zeroShareItemIds.has(id) ? 0 : perSecondary)
  }
  return out
}

/**
 * Round a sharePercent map to integers while preserving the sum (typically
 * 100). Each value is floored, then the leftover (sum − floored sum) is
 * distributed one point at a time to the entries with the largest fractional
 * remainder. This is the same "dollar split" the redistribute branch in
 * `setProductShare` already uses.
 *
 * Order of `productIds` is preserved in the returned map — important so the
 * primary is the first key and stays distinguishable in callers that iterate.
 */
export function roundSharesPreservingSum(
  productIds: string[],
  shares: Map<string, number>
): Map<string, number> {
  const total = productIds.reduce((s, id) => s + (shares.get(id) ?? 0), 0)
  const targetTotal = Math.round(total)
  const floored = productIds.map((id) => Math.floor(shares.get(id) ?? 0))
  const remainders = productIds.map((id, i) => ({
    i,
    frac: (shares.get(id) ?? 0) - floored[i],
  }))
  let leftover = targetTotal - floored.reduce((s, v) => s + v, 0)
  // Distribute leftover to largest fractional remainders first.
  remainders.sort((a, b) => b.frac - a.frac)
  for (const r of remainders) {
    if (leftover <= 0) break
    floored[r.i]++
    leftover--
  }
  const out = new Map<string, number>()
  for (let i = 0; i < productIds.length; i++) out.set(productIds[i], floored[i])
  return out
}
