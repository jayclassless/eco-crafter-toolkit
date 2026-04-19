import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { createSkillManagement } from '../use-skill-management'

const BUILD_ID = 'build1'
const DATASET_ID = 'ds1'
const OTHER_DATASET_ID = 'ds2'

let buildStore: Store
let gameDataStore: Store

type Row = Record<string, unknown> & { id: string }

function rowsForBuild(store: Store, table: string): Row[] {
  return store
    .getRowIds(table)
    .map((id): Row => ({ id, ...(store.getRow(table, id) as Record<string, unknown>) }))
    .filter((r) => r.buildId === BUILD_ID)
}

function setupGameData() {
  // Skills
  gameDataStore.setRow('skills', 'skill-mining', {
    id: 'skill-mining',
    datasetId: DATASET_ID,
    name: 'MiningSkill',
    profession: 'MiningProfession',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('skills', 'skill-other-dataset', {
    id: 'skill-other-dataset',
    datasetId: OTHER_DATASET_ID,
    name: 'OtherSkill',
    profession: 'Other',
    maxLevel: 7,
    laborReducePercent: '[]',
  })

  // Talents (two at level 3 in the same skill — sibling rule)
  gameDataStore.setRow('talents', 'talent-3a', {
    id: 'talent-3a',
    datasetId: DATASET_ID,
    skillId: 'skill-mining',
    name: 'MiningA',
    talentGroupName: 'GroupA',
    value: 1,
    level: 3,
    isLevelable: false,
    maxTalentLevel: 0,
  })
  gameDataStore.setRow('talents', 'talent-3b', {
    id: 'talent-3b',
    datasetId: DATASET_ID,
    skillId: 'skill-mining',
    name: 'MiningB',
    talentGroupName: 'GroupB',
    value: 1,
    level: 3,
    isLevelable: false,
    maxTalentLevel: 0,
  })
  gameDataStore.setRow('talents', 'talent-5', {
    id: 'talent-5',
    datasetId: DATASET_ID,
    skillId: 'skill-mining',
    name: 'MiningC',
    talentGroupName: 'GroupC',
    value: 1,
    level: 5,
    isLevelable: false,
    maxTalentLevel: 0,
  })
  // Levelable talent at level 3 (shares the sibling-level with talent-3a/3b).
  gameDataStore.setRow('talents', 'talent-lev', {
    id: 'talent-lev',
    datasetId: DATASET_ID,
    skillId: 'skill-mining',
    name: 'MiningLev',
    talentGroupName: 'GroupLev',
    value: 1,
    level: 3,
    isLevelable: true,
    maxTalentLevel: 5,
  })

  // Recipes — two for mining (one in another dataset to confirm filtering)
  gameDataStore.setRow('recipes', 'recipe-iron', {
    id: 'recipe-iron',
    datasetId: DATASET_ID,
    name: 'IronOre',
    familyName: 'IronOre',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipes', 'recipe-copper', {
    id: 'recipe-copper',
    datasetId: DATASET_ID,
    name: 'CopperOre',
    familyName: 'CopperOre',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  gameDataStore.setRow('recipes', 'recipe-other', {
    id: 'recipe-other',
    datasetId: OTHER_DATASET_ID,
    name: 'Other',
    familyName: 'Other',
    skillId: 'skill-mining',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
}

function setupBuild() {
  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: DATASET_ID,
    name: 'Test',
    createdAt: 'now',
  })
  buildStore.setRow('userMargins', 'margin-default', {
    id: 'margin-default',
    buildId: BUILD_ID,
    name: 'Default',
    percent: 15,
    isDefault: true,
  })
}

beforeEach(() => {
  buildStore = createBuildStore()
  gameDataStore = createGameDataStore()
  setupGameData()
  setupBuild()
})

function mgmt() {
  return createSkillManagement(buildStore, gameDataStore, BUILD_ID, DATASET_ID)
}

describe('createSkillManagement', () => {
  describe('addSkill', () => {
    it('creates a userSkill at level 1', () => {
      mgmt().addSkill('skill-mining')
      const skills = rowsForBuild(buildStore, 'userSkills')
      expect(skills).toHaveLength(1)
      expect(skills[0].skillId).toBe('skill-mining')
      expect(skills[0].level).toBe(1)
    })

    it('auto-adds recipes for the skill in the current dataset only', () => {
      mgmt().addSkill('skill-mining')
      const recipes = rowsForBuild(buildStore, 'userRecipes')
      const recipeIds = recipes.map((r) => r.recipeId).sort()
      expect(recipeIds).toEqual(['recipe-copper', 'recipe-iron'])
    })

    it('auto-links each new recipe to the default margin', () => {
      mgmt().addSkill('skill-mining')
      const links = rowsForBuild(buildStore, 'userRecipeMargins')
      expect(links).toHaveLength(2)
      expect(links.every((l) => l.userMarginId === 'margin-default')).toBe(true)
    })

    it('ignores default margins from other builds when linking new recipes', () => {
      buildStore.setRow('userMargins', 'm-foreign-default', {
        id: 'm-foreign-default',
        buildId: 'other-build',
        name: 'Foreign',
        percent: 5,
        isDefault: true,
      })
      mgmt().addSkill('skill-mining')
      const links = rowsForBuild(buildStore, 'userRecipeMargins')
      // Both new recipes link to the in-build default, none to the foreign one
      expect(links).toHaveLength(2)
      expect(links.every((l) => l.userMarginId === 'margin-default')).toBe(true)
    })

    it('still adds recipes when no default margin exists (no margin links created)', () => {
      buildStore.delRow('userMargins', 'margin-default')
      mgmt().addSkill('skill-mining')
      expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(2)
      expect(rowsForBuild(buildStore, 'userRecipeMargins')).toHaveLength(0)
    })

    it('ignores foreign-build userRecipes when computing duplicates', () => {
      // A foreign-build userRecipe with the same recipeId must NOT block adding it here
      buildStore.setRow('userRecipes', 'ur-foreign-iron', {
        id: 'ur-foreign-iron',
        buildId: 'other-build',
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      mgmt().addSkill('skill-mining')
      const ourRecipeIds = rowsForBuild(buildStore, 'userRecipes')
        .map((r) => r.recipeId)
        .sort()
      expect(ourRecipeIds).toEqual(['recipe-copper', 'recipe-iron'])
    })

    it('does not add duplicate recipes when one already exists', () => {
      buildStore.setRow('userRecipes', 'ur-pre', {
        id: 'ur-pre',
        buildId: BUILD_ID,
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      mgmt().addSkill('skill-mining')
      const recipeIds = rowsForBuild(buildStore, 'userRecipes')
        .map((r) => r.recipeId)
        .sort()
      expect(recipeIds).toEqual(['recipe-copper', 'recipe-iron'])
    })

    it('auto-adds the crafting tables used by the new recipes', () => {
      mgmt().addSkill('skill-mining')
      const tables = rowsForBuild(buildStore, 'userCraftingTables')
      // Both recipes use ct1 — exactly one user crafting table row.
      expect(tables).toHaveLength(1)
      expect(tables[0].craftingTableId).toBe('ct1')
      expect(tables[0].pluginModuleId).toBe('')
      expect(tables[0].costPerMinute).toBe(0)
    })

    it('auto-adds multiple distinct crafting tables when recipes span tables', () => {
      gameDataStore.setCell('recipes', 'recipe-copper', 'craftingTableId', 'ct2')
      mgmt().addSkill('skill-mining')
      const ctIds = rowsForBuild(buildStore, 'userCraftingTables')
        .map((r) => r.craftingTableId)
        .sort()
      expect(ctIds).toEqual(['ct1', 'ct2'])
    })

    it('does not duplicate or overwrite an existing user crafting table', () => {
      buildStore.setRow('userCraftingTables', 'uct-existing', {
        id: 'uct-existing',
        buildId: BUILD_ID,
        craftingTableId: 'ct1',
        pluginModuleId: 'pm-upgrade',
        costPerMinute: 2.5,
      })
      mgmt().addSkill('skill-mining')
      const tables = rowsForBuild(buildStore, 'userCraftingTables')
      expect(tables).toHaveLength(1)
      expect(tables[0].id).toBe('uct-existing')
      expect(tables[0].pluginModuleId).toBe('pm-upgrade')
      expect(tables[0].costPerMinute).toBe(2.5)
    })

    it('does not count foreign-build user crafting tables as existing', () => {
      buildStore.setRow('userCraftingTables', 'uct-foreign', {
        id: 'uct-foreign',
        buildId: 'other-build',
        craftingTableId: 'ct1',
        pluginModuleId: '',
        costPerMinute: 0,
      })
      mgmt().addSkill('skill-mining')
      const ourTables = rowsForBuild(buildStore, 'userCraftingTables')
      expect(ourTables).toHaveLength(1)
      expect(ourTables[0].craftingTableId).toBe('ct1')
    })
  })

  describe('removeSkill', () => {
    beforeEach(() => {
      mgmt().addSkill('skill-mining')
      // Enable a talent for the skill
      buildStore.setRow('userTalents', 'ut1', {
        id: 'ut1',
        buildId: BUILD_ID,
        talentId: 'talent-3a',
        enabled: true,
      })
      // Add a collapsed-group entry that should be cleaned
      buildStore.setRow('hiddenSkills', 'csg1', {
        buildId: BUILD_ID,
        skillId: 'skill-mining',
      })
      // And entries that must NOT be cleaned (different build / different skill)
      buildStore.setRow('hiddenSkills', 'csg-other-build', {
        buildId: 'other-build',
        skillId: 'skill-mining',
      })
      buildStore.setRow('hiddenSkills', 'csg-other-skill', {
        buildId: BUILD_ID,
        skillId: 'skill-logging',
      })
    })

    it('removes the userSkill, its recipes, recipe-margin links, and talents', () => {
      const userSkillId = rowsForBuild(buildStore, 'userSkills')[0].id
      mgmt().removeSkill(userSkillId, 'skill-mining')

      expect(rowsForBuild(buildStore, 'userSkills')).toHaveLength(0)
      expect(rowsForBuild(buildStore, 'userRecipes')).toHaveLength(0)
      expect(rowsForBuild(buildStore, 'userRecipeMargins')).toHaveLength(0)
      expect(rowsForBuild(buildStore, 'userTalents')).toHaveLength(0)
    })

    it('leaves foreign-build talents and recipes alone', () => {
      const userSkillId = rowsForBuild(buildStore, 'userSkills')[0].id
      // Add a talent / recipe / urm in another build that should remain
      buildStore.setRow('userTalents', 'ut-foreign', {
        id: 'ut-foreign',
        buildId: 'other-build',
        talentId: 'talent-3a',
        enabled: true,
      })
      buildStore.setRow('userRecipes', 'ur-foreign', {
        id: 'ur-foreign',
        buildId: 'other-build',
        recipeId: 'recipe-iron',
        roundFactor: 0,
      })
      buildStore.setRow('userRecipeMargins', 'urm-foreign', {
        id: 'urm-foreign',
        buildId: 'other-build',
        userRecipeId: 'ur-foreign',
        userMarginId: 'margin-default',
      })
      // Also: a same-build user talent NOT for this skill should be left alone
      gameDataStore.setRow('talents', 'talent-other-skill', {
        id: 'talent-other-skill',
        datasetId: DATASET_ID,
        skillId: 'some-other-skill',
        name: 'X',
        talentGroupName: 'g',
        value: 1,
        level: 1,
      })
      buildStore.setRow('userTalents', 'ut-other-skill', {
        id: 'ut-other-skill',
        buildId: BUILD_ID,
        talentId: 'talent-other-skill',
        enabled: true,
      })

      mgmt().removeSkill(userSkillId, 'skill-mining')

      expect(buildStore.getRow('userTalents', 'ut-foreign').buildId).toBe('other-build')
      expect(buildStore.getRow('userRecipes', 'ur-foreign').buildId).toBe('other-build')
      expect(buildStore.getRow('userRecipeMargins', 'urm-foreign').buildId).toBe('other-build')
      expect(buildStore.getRow('userTalents', 'ut-other-skill').enabled).toBe(true)
    })

    it('removes the matching hidden-skill entry but leaves others', () => {
      const userSkillId = rowsForBuild(buildStore, 'userSkills')[0].id
      mgmt().removeSkill(userSkillId, 'skill-mining')
      const remainingIds = buildStore.getRowIds('hiddenSkills').sort()
      expect(remainingIds).toEqual(['csg-other-build', 'csg-other-skill'])
    })
  })

  describe('setSkillLevel', () => {
    it('updates the level and disables talents above the new level', () => {
      mgmt().addSkill('skill-mining')
      const userSkillId = rowsForBuild(buildStore, 'userSkills')[0].id

      // Pretend the user enabled level-5 talent at higher skill
      buildStore.setCell('userSkills', userSkillId, 'level', 5)
      buildStore.setRow('userTalents', 'ut-5', {
        id: 'ut-5',
        buildId: BUILD_ID,
        talentId: 'talent-5',
        enabled: true,
      })
      buildStore.setRow('userTalents', 'ut-3', {
        id: 'ut-3',
        buildId: BUILD_ID,
        talentId: 'talent-3a',
        enabled: true,
      })

      mgmt().setSkillLevel(userSkillId, 3)

      expect(buildStore.getCell('userSkills', userSkillId, 'level')).toBe(3)
      expect(buildStore.getCell('userTalents', 'ut-5', 'enabled')).toBe(false)
      // talent at level 3 stays enabled
      expect(buildStore.getCell('userTalents', 'ut-3', 'enabled')).toBe(true)
    })
  })

  describe('toggleTalent', () => {
    it("enables a talent (creating the row if it doesn't exist)", () => {
      mgmt().toggleTalent('talent-3a', '', true)
      const talents = rowsForBuild(buildStore, 'userTalents')
      expect(talents).toHaveLength(1)
      expect(talents[0].talentId).toBe('talent-3a')
      expect(talents[0].enabled).toBe(true)
    })

    it('enforces one-talent-per-level: enabling a talent disables siblings', () => {
      buildStore.setRow('userTalents', 'ut-a', {
        id: 'ut-a',
        buildId: BUILD_ID,
        talentId: 'talent-3a',
        enabled: true,
      })
      mgmt().toggleTalent('talent-3b', '', true)

      expect(buildStore.getCell('userTalents', 'ut-a', 'enabled')).toBe(false)
      const enabled = rowsForBuild(buildStore, 'userTalents').filter((t) => t.enabled)
      expect(enabled).toHaveLength(1)
      expect(enabled[0].talentId).toBe('talent-3b')
    })

    it('ignores foreign-build talents when enforcing the sibling rule', () => {
      // A foreign-build talent at the same level should not be touched
      buildStore.setRow('userTalents', 'ut-foreign-3a', {
        id: 'ut-foreign-3a',
        buildId: 'other-build',
        talentId: 'talent-3a',
        enabled: true,
      })
      // A same-build but already-disabled sibling — should not be touched either
      buildStore.setRow('userTalents', 'ut-3a-off', {
        id: 'ut-3a-off',
        buildId: BUILD_ID,
        talentId: 'talent-3a',
        enabled: false,
      })
      mgmt().toggleTalent('talent-3b', '', true)
      expect(buildStore.getCell('userTalents', 'ut-foreign-3a', 'enabled')).toBe(true)
      expect(buildStore.getCell('userTalents', 'ut-3a-off', 'enabled')).toBe(false)
    })

    it('disabling does not affect siblings', () => {
      buildStore.setRow('userTalents', 'ut-a', {
        id: 'ut-a',
        buildId: BUILD_ID,
        talentId: 'talent-3a',
        enabled: true,
      })
      buildStore.setRow('userTalents', 'ut-b', {
        id: 'ut-b',
        buildId: BUILD_ID,
        talentId: 'talent-3b',
        enabled: false,
      })
      mgmt().toggleTalent('talent-3a', 'ut-a', false)
      expect(buildStore.getCell('userTalents', 'ut-a', 'enabled')).toBe(false)
      expect(buildStore.getCell('userTalents', 'ut-b', 'enabled')).toBe(false)
    })

    it('enabling a levelable talent defaults talentLevel to 1', () => {
      mgmt().toggleTalent('talent-lev', '', true)
      const [row] = rowsForBuild(buildStore, 'userTalents')
      expect(row.talentId).toBe('talent-lev')
      expect(row.enabled).toBe(true)
      expect(row.talentLevel).toBe(1)
    })

    it('disabling a levelable talent clears its talentLevel', () => {
      buildStore.setRow('userTalents', 'ut-lev', {
        id: 'ut-lev',
        buildId: BUILD_ID,
        talentId: 'talent-lev',
        enabled: true,
        talentLevel: 3,
      })
      mgmt().toggleTalent('talent-lev', 'ut-lev', false)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'enabled')).toBe(false)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'talentLevel')).toBe(0)
    })
  })

  describe('setTalentLevel', () => {
    it('creates an enabled userTalent at the chosen level when none exists', () => {
      mgmt().setTalentLevel('talent-lev', '', 3)
      const [row] = rowsForBuild(buildStore, 'userTalents')
      expect(row.talentId).toBe('talent-lev')
      expect(row.enabled).toBe(true)
      expect(row.talentLevel).toBe(3)
    })

    it('updates the existing userTalent in place', () => {
      buildStore.setRow('userTalents', 'ut-lev', {
        id: 'ut-lev',
        buildId: BUILD_ID,
        talentId: 'talent-lev',
        enabled: true,
        talentLevel: 1,
      })
      mgmt().setTalentLevel('talent-lev', 'ut-lev', 4)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'talentLevel')).toBe(4)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'enabled')).toBe(true)
      expect(rowsForBuild(buildStore, 'userTalents')).toHaveLength(1)
    })

    it('clamps above the talent maxTalentLevel', () => {
      mgmt().setTalentLevel('talent-lev', '', 99)
      const [row] = rowsForBuild(buildStore, 'userTalents')
      // talent-lev maxTalentLevel is 5
      expect(row.talentLevel).toBe(5)
    })

    it('level 0 disables the talent and clears the level', () => {
      buildStore.setRow('userTalents', 'ut-lev', {
        id: 'ut-lev',
        buildId: BUILD_ID,
        talentId: 'talent-lev',
        enabled: true,
        talentLevel: 4,
      })
      mgmt().setTalentLevel('talent-lev', 'ut-lev', 0)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'enabled')).toBe(false)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'talentLevel')).toBe(0)
    })

    it('disables sibling talents at the same level when set to a positive value', () => {
      // talent-3a and talent-lev share level 3 — enabling one must disable the others.
      buildStore.setRow('userTalents', 'ut-a', {
        id: 'ut-a',
        buildId: BUILD_ID,
        talentId: 'talent-3a',
        enabled: true,
        talentLevel: 0,
      })
      mgmt().setTalentLevel('talent-lev', '', 2)
      expect(buildStore.getCell('userTalents', 'ut-a', 'enabled')).toBe(false)
      const enabled = rowsForBuild(buildStore, 'userTalents').filter((t) => t.enabled)
      expect(enabled).toHaveLength(1)
      expect(enabled[0].talentId).toBe('talent-lev')
      expect(enabled[0].talentLevel).toBe(2)
    })
  })

  describe('setSkillLevel with levelable talents', () => {
    it('resets talentLevel on levelable talents dropped above the new skill level', () => {
      mgmt().addSkill('skill-mining')
      const userSkillId = rowsForBuild(buildStore, 'userSkills')[0].id
      buildStore.setCell('userSkills', userSkillId, 'level', 5)
      buildStore.setRow('userTalents', 'ut-lev', {
        id: 'ut-lev',
        buildId: BUILD_ID,
        talentId: 'talent-lev',
        enabled: true,
        talentLevel: 4,
      })

      mgmt().setSkillLevel(userSkillId, 2)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'enabled')).toBe(false)
      expect(buildStore.getCell('userTalents', 'ut-lev', 'talentLevel')).toBe(0)
    })
  })
})
