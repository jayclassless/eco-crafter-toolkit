import { describe, it, expect } from 'vitest'

import type { SolverInput, SolverRecipe } from '@/types/solver'

import { resolveProductCost, solve } from '../solver'

function makeRecipe(overrides: Partial<SolverRecipe> = {}): SolverRecipe {
  return {
    id: 'recipe-1',
    skillId: 'skill-1',
    skillLevel: 3,
    laborReducePercent: [1.0, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
    activeTalents: [],
    pluginModule: null,
    speedPluginModule: null,
    baseCraftTime: 1.0,
    baseLaborCost: 100,
    costPerMinute: 0,
    roundFactor: 0,
    ingredients: [],
    products: [],
    craftMinutesModifiers: [],
    laborModifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
    ...overrides,
  }
}

function makeInput(overrides: Partial<SolverInput> = {}): SolverInput {
  return {
    recipes: [],
    prices: {},
    overrides: {},
    settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: false },
    margins: {},
    recipeMargins: {},
    productMargins: {},
    tagItems: {},
    primaryTagItems: {},
    primaryRecipeIds: {},
    priceModes: {},
    ...overrides,
  }
}

describe('solve', () => {
  describe('single recipe, single product', () => {
    it('calculates cost from ingredients only', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [
          { itemOrTagId: 'wood', baseQuantity: -4, modifiers: [] },
          { itemOrTagId: 'stone', baseQuantity: -2, modifiers: [] },
        ],
        products: [
          { itemOrTagId: 'table', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { wood: 5, stone: 10 } }))
      // cost = -((-4*5) + (-2*10)) = 40
      expect(result.prices['table'].costPrice).toBeCloseTo(40)
      expect(result.errors).toHaveLength(0)
    })

    it('adds labor cost based on calorie cost', () => {
      const recipe = makeRecipe({
        baseLaborCost: 200,
        baseCraftTime: 0,
        skillLevel: 0,
        laborModifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { wood: 10 },
          settings: { marginType: 'markup', calorieCost: 50, applyMarginBetweenSkills: false },
        })
      )
      // ingredient=10, labor=200*1.0*50/1000=10, total=20
      expect(result.prices['plank'].costPrice).toBeCloseTo(20)
    })

    it('adds craft time cost', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 5,
        costPerMinute: 2,
        laborModifiers: [],
        craftMinutesModifiers: [],
        ingredients: [{ itemOrTagId: 'ore', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'bar', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { ore: 10 } }))
      // ingredient=10, craftTime=5*2=10, total=20
      expect(result.prices['bar'].costPrice).toBeCloseTo(20)
    })

    it('applies skill modifier to labor', () => {
      const recipe = makeRecipe({
        baseLaborCost: 1000,
        baseCraftTime: 0,
        skillLevel: 3,
        laborModifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        ingredients: [],
        products: [
          { itemOrTagId: 'item', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          settings: { marginType: 'markup', calorieCost: 100, applyMarginBetweenSkills: false },
        })
      )
      // labor=1000*0.7*100/1000=70
      expect(result.prices['item'].costPrice).toBeCloseTo(70)
    })

    it('applies margin to produce sale price', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { wood: 100 },
          margins: { m1: { name: 'Standard', percent: 20 } },
          recipeMargins: { 'recipe-1': 'm1' },
          settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: false },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(100)
      expect(result.prices['plank'].salePrice).toBeCloseTo(120)
    })
  })

  describe('multi-product recipes', () => {
    it('distributes cost by share percentage', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'stone', baseQuantity: -10, modifiers: [] }],
        products: [
          {
            itemOrTagId: 'brick',
            baseQuantity: 2,
            share: 0.6,
            isReintegrated: false,
            modifiers: [],
          },
          {
            itemOrTagId: 'gravel',
            baseQuantity: 2,
            share: 0.4,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { stone: 1 } }))
      expect(result.prices['brick'].costPrice).toBeCloseTo(3)
      expect(result.prices['gravel'].costPrice).toBeCloseTo(2)
    })

    it('handles reintegrated products', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'stone', baseQuantity: -10, modifiers: [] }],
        products: [
          { itemOrTagId: 'brick', baseQuantity: 2, share: 1, isReintegrated: false, modifiers: [] },
          { itemOrTagId: 'dust', baseQuantity: 1, share: 0, isReintegrated: true, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { stone: 1, dust: 2 } }))
      // ingredient=10, reintegrated=2*1=2, net=10-2=8, brick=8/2=4
      expect(result.prices['brick'].costPrice).toBeCloseTo(4)
    })
  })

  describe('user-priced ingredients', () => {
    // Regression: a recipe that produces an ingredient with a user-set price
    // (input.prices) used to clobber that price in the cost flow, so a
    // downstream recipe consuming the ingredient saw the recipe-derived value
    // instead. Reproduces the SmeltIron/IronConcentrate divergence: dialog
    // shows ingredient unit prices from the user value (5.30 total) while the
    // product's Unit Price was computed from the clobbered value (~1.72/bar
    // instead of ~0.88/bar).
    const ironConcRecipe = (): SolverRecipe =>
      makeRecipe({
        id: 'iron-conc',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'crushed-ore', baseQuantity: -5, modifiers: [] }],
        products: [
          {
            itemOrTagId: 'iron-conc',
            baseQuantity: 1,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })
    const smeltIron = (): SolverRecipe =>
      makeRecipe({
        id: 'smelt-iron',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [
          { itemOrTagId: 'iron-conc', baseQuantity: -2, modifiers: [] },
          { itemOrTagId: 'clay-mold', baseQuantity: -6, modifiers: [] },
        ],
        products: [
          {
            itemOrTagId: 'iron-bar',
            baseQuantity: 6,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
          { itemOrTagId: 'slag', baseQuantity: 2, share: 0, isReintegrated: false, modifiers: [] },
          {
            itemOrTagId: 'clay-mold',
            baseQuantity: 3,
            share: 0,
            isReintegrated: true,
            modifiers: [],
          },
        ],
      })

    it('user-set price wins over a recipe that also produces the ingredient', () => {
      const result = solve(
        makeInput({
          recipes: [ironConcRecipe(), smeltIron()],
          prices: { 'iron-conc': 2.5, 'crushed-ore': 1 },
          overrides: { 'clay-mold': 0.1 },
        })
      )
      // With user iron-conc=2.5: 2*2.5 + 6*0.1 - 3*0.1 = 5.30; per bar = 0.8833
      expect(result.prices['iron-bar'].costPrice).toBeCloseTo(0.8833, 3)
      expect(result.recipePrices['smelt-iron::iron-bar'].costPrice).toBeCloseTo(0.8833, 3)
      // The user's price is what's emitted; the recipe-derived 5.0 is not.
      expect(result.prices['iron-conc'].costPrice).toBeCloseTo(2.5)
    })

    it('order-independent: user-set price wins regardless of recipe iteration order', () => {
      // Reverse the array — IronConcentrate would have been resolved first
      // under the old logic, clobbering the seeded 2.5 before SmeltIron ran.
      const result = solve(
        makeInput({
          recipes: [smeltIron(), ironConcRecipe()],
          prices: { 'iron-conc': 2.5, 'crushed-ore': 1 },
          overrides: { 'clay-mold': 0.1 },
        })
      )
      expect(result.prices['iron-bar'].costPrice).toBeCloseTo(0.8833, 3)
      expect(result.prices['iron-conc'].costPrice).toBeCloseTo(2.5)
    })

    it('still records the recipe-keyed cost so the dialog can show what the recipe would charge', () => {
      const result = solve(
        makeInput({
          recipes: [ironConcRecipe(), smeltIron()],
          prices: { 'iron-conc': 2.5, 'crushed-ore': 1 },
          overrides: { 'clay-mold': 0.1 },
        })
      )
      // IronConcentrateRecipe's per-recipe cost still reflects what producing
      // it would actually cost (5.0), even though it doesn't drive cost flow.
      expect(result.recipePrices['iron-conc::iron-conc'].costPrice).toBeCloseTo(5)
    })

    it('per-recipe Unit Price reflects the final resolved ingredient cost, not the mid-iteration value', () => {
      // Reproduces the v13 SmeltIron bug: when an ingredient (Iron Concentrate)
      // is produced by multiple recipes in the build, the iterative solver
      // used to write `recipePrices[consumer::product]` based on whichever
      // producer ran first. Later (cheaper) producers updated the resolved
      // costPrice but never re-ran the consumer's recipe, so the dialog's
      // per-recipe Unit Price stayed at the stale, more-expensive value.
      const expensiveProducer = makeRecipe({
        id: 'iron-conc-expensive',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'crushed-ore', baseQuantity: -5, modifiers: [] }],
        products: [
          {
            itemOrTagId: 'iron-conc',
            baseQuantity: 1,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })
      const cheapProducer = makeRecipe({
        id: 'iron-conc-cheap',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'crushed-ore', baseQuantity: -2, modifiers: [] }],
        products: [
          {
            itemOrTagId: 'iron-conc',
            baseQuantity: 1,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })
      const consumer = makeRecipe({
        id: 'smelt-iron',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [
          { itemOrTagId: 'iron-conc', baseQuantity: -2, modifiers: [] },
          { itemOrTagId: 'clay-mold', baseQuantity: -6, modifiers: [] },
        ],
        products: [
          {
            itemOrTagId: 'iron-bar',
            baseQuantity: 6,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
          {
            itemOrTagId: 'clay-mold',
            baseQuantity: 3,
            share: 0,
            isReintegrated: true,
            modifiers: [],
          },
        ],
      })
      // Order matters: the expensive producer comes first so it would set
      // costPrices[iron-conc]=5 before the consumer ran under the old single-
      // pass logic.
      const result = solve(
        makeInput({
          recipes: [expensiveProducer, consumer, cheapProducer],
          prices: { 'crushed-ore': 1, 'clay-mold': 0.1 },
        })
      )
      // Final resolved iron-conc cost: min(5, 2) = 2.
      expect(result.prices['iron-conc'].costPrice).toBeCloseTo(2)
      // Smelt Iron's per-recipe IronBar Unit Price uses the final iron-conc
      // price: (2*2 + 6*0.1 - 3*0.1) / 6 = 4.30/6 ≈ 0.7166 — NOT (2*5 + 6*0.1
      // - 3*0.1) / 6 = 1.7166, which was the buggy mid-iteration value.
      expect(result.recipePrices['smelt-iron::iron-bar'].costPrice).toBeCloseTo(0.7166, 3)
    })

    it('applies productMargin to the user price when emitting salePrice', () => {
      const result = solve(
        makeInput({
          recipes: [ironConcRecipe(), smeltIron()],
          prices: { 'iron-conc': 2.5, 'crushed-ore': 1 },
          overrides: { 'clay-mold': 0.1 },
          productMargins: { 'iron-conc': 'm1' },
          margins: { m1: { name: 'std', percent: 20 } },
        })
      )
      // markup: cost * (1 + 0.2) = 3
      expect(result.prices['iron-conc'].salePrice).toBeCloseTo(3)
    })
  })

  describe('recipe chains', () => {
    it('resolves a two-step chain', () => {
      const recipe1 = makeRecipe({
        id: 'r1',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'ore', baseQuantity: -2, modifiers: [] }],
        products: [
          { itemOrTagId: 'ingot', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const recipe2 = makeRecipe({
        id: 'r2',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'ingot', baseQuantity: -3, modifiers: [] }],
        products: [
          { itemOrTagId: 'sword', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe2, recipe1], prices: { ore: 5 } }))
      expect(result.prices['ingot'].costPrice).toBeCloseTo(10)
      expect(result.prices['sword'].costPrice).toBeCloseTo(30)
    })

    it('handles recipes with no resolvable ingredients as errors', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'unknown', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'thing', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe] }))
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].recipeId).toBe('recipe-1')
    })
  })

  describe('dynamic modifiers on quantities', () => {
    it('applies module modifier to ingredient quantity', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        pluginModule: { percent: 0.5 },
        ingredients: [
          {
            itemOrTagId: 'wood',
            baseQuantity: -4,
            modifiers: [{ dynamicType: 'Module', refName: 'skill-1' }],
          },
        ],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { wood: 10 } }))
      // quantity=-4*0.5=-2, cost=-(-2*10)=20
      expect(result.prices['plank'].costPrice).toBeCloseTo(20)
    })

    it('applies round factor to quantities', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        roundFactor: 1,
        pluginModule: { percent: 0.7 },
        ingredients: [
          {
            itemOrTagId: 'wood',
            baseQuantity: -3,
            modifiers: [{ dynamicType: 'Module', refName: 'skill-1' }],
          },
        ],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { wood: 10 } }))
      // dynamic=-3*0.7=-2.1, roundFactor=1: floor(-2.1*1)/1=-3, cost=-(-3*10)=30
      expect(result.prices['plank'].costPrice).toBeCloseTo(30)
    })
  })

  describe('tag resolution', () => {
    it('uses minimum price from tag items when no primary set', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { birch: 8, oak: 12 },
          tagItems: { 'tag-wood': ['birch', 'oak'] },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(8)
    })

    it('uses primary item price when mode=mirror is set', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { birch: 8, oak: 12 },
          tagItems: { 'tag-wood': ['birch', 'oak'] },
          primaryTagItems: { 'tag-wood': 'oak' },
          priceModes: { 'tag-wood': 'mirror' },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(12)
    })

    it('skips unpriced children when mode=min', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { oak: 12 },
          tagItems: { 'tag-wood': ['birch', 'oak', 'pine'] },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(12)
    })

    it('uses maximum price from tag items when mode=max', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { birch: 8, oak: 12, pine: 5 },
          tagItems: { 'tag-wood': ['birch', 'oak', 'pine'] },
          priceModes: { 'tag-wood': 'max' },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(12)
    })

    it('averages priced children when mode=avg, skipping unpriced', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { birch: 8, oak: 12 },
          tagItems: { 'tag-wood': ['birch', 'oak', 'pine'] },
          priceModes: { 'tag-wood': 'avg' },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(10)
    })

    it('errors when mode=avg and no children are priced', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          tagItems: { 'tag-wood': ['birch', 'oak'] },
          priceModes: { 'tag-wood': 'avg' },
        })
      )
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.prices['plank']).toBeUndefined()
    })

    it('falls back to min when mode=mirror but primaryItemId is missing', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { birch: 8, oak: 12 },
          tagItems: { 'tag-wood': ['birch', 'oak'] },
          priceModes: { 'tag-wood': 'mirror' },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(8)
    })

    it('falls back to min when mode=manual but no manual price entered', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { birch: 8, oak: 12 },
          tagItems: { 'tag-wood': ['birch', 'oak'] },
          priceModes: { 'tag-wood': 'manual' },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(8)
    })
  })

  describe('precomputed/contract behaviors', () => {
    it('applies talent modifier to labor cost', () => {
      const recipe = makeRecipe({
        baseLaborCost: 1000,
        baseCraftTime: 0,
        skillLevel: 0,
        activeTalents: [{ name: 'efficient', value: 0.5 }],
        laborModifiers: [
          { dynamicType: 'Skill', refName: 'skill-1' },
          { dynamicType: 'Talent', refName: 'efficient' },
        ],
        ingredients: [],
        products: [
          { itemOrTagId: 'item', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          settings: { marginType: 'markup', calorieCost: 100, applyMarginBetweenSkills: false },
        })
      )
      // 1000 * 1.0 * 0.5 * 100 / 1000 = 50
      expect(result.prices['item'].costPrice).toBeCloseTo(50)
    })

    it('uses speedPluginModule for craft time but not labor', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 10,
        costPerMinute: 1,
        pluginModule: { percent: 0.5 },
        speedPluginModule: { percent: 0.25 },
        laborModifiers: [],
        craftMinutesModifiers: [{ dynamicType: 'Module', refName: 'mod' }],
        ingredients: [],
        products: [
          { itemOrTagId: 'item', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe] }))
      // craft = 10 * 0.25 * 1 = 2.5 (uses speedPluginModule, not pluginModule)
      expect(result.prices['item'].costPrice).toBeCloseTo(2.5)
    })

    it('overrides take precedence over solver computation', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { wood: 5, plank: 999 },
          overrides: { plank: 42 },
        })
      )
      // override (42) wins over the non-override seed (999) and over the
      // recipe-derived value (5). The recipe still records its per-recipe
      // cost via recipePrices for the dialog.
      expect(result.prices['plank'].costPrice).toBeCloseTo(42)
      expect(result.recipePrices['recipe-1::plank'].costPrice).toBeCloseTo(5)
    })

    it('resolves a deep chain across many iterations', () => {
      const recipes: SolverRecipe[] = []
      // a -> b -> c -> d -> e, given in reverse to force iteration
      const links = ['e', 'd', 'c', 'b']
      const sources = ['d', 'c', 'b', 'a']
      for (let i = 0; i < links.length; i++) {
        recipes.push(
          makeRecipe({
            id: `r-${links[i]}`,
            baseLaborCost: 0,
            baseCraftTime: 0,
            laborModifiers: [],
            ingredients: [{ itemOrTagId: sources[i], baseQuantity: -1, modifiers: [] }],
            products: [
              {
                itemOrTagId: links[i],
                baseQuantity: 1,
                share: 1,
                isReintegrated: false,
                modifiers: [],
              },
            ],
          })
        )
      }
      const result = solve(makeInput({ recipes, prices: { a: 7 } }))
      expect(result.prices['b'].costPrice).toBeCloseTo(7)
      expect(result.prices['c'].costPrice).toBeCloseTo(7)
      expect(result.prices['d'].costPrice).toBeCloseTo(7)
      expect(result.prices['e'].costPrice).toBeCloseTo(7)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('multi-recipe products', () => {
    const baseRecipe = (id: string, ingredient: string, productId = 'widget') =>
      makeRecipe({
        id,
        skillId: `skill-${id}`,
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: ingredient, baseQuantity: -1, modifiers: [] }],
        products: [
          {
            itemOrTagId: productId,
            baseQuantity: 1,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })

    it('defaults to min cost across producers', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('cheap', 'a'), baseRecipe('pricey', 'b')],
          prices: { a: 5, b: 20 },
        })
      )
      expect(result.prices['widget'].costPrice).toBeCloseTo(5)
      expect(result.prices['widget'].recipeId).toBe('cheap')
    })

    it('picks max cost when mode=max', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('cheap', 'a'), baseRecipe('pricey', 'b')],
          prices: { a: 5, b: 20 },
          priceModes: { widget: 'max' },
        })
      )
      expect(result.prices['widget'].costPrice).toBeCloseTo(20)
      expect(result.prices['widget'].recipeId).toBe('pricey')
    })

    it('averages across producers when mode=avg', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('a', 'ia'), baseRecipe('b', 'ib'), baseRecipe('c', 'ic')],
          prices: { ia: 4, ib: 8, ic: 12 },
          priceModes: { widget: 'avg' },
        })
      )
      expect(result.prices['widget'].costPrice).toBeCloseTo(8)
      expect(result.prices['widget'].recipeId).toBe('')
    })

    it('mirrors the chosen recipe when mode=mirror', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('cheap', 'a'), baseRecipe('pricey', 'b')],
          prices: { a: 5, b: 20 },
          priceModes: { widget: 'mirror' },
          primaryRecipeIds: { widget: 'pricey' },
        })
      )
      expect(result.prices['widget'].costPrice).toBeCloseTo(20)
      expect(result.prices['widget'].recipeId).toBe('pricey')
    })

    it('falls back to min when mode=mirror but chosen recipe is absent', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('cheap', 'a'), baseRecipe('pricey', 'b')],
          prices: { a: 5, b: 20 },
          priceModes: { widget: 'mirror' },
          primaryRecipeIds: { widget: 'missing' },
        })
      )
      expect(result.prices['widget'].costPrice).toBeCloseTo(5)
      expect(result.prices['widget'].recipeId).toBe('cheap')
    })

    it('exposes per-recipe prices via recipePrices', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('cheap', 'a'), baseRecipe('pricey', 'b')],
          prices: { a: 5, b: 20 },
        })
      )
      expect(result.recipePrices['cheap::widget'].costPrice).toBeCloseTo(5)
      expect(result.recipePrices['pricey::widget'].costPrice).toBeCloseTo(20)
    })

    it('prefers productMargins over recipeMargins for sale price', () => {
      const result = solve(
        makeInput({
          recipes: [baseRecipe('cheap', 'a'), baseRecipe('pricey', 'b')],
          prices: { a: 5, b: 20 },
          margins: {
            recipe: { name: 'Recipe', percent: 10 },
            product: { name: 'Product', percent: 50 },
          },
          recipeMargins: { cheap: 'recipe', pricey: 'recipe' },
          productMargins: { widget: 'product' },
        })
      )
      expect(result.prices['widget'].salePrice).toBeCloseTo(7.5)
    })

    it('converges when a downstream recipe consumes a multi-producer product', () => {
      const producer1 = baseRecipe('producer1', 'a', 'bar')
      const producer2 = baseRecipe('producer2', 'b', 'bar')
      const consumer = makeRecipe({
        id: 'consumer',
        skillId: 'skill-consumer',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'bar', baseQuantity: -2, modifiers: [] }],
        products: [
          {
            itemOrTagId: 'tool',
            baseQuantity: 1,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [consumer, producer1, producer2],
          prices: { a: 4, b: 10 },
        })
      )
      expect(result.prices['bar'].costPrice).toBeCloseTo(4)
      expect(result.prices['tool'].costPrice).toBeCloseTo(8)
    })
  })

  describe('resolveProductCost', () => {
    const makeCandidate = (recipeId: string, costPrice: number, salePrice = costPrice) => ({
      recipeId,
      costPrice,
      salePrice,
      skillId: `skill-${recipeId}`,
    })

    it('returns the sole candidate regardless of mode', () => {
      const c = makeCandidate('r1', 7)
      for (const mode of ['min', 'max', 'avg', 'mirror', 'manual'] as const) {
        const r = resolveProductCost([c], mode, '')
        expect(r.costPrice).toBe(7)
        expect(r.recipeId).toBe('r1')
      }
    })

    it('min picks the lowest cost', () => {
      const r = resolveProductCost(
        [makeCandidate('hi', 10), makeCandidate('lo', 4), makeCandidate('mid', 6)],
        'min',
        ''
      )
      expect(r.costPrice).toBe(4)
      expect(r.recipeId).toBe('lo')
      expect(r.skillId).toBe('skill-lo')
    })

    it('max picks the highest cost', () => {
      const r = resolveProductCost(
        [makeCandidate('hi', 10), makeCandidate('lo', 4), makeCandidate('mid', 6)],
        'max',
        ''
      )
      expect(r.costPrice).toBe(10)
      expect(r.recipeId).toBe('hi')
    })

    it('avg averages cost and sale separately and blanks recipeId', () => {
      const r = resolveProductCost([makeCandidate('a', 4, 6), makeCandidate('b', 8, 12)], 'avg', '')
      expect(r.costPrice).toBe(6)
      expect(r.salePrice).toBe(9)
      expect(r.recipeId).toBe('')
      expect(r.skillId).toBeUndefined()
    })

    it('mirror picks the matching recipeId', () => {
      const r = resolveProductCost(
        [makeCandidate('a', 4), makeCandidate('b', 8), makeCandidate('c', 2)],
        'mirror',
        'b'
      )
      expect(r.costPrice).toBe(8)
      expect(r.recipeId).toBe('b')
    })

    it('mirror falls back to min when primaryRecipeId is missing', () => {
      const r = resolveProductCost([makeCandidate('a', 4), makeCandidate('b', 8)], 'mirror', '')
      expect(r.costPrice).toBe(4)
      expect(r.recipeId).toBe('a')
    })

    it('mirror falls back to min when primaryRecipeId is not in candidates', () => {
      const r = resolveProductCost([makeCandidate('a', 4), makeCandidate('b', 8)], 'mirror', 'nope')
      expect(r.costPrice).toBe(4)
      expect(r.recipeId).toBe('a')
    })
  })

  describe('apply margin between skills', () => {
    it('uses margin price when ingredient comes from different skill', () => {
      const recipe1 = makeRecipe({
        id: 'r1',
        skillId: 'carpentry',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const recipe2 = makeRecipe({
        id: 'r2',
        skillId: 'masonry',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'plank', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'frame', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe1, recipe2],
          prices: { log: 10 },
          margins: { m1: { name: 'Standard', percent: 50 } },
          recipeMargins: { r1: 'm1', r2: 'm1' },
          settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: true },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(10)
      expect(result.prices['plank'].salePrice).toBeCloseTo(15)
      expect(result.prices['frame'].costPrice).toBeCloseTo(15)
      expect(result.prices['frame'].salePrice).toBeCloseTo(22.5)
    })

    it('uses base price when ingredient comes from same skill', () => {
      const recipe1 = makeRecipe({
        id: 'r1',
        skillId: 'carpentry',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const recipe2 = makeRecipe({
        id: 'r2',
        skillId: 'carpentry',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'plank', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'beam', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe1, recipe2],
          prices: { log: 10 },
          margins: { m1: { name: 'Standard', percent: 50 } },
          recipeMargins: { r1: 'm1', r2: 'm1' },
          settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: true },
        })
      )
      expect(result.prices['beam'].costPrice).toBeCloseTo(10)
    })
  })
})

