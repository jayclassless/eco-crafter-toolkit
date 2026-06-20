import { describe, expect, it } from 'vitest'

import { type PlannerInput, type PlannerRecipe, planProduction } from '../production-planner'

interface Scenario {
  recipes?: Record<string, PlannerRecipe> // itemId -> producing recipe
  tags?: Record<string, string[]> // tagId -> member item ids
  inventory?: Record<string, number>
}

function makeInput(
  targetItemId: string,
  desiredQuantity: number | null,
  scenario: Scenario
): PlannerInput {
  const recipes = scenario.recipes ?? {}
  const tags = scenario.tags ?? {}
  return {
    targetItemId,
    desiredQuantity,
    inventory: scenario.inventory ?? {},
    recipeForItem: (itemId) => recipes[itemId] ?? null,
    tagMembers: (tagId) => tags[tagId] ?? null,
    isTag: (id) => id in tags,
  }
}

describe('planProduction', () => {
  describe('linear chain (Wood -> Dowels -> Hewn Logs)', () => {
    const recipes: Record<string, PlannerRecipe> = {
      dowels: {
        recipeId: 'r-dowels',
        ingredients: [{ itemId: 'wood', qty: 5 }],
        products: [{ itemId: 'dowels', qty: 2 }],
      },
      hewnLog: {
        recipeId: 'r-hewn',
        ingredients: [{ itemId: 'dowels', qty: 4 }],
        products: [{ itemId: 'hewnLog', qty: 1 }],
      },
    }

    it('maximizes hewn logs from 100 wood and orders steps leaves-first', () => {
      const result = planProduction(
        makeInput('hewnLog', null, { recipes, inventory: { wood: 100 } })
      )
      expect(result.cyclic).toBe(false)
      expect(result.feasible).toBe(true)
      // 10N wood per hewn log => 100 wood => 10 logs.
      expect(result.producible).toBe(10)
      expect(result.steps.map((s) => s.recipeId)).toEqual(['r-dowels', 'r-hewn'])
      const [dowelStep, hewnStep] = result.steps
      expect(dowelStep.crafts).toBe(20) // 40 dowels / 2
      expect(hewnStep.crafts).toBe(10)
      expect(dowelStep.consumes).toEqual([{ itemId: 'wood', qty: 100 }])
      expect(hewnStep.consumes).toEqual([{ itemId: 'dowels', qty: 40 }])
      expect(result.missing).toEqual([])
      expect(result.leftovers).toEqual([])
    })

    it('reports the shortfall when a desired quantity is unreachable', () => {
      const result = planProduction(makeInput('hewnLog', 15, { recipes, inventory: { wood: 100 } }))
      expect(result.feasible).toBe(false)
      expect(result.producible).toBe(10) // best achievable
      // 15 logs need 150 wood; have 100 => short 50.
      expect(result.missing).toEqual([{ itemId: 'wood', qty: 50 }])
      expect(result.steps.map((s) => s.recipeId)).toEqual(['r-dowels', 'r-hewn'])
    })

    it('meets a reachable desired quantity', () => {
      const result = planProduction(makeInput('hewnLog', 5, { recipes, inventory: { wood: 100 } }))
      expect(result.feasible).toBe(true)
      expect(result.producible).toBe(5)
      expect(result.missing).toEqual([])
    })
  })

  describe('whole-craft rounding and leftovers', () => {
    const recipes: Record<string, PlannerRecipe> = {
      dowels: {
        recipeId: 'r-dowels',
        ingredients: [{ itemId: 'wood', qty: 5 }],
        products: [{ itemId: 'dowels', qty: 2 }],
      },
    }

    it('overproduces to satisfy an odd demand and reports the leftover', () => {
      const result = planProduction(makeInput('dowels', 3, { recipes, inventory: { wood: 10 } }))
      expect(result.feasible).toBe(true)
      expect(result.producible).toBe(3)
      // 2 crafts => 4 dowels, 1 left over.
      expect(result.steps[0].crafts).toBe(2)
      expect(result.leftovers).toEqual([{ itemId: 'dowels', qty: 1 }])
    })
  })

  describe('branching with a shared raw input', () => {
    const recipes: Record<string, PlannerRecipe> = {
      gizmo: {
        recipeId: 'r-gizmo',
        ingredients: [
          { itemId: 'partA', qty: 1 },
          { itemId: 'partB', qty: 1 },
        ],
        products: [{ itemId: 'gizmo', qty: 1 }],
      },
      partA: {
        recipeId: 'r-partA',
        ingredients: [{ itemId: 'wood', qty: 2 }],
        products: [{ itemId: 'partA', qty: 1 }],
      },
      partB: {
        recipeId: 'r-partB',
        ingredients: [{ itemId: 'wood', qty: 3 }],
        products: [{ itemId: 'partB', qty: 1 }],
      },
    }

    it('allocates the shared raw across both sub-chains', () => {
      const result = planProduction(makeInput('gizmo', null, { recipes, inventory: { wood: 10 } }))
      // Each gizmo costs 5 wood (2 + 3). 10 wood => 2 gizmos.
      expect(result.producible).toBe(2)
      expect(result.steps.map((s) => s.recipeId)).toContain('r-partA')
      expect(result.steps.map((s) => s.recipeId)).toContain('r-partB')
      // Target step is last.
      expect(result.steps[result.steps.length - 1].recipeId).toBe('r-gizmo')
    })
  })

  describe('co-product credit', () => {
    const recipes: Record<string, PlannerRecipe> = {
      block: {
        recipeId: 'r-block',
        ingredients: [{ itemId: 'slag', qty: 2 }],
        products: [{ itemId: 'block', qty: 1 }],
      },
      // Smelting ore yields metal plus slag as a co-product.
      slag: {
        recipeId: 'r-smelt',
        ingredients: [{ itemId: 'ore', qty: 1 }],
        products: [
          { itemId: 'metal', qty: 1 },
          { itemId: 'slag', qty: 2 },
        ],
      },
    }

    it('uses co-product output and surfaces the unused co-product as leftover', () => {
      const result = planProduction(makeInput('block', null, { recipes, inventory: { ore: 10 } }))
      // Each block needs 2 slag = 1 smelt = 1 ore. 10 ore => 10 blocks, 10 metal left.
      expect(result.producible).toBe(10)
      expect(result.leftovers).toEqual([{ itemId: 'metal', qty: 10 }])
    })
  })

  describe('tag ingredient resolution (inventory-first)', () => {
    it('prefers a tag member the user already has', () => {
      const recipes: Record<string, PlannerRecipe> = {
        plank: {
          recipeId: 'r-plank',
          ingredients: [{ itemId: 'tag-wood', qty: 1 }],
          products: [{ itemId: 'plank', qty: 1 }],
        },
      }
      const result = planProduction(
        makeInput('plank', null, {
          recipes,
          tags: { 'tag-wood': ['oak', 'birch'] },
          inventory: { birch: 5 },
        })
      )
      expect(result.producible).toBe(5)
      expect(result.steps[0].consumes).toEqual([{ itemId: 'birch', qty: 5 }])
    })

    it('consumes a stocked tag directly as a raw pool', () => {
      const recipes: Record<string, PlannerRecipe> = {
        plank: {
          recipeId: 'r-plank',
          ingredients: [{ itemId: 'tag-wood', qty: 1 }],
          products: [{ itemId: 'plank', qty: 1 }],
        },
      }
      const result = planProduction(
        makeInput('plank', null, {
          recipes,
          tags: { 'tag-wood': ['oak', 'birch'] },
          inventory: { 'tag-wood': 50 },
        })
      )
      // 1 tag-wood per plank, 50 stocked => 50 planks, drawn from the tag pool.
      expect(result.producible).toBe(50)
      expect(result.steps[0].consumes).toEqual([{ itemId: 'tag-wood', qty: 50 }])
    })

    it('reports the tag (not an arbitrary member) when nothing satisfies it', () => {
      const recipes: Record<string, PlannerRecipe> = {
        plank: {
          recipeId: 'r-plank',
          ingredients: [{ itemId: 'tag-wood', qty: 1 }],
          products: [{ itemId: 'plank', qty: 1 }],
        },
      }
      const result = planProduction(
        makeInput('plank', null, {
          recipes,
          tags: { 'tag-wood': ['oak', 'birch'] }, // neither in stock nor craftable
          inventory: {},
        })
      )
      expect(result.producible).toBe(0)
      expect(result.missing).toEqual([{ itemId: 'tag-wood', qty: 1 }])
    })

    it('falls back to a craftable member when none are in stock', () => {
      const recipes: Record<string, PlannerRecipe> = {
        plank: {
          recipeId: 'r-plank',
          ingredients: [{ itemId: 'tag-wood', qty: 1 }],
          products: [{ itemId: 'plank', qty: 1 }],
        },
        oak: {
          recipeId: 'r-oak',
          ingredients: [{ itemId: 'logs', qty: 2 }],
          products: [{ itemId: 'oak', qty: 1 }],
        },
      }
      const result = planProduction(
        makeInput('plank', null, {
          recipes,
          tags: { 'tag-wood': ['oak'] },
          inventory: { logs: 10 },
        })
      )
      // 1 oak per plank, 2 logs per oak => 10 logs => 5 planks.
      expect(result.producible).toBe(5)
      expect(result.steps.map((s) => s.recipeId)).toEqual(['r-oak', 'r-plank'])
    })
  })

  describe('missing materials', () => {
    it('reports what is needed for a single unit when nothing can be made', () => {
      const recipes: Record<string, PlannerRecipe> = {
        plank: {
          recipeId: 'r-plank',
          ingredients: [{ itemId: 'wood', qty: 3 }],
          products: [{ itemId: 'plank', qty: 1 }],
        },
      }
      const result = planProduction(makeInput('plank', null, { recipes, inventory: {} }))
      expect(result.producible).toBe(0)
      expect(result.feasible).toBe(false)
      expect(result.steps).toEqual([])
      expect(result.missing).toEqual([{ itemId: 'wood', qty: 3 }])
    })
  })

  describe('cycle detection', () => {
    it('flags a dependency cycle as unplannable', () => {
      const recipes: Record<string, PlannerRecipe> = {
        a: {
          recipeId: 'r-a',
          ingredients: [{ itemId: 'b', qty: 1 }],
          products: [{ itemId: 'a', qty: 1 }],
        },
        b: {
          recipeId: 'r-b',
          ingredients: [{ itemId: 'a', qty: 1 }],
          products: [{ itemId: 'b', qty: 1 }],
        },
      }
      const result = planProduction(makeInput('a', null, { recipes, inventory: { a: 0 } }))
      expect(result.cyclic).toBe(true)
      expect(result.producible).toBe(0)
    })
  })

  describe('target available directly in inventory', () => {
    it('counts existing stock when the target is also produced', () => {
      const recipes: Record<string, PlannerRecipe> = {
        plank: {
          recipeId: 'r-plank',
          ingredients: [{ itemId: 'wood', qty: 1 }],
          products: [{ itemId: 'plank', qty: 1 }],
        },
      }
      const result = planProduction(
        makeInput('plank', null, { recipes, inventory: { wood: 4, plank: 3 } })
      )
      // 3 on hand + 4 from wood = 7.
      expect(result.producible).toBe(7)
    })
  })
})
