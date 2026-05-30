import { beforeEach, describe, expect, it } from 'vitest'

import type { PriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { computeAdHocRecipe, seedIngredientPrices } from '../adhoc-recipe-calc'

const DS = 'ds1'
const BUILD = 'b1'
let game: ReturnType<typeof createGameDataStore>
let build: ReturnType<typeof createBuildStore>

const getName = () => ''

beforeEach(() => {
  game = createGameDataStore()
  build = createBuildStore()
})

function addSkill(laborReducePercent: string) {
  game.setRow('skills', 'sk1', {
    id: 'sk1',
    datasetId: DS,
    name: 'Mining',
    maxLevel: 7,
    laborReducePercent,
  })
}

function addRecipe(overrides: Record<string, unknown> = {}) {
  game.setRow('recipes', 'r1', {
    id: 'r1',
    datasetId: DS,
    name: 'R',
    familyName: 'F',
    skillId: 'sk1',
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 10,
    baseLaborCost: 100,
    ...overrides,
  })
}

describe('computeAdHocRecipe', () => {
  it('sums ingredient cost plus labor, and skill level drives labor reduction', () => {
    addSkill('[1,0.5]')
    addRecipe()
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: -2,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'bar',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    game.setRow('modifiers', 'mod-labor', {
      id: 'mod-labor',
      datasetId: DS,
      targetType: 'labor',
      targetId: 'r1',
      dynamicType: 'Skill',
      refName: 'Mining',
    })

    const controls = {
      skillLevel: 0,
      pluginModuleId: '',
      talentStates: {},
      ingredientPrices: { iron: 5 },
    }

    // Level 0: laborReducePercent[0]=1 → labor 100 → laborCost = 100*10/1000 = 1.
    // ingredient cost = 5 * 2 = 10. costPrice = 11.
    const lvl0 = computeAdHocRecipe(game, DS, getName, 'r1', controls, 10, 20)!
    expect(lvl0.output.recipeCosts['r1'].laborCost).toBeCloseTo(1)
    expect(lvl0.output.prices['bar'].costPrice).toBeCloseTo(11)

    // Level 1: laborReducePercent[1]=0.5 → labor 50 → laborCost 0.5 → costPrice 10.5.
    const lvl1 = computeAdHocRecipe(
      game,
      DS,
      getName,
      'r1',
      { ...controls, skillLevel: 1 },
      10,
      20
    )!
    expect(lvl1.output.recipeCosts['r1'].laborCost).toBeCloseTo(0.5)
    expect(lvl1.output.prices['bar'].costPrice).toBeCloseTo(10.5)
  })

  it('applies a resource plugin module to reduce ingredient quantity', () => {
    addSkill('[1]')
    addRecipe({ baseLaborCost: 0 })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'Upg',
      craftingTableId: 'ct1',
      pluginType: 'Resource',
      percent: 0.5,
      skillId: '',
      skillPercent: 0,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: -4,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'bar',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Module',
      refName: 'Mining',
    })

    const base = {
      skillLevel: 0,
      talentStates: {},
      ingredientPrices: { iron: 5 },
    }
    // No module: 4 iron × 5 = 20.
    const noMod = computeAdHocRecipe(
      game,
      DS,
      getName,
      'r1',
      { ...base, pluginModuleId: '' },
      0,
      20
    )!
    expect(noMod.output.prices['bar'].costPrice).toBeCloseTo(20)
    // Resource module 0.5: 2 iron × 5 = 10.
    const withMod = computeAdHocRecipe(
      game,
      DS,
      getName,
      'r1',
      { ...base, pluginModuleId: 'pm1' },
      0,
      20
    )!
    expect(withMod.output.prices['bar'].costPrice).toBeCloseTo(10)
    expect(withMod.mods.elementModifiedQuantities.get('re-i')).toBeCloseTo(-2)
  })

  it('applies an enabled talent toggle to reduce ingredient quantity', () => {
    addSkill('[1]')
    addRecipe({ baseLaborCost: 0 })
    game.setRow('talents', 't-sharp', {
      id: 't-sharp',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Sharp',
      talentGroupName: 'g',
      value: 0.5,
      level: 1,
      isLevelable: false,
      maxTalentLevel: 0,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: -4,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'bar',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Talent',
      refName: 'Sharp',
    })

    const base = {
      skillLevel: 1,
      pluginModuleId: '',
      ingredientPrices: { iron: 5 },
    }
    const off = computeAdHocRecipe(game, DS, getName, 'r1', { ...base, talentStates: {} }, 0, 20)!
    expect(off.output.prices['bar'].costPrice).toBeCloseTo(20)
    const on = computeAdHocRecipe(
      game,
      DS,
      getName,
      'r1',
      { ...base, talentStates: { 't-sharp': { enabled: true, level: 0 } } },
      0,
      20
    )!
    expect(on.output.prices['bar'].costPrice).toBeCloseTo(10)
  })

  it('consumes a tag ingredient price directly from the seeded prices', () => {
    addSkill('[1]')
    addRecipe({ baseLaborCost: 0 })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'wood-tag',
      baseQuantity: -3,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'plank',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })

    const result = computeAdHocRecipe(
      game,
      DS,
      getName,
      'r1',
      { skillLevel: 0, pluginModuleId: '', talentStates: {}, ingredientPrices: { 'wood-tag': 2 } },
      0,
      20
    )!
    // 3 × 2 = 6, no labor.
    expect(result.output.prices['plank'].costPrice).toBeCloseTo(6)
    expect(result.output.errors).toHaveLength(0)
  })

  it('distributes cost across products of a multi-product recipe by auto shares', () => {
    addSkill('[1]')
    addRecipe({ baseLaborCost: 0 })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: -10,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-a', {
      id: 're-a',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'a',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    game.setRow('recipeElements', 're-b', {
      id: 're-b',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'b',
      baseQuantity: 1,
      isProduct: true,
      index: 1,
    })

    const result = computeAdHocRecipe(
      game,
      DS,
      getName,
      'r1',
      { skillLevel: 0, pluginModuleId: '', talentStates: {}, ingredientPrices: { iron: 1 } },
      0,
      20
    )!
    // total cost = 10. default split 20 → a (primary) 80% = 8, b 20% = 2.
    expect(result.output.recipePrices['r1::a'].costPrice).toBeCloseTo(8)
    expect(result.output.recipePrices['r1::b'].costPrice).toBeCloseTo(2)
  })
})

