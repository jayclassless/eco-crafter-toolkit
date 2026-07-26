import { describe, it, expect } from 'vitest'

import type { DatasetJson } from '@/types/dataset-json'

import { validateDatasetJson, parseDataset, computeMaxTalentLevel } from '../import-dataset'

function makeMinimalDataset(): DatasetJson {
  return {
    Version: 1,
    Skills: [
      {
        Name: 'TestSkill',
        LocalizedName: { 'en-US': 'Test Skill' },
        MaxLevel: 7,
        LaborReducePercent: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
        Talents: [
          {
            Name: 'TestTalent',
            LocalizedName: { 'en-US': 'Test Talent' },
            TalentGroupName: 'TestGroup',
            Value: 0.85,
            Level: 3,
          },
        ],
      },
    ],
    Items: [
      { Name: 'WoodItem', LocalizedName: { 'en-US': 'Wood' } },
      { Name: 'PlankItem', LocalizedName: { 'en-US': 'Plank' } },
      {
        Name: 'BasicUpgradeItem',
        LocalizedName: { 'en-US': 'Basic Upgrade' },
        IsPluginModule: true,
        PluginType: 'Resource',
        PluginModulePercent: 0.9,
        PluginModuleSkill: 'TestSkill',
        PluginModuleSkillPercent: 0.8,
      },
      {
        Name: 'WorkbenchItem',
        LocalizedName: { 'en-US': 'Workbench' },
        IsCraftingTable: true,
        CraftingTablePluginModules: ['BasicUpgradeItem'],
      },
      {
        Name: 'CornItem',
        LocalizedName: { 'en-US': 'Corn' },
        MaturityAgeDays: 0.8,
        PostHarvestingGrowth: 0,
        PickableAtPercent: 0,
        PrimaryResourceMin: 1,
        PrimaryResourceMax: 3,
        SeedItem: 'CornSeedItem',
        PlantName: { 'en-US': 'Corn' },
      },
      { Name: 'CornSeedItem', LocalizedName: { 'en-US': 'Corn Seed' } },
      {
        Name: 'OakLogItem',
        LocalizedName: { 'en-US': 'Oak Log' },
        MaturityAgeDays: 7,
        PostHarvestingGrowth: 0,
        PickableAtPercent: 0,
        PlantName: { 'en-US': 'Oak' },
        IsTree: true,
      },
    ],
    Tags: [
      {
        Name: 'WoodTag',
        LocalizedName: { 'en-US': 'Wood' },
        AssociatedItems: ['WoodItem'],
      },
    ],
    Recipes: [
      {
        Name: 'PlankRecipe',
        LocalizedName: { 'en-US': 'Plank' },
        FamilyName: 'Plank',
        CraftMinutes: { BaseValue: 1.0, Modifiers: [] },
        RequiredSkill: 'TestSkill',
        RequiredSkillLevel: 1,
        IsBlueprint: false,
        IsDefault: true,
        Labor: {
          BaseValue: 100,
          Modifiers: [{ DynamicType: 'Skill', Item: 'TestSkill' }],
        },
        CraftingTable: 'WorkbenchItem',
        Ingredients: [
          {
            ItemOrTag: 'WoodTag',
            Quantity: { BaseValue: 4.0, Modifiers: [{ DynamicType: 'Module', Item: 'TestSkill' }] },
          },
        ],
        Products: [
          {
            ItemOrTag: 'PlankItem',
            Quantity: { BaseValue: 2.0, Modifiers: [] },
          },
        ],
      },
    ],
  }
}

describe('validateDatasetJson', () => {
  it('accepts a valid dataset', () => {
    const result = validateDatasetJson(makeMinimalDataset())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects missing Version', () => {
    const data = makeMinimalDataset()
    delete (data as unknown as Record<string, unknown>).Version
    const result = validateDatasetJson(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Version'))).toBe(true)
  })

  it('rejects missing Skills array', () => {
    const data = makeMinimalDataset()
    delete (data as unknown as Record<string, unknown>).Skills
    const result = validateDatasetJson(data)
    expect(result.valid).toBe(false)
  })

  it('rejects recipe referencing non-existent crafting table', () => {
    const data = makeMinimalDataset()
    data.Recipes[0].CraftingTable = 'NonExistentTable'
    const result = validateDatasetJson(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('NonExistentTable'))).toBe(true)
  })

  it('rejects recipe referencing non-existent skill', () => {
    const data = makeMinimalDataset()
    data.Recipes[0].RequiredSkill = 'NonExistentSkill'
    const result = validateDatasetJson(data)
    expect(result.valid).toBe(false)
  })

  it('rejects item missing en-US localized name', () => {
    const data = makeMinimalDataset()
    data.Items[0].LocalizedName = { fr: 'Bois' }
    const result = validateDatasetJson(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('en-US'))).toBe(true)
  })
})

