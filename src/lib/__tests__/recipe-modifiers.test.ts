import { beforeEach, describe, expect, it } from 'vitest'

import { buildRecipeBuildState, buildRecipeIndexes } from '@/hooks/use-solver-snapshot'
import { resolveRecipeModifiers, type GetNameFn } from '@/lib/recipe-modifiers'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

const BUILD = 'b1'
const DS = 'ds1'
let game: ReturnType<typeof createGameDataStore>
let build: ReturnType<typeof createBuildStore>

const emptyGetName: GetNameFn = () => ''
const rawGetName: GetNameFn = (entityType, entityId) => `${entityType}:${entityId}`

const setupSettings = () => {
  build.setRow('userSettings', 'st1', {
    id: 'st1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 5,
    showUnskilledRecipes: false,
    onlyLevelAccessible: false,
    applyMarginBetweenSkills: true,
  })
}

const setRecipe = (overrides: Record<string, unknown> = {}) => {
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
    baseCraftTime: 2,
    baseLaborCost: 10,
    ...overrides,
  })
}

const setSkill = (overrides: Record<string, unknown> = {}) => {
  game.setRow('skills', 'sk1', {
    id: 'sk1',
    datasetId: DS,
    name: 'Mining',
    maxLevel: 7,
    laborReducePercent: '[1,0.9,0.8,0.7,0.6,0.5,0.4,0.3]',
    ...overrides,
  })
}

const setUserRecipe = (overrides: Record<string, unknown> = {}) => {
  build.setRow('userRecipes', 'ur1', {
    id: 'ur1',
    buildId: BUILD,
    recipeId: 'r1',
    roundFactor: 0,
    ...overrides,
  })
}

const resolve = (recipeId = 'r1', userRecipeId = 'ur1', roundFactor = 0) => {
  const indexes = buildRecipeIndexes(game)
  const buildState = buildRecipeBuildState(build, BUILD)
  return resolveRecipeModifiers(
    game,
    recipeId,
    userRecipeId,
    roundFactor,
    DS,
    indexes,
    buildState,
    emptyGetName
  )
}

beforeEach(() => {
  game = createGameDataStore()
  build = createBuildStore()
  setupSettings()
})

