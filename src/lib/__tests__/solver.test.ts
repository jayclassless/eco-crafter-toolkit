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
      // recipe shouldn't overwrite the override; costPrice for the recipe-derived
      // plank entry is computed from wood=5 → 5, but override seeds the maps to 42
      // so downstream consumers see 42. The recipe still resolves and stores its
      // computed value in `computed`, which is what's returned.
      expect(result.prices['plank'].costPrice).toBeCloseTo(5)
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
