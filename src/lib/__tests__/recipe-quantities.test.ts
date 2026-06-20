import { describe, expect, it } from 'vitest'

import type { SolverRecipe } from '@/types/solver'

import { getEffectiveRecipeQuantities } from '../recipe-quantities'

function makeRecipe(overrides: Partial<SolverRecipe> = {}): SolverRecipe {
  return {
    id: 'recipe-1',
    skillId: 'skill-1',
    skillLevel: 0,
    laborReducePercent: [1.0, 0.8, 0.5],
    activeTalents: [],
    pluginModule: null,
    speedPluginModule: null,
    baseCraftTime: 1,
    baseLaborCost: 0,
    costPerMinute: 0,
    roundFactor: 0,
    ingredients: [],
    products: [],
    craftMinutesModifiers: [],
    laborModifiers: [],
    ...overrides,
  }
}

describe('getEffectiveRecipeQuantities', () => {
  it('returns base quantities when there are no modifiers', () => {
    const recipe = makeRecipe({
      ingredients: [{ itemOrTagId: 'wood', baseQuantity: -4, modifiers: [] }],
      products: [
        { itemOrTagId: 'table', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
      ],
    })
    const { ingredients, products } = getEffectiveRecipeQuantities(recipe)
    expect(ingredients).toEqual([{ itemOrTagId: 'wood', qty: -4 }])
    expect(products).toEqual([{ itemOrTagId: 'table', qty: 1, share: 1, isReintegrated: false }])
  })

  it('applies a skill modifier to ingredient quantity', () => {
    const recipe = makeRecipe({
      skillLevel: 2, // laborReducePercent[2] = 0.5
      ingredients: [
        {
          itemOrTagId: 'wood',
          baseQuantity: -4,
          modifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        },
      ],
    })
    const { ingredients } = getEffectiveRecipeQuantities(recipe)
    expect(ingredients[0].qty).toBeCloseTo(-2)
  })

  it('applies the round factor (ceil toward zero magnitude for negatives)', () => {
    const recipe = makeRecipe({
      roundFactor: 1, // round to whole numbers
      skillLevel: 1, // 0.8 multiplier
      ingredients: [
        {
          itemOrTagId: 'wood',
          baseQuantity: -3,
          modifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        },
      ],
    })
    // -3 * 0.8 = -2.4 -> floor(-2.4) = -3
    const { ingredients } = getEffectiveRecipeQuantities(recipe)
    expect(ingredients[0].qty).toBe(-3)
  })

  it('preserves share and reintegration flags on products', () => {
    const recipe = makeRecipe({
      products: [
        { itemOrTagId: 'plank', baseQuantity: 2, share: 0.8, isReintegrated: false, modifiers: [] },
        { itemOrTagId: 'sawdust', baseQuantity: 1, share: 0, isReintegrated: true, modifiers: [] },
      ],
    })
    const { products } = getEffectiveRecipeQuantities(recipe)
    expect(products).toEqual([
      { itemOrTagId: 'plank', qty: 2, share: 0.8, isReintegrated: false },
      { itemOrTagId: 'sawdust', qty: 1, share: 0, isReintegrated: true },
    ])
  })
})