describe('resolveRecipeModifiers', () => {
  it('returns null when the recipe does not exist', () => {
    const result = resolve('missing-recipe')
    expect(result).toBeNull()
  })

  it('returns empty bonuses and multipliers of 1 when no modifiers apply', () => {
    setSkill()
    setRecipe()
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 5,
      isProduct: false,
      index: 0,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.bonuses).toEqual([])
    expect(result.elementMultipliers.get('re-i')).toBe(1)
    expect(result.elementModifiedQuantities.get('re-i')).toBe(5)
    expect(result.craftMultiplier).toBe(1)
    expect(result.laborMultiplier).toBe(1)
    expect(result.modifiedCraftTime).toBe(2)
    expect(result.modifiedLaborCost).toBe(10)
  })

  it('applies a skill labor-reduce modifier and produces a skill bonus entry', () => {
    setSkill()
    setRecipe()
    game.setRow('modifiers', 'mod-labor', {
      id: 'mod-labor',
      datasetId: DS,
      targetType: 'labor',
      targetId: 'r1',
      dynamicType: 'Skill',
      refName: 'Mining',
    })
    build.setRow('userSkills', 'us1', {
      id: 'us1',
      buildId: BUILD,
      skillId: 'sk1',
      level: 1,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.laborMultiplier).toBeCloseTo(0.9)
    expect(result.modifiedLaborCost).toBeCloseTo(9)
    expect(result.bonuses).toHaveLength(1)
    const b = result.bonuses[0]
    expect(b.source).toBe('skill')
    expect(b.icon).toEqual({ kind: 'skill', rawName: 'Mining' })
    expect(b.displayName).toBe('Mining (Level 1)')
    expect(b.effects).toEqual([{ metric: 'labor', signedPercent: -10 }])
  })

  it('applies a non-levelable enabled talent and lists an ingredients effect', () => {
    setSkill()
    setRecipe()
    game.setRow('talents', 't-sharp', {
      id: 't-sharp',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Sharp',
      talentGroupName: 'Precision',
      value: 0.8,
      level: 1,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
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
    build.setRow('userTalents', 'ut-sharp', {
      id: 'ut-sharp',
      buildId: BUILD,
      talentId: 't-sharp',
      enabled: true,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.elementMultipliers.get('re-i')).toBeCloseTo(0.8)
    expect(result.elementModifiedQuantities.get('re-i')).toBeCloseTo(8)
    expect(result.bonuses).toHaveLength(1)
    const b = result.bonuses[0]
    expect(b.source).toBe('talent')
    expect(b.displayName).toBe('Sharp')
    expect(b.icon).toEqual({ kind: 'talent', talentGroupName: 'Precision' })
    expect(b.effects).toEqual([{ metric: 'ingredients', signedPercent: -20 }])
  })

  it('resolves a CappedMultiplicative bonus-system talent at a given level', () => {
    setSkill()
    setRecipe()
    game.setRow('talents', 't-brick', {
      id: 't-brick',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Bricklaying',
      talentGroupName: 'Crafting',
      value: 1,
      level: 1,
      isLevelable: true,
      maxTalentLevel: 5,
    })
    game.setRow('talentBonuses', 'tb-0', {
      id: 'tb-0',
      datasetId: DS,
      talentId: 't-brick',
      bonusIndex: 0,
      action: 'Add',
      effectType: 'CappedMultiplicative',
      value: 0.95,
      cap: 0.8,
      lowerIsBetter: true,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'clay',
      baseQuantity: 100,
      isProduct: false,
      index: 0,
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Talent',
      refName: 'Bricklaying:0',
    })
    build.setRow('userTalents', 'ut-brick', {
      id: 'ut-brick',
      buildId: BUILD,
      talentId: 't-brick',
      enabled: true,
      talentLevel: 3,
    })
    setUserRecipe()

    const result = resolve()!
    // 0.95^3 = 0.857375 (above cap 0.8, so raw value used)
    expect(result.elementMultipliers.get('re-i')!).toBeCloseTo(0.857375, 4)
    expect(result.bonuses).toHaveLength(1)
    const b = result.bonuses[0]
    expect(b.source).toBe('talent')
    expect(b.displayName).toBe('Bricklaying')
    // Matching signedPercent: round((0.857375 - 1) * 1000)/10 = -14.3
    expect(b.effects).toEqual([{ metric: 'ingredients', signedPercent: -14.3 }])
  })

  it('applies a plugin module with matching skillPercent override', () => {
    setSkill()
    setRecipe()
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'AdvancedUpgrade',
      pluginType: 'Resource',
      percent: 0.9,
      skillId: 'sk1',
      skillPercent: 0.8,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
      index: 0,
    })
    // Modifier references the Mining skill by name; Mining's skill row id is
    // 'sk1', which matches the module's skillId → skillPercent (0.8) applies.
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Module',
      refName: 'Mining',
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0.5,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.elementMultipliers.get('re-i')).toBeCloseTo(0.8)
    expect(result.elementModifiedQuantities.get('re-i')).toBeCloseTo(8)
    expect(result.bonuses).toHaveLength(1)
    const b = result.bonuses[0]
    expect(b.source).toBe('module')
    expect(b.icon).toEqual({ kind: 'module', rawName: 'AdvancedUpgrade' })
    expect(b.effects).toEqual([{ metric: 'ingredients', signedPercent: -20 }])
  })

  it('uses skillPercent for a skilless recipe when the modifier references the module-bound skill', () => {
    // Regression: recipes like BrickRecipe have no skillId of their own but
    // their craftMinutes modifier references a skill (PotterySkill) and when
    // the user's module is pottery-bound, the skillPercent must apply.
    setSkill() // 'sk1' named 'Mining'
    setRecipe({ skillId: undefined, baseCraftTime: 10 })
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Kiln' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'MiningUpgrade',
      pluginType: 'Resource&Speed',
      percent: 0.8,
      skillId: 'sk1',
      skillPercent: 0.75,
    })
    // Modifier references 'Mining' by name → resolves to skillId 'sk1'
    // → matches module.skillId → skillPercent (0.75) applies to craft time.
    game.setRow('modifiers', 'mod-craft', {
      id: 'mod-craft',
      datasetId: DS,
      targetType: 'craftMinutes',
      targetId: 'r1',
      dynamicType: 'Module',
      refName: 'Mining',
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.craftMultiplier).toBeCloseTo(0.75)
    expect(result.modifiedCraftTime).toBeCloseTo(7.5)
  })

  it('applies plain module percent when skill does not match', () => {
    setSkill()
    setRecipe({ skillId: 'sk-other' })
    game.setRow('skills', 'sk-other', {
      id: 'sk-other',
      datasetId: DS,
      name: 'Other',
      maxLevel: 1,
      laborReducePercent: '[1]',
    })
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'Upg',
      pluginType: 'Resource',
      percent: 0.9,
      skillId: 'sk1',
      skillPercent: 0.5,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
      index: 0,
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Module',
      refName: 'Upg',
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0,
    })
    setUserRecipe()

    const result = resolve()!
    // Modifier refName 'Upg' doesn't match any skill name → mod.skillId is
    // undefined → skillPercent does not apply, module's plain percent (0.9) is used.
    expect(result.elementMultipliers.get('re-i')).toBeCloseTo(0.9)
    expect(result.bonuses[0].effects).toEqual([{ metric: 'ingredients', signedPercent: -10 }])
  })

  it('surfaces a single talent line with multiple metric effects when it touches both ingredients and products', () => {
    setSkill()
    setRecipe()
    game.setRow('talents', 't-versatile', {
      id: 't-versatile',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Versatile',
      talentGroupName: 'General',
      value: 0.75,
      level: 1,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 4,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'bar',
      baseQuantity: 2,
      isProduct: true,
      index: 1,
    })
    game.setRow('modifiers', 'mod-i', {
      id: 'mod-i',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Talent',
      refName: 'Versatile',
    })
    // NOTE: typically a different talent value would affect products, but for
    // this test we reuse "Versatile" to prove multi-metric collapse under one
    // bonus line. Since activeTalents lookup is by name, both metrics use the
    // same 0.75 value.
    game.setRow('modifiers', 'mod-p', {
      id: 'mod-p',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-p',
      dynamicType: 'Talent',
      refName: 'Versatile',
    })
    build.setRow('userTalents', 'ut-v', {
      id: 'ut-v',
      buildId: BUILD,
      talentId: 't-versatile',
      enabled: true,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.bonuses).toHaveLength(1)
    const b = result.bonuses[0]
    expect(b.source).toBe('talent')
    expect(b.displayName).toBe('Versatile')
    // Ordered by EFFECT_ORDER: labor, craftTime, ingredients, products
    expect(b.effects).toEqual([
      { metric: 'ingredients', signedPercent: -25 },
      { metric: 'products', signedPercent: -25 },
    ])
  })

  it('skips a talent whose refName is not in activeTalents (disabled)', () => {
    setSkill()
    setRecipe()
    game.setRow('talents', 't-off', {
      id: 't-off',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Unused',
      talentGroupName: 'g',
      value: 0.5,
      level: 1,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 4,
      isProduct: false,
      index: 0,
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Talent',
      refName: 'Unused',
    })
    // No userTalents row → talent is inactive
    setUserRecipe()

    const result = resolve()!
    expect(result.bonuses).toEqual([])
    expect(result.elementMultipliers.get('re-i')).toBe(1)
  })

  it('sorts bonuses by source order (skill, talent, module) and uses localized names via getName', () => {
    setSkill()
    setRecipe()
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'Upg',
      pluginType: 'Resource',
      percent: 0.9,
      skillId: '',
      skillPercent: 0,
    })
    game.setRow('talents', 't-a', {
      id: 't-a',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Sharp',
      talentGroupName: 'Prec',
      value: 0.95,
      level: 1,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
      index: 0,
    })
    // Modifiers in reverse insertion order: module first, then talent, then skill
    game.setRow('modifiers', 'mod-mod', {
      id: 'mod-mod',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Module',
      refName: 'Upg',
    })
    game.setRow('modifiers', 'mod-tal', {
      id: 'mod-tal',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Talent',
      refName: 'Sharp',
    })
    game.setRow('modifiers', 'mod-skill', {
      id: 'mod-skill',
      datasetId: DS,
      targetType: 'labor',
      targetId: 'r1',
      dynamicType: 'Skill',
      refName: 'Mining',
    })
    build.setRow('userSkills', 'us1', {
      id: 'us1',
      buildId: BUILD,
      skillId: 'sk1',
      level: 2,
    })
    build.setRow('userTalents', 'ut-a', {
      id: 'ut-a',
      buildId: BUILD,
      talentId: 't-a',
      enabled: true,
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0,
    })
    setUserRecipe()

    const indexes = buildRecipeIndexes(game)
    const buildState = buildRecipeBuildState(build, BUILD)
    const result = resolveRecipeModifiers(
      game,
      'r1',
      'ur1',
      0,
      DS,
      indexes,
      buildState,
      rawGetName
    )!

    expect(result.bonuses.map((b) => b.source)).toEqual(['skill', 'talent', 'module'])
    expect(result.bonuses[0].displayName).toBe('skill:sk1 (Level 2)')
    expect(result.bonuses[1].displayName).toBe('talent:t-a')
    expect(result.bonuses[2].displayName).toBe('pluginModule:pm1')
  })

  it('does not reduce craft time when the plugin module is Resource-only', () => {
    setSkill()
    setRecipe({ baseCraftTime: 10 })
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'ResourceOnly',
      pluginType: 'Resource',
      percent: 0.5,
      skillId: '',
      skillPercent: 0,
    })
    // Both craftMinutes and an ingredient have a Module modifier — but the
    // module is Resource-only, so only the ingredient multiplier should change.
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
      index: 0,
    })
    game.setRow('modifiers', 'mod-craft', {
      id: 'mod-craft',
      datasetId: DS,
      targetType: 'craftMinutes',
      targetId: 'r1',
      dynamicType: 'Module',
      refName: 'ResourceOnly',
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Module',
      refName: 'ResourceOnly',
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0,
    })
    setUserRecipe()

    const result = resolve()!
    // Resource module → ingredient reduced 50%
    expect(result.elementMultipliers.get('re-i')).toBeCloseTo(0.5)
    // Resource module → craft time UNCHANGED
    expect(result.craftMultiplier).toBe(1)
    expect(result.modifiedCraftTime).toBe(10)
    // The bonus line should show only the ingredients effect, not craftTime.
    expect(result.bonuses).toHaveLength(1)
    expect(result.bonuses[0].effects).toEqual([{ metric: 'ingredients', signedPercent: -50 }])
  })

  it('does not reduce ingredients when the plugin module is Speed-only', () => {
    setSkill()
    setRecipe({ baseCraftTime: 10 })
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'SpeedOnly',
      pluginType: 'Speed',
      percent: 0.5,
      skillId: '',
      skillPercent: 0,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
      index: 0,
    })
    game.setRow('modifiers', 'mod-craft', {
      id: 'mod-craft',
      datasetId: DS,
      targetType: 'craftMinutes',
      targetId: 'r1',
      dynamicType: 'Module',
      refName: 'SpeedOnly',
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'Module',
      refName: 'SpeedOnly',
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0,
    })
    setUserRecipe()

    const result = resolve()!
    expect(result.elementMultipliers.get('re-i')).toBe(1)
    expect(result.craftMultiplier).toBeCloseTo(0.5)
    expect(result.modifiedCraftTime).toBeCloseTo(5)
    expect(result.bonuses).toHaveLength(1)
    expect(result.bonuses[0].effects).toEqual([{ metric: 'craftTime', signedPercent: -50 }])
  })

  it('applies roundFactor to modified element quantities', () => {
    setSkill()
    setRecipe()
    game.setRow('talents', 't-s', {
      id: 't-s',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Sharp',
      talentGroupName: 'g',
      value: 0.625,
      level: 1,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 10,
      isProduct: false,
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
    build.setRow('userTalents', 'ut', {
      id: 'ut',
      buildId: BUILD,
      talentId: 't-s',
      enabled: true,
    })
    setUserRecipe({ roundFactor: 1 })

    // baseQuantity × multiplier = 10 × 0.625 = 6.25 → ceil to nearest 1 = 7
    const result = resolve('r1', 'ur1', 1)!
    expect(result.elementMultipliers.get('re-i')).toBeCloseTo(0.625)
    expect(result.elementModifiedQuantities.get('re-i')).toBe(7)
  })
})