describe('solve — additional scenarios', () => {
  describe('margin types', () => {
    it('applies grossMargin formula to derive sale price', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { wood: 100 },
          margins: { m1: { name: 'GM', percent: 25 } },
          recipeMargins: { 'recipe-1': 'm1' },
          settings: { marginType: 'grossMargin', calorieCost: 0, applyMarginBetweenSkills: false },
        })
      )
      // grossMargin: 100 / (1 - 0.25) = 133.333…
      expect(result.prices['plank'].costPrice).toBeCloseTo(100)
      expect(result.prices['plank'].salePrice).toBeCloseTo(133.333333, 4)
    })

    it('produces 0 sale price when cost is 0 even with a markup margin', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        products: [
          { itemOrTagId: 'free', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          margins: { m1: { name: 'M', percent: 50 } },
          recipeMargins: { 'recipe-1': 'm1' },
        })
      )
      expect(result.prices['free'].costPrice).toBeCloseTo(0)
      expect(result.prices['free'].salePrice).toBeCloseTo(0)
    })

    it('uses the recipeMargin when no productMargin is set', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { wood: 50 },
          margins: { rm: { name: 'R', percent: 30 } },
          recipeMargins: { 'recipe-1': 'rm' },
        })
      )
      expect(result.prices['plank'].salePrice).toBeCloseTo(65)
    })

    it('treats a missing margin id as no margin (sale equals cost)', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { wood: 7 },
          recipeMargins: { 'recipe-1': 'phantom' },
        })
      )
      expect(result.prices['plank'].costPrice).toBeCloseTo(7)
      expect(result.prices['plank'].salePrice).toBeCloseTo(7)
    })
  })

  describe('product quantities and shares', () => {
    it('downstream consumer sees the override price, not the producer recipe price', () => {
      const producer = makeRecipe({
        id: 'p1',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const consumer = makeRecipe({
        id: 'c1',
        skillId: 'skill-c',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'plank', baseQuantity: -2, modifiers: [] }],
        products: [
          { itemOrTagId: 'table', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [consumer, producer],
          prices: { wood: 1 },
          overrides: { plank: 50 },
        })
      )
      // Override wins everywhere: outputPrices, downstream consumer cost, and
      // producer's own item-keyed price. Producer recipe still records its
      // own per-recipe cost via recipePrices (=1) for dialog comparison.
      expect(result.prices['plank'].costPrice).toBeCloseTo(50)
      expect(result.prices['table'].costPrice).toBeCloseTo(100)
      expect(result.recipePrices['p1::plank'].costPrice).toBeCloseTo(1)
    })

    it('skips products with quantity 0 (no price emitted, no division by zero)', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'rock', baseQuantity: -2, modifiers: [] }],
        products: [
          { itemOrTagId: 'gold', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
          { itemOrTagId: 'dust', baseQuantity: 0, share: 0, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { rock: 10 } }))
      expect(result.prices['gold'].costPrice).toBeCloseTo(20)
      expect(result.prices['dust']).toBeUndefined()
    })

    it('keys recipePrices per (recipe, product) for multi-product recipes', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'rock', baseQuantity: -10, modifiers: [] }],
        products: [
          { itemOrTagId: 'a', baseQuantity: 1, share: 0.7, isReintegrated: false, modifiers: [] },
          { itemOrTagId: 'b', baseQuantity: 1, share: 0.3, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { rock: 1 } }))
      expect(result.recipePrices['recipe-1::a'].costPrice).toBeCloseTo(7)
      expect(result.recipePrices['recipe-1::b'].costPrice).toBeCloseTo(3)
    })
  })

  describe('recipeCosts breakdown', () => {
    it('exposes per-recipe craftTime, laborAmount, costPerMinute and calorieCost', () => {
      const recipe = makeRecipe({
        baseCraftTime: 4,
        baseLaborCost: 500,
        costPerMinute: 0.25,
        skillLevel: 4, // 0.65 reduction in default array
        laborModifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        ingredients: [],
        products: [
          { itemOrTagId: 'item', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          settings: { marginType: 'markup', calorieCost: 200, applyMarginBetweenSkills: false },
        })
      )
      const breakdown = result.recipeCosts['recipe-1']
      expect(breakdown.craftTime).toBeCloseTo(4)
      expect(breakdown.craftTimeCost).toBeCloseTo(1)
      expect(breakdown.laborAmount).toBeCloseTo(500 * 0.65)
      expect(breakdown.laborCost).toBeCloseTo((500 * 0.65 * 200) / 1000)
      expect(breakdown.costPerMinute).toBeCloseTo(0.25)
      expect(breakdown.calorieCost).toBe(200)
    })
  })

  describe('reintegrated products + multi-product cost shares', () => {
    it('subtracts a reintegrated by-product priced via a tag', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'rock', baseQuantity: -10, modifiers: [] }],
        products: [
          { itemOrTagId: 'iron', baseQuantity: 2, share: 1, isReintegrated: false, modifiers: [] },
          {
            itemOrTagId: 'tag-slag',
            baseQuantity: 1,
            share: 0,
            isReintegrated: true,
            modifiers: [],
          },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { rock: 1, slag: 2 },
          tagItems: { 'tag-slag': ['slag'] },
        })
      )
      // 10 - 2 = 8 → 8 / 2 = 4 per iron
      expect(result.prices['iron'].costPrice).toBeCloseTo(4)
    })

    it('shares cost across non-reintegrated products in proportion to share, regardless of quantity', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'wood', baseQuantity: -10, modifiers: [] }],
        products: [
          {
            itemOrTagId: 'plank',
            baseQuantity: 4,
            share: 0.5,
            isReintegrated: false,
            modifiers: [],
          },
          {
            itemOrTagId: 'chip',
            baseQuantity: 1,
            share: 0.5,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { wood: 4 } }))
      // total = 40, plank gets 40*0.5=20 over 4 -> 5 each; chip gets 20 over 1 -> 20 each.
      expect(result.prices['plank'].costPrice).toBeCloseTo(5)
      expect(result.prices['chip'].costPrice).toBeCloseTo(20)
    })
  })

  describe('apply margin between skills with tags + multi-recipe', () => {
    it('does not apply a sale-side margin when ingredient comes via a tag (producingSkill is unknown)', () => {
      // tag-wood expands to {birch, oak}; both produced in different skills.
      // The tag itself isn't tracked in producingSkills, so the consumer
      // (different skill) currently uses the cost price. This documents the
      // intentional behavior so a future fix can update the test.
      const birchRecipe = makeRecipe({
        id: 'birch-r',
        skillId: 'lumber',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'birch', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const consumer = makeRecipe({
        id: 'c-r',
        skillId: 'mason',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag-wood', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'frame', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [birchRecipe, consumer],
          prices: { log: 10 },
          tagItems: { 'tag-wood': ['birch'] },
          margins: { m: { name: 'M', percent: 50 } },
          recipeMargins: { 'birch-r': 'm', 'c-r': 'm' },
          settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: true },
        })
      )
      // birch sale = 15 (with 50% markup), but tag lookup uses cost = 10.
      expect(result.prices['birch'].costPrice).toBeCloseTo(10)
      expect(result.prices['birch'].salePrice).toBeCloseTo(15)
      expect(result.prices['frame'].costPrice).toBeCloseTo(10)
    })

    it('uses cost price (no margin) when applyMarginBetweenSkills is true but no margin exists', () => {
      const r1 = makeRecipe({
        id: 'r1',
        skillId: 'a',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const r2 = makeRecipe({
        id: 'r2',
        skillId: 'b',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'plank', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'frame', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [r1, r2],
          prices: { log: 10 },
          settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: true },
        })
      )
      // No margin → sale === cost on plank → consumer uses cost.
      expect(result.prices['plank'].salePrice).toBeCloseTo(10)
      expect(result.prices['frame'].costPrice).toBeCloseTo(10)
    })
  })

  describe('multi-recipe products with downstream consumption', () => {
    it('chooses min by default but downstream consumer reflects current min after each candidate', () => {
      const a = makeRecipe({
        id: 'a',
        skillId: 'sa',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'iA', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'mid', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const b = makeRecipe({
        id: 'b',
        skillId: 'sb',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'iB', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'mid', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const c = makeRecipe({
        id: 'c',
        skillId: 'sc',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'mid', baseQuantity: -2, modifiers: [] }],
        products: [
          { itemOrTagId: 'final', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [a, b, c],
          prices: { iA: 7, iB: 3 },
        })
      )
      expect(result.prices['mid'].costPrice).toBeCloseTo(3)
      expect(result.prices['final'].costPrice).toBeCloseTo(6)
    })

    it('mirror with a primaryRecipeId matching the more-expensive producer flows through to consumers', () => {
      const cheap = makeRecipe({
        id: 'cheap',
        skillId: 'sa',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'iA', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'mid', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const pricey = makeRecipe({
        id: 'pricey',
        skillId: 'sb',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'iB', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'mid', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const consumer = makeRecipe({
        id: 'cons',
        skillId: 'sc',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'mid', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'final', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [cheap, pricey, consumer],
          prices: { iA: 5, iB: 20 },
          priceModes: { mid: 'mirror' },
          primaryRecipeIds: { mid: 'pricey' },
        })
      )
      expect(result.prices['mid'].costPrice).toBeCloseTo(20)
      expect(result.prices['final'].costPrice).toBeCloseTo(20)
    })
  })

  describe('tag price modes — additional', () => {
    const recipeForTag = (tagId = 'tag-x', productId = 'out') =>
      makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: tagId, baseQuantity: -1, modifiers: [] }],
        products: [
          {
            itemOrTagId: productId,
            baseQuantity: 1,
            share: 1,
            isReintegrated: false,
            modifiers: [],
          },
        ],
      })

    it('falls back to min when mode=mirror but the primaryItemId is unpriced', () => {
      const result = solve(
        makeInput({
          recipes: [recipeForTag()],
          prices: { c: 5 },
          tagItems: { 'tag-x': ['a', 'b', 'c'] },
          primaryTagItems: { 'tag-x': 'a' },
          priceModes: { 'tag-x': 'mirror' },
        })
      )
      expect(result.prices['out'].costPrice).toBeCloseTo(5)
    })

    it('mode=avg only emits sale price when ALL children have a sale price', () => {
      // Producer1 produces "a" and gets a sale via margin.
      // Producer2 produces "b" with no margin → sale === cost — so all are
      // sale-priced and the tag avg sale should match.
      const ra = makeRecipe({
        id: 'ra',
        skillId: 'sa',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'a', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const rb = makeRecipe({
        id: 'rb',
        skillId: 'sb',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -2, modifiers: [] }],
        products: [
          { itemOrTagId: 'b', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const consumer = makeRecipe({
        id: 'cons',
        skillId: 'sc',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'frame', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [ra, rb, consumer],
          prices: { log: 5 },
          tagItems: { tag: ['a', 'b'] },
          priceModes: { tag: 'avg' },
        })
      )
      // a cost=5, b cost=10, avg=7.5
      expect(result.prices['frame'].costPrice).toBeCloseTo(7.5)
    })

    it('mode=avg returns null sale price when some tag children have no sale (raw seed price only)', () => {
      // Seed price for 'a' (no sale), recipe-derived 'b' (sale exists).
      const rb = makeRecipe({
        id: 'rb',
        skillId: 'sb',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'log', baseQuantity: -2, modifiers: [] }],
        products: [
          { itemOrTagId: 'b', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const consumer = makeRecipe({
        id: 'cons',
        skillId: 'sc',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'frame', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [rb, consumer],
          prices: { log: 5, a: 100 },
          tagItems: { tag: ['a', 'b'] },
          priceModes: { tag: 'avg' },
          margins: { m: { name: 'M', percent: 100 } },
          recipeMargins: { rb: 'm', cons: 'm' },
          settings: { marginType: 'markup', calorieCost: 0, applyMarginBetweenSkills: true },
        })
      )
      // tag cost = avg(100, 10) = 55; frame cost = 55 (no sale on tag because
      // 'a' has no sale entry → applyMarginBetweenSkills can't use sale).
      expect(result.prices['frame'].costPrice).toBeCloseTo(55)
    })

    it('emits a tag price entry alongside item prices in the output', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'tag', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'frame', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          prices: { a: 8, b: 3 },
          tagItems: { tag: ['a', 'b'] },
        })
      )
      expect(result.prices['tag']).toMatchObject({
        costPrice: 3,
        salePrice: 3,
        recipeId: '',
      })
    })

    it('does not error when an unused tag has no priced items (no consumer references it)', () => {
      const result = solve(
        makeInput({
          recipes: [],
          tagItems: { 'tag-orphan': ['x', 'y'] },
        })
      )
      expect(result.prices['tag-orphan']).toBeUndefined()
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('Skill modifier edge cases', () => {
    it('clamps skill level to the last laborReducePercent entry', () => {
      const recipe = makeRecipe({
        baseLaborCost: 100,
        baseCraftTime: 0,
        skillLevel: 99,
        laborReducePercent: [1, 0.5],
        laborModifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        products: [
          { itemOrTagId: 'item', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(
        makeInput({
          recipes: [recipe],
          settings: { marginType: 'markup', calorieCost: 1000, applyMarginBetweenSkills: false },
        })
      )
      expect(result.prices['item'].costPrice).toBeCloseTo(50)
    })

    it('falls back to base percent when modifier has skillId but no plugin module is fitted', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [
          {
            itemOrTagId: 'wood',
            baseQuantity: -2,
            modifiers: [{ dynamicType: 'Module', refName: 'CookingSkill', skillId: 'cooking' }],
          },
        ],
        products: [
          { itemOrTagId: 'plank', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe], prices: { wood: 5 } }))
      expect(result.prices['plank'].costPrice).toBeCloseTo(10)
    })
  })

  describe('error reporting', () => {
    it('reports one error per unresolved recipe', () => {
      const r1 = makeRecipe({
        id: 'r1',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'unknown', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'p1', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const r2 = makeRecipe({
        id: 'r2',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'unknown', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'p2', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [r1, r2] }))
      expect(result.errors).toHaveLength(2)
      const ids = result.errors.map((e) => e.recipeId).sort()
      expect(ids).toEqual(['r1', 'r2'])
      expect(result.errors.every((e) => e.code === 'unresolved')).toBe(true)
    })

    it('reports non-convergent errors when the iteration cap is exhausted', () => {
      // Two-recipe linear chain: seed → r1 prices m1, r2 (consumes m1) prices
      // m2. With maxPasses=1, r2 cannot resolve in pass 1 because r1 runs
      // first and writes m1, but r2's ingredient lookup happens on the same
      // pass and the loop bails before re-running. Actually a 2-recipe chain
      // needs 2 passes to fully converge: pass 1 writes m1 (changed=true),
      // pass 2 picks up m1 in r2 (changed=true again on that pass), pass 3
      // settles. Capping at 1 forces the cap to fire while r2 is still
      // changing.
      const r1 = makeRecipe({
        id: 'r1',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'seed', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'm1', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const r2 = makeRecipe({
        id: 'r2',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'm1', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'm2', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [r1, r2], prices: { seed: 5 } }), { maxPasses: 1 })
      const nonConvergent = result.errors.filter((e) => e.code === 'non-convergent')
      expect(nonConvergent.length).toBeGreaterThan(0)
      expect(nonConvergent.every((e) => e.recipeId === 'r1' || e.recipeId === 'r2')).toBe(true)
    })

    it('does not emit non-convergent errors on a normally-converging input', () => {
      const r1 = makeRecipe({
        id: 'r1',
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'seed', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'm1', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [r1], prices: { seed: 5 } }))
      expect(result.errors.filter((e) => e.code === 'non-convergent')).toHaveLength(0)
    })

    it('treats a self-referencing recipe as unresolvable', () => {
      const recipe = makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 0,
        laborModifiers: [],
        ingredients: [{ itemOrTagId: 'thing', baseQuantity: -1, modifiers: [] }],
        products: [
          { itemOrTagId: 'thing', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })
      const result = solve(makeInput({ recipes: [recipe] }))
      expect(result.errors).toHaveLength(1)
      expect(result.prices['thing']).toBeUndefined()
    })

    it('returns no errors for empty input', () => {
      const result = solve(makeInput())
      expect(result.errors).toHaveLength(0)
      expect(result.prices).toEqual({})
    })
  })

  describe('custom-recipe upgrade-module modifiers', () => {
    // Mirrors what writeRecipeElementsAndModifiers (custom-entities.ts) emits:
    // labor is Skill-reduced (never module), craft time carries a Module modifier,
    // a "module-reduced" ingredient carries a Module modifier and a static one does
    // not. A single installed module fills both module slots; pluginType gates it.
    const makeCustomRecipe = (module: { percent: number; pluginType: string } | null) =>
      makeRecipe({
        baseLaborCost: 0,
        baseCraftTime: 10,
        costPerMinute: 2,
        pluginModule: module,
        speedPluginModule: module,
        laborModifiers: [{ dynamicType: 'Skill', refName: 'skill-1' }],
        craftMinutesModifiers: [{ dynamicType: 'Module', refName: 'skill-1' }],
        ingredients: [
          // toggled-on ingredient (module-reduced)
          {
            itemOrTagId: 'wood',
            baseQuantity: -10,
            modifiers: [{ dynamicType: 'Module', refName: 'skill-1' }],
          },
          // toggled-off ingredient (static; no modifier)
          { itemOrTagId: 'nail', baseQuantity: -10, modifiers: [] },
        ],
        products: [
          { itemOrTagId: 'out', baseQuantity: 1, share: 1, isReintegrated: false, modifiers: [] },
        ],
      })

    const costOf = (module: { percent: number; pluginType: string } | null) =>
      solve(makeInput({ recipes: [makeCustomRecipe(module)], prices: { wood: 1, nail: 1 } }))
        .prices['out'].costPrice

    it('applies no module reduction when none is installed', () => {
      // ingredients 10+10=20, craft 10*2=20 → 40
      expect(costOf(null)).toBeCloseTo(40)
    })

    it('a Resource module reduces the toggled-on ingredient but not craft time', () => {
      // wood 10*0.5=5, nail 10 (static), craft 20 (speed-gated off) → 35
      expect(costOf({ percent: 0.5, pluginType: 'Resource' })).toBeCloseTo(35)
    })

    it('a Speed module reduces craft time but not ingredients', () => {
      // ingredients 20 (resource-gated off), craft 20*0.5=10 → 30
      expect(costOf({ percent: 0.5, pluginType: 'Speed' })).toBeCloseTo(30)
    })

    it('a combined Resource&Speed module reduces both', () => {
      // wood 5 + nail 10 = 15, craft 10 → 25
      expect(costOf({ percent: 0.5, pluginType: 'Resource&Speed' })).toBeCloseTo(25)
    })
  })

  describe('resolveProductCost — additional edge cases', () => {
    const cand = (recipeId: string, costPrice: number, salePrice = costPrice) => ({
      recipeId,
      costPrice,
      salePrice,
      skillId: `skill-${recipeId}`,
    })

    it('manual mode with multiple candidates falls through to min', () => {
      const r = resolveProductCost([cand('a', 5), cand('b', 1)], 'manual', '')
      expect(r.costPrice).toBe(1)
      expect(r.recipeId).toBe('b')
    })

    it('avg with single candidate returns that candidate intact (skill preserved)', () => {
      const r = resolveProductCost([cand('a', 4)], 'avg', '')
      expect(r.costPrice).toBe(4)
      expect(r.recipeId).toBe('a')
      expect(r.skillId).toBe('skill-a')
    })
  })
})
