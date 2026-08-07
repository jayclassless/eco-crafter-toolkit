import { describe, it, expect } from 'vitest'

import { moduleFactor } from '@/lib/dynamic-values'
import { solve } from '@/lib/solver'
import type { SolverInput, SolverRecipe, SolverModuleEffect } from '@/types/solver'

/**
 * The solver (`solver.ts`) and the recipe dialog's display path
 * (`recipe-modifiers.ts`) compute module effects through separate code paths.
 * Nothing structural forces them to agree — before this change they were two
 * independent implementations. They now both call `moduleFactor`, and this test
 * is what pins that: it drives a real `solve()` and checks the resulting cost
 * against the factor the display path would show.
 *
 * If someone reimplements the math on either side, the numbers diverge here
 * rather than in production, where the symptom is a dialog that disagrees with
 * the price beside it.
 */
function fx(
  moduleId: string,
  action: SolverModuleEffect['action'],
  effectType: SolverModuleEffect['effectType'],
  value: number,
  skillIds: string[] = []
): SolverModuleEffect {
  return { moduleId, action, effectType, value, skillIds }
}

const GENERICS: SolverModuleEffect[] = [
  fx('basic', 'ResourceCost', 'AdditivePercent', -0.1),
  fx('basic', 'LaborCost', 'AdditivePercent', -0.05),
  fx('basic', 'CraftTime', 'Multiplicative', 0.75),
  fx('adv', 'ResourceCost', 'AdditivePercent', -0.1),
  fx('adv', 'LaborCost', 'AdditivePercent', -0.1),
  fx('adv', 'CraftTime', 'Multiplicative', 0.65),
  fx('mod', 'ResourceCost', 'AdditivePercent', -0.15),
  fx('mod', 'LaborCost', 'AdditivePercent', -0.1),
  fx('mod', 'CraftTime', 'Multiplicative', 0.5),
]

const SPECIALTY: SolverModuleEffect[] = [
  fx('carp', 'ResourceCost', 'AdditivePercent', -0.05, ['sk-carp']),
  fx('carp', 'CraftTime', 'Multiplicative', 0.75, ['sk-carp']),
]

function makeRecipe(effects: SolverModuleEffect[], skillId: string): SolverRecipe {
  return {
    id: 'r1',
    skillId,
    skillLevel: 0,
    laborReducePercent: [1],
    activeTalents: [],
    moduleEffects: effects,
    baseCraftTime: 10,
    baseLaborCost: 1000,
    costPerMinute: 1,
    roundFactor: 0,
    ingredients: [
      {
        itemOrTagId: 'wood',
        baseQuantity: -10,
        modifiers: [{ dynamicType: 'Module', refName: 'Carpentry', skillId: 'sk-carp' }],
      },
    ],
    products: [
      { itemOrTagId: 'out', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
    ],
    craftMinutesModifiers: [{ dynamicType: 'Module', refName: 'Carpentry', skillId: 'sk-carp' }],
    laborModifiers: [],
  }
}

function makeInput(recipe: SolverRecipe): SolverInput {
  return {
    recipes: [recipe],
    prices: { wood: 1 },
    overrides: {},
    settings: { marginType: 'markup', calorieCost: 1000, applyMarginBetweenSkills: false },
    margins: {},
    recipeMargins: {},
    productMargins: {},
    tagItems: {},
    primaryTagItems: {},
    primaryRecipeIds: {},
    priceModes: {},
  }
}

describe('solver and display agree on module effects', () => {
  const cases: Array<{ name: string; effects: SolverModuleEffect[]; skillId: string }> = [
    { name: 'no modules', effects: [], skillId: 'sk-carp' },
    { name: 'three generic slots', effects: GENERICS, skillId: 'sk-carp' },
    { name: 'four slots, scope matches', effects: [...GENERICS, ...SPECIALTY], skillId: 'sk-carp' },
    {
      name: 'four slots, scope does not match',
      effects: [...GENERICS, ...SPECIALTY],
      skillId: 'sk-masonry',
    },
    {
      name: 'legacy scoped-supersedes-unscoped',
      effects: [
        fx('legacy', 'ResourceCost', 'Multiplicative', 0.8),
        fx('legacy', 'ResourceCost', 'Multiplicative', 0.75, ['sk-carp']),
        fx('legacy', 'CraftTime', 'Multiplicative', 0.8),
        fx('legacy', 'CraftTime', 'Multiplicative', 0.75, ['sk-carp']),
      ],
      skillId: 'sk-carp',
    },
  ]

  it.each(cases)('$name', ({ effects, skillId }) => {
    const recipe = makeRecipe(effects, skillId)
    const out = solve(makeInput(recipe))

    // The display path's factors, from the same helper the dialog calls. Rule B
    // (ingredient's own skill) for resource and craft time; Rule A (recipe's
    // skill) for labor.
    const resourceFactor = moduleFactor(effects, 'resource', 'sk-carp')
    const craftFactor = moduleFactor(effects, 'speed', 'sk-carp')
    const laborFactor = moduleFactor(effects, 'labor', skillId)

    // Reconstruct the cost the solver must have produced from those factors.
    const ingredientCost = 10 * resourceFactor * 1
    const craftCost = 10 * craftFactor * 1
    const laborCost = (1000 * laborFactor * 1000) / 1000
    const expected = ingredientCost + craftCost + laborCost

    expect(out.prices['out'].costPrice).toBeCloseTo(expected, 9)
  })
})