describe('seedIngredientPrices', () => {
  function stubSignal(costs: Record<string, number>): PriceSignal {
    return {
      get: (id: string, field: 'costPrice' | 'salePrice') =>
        field === 'costPrice' ? (costs[id] ?? null) : null,
    } as unknown as PriceSignal
  }

  beforeEach(() => {
    game.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: DS,
      name: 'R',
      familyName: 'F',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're-i1', {
      id: 're-i1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: -1,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-i2', {
      id: 're-i2',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'copper',
      baseQuantity: -1,
      isProduct: false,
      index: 1,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'bar',
      baseQuantity: 1,
      isProduct: true,
      index: 2,
    })
  })

  it('prefers the manual price, then signal cost price, then 0; products excluded', () => {
    build.setRow('userPrices', 'p1', {
      id: 'p1',
      buildId: BUILD,
      itemOrTagId: 'iron',
      price: 7,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'manual',
    })
    const signal = stubSignal({ copper: 3, bar: 99 })
    const seeded = seedIngredientPrices(game, build, signal, BUILD, 'r1')
    expect(seeded).toEqual({ iron: 7, copper: 3 })
    expect('bar' in seeded).toBe(false)
  })

  it('falls back to 0 when neither a manual nor a signal price exists', () => {
    const seeded = seedIngredientPrices(game, build, stubSignal({}), BUILD, 'r1')
    expect(seeded).toEqual({ iron: 0, copper: 0 })
  })

  it('preserves a manual price of 0 (free) instead of falling through to the signal', () => {
    build.setRow('userPrices', 'p1', {
      id: 'p1',
      buildId: BUILD,
      itemOrTagId: 'iron',
      price: 0,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'manual',
    })
    const seeded = seedIngredientPrices(
      game,
      build,
      stubSignal({ iron: 99, copper: 3 }),
      BUILD,
      'r1'
    )
    expect(seeded.iron).toBe(0)
    expect(seeded.copper).toBe(3)
  })

  it('ignores a placeholder price on a non-manual (e.g. min-mode) userPrices row', () => {
    build.setRow('userPrices', 'p1', {
      id: 'p1',
      buildId: BUILD,
      itemOrTagId: 'iron',
      price: 0,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'min',
    })
    // priceMode is not 'manual', so the placeholder 0 must NOT seed iron — it
    // should use the signal cost price instead.
    const seeded = seedIngredientPrices(
      game,
      build,
      stubSignal({ iron: 5, copper: 3 }),
      BUILD,
      'r1'
    )
    expect(seeded.iron).toBe(5)
    expect(seeded.copper).toBe(3)
  })
})
