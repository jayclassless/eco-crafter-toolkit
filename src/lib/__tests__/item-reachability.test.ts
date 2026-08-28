import { describe, expect, it } from 'vitest'

import {
  computeReachableItemIds,
  type ReachabilityGraph,
  type ReachabilityRecipe,
} from '@/lib/item-reachability'

function recipe(over: Partial<ReachabilityRecipe> = {}): ReachabilityRecipe {
  return {
    skillId: '',
    craftingTableItemId: '',
    ingredientIds: [],
    productIds: [],
    ...over,
  }
}

function graph(
  recipes: ReachabilityRecipe[],
  rawItemIds: string[],
  tagMembers: Record<string, string[]> = {}
): ReachabilityGraph {
  return {
    recipes,
    rawItemIds: new Set(rawItemIds),
    tagMembers: new Map(Object.entries(tagMembers)),
  }
}

describe('computeReachableItemIds', () => {
  it('seeds with the raw materials even when no recipe can run', () => {
    const reachable = computeReachableItemIds(graph([], ['log', 'rock']), new Set())
    expect([...reachable].sort()).toEqual(['log', 'rock'])
  })

  it('runs a skill-less recipe with no skills unlocked at all', () => {
    // A recipe requiring no skill requires none — the Unskilled toggle is a
    // display filter over furnishings, not a gate on these.
    const g = graph([recipe({ ingredientIds: ['log'], productIds: ['board'] })], ['log'])
    expect(computeReachableItemIds(g, new Set()).has('board')).toBe(true)
  })

  it('withholds a product whose recipe needs a locked skill', () => {
    const g = graph(
      [recipe({ skillId: 'carpentry', ingredientIds: ['log'], productIds: ['lumber'] })],
      ['log']
    )
    expect(computeReachableItemIds(g, new Set()).has('lumber')).toBe(false)
    expect(computeReachableItemIds(g, new Set(['carpentry'])).has('lumber')).toBe(true)
  })

  it('withholds a product when only SOME ingredients are obtainable', () => {
    // The bug this whole module exists for: Hunting unlocks the Elk Mount
    // recipe, but the mount also needs composite lumber from a locked skill.
    const g = graph(
      [
        recipe({ skillId: 'composites', ingredientIds: ['log'], productIds: ['composite'] }),
        recipe({
          skillId: 'hunting',
          ingredientIds: ['carcass', 'composite'],
          productIds: ['elkMount'],
        }),
      ],
      ['log', 'carcass']
    )
    expect(computeReachableItemIds(g, new Set(['hunting'])).has('elkMount')).toBe(false)
    expect(computeReachableItemIds(g, new Set(['hunting', 'composites'])).has('elkMount')).toBe(
      true
    )
  })

  it('treats every skill as unlocked when given null', () => {
    const g = graph(
      [recipe({ skillId: 'carpentry', ingredientIds: ['log'], productIds: ['lumber'] })],
      ['log']
    )
    expect(computeReachableItemIds(g, null).has('lumber')).toBe(true)
  })

  it('satisfies a tag ingredient from any single member', () => {
    const g = graph([recipe({ ingredientIds: ['woodTag'], productIds: ['board'] })], ['oakLog'], {
      woodTag: ['birchLog', 'oakLog', 'cedarLog'],
    })
    expect(computeReachableItemIds(g, new Set()).has('board')).toBe(true)
  })

  it('leaves a tag ingredient unsatisfied when no member is obtainable', () => {
    const g = graph([recipe({ ingredientIds: ['woodTag'], productIds: ['board'] })], ['rock'], {
      woodTag: ['birchLog', 'oakLog'],
    })
    expect(computeReachableItemIds(g, new Set()).has('board')).toBe(false)
  })

  it('requires the crafting table to be reachable first', () => {
    const g = graph(
      [
        recipe({ craftingTableItemId: 'workbench', ingredientIds: ['log'], productIds: ['board'] }),
        recipe({ skillId: 'carpentry', ingredientIds: ['log'], productIds: ['workbench'] }),
      ],
      ['log']
    )
    expect(computeReachableItemIds(g, new Set()).has('board')).toBe(false)
    expect(computeReachableItemIds(g, new Set(['carpentry'])).has('board')).toBe(true)
  })

  it('resolves a chain that needs several passes, in any recipe order', () => {
    // Declared back to front, so a single pass could not resolve it.
    const g = graph(
      [
        recipe({ ingredientIds: ['lumber'], productIds: ['chair'] }),
        recipe({ ingredientIds: ['board'], productIds: ['lumber'] }),
        recipe({ ingredientIds: ['log'], productIds: ['board'] }),
      ],
      ['log']
    )
    expect(computeReachableItemIds(g, new Set()).has('chair')).toBe(true)
  })

  it('terminates on a recipe cycle without admitting either product', () => {
    const g = graph(
      [
        recipe({ ingredientIds: ['b'], productIds: ['a'] }),
        recipe({ ingredientIds: ['a'], productIds: ['b'] }),
      ],
      []
    )
    const reachable = computeReachableItemIds(g, new Set())
    expect(reachable.has('a')).toBe(false)
    expect(reachable.has('b')).toBe(false)
  })

  it('admits a byproduct alongside the primary product', () => {
    const g = graph([recipe({ ingredientIds: ['ore'], productIds: ['bar', 'tailings'] })], ['ore'])
    expect(computeReachableItemIds(g, new Set()).has('tailings')).toBe(true)
  })

  it('does not mutate the graph it is given', () => {
    const recipes = [recipe({ ingredientIds: ['log'], productIds: ['board'] })]
    const g = graph(recipes, ['log'])
    computeReachableItemIds(g, new Set())
    computeReachableItemIds(g, new Set())
    expect(g.recipes).toHaveLength(1)
    expect([...g.rawItemIds]).toEqual(['log'])
  })
})