describe('parseDataset', () => {
  it('parses a valid dataset into normalized entities', () => {
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].name).toBe('TestSkill')
    expect(result.skills[0].maxLevel).toBe(7)
    expect(result.skills[0].datasetId).toBe('test-dataset')

    expect(result.talents).toHaveLength(1)
    expect(result.talents[0].value).toBe(0.85)
    expect(result.talents[0].skillId).toBe(result.skills[0].id)

    expect(result.items.length).toBeGreaterThanOrEqual(4)
    expect(result.tagItems).toHaveLength(1)

    expect(result.craftingTables).toHaveLength(1)
    expect(result.craftingTables[0].name).toBe('WorkbenchItem')

    expect(result.pluginModules).toHaveLength(1)
    expect(result.pluginModules[0].percent).toBe(0.9)
    expect(result.pluginModules[0].pluginType).toBe('Resource')

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes[0].baseLaborCost).toBe(100)
    expect(result.recipes[0].baseCraftTime).toBe(1.0)

    expect(result.recipeElements.length).toBeGreaterThanOrEqual(2)
    expect(result.modifiers.length).toBeGreaterThanOrEqual(2)

    expect(result.localizedNames.length).toBeGreaterThan(0)
  })

  it('defaults v12 talents (no Bonuses) to isLevelable=false with no TalentBonus rows', () => {
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')
    expect(result.talents[0].isLevelable).toBe(false)
    expect(result.talents[0].maxTalentLevel).toBe(0)
    expect(result.talentBonuses).toHaveLength(0)
  })

  it('merges crop growth fields onto the harvested item and resolves the seed link', () => {
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')
    const corn = result.items.find((i) => i.name === 'CornItem')!
    const cornSeed = result.items.find((i) => i.name === 'CornSeedItem')!

    expect(corn.maturityAgeDays).toBe(0.8)
    expect(corn.postHarvestingGrowth).toBe(0)
    expect(corn.pickableAtPercent).toBe(0)
    expect(corn.primaryResourceMin).toBe(1)
    expect(corn.primaryResourceMax).toBe(3)
    expect(corn.seedItemId).toBe(cornSeed.id)
    expect(corn.isTree).toBe(false)
  })

  it('defaults the primary resource range to 0 for datasets that omit it', () => {
    // Datasets extracted before ranges were captured must import cleanly; the
    // crop-growth fallback keys on a non-positive max.
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')
    const oak = result.items.find((i) => i.name === 'OakLogItem')!
    expect(oak.maturityAgeDays).toBe(7)
    expect(oak.primaryResourceMin).toBe(0)
    expect(oak.primaryResourceMax).toBe(0)
  })

  it('records the in-world species name under the plant entity type', () => {
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')
    const oak = result.items.find((i) => i.name === 'OakLogItem')!
    const plantName = result.localizedNames.find(
      (n) => n.entityType === 'plant' && n.entityId === oak.id && n.locale === 'en-US'
    )
    expect(plantName?.name).toBe('Oak')
    expect(oak.isTree).toBe(true)
    expect(oak.maturityAgeDays).toBe(7)
  })

  it('records a talent description under the talentDescription entity type', () => {
    const data = makeMinimalDataset()
    data.Skills[0].Talents[0].LocalizedDescription = {
      'en-US': 'Increases the damage of related tools by 1.',
    }
    const result = parseDataset(data, 'test-dataset')
    const talent = result.talents.find((t) => t.name === 'TestTalent')!
    const desc = result.localizedNames.find(
      (n) =>
        n.entityType === 'talentDescription' && n.entityId === talent.id && n.locale === 'en-US'
    )
    expect(desc?.name).toBe('Increases the damage of related tools by 1.')
  })

  it('omits talentDescription entries for datasets without descriptions', () => {
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')
    expect(result.localizedNames.some((n) => n.entityType === 'talentDescription')).toBe(false)
  })

  it('leaves non-crop items without growth fields (back-compat)', () => {
    const result = parseDataset(makeMinimalDataset(), 'test-dataset')
    const wood = result.items.find((i) => i.name === 'WoodItem')!
    expect(wood.maturityAgeDays).toBeUndefined()
    expect(wood.seedItemId).toBeUndefined()
  })

  it('emits recipeUnlocks rows from Unlock-action bonuses, dropping unresolved recipe names', () => {
    const data = makeMinimalDataset()
    data.Skills[0].Talents.push({
      Name: 'UnlockTalent',
      LocalizedName: { 'en-US': 'Unlock' },
      TalentGroupName: 'UnlockGroup',
      Value: 0,
      Level: 6,
      Bonuses: [
        {
          Action: 'Unlock',
          EffectType: 'Override',
          Value: 1,
          Scope: { Recipes: ['PlankRecipe', 'GhostRecipe'] },
        },
      ],
    })
    const result = parseDataset(data, 'test-dataset')
    const plankId = result.recipes.find((r) => r.name === 'PlankRecipe')!.id
    const unlockTalent = result.talents.find((t) => t.name === 'UnlockTalent')!
    expect(result.recipeUnlocks).toHaveLength(1)
    expect(result.recipeUnlocks[0]).toMatchObject({
      datasetId: 'test-dataset',
      recipeId: plankId,
      talentId: unlockTalent.id,
    })
  })

  it('ingests v13 Bonuses, computes isLevelable/maxTalentLevel, and writes bonus rows', () => {
    const data = makeMinimalDataset()
    data.Skills[0].Talents.push({
      Name: 'LevelableTalent',
      LocalizedName: { 'en-US': 'Levelable' },
      TalentGroupName: 'Lg',
      Value: 1,
      Level: 5,
      Bonuses: [
        {
          Action: 'Reduce',
          EffectType: 'CappedMultiplicative',
          Value: 0.9,
          Cap: 0.5,
          LowerIsBetter: true,
          Scope: { Recipes: ['PlankRecipe'] },
        },
        {
          Action: 'Reduce',
          EffectType: 'Multiplicative',
          Value: 0.8,
          Scope: { Recipes: ['PlankRecipe'] },
        },
      ],
    })
    const result = parseDataset(data, 'test-dataset')
    const levelable = result.talents.find((t) => t.name === 'LevelableTalent')!
    expect(levelable.isLevelable).toBe(true)
    // 0.9^7 ≈ 0.478 — first level reaching cap 0.5
    expect(levelable.maxTalentLevel).toBe(7)
    const bonuses = result.talentBonuses.filter((b) => b.talentId === levelable.id)
    expect(bonuses).toHaveLength(2)
    expect(bonuses[0].effectType).toBe('CappedMultiplicative')
    expect(bonuses[0].cap).toBe(0.5)
    expect(bonuses[0].lowerIsBetter).toBe(true)
    expect(bonuses[1].effectType).toBe('Multiplicative')
    expect(bonuses[1].cap).toBe(0)
    expect(bonuses[1].bonusIndex).toBe(1)
  })
})

describe('computeMaxTalentLevel', () => {
  it('returns 0 for v12-style fixed talents (value=0 or 1)', () => {
    expect(computeMaxTalentLevel(1, 0.5)).toBe(0)
    expect(computeMaxTalentLevel(0, 0.5)).toBe(0)
  })

  it('returns 0 when cap is 0', () => {
    expect(computeMaxTalentLevel(0.9, 0)).toBe(0)
  })

  it('finds the first level reaching a decreasing cap', () => {
    // 0.9^6 ≈ 0.531, 0.9^7 ≈ 0.478
    expect(computeMaxTalentLevel(0.9, 0.5)).toBe(7)
    // 0.5^1 === 0.5 → level 1 already reaches cap
    expect(computeMaxTalentLevel(0.5, 0.5)).toBe(1)
  })

  it('finds the first level reaching an increasing cap', () => {
    // 1.1^8 ≈ 2.14 > 2
    expect(computeMaxTalentLevel(1.1, 2)).toBe(8)
  })

  it('clamps to 20 when the cap is never reached within the search window', () => {
    expect(computeMaxTalentLevel(0.9999, 0.5)).toBe(20)
  })
})
