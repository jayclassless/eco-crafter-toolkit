import type { DatasetJson } from '@/types/dataset-json'
import type {
  Skill,
  Talent,
  TalentBonus,
  Item,
  TagItem,
  CraftingTable,
  PluginModule,
  CraftingTablePluginModule,
  Recipe,
  RecipeElement,
  Modifier,
  LocalizedName,
} from '@/types/game-data'

import { generateId } from './ids'

// For a CappedMultiplicative bonus, returns the first level at which applying
// another factor of `value` reaches `cap`. v12-style fixed talents (value=0
// or value=1) and non-capped bonuses return 0.
export function computeMaxTalentLevel(value: number, cap: number): number {
  if (value === 1 || value === 0 || cap === 0) return 0
  const increasing = value > 1
  for (let level = 1; level <= 20; level++) {
    const effective = Math.pow(value, level)
    if (increasing ? effective >= cap : effective <= cap) return level
  }
  return 20
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateDatasetJson(data: unknown): ValidationResult {
  const errors: string[] = []
  const d = data as Record<string, unknown>

  if (d.Version == null) errors.push('Missing required field: Version')
  if (!Array.isArray(d.Skills)) errors.push('Missing required field: Skills')
  if (!Array.isArray(d.Items)) errors.push('Missing required field: Items')
  if (!Array.isArray(d.Tags)) errors.push('Missing required field: Tags')
  if (!Array.isArray(d.Recipes)) errors.push('Missing required field: Recipes')

  if (errors.length > 0) return { valid: false, errors }

  const typed = data as DatasetJson

  const skillNames = new Set(typed.Skills.map((s) => s.Name))
  const itemNames = new Set(typed.Items.map((i) => i.Name))
  const tagNames = new Set(typed.Tags.map((t) => t.Name))
  const craftingTableNames = new Set(
    typed.Items.filter((i) => i.IsCraftingTable).map((i) => i.Name)
  )
  const allItemOrTagNames = new Set([...itemNames, ...tagNames])

  for (const item of typed.Items) {
    if (!item.LocalizedName['en-US']) {
      errors.push(`Item "${item.Name}" missing en-US localized name`)
    }
  }
  for (const skill of typed.Skills) {
    if (!skill.LocalizedName['en-US']) {
      errors.push(`Skill "${skill.Name}" missing en-US localized name`)
    }
  }

  for (const recipe of typed.Recipes) {
    if (recipe.RequiredSkill && !skillNames.has(recipe.RequiredSkill)) {
      errors.push(`Recipe "${recipe.Name}" references non-existent skill "${recipe.RequiredSkill}"`)
    }
    if (!craftingTableNames.has(recipe.CraftingTable)) {
      errors.push(
        `Recipe "${recipe.Name}" references non-existent crafting table "${recipe.CraftingTable}"`
      )
    }
    for (const elem of [...recipe.Ingredients, ...recipe.Products]) {
      if (!allItemOrTagNames.has(elem.ItemOrTag)) {
        errors.push(`Recipe "${recipe.Name}" references non-existent item/tag "${elem.ItemOrTag}"`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export interface ParsedDataset {
  skills: Skill[]
  talents: Talent[]
  talentBonuses: TalentBonus[]
  items: Item[]
  tagItems: TagItem[]
  craftingTables: CraftingTable[]
  pluginModules: PluginModule[]
  craftingTablePluginModules: CraftingTablePluginModule[]
  recipes: Recipe[]
  recipeElements: RecipeElement[]
  modifiers: Modifier[]
  localizedNames: LocalizedName[]
}

export function parseDataset(data: DatasetJson, datasetId: string): ParsedDataset {
  const skills: Skill[] = []
  const talents: Talent[] = []
  const talentBonuses: TalentBonus[] = []
  const items: Item[] = []
  const tagItems: TagItem[] = []
  const craftingTables: CraftingTable[] = []
  const pluginModules: PluginModule[] = []
  const craftingTablePluginModules: CraftingTablePluginModule[] = []
  const recipes: Recipe[] = []
  const recipeElements: RecipeElement[] = []
  const modifiers: Modifier[] = []
  const localizedNames: LocalizedName[] = []

  const skillIdByName = new Map<string, string>()
  const itemIdByName = new Map<string, string>()
  const craftingTableIdByName = new Map<string, string>()

  // Parse skills and talents
  for (const s of data.Skills) {
    const skillId = generateId()
    skillIdByName.set(s.Name, skillId)
    skills.push({
      id: skillId,
      datasetId,
      name: s.Name,
      profession: s.Profession,
      maxLevel: s.MaxLevel,
      laborReducePercent: s.LaborReducePercent,
    })
    addLocalizedNames(localizedNames, 'skill', skillId, s.LocalizedName)

    for (const t of s.Talents) {
      const talentId = generateId()
      const bonuses = t.Bonuses ?? []
      let isLevelable = false
      let maxTalentLevel = 0
      for (const b of bonuses) {
        if (b.EffectType === 'CappedMultiplicative' && b.Cap !== undefined) {
          isLevelable = true
          const lvl = computeMaxTalentLevel(b.Value, b.Cap)
          // The talent's overall max level is the tightest cap across its
          // bonuses — further levels would produce no effect on that one.
          if (maxTalentLevel === 0 || lvl < maxTalentLevel) maxTalentLevel = lvl
        }
      }
      talents.push({
        id: talentId,
        datasetId,
        skillId,
        name: t.Name,
        talentGroupName: t.TalentGroupName,
        value: t.Value,
        level: t.Level,
        isLevelable,
        maxTalentLevel,
      })
      addLocalizedNames(localizedNames, 'talent', talentId, t.LocalizedName)

      for (let idx = 0; idx < bonuses.length; idx++) {
        const b = bonuses[idx]
        talentBonuses.push({
          id: generateId(),
          datasetId,
          talentId,
          bonusIndex: idx,
          action: b.Action,
          effectType: b.EffectType,
          value: b.Value,
          cap: b.Cap ?? 0,
          lowerIsBetter: b.LowerIsBetter ?? true,
        })
      }
    }
  }

  // Parse items (includes crafting tables and plugin modules)
  for (const i of data.Items) {
    const itemId = generateId()
    itemIdByName.set(i.Name, itemId)
    items.push({ id: itemId, datasetId, name: i.Name, isTag: false })
    addLocalizedNames(localizedNames, 'item', itemId, i.LocalizedName)

    if (i.IsCraftingTable) {
      const ctId = generateId()
      craftingTableIdByName.set(i.Name, ctId)
      craftingTables.push({ id: ctId, datasetId, name: i.Name })
      addLocalizedNames(localizedNames, 'craftingTable', ctId, i.LocalizedName)
    }

    if (i.IsPluginModule && i.PluginType && i.PluginModulePercent != null) {
      const pmId = generateId()
      pluginModules.push({
        id: pmId,
        datasetId,
        name: i.Name,
        pluginType: i.PluginType as PluginModule['pluginType'],
        percent: i.PluginModulePercent,
        skillId: i.PluginModuleSkill ? skillIdByName.get(i.PluginModuleSkill) : undefined,
        skillPercent: i.PluginModuleSkillPercent,
      })
      addLocalizedNames(localizedNames, 'pluginModule', pmId, i.LocalizedName)
    }
  }

  // Second pass: link plugin modules to crafting tables (many-to-many)
  const pmIdByName = new Map(pluginModules.map((pm) => [pm.name, pm.id]))
  for (const i of data.Items) {
    if (i.IsCraftingTable && i.CraftingTablePluginModules) {
      const ctId = craftingTableIdByName.get(i.Name)!
      for (const pmName of i.CraftingTablePluginModules) {
        const pmId = pmIdByName.get(pmName)
        if (pmId) {
          craftingTablePluginModules.push({
            id: generateId(),
            datasetId,
            craftingTableId: ctId,
            pluginModuleId: pmId,
          })
        }
      }
    }
  }

  // Parse tags
  for (const t of data.Tags) {
    const tagId = generateId()
    itemIdByName.set(t.Name, tagId)
    items.push({ id: tagId, datasetId, name: t.Name, isTag: true })
    addLocalizedNames(localizedNames, 'item', tagId, t.LocalizedName)

    for (const assocName of t.AssociatedItems) {
      const assocId = itemIdByName.get(assocName)
      if (assocId) {
        tagItems.push({ id: generateId(), datasetId, tagId, itemId: assocId })
      }
    }
  }

  // Parse recipes
  for (const r of data.Recipes) {
    const recipeId = generateId()
    const skillId = skillIdByName.get(r.RequiredSkill)
    const ctId = craftingTableIdByName.get(r.CraftingTable) ?? ''

    recipes.push({
      id: recipeId,
      datasetId,
      name: r.Name,
      familyName: r.FamilyName,
      skillId,
      requiredSkillLevel: r.RequiredSkillLevel,
      isBlueprint: r.IsBlueprint,
      isDefault: r.IsDefault,
      craftingTableId: ctId,
      baseCraftTime: r.CraftMinutes.BaseValue,
      baseLaborCost: r.Labor.BaseValue,
    })
    addLocalizedNames(localizedNames, 'recipe', recipeId, r.LocalizedName)

    for (const mod of r.CraftMinutes.Modifiers) {
      modifiers.push({
        id: generateId(),
        datasetId,
        targetType: 'craftMinutes',
        targetId: recipeId,
        dynamicType: mod.DynamicType,
        refName: mod.Item,
      })
    }

    for (const mod of r.Labor.Modifiers) {
      modifiers.push({
        id: generateId(),
        datasetId,
        targetType: 'labor',
        targetId: recipeId,
        dynamicType: mod.DynamicType,
        refName: mod.Item,
      })
    }

    let index = 0
    for (const elem of r.Ingredients) {
      const elemId = generateId()
      const itemOrTagId = itemIdByName.get(elem.ItemOrTag) ?? ''
      recipeElements.push({
        id: elemId,
        datasetId,
        recipeId,
        itemOrTagId,
        baseQuantity: -elem.Quantity.BaseValue,
        isProduct: false,
        index: index++,
      })
      for (const mod of elem.Quantity.Modifiers) {
        modifiers.push({
          id: generateId(),
          datasetId,
          targetType: 'elementQuantity',
          targetId: elemId,
          dynamicType: mod.DynamicType,
          refName: mod.Item,
        })
      }
    }

    for (const elem of r.Products) {
      const elemId = generateId()
      const itemOrTagId = itemIdByName.get(elem.ItemOrTag) ?? ''
      recipeElements.push({
        id: elemId,
        datasetId,
        recipeId,
        itemOrTagId,
        baseQuantity: elem.Quantity.BaseValue,
        isProduct: true,
        index: index++,
      })
      for (const mod of elem.Quantity.Modifiers) {
        modifiers.push({
          id: generateId(),
          datasetId,
          targetType: 'elementQuantity',
          targetId: elemId,
          dynamicType: mod.DynamicType,
          refName: mod.Item,
        })
      }
    }
  }

  return {
    skills,
    talents,
    talentBonuses,
    items,
    tagItems,
    craftingTables,
    pluginModules,
    craftingTablePluginModules,
    recipes,
    recipeElements,
    modifiers,
    localizedNames,
  }
}

function addLocalizedNames(
  names: LocalizedName[],
  entityType: string,
  entityId: string,
  localized: Record<string, string>
): void {
  for (const [locale, name] of Object.entries(localized)) {
    if (name) {
      names.push({ id: generateId(), entityType, entityId, locale, name })
    }
  }
}
