import { describe, expect, it } from 'vitest'

import { computeReintegratedProductIds } from '../reintegration'

describe('computeReintegratedProductIds', () => {
  const NONE = new Set<string>()

  it('returns an empty set when no rule fires', () => {
    const result = computeReintegratedProductIds({
      orderedProductItemIds: ['epoxy', 'sulfur'],
      ingredientItemIds: new Set(['petroleum']),
      autoReintegrateSecondaryItemIds: NONE,
    })
    expect(result).toEqual(new Set())
  })

  it('flags a product that is also an ingredient of the recipe', () => {
    const result = computeReintegratedProductIds({
      orderedProductItemIds: ['plank', 'mold'],
      ingredientItemIds: new Set(['log', 'mold']),
      autoReintegrateSecondaryItemIds: NONE,
    })
    expect(result).toEqual(new Set(['mold']))
  })

  it('flags a curated container produced as a non-primary product', () => {
    // Epoxy recipe shape: Petroleum in; Epoxy (primary) + Barrel + Sulfur out.
    const result = computeReintegratedProductIds({
      orderedProductItemIds: ['epoxy', 'barrel', 'sulfur'],
      ingredientItemIds: new Set(['petroleum']),
      autoReintegrateSecondaryItemIds: new Set(['barrel']),
    })
    expect(result).toEqual(new Set(['barrel']))
  })

  it('does NOT flag a curated container that is the primary product', () => {
    // A recipe whose primary output is the container itself (e.g. making barrels).
    const result = computeReintegratedProductIds({
      orderedProductItemIds: ['barrel', 'scrap'],
      ingredientItemIds: new Set(['iron']),
      autoReintegrateSecondaryItemIds: new Set(['barrel']),
    })
    expect(result).toEqual(new Set())
  })

  it('lets a user override force reintegration on', () => {
    const result = computeReintegratedProductIds({
      orderedProductItemIds: ['epoxy', 'sulfur'],
      ingredientItemIds: new Set(['petroleum']),
      autoReintegrateSecondaryItemIds: NONE,
      userOverrides: new Map([['sulfur', true]]),
    })
    expect(result).toEqual(new Set(['sulfur']))
  })

  it('lets a user override force reintegration off, beating the default rule', () => {
    const result = computeReintegratedProductIds({
      orderedProductItemIds: ['epoxy', 'barrel', 'sulfur'],
      ingredientItemIds: new Set(['petroleum']),
      autoReintegrateSecondaryItemIds: new Set(['barrel']),
      userOverrides: new Map([['barrel', false]]),
    })
    expect(result).toEqual(new Set())
  })
})
