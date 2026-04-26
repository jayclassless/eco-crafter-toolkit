import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { createBuildOps } from '../use-build'

let buildStore: Store
let gameDataStore: Store

beforeEach(() => {
  buildStore = createBuildStore()
  gameDataStore = createGameDataStore()

  gameDataStore.setRow('skills', 'skill-self', {
    id: 'skill-self',
    datasetId: 'ds1',
    name: 'SelfImprovementSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('skills', 'skill-self-other', {
    id: 'skill-self-other',
    datasetId: 'ds2',
    name: 'SelfImprovementSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  // Recipes associated with the Self Improvement skill, so createBuild has
  // something to auto-add when it delegates to addSkill.
  gameDataStore.setRow('recipes', 'recipe-campfire', {
    id: 'recipe-campfire',
    datasetId: 'ds1',
    name: 'Campfire',
    familyName: 'Campfire',
    skillId: 'skill-self',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-hand',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipes', 'recipe-torch', {
    id: 'recipe-torch',
    datasetId: 'ds1',
    name: 'Torch',
    familyName: 'Torch',
    skillId: 'skill-self',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-hand',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
})

const ops = () => createBuildOps(buildStore, gameDataStore)

describe('createBuildOps', () => {
  describe('getBuilds', () => {
    it('returns only builds for the given dataset', () => {
      buildStore.setRow('builds', 'b1', { id: 'b1', datasetId: 'ds1', name: 'A', createdAt: 'x' })
      buildStore.setRow('builds', 'b2', { id: 'b2', datasetId: 'ds2', name: 'B', createdAt: 'x' })
      const result = ops().getBuilds('ds1')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('b1')
    })
  })

  describe('createBuild', () => {
    it('creates build, settings row, default margin, and self-improvement skill', () => {
      const id = ops().createBuild('ds1', 'My Build')
      expect(buildStore.getCell('builds', id, 'name')).toBe('My Build')

      const settings = buildStore
        .getRowIds('userSettings')
        .map((rid) => buildStore.getRow('userSettings', rid))
        .filter((r) => r.buildId === id)
      expect(settings).toHaveLength(1)
      expect(settings[0].marginType).toBe('markup')

      const margins = buildStore
        .getRowIds('userMargins')
        .map((rid) => buildStore.getRow('userMargins', rid))
        .filter((r) => r.buildId === id)
      expect(margins).toHaveLength(1)
      expect(margins[0].isDefault).toBe(true)

      const skills = buildStore
        .getRowIds('userSkills')
        .map((rid) => buildStore.getRow('userSkills', rid))
        .filter((r) => r.buildId === id)
      expect(skills).toHaveLength(1)
      expect(skills[0].skillId).toBe('skill-self')
    })

    it('does not auto-add a skill from a different dataset', () => {
      const id = ops().createBuild('ds3', 'X')
      const skills = buildStore
        .getRowIds('userSkills')
        .map((rid) => buildStore.getRow('userSkills', rid))
        .filter((r) => r.buildId === id)
      expect(skills).toHaveLength(0)
    })

    it('auto-adds the self-improvement skill recipes (and their crafting tables)', () => {
      const id = ops().createBuild('ds1', 'My Build')

      const recipes = buildStore
        .getRowIds('userRecipes')
        .map((rid) => buildStore.getRow('userRecipes', rid))
        .filter((r) => r.buildId === id)
      const recipeIds = recipes.map((r) => r.recipeId).sort()
      expect(recipeIds).toEqual(['recipe-campfire', 'recipe-torch'])

      // Each new recipe should be linked to the build's default margin.
      const margins = buildStore
        .getRowIds('userRecipeMargins')
        .map((rid) => buildStore.getRow('userRecipeMargins', rid))
        .filter((r) => r.buildId === id)
      expect(margins).toHaveLength(2)

      // The recipes' crafting table should have been auto-added too.
      const tables = buildStore
        .getRowIds('userCraftingTables')
        .map((rid) => buildStore.getRow('userCraftingTables', rid))
        .filter((r) => r.buildId === id)
      expect(tables).toHaveLength(1)
      expect(tables[0].craftingTableId).toBe('ct-hand')
    })
  })

  describe('deleteBuild', () => {
    it('cascades deletes across all build-scoped tables and hidden-skill rows', () => {
      const id = ops().createBuild('ds1', 'X')
      buildStore.setRow('userRecipes', 'ur1', {
        id: 'ur1',
        buildId: id,
        recipeId: 'r1',
        roundFactor: 0,
      })
      buildStore.setRow('userPrices', 'up1', {
        id: 'up1',
        buildId: id,
        itemOrTagId: 'i1',
        price: 1,
        isOverride: false,
        primaryItemId: '',
      })
      buildStore.setRow('hiddenSkills', 'csg1', { buildId: id, skillName: 'X' })
      buildStore.setRow('hiddenSkills', 'csg2', { buildId: 'other', skillName: 'Y' })

      // Foreign-build rows in scoped tables must be left alone
      buildStore.setRow('userRecipes', 'ur-foreign', {
        id: 'ur-foreign',
        buildId: 'other-build',
        recipeId: 'rx',
        roundFactor: 0,
      })

      ops().deleteBuild(id)

      expect(buildStore.getRow('userRecipes', 'ur-foreign').buildId).toBe('other-build')
      expect(buildStore.getRow('builds', id)).toEqual({})
      expect(
        buildStore
          .getRowIds('userRecipes')
          .filter((r) => buildStore.getCell('userRecipes', r, 'buildId') === id)
      ).toHaveLength(0)
      expect(
        buildStore
          .getRowIds('userPrices')
          .filter((r) => buildStore.getCell('userPrices', r, 'buildId') === id)
      ).toHaveLength(0)
      expect(
        buildStore
          .getRowIds('userMargins')
          .filter((r) => buildStore.getCell('userMargins', r, 'buildId') === id)
      ).toHaveLength(0)
      expect(
        buildStore
          .getRowIds('userSettings')
          .filter((r) => buildStore.getCell('userSettings', r, 'buildId') === id)
      ).toHaveLength(0)
      expect(buildStore.getRowIds('hiddenSkills')).toEqual(['csg2'])
    })
  })

  describe('cloneBuild', () => {
    it('returns null when the source build does not exist', () => {
      expect(ops().cloneBuild('nonexistent')).toBeNull()
    })

    it('preserves datasetId and suffixes name with " (Copy)"', () => {
      const sourceId = ops().createBuild('ds1', 'Original')
      const newId = ops().cloneBuild(sourceId)

      expect(newId).not.toBeNull()
      expect(newId).not.toBe(sourceId)
      expect(buildStore.getCell('builds', newId!, 'datasetId')).toBe('ds1')
      expect(buildStore.getCell('builds', newId!, 'name')).toBe('Original (Copy)')
    })

    it('duplicates every per-build row under the new buildId and leaves source untouched', () => {
      const sourceId = ops().createBuild('ds1', 'Source')

      // Add custom rows across several per-build tables to verify they all copy.
      buildStore.setRow('userPrices', 'up1', {
        id: 'up1',
        buildId: sourceId,
        itemOrTagId: 'item-x',
        price: 42,
        isOverride: true,
      })
      buildStore.setRow('hiddenCraftingTables', 'hct1', {
        buildId: sourceId,
        craftingTableId: 'ct-anvil',
      })
      buildStore.setRow('hiddenTags', 'ht1', {
        buildId: sourceId,
        tagId: 'tag-foo',
      })

      // A foreign-build row in the same tables must not be copied.
      buildStore.setRow('userPrices', 'up-foreign', {
        id: 'up-foreign',
        buildId: 'other-build',
        itemOrTagId: 'item-y',
        price: 99,
        isOverride: false,
      })

      const sourceRecipeCount = buildStore
        .getRowIds('userRecipes')
        .filter((r) => buildStore.getCell('userRecipes', r, 'buildId') === sourceId).length

      const newId = ops().cloneBuild(sourceId)!

      // Source rows untouched
      expect(buildStore.getCell('builds', sourceId, 'name')).toBe('Source')
      expect(buildStore.getCell('userPrices', 'up1', 'buildId')).toBe(sourceId)
      expect(buildStore.getCell('userPrices', 'up-foreign', 'buildId')).toBe('other-build')

      // Cloned rows present in each table we wrote to, and recipe count matches.
      const clonedRecipeCount = buildStore
        .getRowIds('userRecipes')
        .filter((r) => buildStore.getCell('userRecipes', r, 'buildId') === newId).length
      expect(clonedRecipeCount).toBe(sourceRecipeCount)

      const clonedPrice = buildStore
        .getRowIds('userPrices')
        .map((r) => buildStore.getRow('userPrices', r))
        .find((r) => r.buildId === newId)
      expect(clonedPrice?.itemOrTagId).toBe('item-x')
      expect(clonedPrice?.price).toBe(42)

      const clonedHiddenCt = buildStore
        .getRowIds('hiddenCraftingTables')
        .filter((r) => buildStore.getCell('hiddenCraftingTables', r, 'buildId') === newId)
      expect(clonedHiddenCt).toHaveLength(1)

      const clonedHiddenTag = buildStore
        .getRowIds('hiddenTags')
        .filter((r) => buildStore.getCell('hiddenTags', r, 'buildId') === newId)
      expect(clonedHiddenTag).toHaveLength(1)

      // Default margin is duplicated (createBuild creates one) and remains marked default.
      const clonedMargins = buildStore
        .getRowIds('userMargins')
        .map((r) => buildStore.getRow('userMargins', r))
        .filter((r) => r.buildId === newId)
      expect(clonedMargins).toHaveLength(1)
      expect(clonedMargins[0].isDefault).toBe(true)
    })

    it('skips computedPrices to avoid copying a stale solver cache', () => {
      const sourceId = ops().createBuild('ds1', 'Source')
      buildStore.setRow('computedPrices', 'cp1', {
        id: 'cp1',
        buildId: sourceId,
        itemOrTagId: 'item-x',
        costPrice: 1,
        salePrice: 2,
        recipeId: 'recipe-x',
      })

      const newId = ops().cloneBuild(sourceId)!

      const clonedComputed = buildStore
        .getRowIds('computedPrices')
        .filter((r) => buildStore.getCell('computedPrices', r, 'buildId') === newId)
      expect(clonedComputed).toHaveLength(0)
    })
  })
})
