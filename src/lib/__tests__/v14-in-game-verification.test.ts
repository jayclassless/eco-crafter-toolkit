import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, it, expect } from 'vitest'

import { createGameDataOps } from '@/hooks/use-game-data'
import { buildRecipeBuildState, buildRecipeIndexes } from '@/hooks/use-solver-snapshot'
import { getCompare } from '@/lib/collator'
import { parseDataset } from '@/lib/import-dataset'
import { resolveRecipeModifiers } from '@/lib/recipe-modifiers'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import type { DatasetJson } from '@/types/dataset-json'

/**
 * 🛑 THE ONLY TEST TIED TO OBSERVED IN-GAME BEHAVIOUR.
 *
 * Every other module test asserts against values read out of the game FILES.
 * This one asserts against numbers read off a live v14 server's crafting
 * tooltip, driven end-to-end through the real pipeline: the shipped
 * `eco-v14.json` -> parseDataset -> normalizeModuleBonuses -> the store ->
 * assembleSolverRecipe -> moduleFactor.
 *
 * Observed on a Carpentry Table with Basic + Advanced + Modern installed:
 *
 *   Icebox   10 HewnLog  -> 6.5      (additive x0.65, NOT multiplicative x0.6885)
 *            12 WoodBoard -> 7.8      (additive x0.65, NOT multiplicative x0.8262)
 *            2 min        -> ~30 s    (multiplicative x0.24375 = 29.25 s, tooltip rounds)
 *            60 cal       -> 45       (additive x0.75, NOT multiplicative x0.7695)
 *
 * If this fails, the app disagrees with the game. Do not adjust the expected
 * values to match new output.
 */
describe('v14 module effects match a live server', () => {
  it('reproduces the observed Icebox numbers', { timeout: 60_000 }, async () => {
    const data = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/eco-v14.json'), 'utf-8')
    ) as DatasetJson
    const game = createGameDataStore()
    const build = createBuildStore()
    const ds = await createGameDataOps(game).importDataset(parseDataset(data, 'x'), 'Eco v14')

    const idOf = (table: string, name: string) => {
      const id = game.getRowIds(table).find((r) => game.getCell(table, r, 'name') === name)
      expect(id, `${table} row named ${name}`).toBeDefined()
      return id!
    }

    const recipeId = idOf('recipes', 'IceboxRecipe')
    const ctId = game.getCell('recipes', recipeId, 'craftingTableId') as string

    build.setRow('builds', 'b1', { id: 'b1', datasetId: ds, name: 'B', createdAt: 'x' })
    build.setRow('userSettings', 's1', { id: 's1', buildId: 'b1', calorieCost: 0 })
    build.setRow('userRecipes', 'ur1', { id: 'ur1', buildId: 'b1', recipeId, roundFactor: 0 })
    build.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: 'b1',
      craftingTableId: ctId,
      basicModuleId: idOf('pluginModules', 'BasicUpgradeItem'),
      advancedModuleId: idOf('pluginModules', 'AdvancedUpgradeItem'),
      modernModuleId: idOf('pluginModules', 'ModernUpgradeItem'),
      costPerMinute: 0,
    })

    const mods = resolveRecipeModifiers(
      game,
      recipeId,
      'ur1',
      0,
      ds,
      buildRecipeIndexes(game),
      buildRecipeBuildState(build, 'b1'),
      () => '',
      getCompare('en-US')
    )!

    // Ingredient quantities are stored negative; both Icebox ingredients are
    // tag-form ("HewnLog", "WoodBoard").
    const byName = new Map<string, number>()
    for (const [reId, v] of mods.elementModifiedQuantities) {
      const itemId = game.getCell('recipeElements', reId, 'itemOrTagId') as string
      byName.set(game.getCell('items', itemId, 'name') as string, v)
    }

    expect(byName.get('HewnLog')).toBeCloseTo(-6.5, 9)
    expect(byName.get('WoodBoard')).toBeCloseTo(-7.8, 9)
    expect(mods.craftMultiplier * 2 * 60).toBeCloseTo(29.25, 9)
    expect(mods.laborMultiplier * 60).toBeCloseTo(45, 9)

    // The specialty module was NOT installed in the observed run, so these are
    // the three generic modules only. Guards against a fourth slot leaking in.
    expect(mods.bonuses.filter((b) => b.source === 'module')).toHaveLength(3)
  })

  it('does not discount static ingredients', () => {
    // Test 1 against the live server: static ingredients (declared
    // `IngredientElement(typeof(X), n, true)`) get no module discount. They
    // carry no `Module` modifier, which is what the gate keys on.
    const data = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/eco-v14.json'), 'utf-8')
    ) as DatasetJson
    const recipe = data.Recipes.find((r) => r.Name === 'BasicUpgradeRecipe')!
    // All four of its ingredients are static.
    for (const ing of recipe.Ingredients) {
      expect(ing.Quantity.Modifiers.some((m) => m.DynamicType === 'Module')).toBe(false)
    }
  })
})
