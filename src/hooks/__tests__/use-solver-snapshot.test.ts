import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { buildSolverSnapshot } from '../use-solver-snapshot'

const BUILD = 'b1'
const DS = 'ds1'
let game: ReturnType<typeof createGameDataStore>
let build: ReturnType<typeof createBuildStore>

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

beforeEach(() => {
  game = createGameDataStore()
  build = createBuildStore()
})

describe('buildSolverSnapshot', () => {
  it('returns null when no settings row exists for the build', () => {
    expect(buildSolverSnapshot(game, build, BUILD, DS)).toBeNull()
  })

  it('ignores settings, margins, recipe-margins, and primary tag items from other builds', () => {
    // Foreign settings — must be skipped, our row should still be picked up
    build.setRow('userSettings', 'st-foreign', {
      id: 'st-foreign',
      buildId: 'other-build',
      marginType: 'grossMargin',
      calorieCost: 999,
      showUnskilledRecipes: true,
      onlyLevelAccessible: true,
      applyMarginBetweenSkills: true,
    })
    setupSettings()
    // Foreign margin — skipped
    build.setRow('userMargins', 'm-foreign', {
      id: 'm-foreign',
      buildId: 'other-build',
      name: 'Foreign',
      percent: 99,
      isDefault: true,
    })
    build.setRow('userMargins', 'm-mine', {
      id: 'm-mine',
      buildId: BUILD,
      name: 'Mine',
      percent: 10,
      isDefault: true,
    })
    // Foreign recipe-margin — skipped
    build.setRow('userRecipes', 'ur-foreign', {
      id: 'ur-foreign',
      buildId: 'other-build',
      recipeId: 'r1',
      roundFactor: 0,
    })
    build.setRow('userRecipeMargins', 'urm-foreign', {
      id: 'urm-foreign',
      buildId: 'other-build',
      userRecipeId: 'ur-foreign',
      userMarginId: 'm-foreign',
    })
    // Foreign primary tag item — skipped
    build.setRow('userPrices', 'p-foreign', {
      id: 'p-foreign',
      buildId: 'other-build',
      itemOrTagId: 'wood-tag',
      price: 1,
      isOverride: false,
      primaryItemId: 'oak',
    })
    // Same build but with no primaryItemId — should not appear in primaryTagItems
    build.setRow('userPrices', 'p-mine-no-primary', {
      id: 'p-mine-no-primary',
      buildId: BUILD,
      itemOrTagId: 'iron',
      price: 1,
      isOverride: false,
      primaryItemId: '',
    })

    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.settings.calorieCost).toBe(5)
    expect(Object.keys(snap.margins).sort()).toEqual(['m-mine'])
    expect(snap.recipeMargins).toEqual({})
    expect(snap.primaryTagItems).toEqual({})
  })

  it('collects prices and overrides separately', () => {
    setupSettings()
    build.setRow('userPrices', 'p1', {
      id: 'p1',
      buildId: BUILD,
      itemOrTagId: 'iron',
      price: 10,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'manual',
    })
    build.setRow('userPrices', 'p2', {
      id: 'p2',
      buildId: BUILD,
      itemOrTagId: 'copper',
      price: 20,
      isOverride: true,
      primaryItemId: '',
      priceMode: 'manual',
    })
    // Wrong build → ignored
    build.setRow('userPrices', 'p3', {
      id: 'p3',
      buildId: 'other',
      itemOrTagId: 'gold',
      price: 99,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'manual',
    })
    // Zero price → ignored
    build.setRow('userPrices', 'p4', {
      id: 'p4',
      buildId: BUILD,
      itemOrTagId: 'lead',
      price: 0,
      isOverride: false,
      primaryItemId: '',
      priceMode: 'manual',
    })

    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.prices).toEqual({ iron: 10 })
    expect(snap.overrides).toEqual({ copper: 20 })
  })

  it('captures margins, recipe margin assignments, primary tag items, and tag items', () => {
    setupSettings()
    build.setRow('userMargins', 'm1', {
      id: 'm1',
      buildId: BUILD,
      name: 'Default',
      percent: 0.25,
      isDefault: true,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    build.setRow('userRecipeMargins', 'urm1', {
      id: 'urm1',
      buildId: BUILD,
      userRecipeId: 'ur1',
      userMarginId: 'm1',
    })
    build.setRow('userPrices', 'p1', {
      id: 'p1',
      buildId: BUILD,
      itemOrTagId: 'wood-tag',
      price: 0,
      isOverride: false,
      primaryItemId: 'oak',
    })
    game.setRow('tagItems', 'ti1', {
      id: 'ti1',
      datasetId: DS,
      tagId: 'wood-tag',
      itemId: 'oak',
    })
    game.setRow('tagItems', 'ti2', {
      id: 'ti2',
      datasetId: DS,
      tagId: 'wood-tag',
      itemId: 'birch',
    })
    // Wrong dataset → ignored
    game.setRow('tagItems', 'ti3', {
      id: 'ti3',
      datasetId: 'other',
      tagId: 'wood-tag',
      itemId: 'oak2',
    })
    // Recipe doesn't exist in game-data — solver recipe entry skipped, but margin
    // assignment is still recorded.
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.margins.m1).toEqual({ name: 'Default', percent: 0.25 })
    expect(snap.recipeMargins).toEqual({ r1: 'm1' })
    expect(snap.primaryTagItems).toEqual({ 'wood-tag': 'oak' })
    expect(snap.tagItems['wood-tag']?.sort()).toEqual(['birch', 'oak'])
    expect(snap.recipes).toHaveLength(0)
  })

  it('builds a recipe with skill, talents, plugin module, modifiers, and shared products', () => {
    setupSettings()
    game.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DS,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1,0.9,0.8]',
    })
    game.setRow('talents', 't-on', {
      id: 't-on',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Sharp',
      talentGroupName: 'g',
      value: 0.1,
      level: 1,
    })
    game.setRow('talents', 't-off', {
      id: 't-off',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Dull',
      talentGroupName: 'g',
      value: 0.2,
      level: 1,
    })
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'Upg',
      craftingTableId: 'ct1',
      pluginType: 'speed',
      percent: 0.5,
      skillId: 'sk1',
      skillPercent: 0.1,
    })
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
      baseLaborCost: 3,
    })
    game.setRow('recipeElements', 're-i', {
      id: 're-i',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'iron',
      baseQuantity: 1,
      isProduct: false,
      index: 0,
    })
    game.setRow('recipeElements', 're-p1', {
      id: 're-p1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'bar',
      baseQuantity: 2,
      isProduct: true,
      index: 0,
    })
    game.setRow('recipeElements', 're-p2', {
      id: 're-p2',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'slag',
      baseQuantity: 1,
      isProduct: true,
      index: 1,
    })
    game.setRow('modifiers', 'mod-craft', {
      id: 'mod-craft',
      datasetId: DS,
      targetType: 'craftMinutes',
      targetId: 'r1',
      dynamicType: 'skill',
      refName: 'Mining',
    })
    game.setRow('modifiers', 'mod-labor', {
      id: 'mod-labor',
      datasetId: DS,
      targetType: 'labor',
      targetId: 'r1',
      dynamicType: 'skill',
      refName: 'Mining',
    })
    game.setRow('modifiers', 'mod-elem', {
      id: 'mod-elem',
      datasetId: DS,
      targetType: 'elementQuantity',
      targetId: 're-i',
      dynamicType: 'talent',
      refName: 'Sharp',
    })

    build.setRow('userSkills', 'us1', {
      id: 'us1',
      buildId: BUILD,
      skillId: 'sk1',
      level: 4,
    })
    build.setRow('userTalents', 'ut-on', {
      id: 'ut-on',
      buildId: BUILD,
      talentId: 't-on',
      enabled: true,
    })
    build.setRow('userTalents', 'ut-off', {
      id: 'ut-off',
      buildId: BUILD,
      talentId: 't-off',
      enabled: false,
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0.5,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 2,
    })

    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.settings).toEqual({
      marginType: 'markup',
      calorieCost: 5,
      applyMarginBetweenSkills: true,
    })
    expect(snap.recipes).toHaveLength(1)
    const r = snap.recipes[0]
    expect(r.id).toBe('r1')
    expect(r.skillId).toBe('sk1')
    expect(r.skillLevel).toBe(4)
    expect(r.laborReducePercent).toEqual([1, 0.9, 0.8])
    expect(r.activeTalents).toEqual([{ name: 'Sharp', value: 0.1 }])
    expect(r.pluginModule).toEqual({
      percent: 0.5,
      skillId: 'sk1',
      skillPercent: 0.1,
      pluginType: 'speed',
    })
    expect(r.costPerMinute).toBe(0.5)
    expect(r.roundFactor).toBe(2)
    expect(r.ingredients).toHaveLength(1)
    expect(r.ingredients[0].modifiers).toHaveLength(1)
    expect(r.products).toHaveLength(2)
    // Default without userProductShares: primary gets `100 − config`, the
    // single non-zero secondary gets `config`. Schema default config is 20.
    expect(r.products[0].share).toBeCloseTo(0.8)
    expect(r.products[1].share).toBeCloseTo(0.2)
    expect(r.craftMinutesModifiers).toHaveLength(1)
    expect(r.laborModifiers).toHaveLength(1)
  })

  it('ignores user recipes belonging to other builds', () => {
    setupSettings()
    game.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: DS,
      name: 'R',
      familyName: 'F',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-missing',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    build.setRow('userRecipes', 'ur-other', {
      id: 'ur-other',
      buildId: 'other-build',
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.recipes).toHaveLength(0)
  })

  it('ignores talents from unrelated skills and the user CT plugin module without skill fields', () => {
    setupSettings()
    game.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DS,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    // Talent in a totally different skill — should be ignored even if active
    game.setRow('talents', 't-other-skill', {
      id: 't-other-skill',
      datasetId: DS,
      skillId: 'sk-other',
      name: 'Other',
      talentGroupName: 'g',
      value: 1,
      level: 1,
    })
    game.setRow('talents', 't-on', {
      id: 't-on',
      datasetId: DS,
      skillId: 'sk1',
      name: 'OK',
      talentGroupName: 'g',
      value: 0.1,
      level: 1,
    })
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
    // Plugin module with empty skill fields → undefined coalesces both
    game.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: DS,
      name: 'Plain',
      craftingTableId: 'ct1',
      pluginType: 'speed',
      percent: 0.25,
      skillId: '',
      skillPercent: 0,
    })
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
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    build.setRow('userTalents', 'ut-other', {
      id: 'ut-other',
      buildId: BUILD,
      talentId: 't-other-skill',
      enabled: true,
    })
    build.setRow('userTalents', 'ut-on', {
      id: 'ut-on',
      buildId: BUILD,
      talentId: 't-on',
      enabled: true,
    })
    // Foreign-build talent — also ignored
    build.setRow('userTalents', 'ut-foreign', {
      id: 'ut-foreign',
      buildId: 'other-build',
      talentId: 't-on',
      enabled: true,
    })
    // Foreign-build skill / crafting table / settings rows — all ignored
    build.setRow('userSkills', 'us-foreign', {
      id: 'us-foreign',
      buildId: 'other-build',
      skillId: 'sk1',
      level: 7,
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 0.1,
    })
    build.setRow('userCraftingTables', 'uct-foreign', {
      id: 'uct-foreign',
      buildId: 'other-build',
      craftingTableId: 'ct1',
      pluginModuleId: 'pm1',
      costPerMinute: 99,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    const r = snap.recipes[0]
    expect(r.activeTalents.map((t) => t.name)).toEqual(['OK'])
    expect(r.pluginModule).toEqual({
      percent: 0.25,
      skillId: undefined,
      skillPercent: undefined,
      pluginType: 'speed',
    })
    expect(r.skillLevel).toBe(0) // foreign userSkill not associated
    expect(r.costPerMinute).toBe(0.1)
  })

  it('handles a skillless single-product recipe with no user crafting table', () => {
    setupSettings()
    game.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: DS,
      name: 'R',
      familyName: 'F',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-missing',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're-p', {
      id: 're-p',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    // Element belonging to a different recipe — should be skipped
    game.setRow('recipeElements', 're-other', {
      id: 're-other',
      datasetId: DS,
      recipeId: 'other-recipe',
      itemOrTagId: 'iron',
      baseQuantity: 1,
      isProduct: false,
      index: 0,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.recipes).toHaveLength(1)
    const r = snap.recipes[0]
    expect(r.skillId).toBeUndefined()
    expect(r.skillLevel).toBe(0)
    expect(r.laborReducePercent).toEqual([1.0])
    expect(r.pluginModule).toBeNull()
    expect(r.costPerMinute).toBe(0)
    expect(r.products).toHaveLength(1)
    expect(r.products[0].share).toBe(1)
    expect(r.ingredients).toHaveLength(0)
    expect(r.activeTalents).toHaveLength(0)
  })

  it('leaves pluginModule null when the user crafting table has no plugin module', () => {
    setupSettings()
    game.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
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
    game.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct1',
      pluginModuleId: '',
      costPerMinute: 0.25,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.recipes[0].pluginModule).toBeNull()
    expect(snap.recipes[0].costPerMinute).toBe(0.25)
  })

  it('emits one SolverTalent per bonus on a levelable bonus talent with capped values', () => {
    setupSettings()
    game.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DS,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    game.setRow('talents', 't-lev', {
      id: 't-lev',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Ethanol',
      talentGroupName: 'g',
      value: 1,
      level: 1,
      isLevelable: true,
      maxTalentLevel: 5,
    })
    game.setRow('talentBonuses', 'tb-0', {
      id: 'tb-0',
      datasetId: DS,
      talentId: 't-lev',
      bonusIndex: 0,
      action: 'Reduce',
      effectType: 'CappedMultiplicative',
      value: 0.9,
      cap: 0.5,
      lowerIsBetter: true,
    })
    game.setRow('talentBonuses', 'tb-1', {
      id: 'tb-1',
      datasetId: DS,
      talentId: 't-lev',
      bonusIndex: 1,
      action: 'Reduce',
      effectType: 'Multiplicative',
      value: 0.8,
      cap: 0,
      lowerIsBetter: true,
    })
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
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    build.setRow('userTalents', 'ut-lev', {
      id: 'ut-lev',
      buildId: BUILD,
      talentId: 't-lev',
      enabled: true,
      talentLevel: 3,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })

    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    const r = snap.recipes[0]
    expect(r.activeTalents).toHaveLength(2)
    // Capped: 0.9^3 = 0.729 — above cap 0.5, so raw value applied.
    const capped = r.activeTalents.find((t) => t.name === 'Ethanol:0')!
    expect(capped.value).toBeCloseTo(0.729)
    // Non-levelable effect type — value is the raw bonus.Value regardless of level.
    const mult = r.activeTalents.find((t) => t.name === 'Ethanol:1')!
    expect(mult.value).toBe(0.8)
  })

  it('clamps a CappedMultiplicative effective value to the cap once exceeded', () => {
    setupSettings()
    game.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DS,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    game.setRow('talents', 't-lev', {
      id: 't-lev',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Ethanol',
      talentGroupName: 'g',
      value: 1,
      level: 1,
      isLevelable: true,
      maxTalentLevel: 7,
    })
    game.setRow('talentBonuses', 'tb-0', {
      id: 'tb-0',
      datasetId: DS,
      talentId: 't-lev',
      bonusIndex: 0,
      action: 'Reduce',
      effectType: 'CappedMultiplicative',
      value: 0.9,
      cap: 0.5,
      lowerIsBetter: true,
    })
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
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    // Level 10 — 0.9^10 ≈ 0.349, past cap 0.5; should clamp to 0.5.
    build.setRow('userTalents', 'ut-lev', {
      id: 'ut-lev',
      buildId: BUILD,
      talentId: 't-lev',
      enabled: true,
      talentLevel: 10,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    const active = snap.recipes[0].activeTalents.find((t) => t.name === 'Ethanol:0')!
    expect(active.value).toBe(0.5)
  })

  it('omits bonus talents that are enabled but at talentLevel 0 (levelable)', () => {
    setupSettings()
    game.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DS,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    game.setRow('talents', 't-lev', {
      id: 't-lev',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Ethanol',
      talentGroupName: 'g',
      value: 1,
      level: 1,
      isLevelable: true,
      maxTalentLevel: 5,
    })
    game.setRow('talentBonuses', 'tb-0', {
      id: 'tb-0',
      datasetId: DS,
      talentId: 't-lev',
      bonusIndex: 0,
      action: 'Reduce',
      effectType: 'CappedMultiplicative',
      value: 0.9,
      cap: 0.5,
      lowerIsBetter: true,
    })
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
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    build.setRow('userTalents', 'ut-lev', {
      id: 'ut-lev',
      buildId: BUILD,
      talentId: 't-lev',
      enabled: true,
      talentLevel: 0,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.recipes[0].activeTalents).toHaveLength(0)
  })

  it('non-levelable bonus talent uses enabled flag and raw bonus values', () => {
    setupSettings()
    game.setRow('skills', 'sk1', {
      id: 'sk1',
      datasetId: DS,
      name: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    game.setRow('talents', 't-fixed', {
      id: 't-fixed',
      datasetId: DS,
      skillId: 'sk1',
      name: 'Sharp',
      talentGroupName: 'g',
      value: 1,
      level: 1,
      isLevelable: false,
      maxTalentLevel: 0,
    })
    game.setRow('talentBonuses', 'tb-fixed', {
      id: 'tb-fixed',
      datasetId: DS,
      talentId: 't-fixed',
      bonusIndex: 0,
      action: 'Reduce',
      effectType: 'Multiplicative',
      value: 0.75,
      cap: 0,
      lowerIsBetter: true,
    })
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
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    game.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: DS,
      recipeId: 'r1',
      itemOrTagId: 'rock',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    build.setRow('userTalents', 'ut-fixed', {
      id: 'ut-fixed',
      buildId: BUILD,
      talentId: 't-fixed',
      enabled: true,
      talentLevel: 0,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    const active = snap.recipes[0].activeTalents
    expect(active).toHaveLength(1)
    expect(active[0]).toEqual({ name: 'Sharp:0', value: 0.75 })
  })

  it('skips user recipes whose recipe belongs to a different dataset', () => {
    setupSettings()
    game.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: 'other',
      name: 'R',
      familyName: 'F',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 1,
    })
    build.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    const snap = buildSolverSnapshot(game, build, BUILD, DS)!
    expect(snap.recipes).toHaveLength(0)
  })

  describe('multi-product share allocation', () => {
    const setupMultiProductRecipe = (opts: {
      productIds: string[]
      ingredientId?: string
      reintegratedProductId?: string
    }) => {
      setupSettings()
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
      if (opts.ingredientId) {
        game.setRow('recipeElements', 're-ing', {
          id: 're-ing',
          datasetId: DS,
          recipeId: 'r1',
          itemOrTagId: opts.ingredientId,
          baseQuantity: -1,
          isProduct: false,
          index: 0,
        })
      }
      opts.productIds.forEach((pid, i) => {
        game.setRow('recipeElements', `re-p${i}`, {
          id: `re-p${i}`,
          datasetId: DS,
          recipeId: 'r1',
          itemOrTagId: pid,
          baseQuantity: 1,
          isProduct: true,
          index: i,
        })
      })
      build.setRow('userRecipes', 'ur1', {
        id: 'ur1',
        buildId: BUILD,
        recipeId: 'r1',
        roundFactor: 0,
      })
    }

    it('marks a product whose item is also an ingredient as reintegrated with share=0', () => {
      setupMultiProductRecipe({
        productIds: ['primary', 'scrap'],
        ingredientId: 'scrap',
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      expect(r.products).toHaveLength(2)
      const primary = r.products.find((p) => p.itemOrTagId === 'primary')!
      const scrap = r.products.find((p) => p.itemOrTagId === 'scrap')!
      expect(primary.isReintegrated).toBe(false)
      expect(primary.share).toBeCloseTo(1)
      expect(scrap.isReintegrated).toBe(true)
      expect(scrap.share).toBe(0)
    })

    it('without userProductShares rows, applies the build-level default split', () => {
      // Schema default `defaultShareForSecondaryItems` = 20 → primary 80,
      // each of the two non-zero secondaries gets 10.
      setupMultiProductRecipe({ productIds: ['a', 'b', 'c'] })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      expect(r.products).toHaveLength(3)
      expect(r.products[0].share).toBeCloseTo(0.8)
      expect(r.products[1].share).toBeCloseTo(0.1)
      expect(r.products[2].share).toBeCloseTo(0.1)
    })

    it('when a reintegrated product sits at index 0, primary is the next non-reintegrated product', () => {
      setupMultiProductRecipe({
        productIds: ['scrap', 'ingot'],
        ingredientId: 'scrap',
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      const ingot = r.products.find((p) => p.itemOrTagId === 'ingot')!
      const scrap = r.products.find((p) => p.itemOrTagId === 'scrap')!
      expect(ingot.share).toBeCloseTo(1)
      expect(scrap.isReintegrated).toBe(true)
      expect(scrap.share).toBe(0)
    })

    it('honors userProductShares rows (stored as 0–100, emitted as 0–1)', () => {
      setupMultiProductRecipe({ productIds: ['a', 'b'] })
      build.setRow('userProductShares', 'ups1', {
        id: 'ups1',
        buildId: BUILD,
        userRecipeId: 'ur1',
        productItemOrTagId: 'a',
        sharePercent: 30,
      })
      build.setRow('userProductShares', 'ups2', {
        id: 'ups2',
        buildId: BUILD,
        userRecipeId: 'ur1',
        productItemOrTagId: 'b',
        sharePercent: 70,
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      const a = r.products.find((p) => p.itemOrTagId === 'a')!
      const b = r.products.find((p) => p.itemOrTagId === 'b')!
      expect(a.share).toBeCloseTo(0.3)
      expect(b.share).toBeCloseTo(0.7)
    })

    it('ignores userProductShares rows from other builds or other userRecipes', () => {
      setupMultiProductRecipe({ productIds: ['a', 'b'] })
      build.setRow('userProductShares', 'ups-foreign-build', {
        id: 'ups-foreign-build',
        buildId: 'other-build',
        userRecipeId: 'ur1',
        productItemOrTagId: 'a',
        sharePercent: 50,
      })
      build.setRow('userProductShares', 'ups-foreign-ur', {
        id: 'ups-foreign-ur',
        buildId: BUILD,
        userRecipeId: 'ur-other',
        productItemOrTagId: 'a',
        sharePercent: 50,
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      // No valid rows for this userRecipeId → falls back to the auto split
      // (config 20 → primary 80, secondary 20).
      expect(r.products[0].share).toBeCloseTo(0.8)
      expect(r.products[1].share).toBeCloseTo(0.2)
    })

    it('honors a custom defaultShareForSecondaryItems setting', () => {
      setupMultiProductRecipe({ productIds: ['a', 'b'] })
      // Override the default 20 with 50.
      build.setCell('userSettings', 'st1', 'defaultShareForSecondaryItems', 50)
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      expect(r.products[0].share).toBeCloseTo(0.5)
      expect(r.products[1].share).toBeCloseTo(0.5)
    })

    it('config=0 reverts to the legacy primary=100, secondaries=0 split', () => {
      setupMultiProductRecipe({ productIds: ['a', 'b', 'c'] })
      build.setCell('userSettings', 'st1', 'defaultShareForSecondaryItems', 0)
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      expect(r.products[0].share).toBeCloseTo(1)
      expect(r.products[1].share).toBe(0)
      expect(r.products[2].share).toBe(0)
    })

    it('keeps Slag/Tailings/WetTailings at 0 even when defaultShareForSecondaryItems > 0', () => {
      // Add real item rows so buildRecipeIndexes sees them as zero-share.
      game.setRow('items', 'slag', { id: 'slag', datasetId: DS, name: 'SlagItem', isTag: false })
      game.setRow('items', 'tail', {
        id: 'tail',
        datasetId: DS,
        name: 'TailingsItem',
        isTag: false,
      })
      game.setRow('items', 'wet', {
        id: 'wet',
        datasetId: DS,
        name: 'WetTailingsItem',
        isTag: false,
      })
      // Recipe: primary=ingot, secondaries=slag, tail, wet (all zero-share),
      // plus one non-zero secondary 'wool'.
      setupMultiProductRecipe({ productIds: ['ingot', 'slag', 'tail', 'wet', 'wool'] })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      const ingot = r.products.find((p) => p.itemOrTagId === 'ingot')!
      const slag = r.products.find((p) => p.itemOrTagId === 'slag')!
      const tail = r.products.find((p) => p.itemOrTagId === 'tail')!
      const wet = r.products.find((p) => p.itemOrTagId === 'wet')!
      const wool = r.products.find((p) => p.itemOrTagId === 'wool')!
      // Schema default config = 20. Only 'wool' counts as a non-zero
      // secondary, so it gets the full 20%; primary gets 80%; waste stays 0.
      expect(ingot.share).toBeCloseTo(0.8)
      expect(slag.share).toBe(0)
      expect(tail.share).toBe(0)
      expect(wet.share).toBe(0)
      expect(wool.share).toBeCloseTo(0.2)
    })

    it('keeps primary at 100% when every secondary is zero-share', () => {
      game.setRow('items', 'slag', { id: 'slag', datasetId: DS, name: 'SlagItem', isTag: false })
      setupMultiProductRecipe({ productIds: ['ingot', 'slag'] })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      const ingot = r.products.find((p) => p.itemOrTagId === 'ingot')!
      const slag = r.products.find((p) => p.itemOrTagId === 'slag')!
      expect(ingot.share).toBeCloseTo(1)
      expect(slag.share).toBe(0)
    })

    it('drops products the user has moved to Materials (isOverride=true, manual)', () => {
      setupMultiProductRecipe({ productIds: ['a', 'b'] })
      // 'a' is excluded — solver must not see it as a product of this recipe.
      build.setRow('userPrices', 'p-a', {
        id: 'p-a',
        buildId: BUILD,
        itemOrTagId: 'a',
        price: 7,
        isOverride: true,
        primaryItemId: '',
        priceMode: 'manual',
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      expect(r.products.map((p) => p.itemOrTagId)).toEqual(['b'])
      // Override is still routed into the overrides map so consumers price 'a'
      // at the user's number.
      expect(snap.overrides).toEqual({ a: 7 })
    })

    it('does not drop a reintegrated entry even when the same item is overridden', () => {
      setupMultiProductRecipe({
        productIds: ['ingot', 'scrap'],
        ingredientId: 'scrap',
      })
      // User excludes scrap from products. Its reintegrated product entry
      // still has to stay so the recipe's cost-credit accounting is correct.
      build.setRow('userPrices', 'p-scrap', {
        id: 'p-scrap',
        buildId: BUILD,
        itemOrTagId: 'scrap',
        price: 1,
        isOverride: true,
        primaryItemId: '',
        priceMode: 'manual',
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      const r = snap.recipes[0]
      const scrap = r.products.find((p) => p.itemOrTagId === 'scrap')
      expect(scrap).toBeDefined()
      expect(scrap!.isReintegrated).toBe(true)
    })

    it("does not drop a product when isOverride=true but priceMode isn't 'manual'", () => {
      setupMultiProductRecipe({ productIds: ['a', 'b'] })
      // Defensive: the toggle flag only counts as "moved to materials" when
      // priceMode='manual'. Mode mismatch means the row is in some other
      // transitional state — don't filter.
      build.setRow('userPrices', 'p-a', {
        id: 'p-a',
        buildId: BUILD,
        itemOrTagId: 'a',
        price: 7,
        isOverride: true,
        primaryItemId: '',
        priceMode: 'min',
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      expect(snap.recipes[0].products.map((p) => p.itemOrTagId).sort()).toEqual(['a', 'b'])
    })

    it("filters a single-product recipe's sole product to an empty array", () => {
      setupMultiProductRecipe({ productIds: ['a'] })
      build.setRow('userPrices', 'p-a', {
        id: 'p-a',
        buildId: BUILD,
        itemOrTagId: 'a',
        price: 3,
        isOverride: true,
        primaryItemId: '',
        priceMode: 'manual',
      })
      const snap = buildSolverSnapshot(game, build, BUILD, DS)!
      // Recipe is still emitted (its labor/craft costs still count if any
      // other recipe consumes its outputs in some other build), but no
      // candidate will be emitted by the solver since products is empty.
      expect(snap.recipes).toHaveLength(1)
      expect(snap.recipes[0].products).toEqual([])
    })
  })
})
