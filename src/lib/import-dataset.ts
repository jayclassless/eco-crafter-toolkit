import type { DatasetJson } from '@/types/dataset-json'
import type {
  Skill,
  Talent,
  TalentBonus,
  Item,
  ItemPart,
  TagItem,
  CraftingTable,
  PluginModule,
  PluginModuleBonus,
  CraftingTablePluginModule,
  ItemSalvage,
  RecipeGarbage,
  Recipe,
  RecipeElement,
  Modifier,
  RecipeUnlock,
  LocalizedName,
  GatheringTool,
  RoomCategory,
  RoomTier,
  TreeSpecies,
} from '@/types/game-data'

import { generateId } from './ids'
import { normalizeModuleBonuses } from './normalize-module-bonuses'

// The power grids a furnishing can draw from. Kept as a validation-time
// allowlist so a dataset naming a grid the app doesn't model fails loudly
// instead of that furnishing quietly bypassing the optimizer's power filter.
const HOUSING_POWER_TYPES = new Set(['Heat', 'Mechanical', 'Electric'])

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

interface ValidationResult {
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
    // v14 garbage. Absent on v11–v13, which have no garbage system.
    for (const g of recipe.GarbageOutputs ?? []) {
      if (!itemNames.has(g.ItemOrTag)) {
        errors.push(
          `Recipe "${recipe.Name}" garbage output references non-existent item "${g.ItemOrTag}"`
        )
      }
      if (!Number.isFinite(g.Quantity)) {
        errors.push(
          `Recipe "${recipe.Name}" garbage output "${g.ItemOrTag}" has non-numeric quantity`
        )
      }
    }
  }

  // ---- Plugin modules -------------------------------------------------------
  //
  // The validator previously checked NOTHING about modules, which is how the v14
  // rewrite shipped a silently no-op module set past it: every module parsed to
  // `{IsPluginModule: true, PluginModulePercent: 1}` — a 0% discount — and
  // validation passed. These checks are the structural backstop.
  for (const item of typed.Items) {
    if (!item.IsPluginModule) continue

    const isV14Shape = item.ModuleBonuses != null
    if (isV14Shape) {
      if (item.ModuleBonuses!.length === 0) {
        errors.push(`Plugin module "${item.Name}" has an empty ModuleBonuses list`)
      }
      for (const b of item.ModuleBonuses!) {
        if (!Number.isFinite(b.Value)) {
          errors.push(
            `Plugin module "${item.Name}" bonus (${b.Action}/${b.EffectType}) has non-numeric Value`
          )
        }
        for (const s of b.Scope.SkillTypes ?? []) {
          if (!skillNames.has(s)) {
            errors.push(`Plugin module "${item.Name}" bonus references non-existent skill "${s}"`)
          }
        }
      }
      // Deprecated tier-ladder modules legitimately carry no slot tag; anything
      // else without one means a slot kind we don't know how to render.
      if (!item.ModuleSlot && !item.IsDeprecated) {
        errors.push(`Plugin module "${item.Name}" has no ModuleSlot and is not deprecated`)
      }
    } else if (item.PluginModulePercent == null) {
      // Legacy shape must at least carry a percent, or it resolves to no effect.
      errors.push(
        `Plugin module "${item.Name}" has neither ModuleBonuses (v14) nor PluginModulePercent (v11–v13)`
      )
    }
  }

  for (const item of typed.Items) {
    for (const s of item.SalvageCost ?? []) {
      if (!itemNames.has(s.ItemOrTag)) {
        errors.push(
          `Item "${item.Name}" salvage cost references non-existent item "${s.ItemOrTag}"`
        )
      }
      if (!Number.isFinite(s.Quantity)) {
        errors.push(`Item "${item.Name}" salvage cost "${s.ItemOrTag}" has non-numeric quantity`)
      }
    }
  }

  // Gathering sections are optional (datasets extracted before gathering
  // support omit them), but when present every cross-reference must resolve —
  // a dangling one would silently drop the tool or species at import time.
  for (const tool of typed.GatheringTools ?? []) {
    if (!itemNames.has(tool.Name)) {
      errors.push(`Gathering tool "${tool.Name}" is not an item in this dataset`)
    }
    if (tool.CalorieSkill && !skillNames.has(tool.CalorieSkill)) {
      errors.push(
        `Gathering tool "${tool.Name}" references non-existent skill "${tool.CalorieSkill}"`
      )
    }
  }
  for (const species of typed.TreeSpecies ?? []) {
    if (!itemNames.has(species.LogItem)) {
      errors.push(
        `Tree species "${species.Name}" references non-existent log item "${species.LogItem}"`
      )
    }
  }

  // ---- Housing ----
  // Also optional. Categories reference each other (and are referenced by
  // items) *by name*, so these checks are what stands in for the referential
  // integrity that resolving to row ids would otherwise provide.
  const roomCategories = typed.RoomCategories ?? []
  const categoryNames = new Set<string>()
  for (const cat of roomCategories) {
    if (!cat.Name) {
      errors.push('Room category has an empty Name')
      continue
    }
    if (categoryNames.has(cat.Name)) {
      errors.push(`Duplicate room category "${cat.Name}"`)
    }
    categoryNames.add(cat.Name)
    // An empty color is expected and fine — the UI falls back to its default
    // text color. Only a malformed non-empty value is an error.
    if (cat.Color && !/^#[0-9A-Fa-f]{6}$/.test(cat.Color)) {
      errors.push(`Room category "${cat.Name}" has malformed color "${cat.Color}"`)
    }
  }
  for (const cat of roomCategories) {
    for (const supporting of cat.SupportingRoomCategoryNames ?? []) {
      if (!categoryNames.has(supporting)) {
        errors.push(
          `Room category "${cat.Name}" references non-existent supporting category "${supporting}"`
        )
      }
    }
    for (const primary of Object.keys(cat.MaxSupportPercentOfPrimaryPerCategory ?? {})) {
      if (!categoryNames.has(primary)) {
        errors.push(
          `Room category "${cat.Name}" has a support override for non-existent category "${primary}"`
        )
      }
    }
  }

  const tierValues = new Set<number>()
  for (const tier of typed.RoomTiers ?? []) {
    if (!Number.isInteger(tier.Tier)) {
      errors.push(`Room tier "${tier.Tier}" is not an integer`)
    } else if (tierValues.has(tier.Tier)) {
      errors.push(`Duplicate room tier ${tier.Tier}`)
    }
    tierValues.add(tier.Tier)
    if (!(tier.SoftCap < tier.HardCap)) {
      errors.push(`Room tier ${tier.Tier} has SoftCap ${tier.SoftCap} >= HardCap ${tier.HardCap}`)
    }
    // 0 or 1 collapses the soft-cap curve (no cap, or an instant one), so
    // neither can be a real value.
    if (!(tier.DiminishingReturnPercent > 0 && tier.DiminishingReturnPercent < 1)) {
      errors.push(
        `Room tier ${tier.Tier} has DiminishingReturnPercent ${tier.DiminishingReturnPercent} outside (0, 1)`
      )
    }
  }

  let housingItemCount = 0
  for (const item of typed.Items) {
    if (item.HousingCategory) {
      housingItemCount++
      if (roomCategories.length > 0 && !categoryNames.has(item.HousingCategory)) {
        errors.push(
          `Item "${item.Name}" references non-existent room category "${item.HousingCategory}"`
        )
      }
      for (const [field, value] of [
        ['HousingDiminishingReturnMultiplier', item.HousingDiminishingReturnMultiplier],
        [
          'HousingDiminishingMultiplierAcrossFullProperty',
          item.HousingDiminishingMultiplierAcrossFullProperty,
        ],
      ] as const) {
        // 0 is real (the plaques), 1 is "no penalty"; anything outside would
        // amplify rather than diminish.
        if (value != null && !(value >= 0 && value <= 1)) {
          errors.push(`Item "${item.Name}" has ${field} ${value} outside [0, 1]`)
        }
      }
      if (item.HousingBaseValue != null && !Number.isFinite(item.HousingBaseValue)) {
        errors.push(`Item "${item.Name}" has a non-finite HousingBaseValue`)
      }
      // An unrecognized grid would be dropped by the optimizer's power filter,
      // silently making the furnishing look freely available.
      if (item.HousingPowerType != null && !HOUSING_POWER_TYPES.has(item.HousingPowerType)) {
        errors.push(`Item "${item.Name}" has unknown HousingPowerType "${item.HousingPowerType}"`)
      }
      if (
        item.HousingPowerWatts != null &&
        (!Number.isFinite(item.HousingPowerWatts) || item.HousingPowerWatts < 0)
      ) {
        errors.push(`Item "${item.Name}" has an invalid HousingPowerWatts`)
      }
    }
    // Tiers outside 0-5 are clamped when looked up, so an out-of-range value
    // would silently resolve to the wrong caps rather than failing.
    if (
      item.BuildingBlockTier != null &&
      (!Number.isInteger(item.BuildingBlockTier) ||
        item.BuildingBlockTier < 0 ||
        item.BuildingBlockTier > 5)
    ) {
      errors.push(`Item "${item.Name}" has BuildingBlockTier ${item.BuildingBlockTier} outside 0-5`)
    }
  }
  // Catches a half-extracted dataset: furnishings present but the category
  // table missing would leave every row uncategorized and uncolored.
  if (housingItemCount > 0 && roomCategories.length === 0) {
    errors.push(`Dataset has ${housingItemCount} housing item(s) but no RoomCategories`)
  }

  return { valid: errors.length === 0, errors }
}

export interface ParsedDataset {
  skills: Skill[]
  talents: Talent[]
  talentBonuses: TalentBonus[]
  items: Item[]
  itemParts: ItemPart[]
  tagItems: TagItem[]
  craftingTables: CraftingTable[]
  pluginModules: PluginModule[]
  pluginModuleBonuses: PluginModuleBonus[]
  craftingTablePluginModules: CraftingTablePluginModule[]
  itemSalvage: ItemSalvage[]
  recipeGarbage: RecipeGarbage[]
  recipes: Recipe[]
  recipeElements: RecipeElement[]
  modifiers: Modifier[]
  recipeUnlocks: RecipeUnlock[]
  gatheringTools: GatheringTool[]
  treeSpecies: TreeSpecies[]
  roomCategories: RoomCategory[]
  roomTiers: RoomTier[]
  localizedNames: LocalizedName[]
}

export function parseDataset(data: DatasetJson, datasetId: string): ParsedDataset {
  const skills: Skill[] = []
  const talents: Talent[] = []
  const talentBonuses: TalentBonus[] = []
  const items: Item[] = []
  const itemParts: ItemPart[] = []
  const tagItems: TagItem[] = []
  const craftingTables: CraftingTable[] = []
  const pluginModules: PluginModule[] = []
  const pluginModuleBonuses: PluginModuleBonus[] = []
  const craftingTablePluginModules: CraftingTablePluginModule[] = []
  const itemSalvage: ItemSalvage[] = []
  const recipeGarbage: RecipeGarbage[] = []
  const recipes: Recipe[] = []
  const recipeElements: RecipeElement[] = []
  const modifiers: Modifier[] = []
  const recipeUnlocks: RecipeUnlock[] = []
  const gatheringTools: GatheringTool[] = []
  const treeSpecies: TreeSpecies[] = []
  const roomCategories: RoomCategory[] = []
  const roomTiers: RoomTier[] = []
  const localizedNames: LocalizedName[] = []

  const skillIdByName = new Map<string, string>()
  const talentIdByName = new Map<string, string>()
  const itemIdByName = new Map<string, string>()
  const craftingTableIdByName = new Map<string, string>()
  const recipeIdByName = new Map<string, string>()

  // Recipes aren't parsed until after talents, so Unlock bonuses get stashed
  // here and resolved to recipe ids once recipeIdByName is populated.
  const pendingUnlocks: { talentId: string; recipeNames: string[] }[] = []

  // Part requirements reference other items; stash them and resolve after the
  // full items list is in itemIdByName (parts are items, not tags).
  const pendingItemParts: { itemId: string; partName: string; quantity: number }[] = []

  // `SalvageCost` names the garbage item an item breaks down into; that item may
  // appear later in data.Items, so resolve after the loop. Empty on v11–v13.
  const pendingSalvage: { itemId: string; garbageName: string; quantity: number }[] = []

  // A crop's SeedItem references another item by name; resolve after the full
  // items list is in itemIdByName. Holds the crop Item object so we can set
  // its seedItemId in place.
  const pendingCropSeeds: { crop: Item; seedName: string }[] = []

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
      specialtyCost: s.SpecialtyCost ?? 1,
    })
    addLocalizedNames(localizedNames, 'skill', skillId, s.LocalizedName)

    for (const t of s.Talents) {
      const talentId = generateId()
      talentIdByName.set(t.Name, talentId)
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
      if (t.LocalizedDescription) {
        addLocalizedNames(localizedNames, 'talentDescription', talentId, t.LocalizedDescription)
      }

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
        if (b.Action === 'Unlock' && b.Scope?.Recipes && b.Scope.Recipes.length > 0) {
          pendingUnlocks.push({ talentId, recipeNames: b.Scope.Recipes })
        }
      }
    }
  }

  // Parse items (includes crafting tables and plugin modules)
  for (const i of data.Items) {
    const itemId = generateId()
    itemIdByName.set(i.Name, itemId)
    const item: Item = {
      id: itemId,
      datasetId,
      name: i.Name,
      isTag: false,
      isPart: i.IsPart ?? false,
    }
    // Crop growth data is only present on harvested crop items.
    if (i.MaturityAgeDays != null) {
      item.maturityAgeDays = i.MaturityAgeDays
      item.postHarvestingGrowth = i.PostHarvestingGrowth ?? 0
      item.pickableAtPercent = i.PickableAtPercent ?? 0
      item.primaryResourceMin = i.PrimaryResourceMin ?? 0
      item.primaryResourceMax = i.PrimaryResourceMax ?? 0
      item.isTree = i.IsTree ?? false
      if (i.SeedItem) pendingCropSeeds.push({ crop: item, seedName: i.SeedItem })
      // The in-world species name is shown in the Crop Tracker picker. Stored
      // under the 'plant' entity type so it doesn't shadow the item's own name.
      if (i.PlantName) addLocalizedNames(localizedNames, 'plant', itemId, i.PlantName)
    }
    // Gathering data. Each block is independent — an item carries at most one,
    // since the four gathering classes are disjoint.
    if (i.MinableHardness != null) {
      item.minableHardness = i.MinableHardness
      item.rubbleItemsPerBlock = i.RubbleItemsPerBlock ?? 0
      item.rubbleMaxItemsPerBlock = i.RubbleMaxItemsPerBlock ?? 0
      item.rubbleExtraHitsPerBlock = i.RubbleExtraHitsPerBlock ?? 0
    }
    if (i.RequiresShovel) item.requiresShovel = true
    if (i.AnimalHealth != null) {
      item.animalHealth = i.AnimalHealth
      // Stored under 'animal' so the species name (e.g. "Deer") doesn't shadow
      // the carcass item's own name, mirroring how 'plant' is used for crops.
      if (i.AnimalName) addLocalizedNames(localizedNames, 'animal', itemId, i.AnimalName)
    }
    if (i.ClothingCalorieRate != null) item.clothingCalorieRate = i.ClothingCalorieRate
    if (i.HousingCategory) {
      item.housingCategory = i.HousingCategory
      item.housingBaseValue = i.HousingBaseValue ?? 0
      item.housingTypeForRoomLimit = i.HousingTypeForRoomLimit ?? ''
      // 1 means no penalty, which is the right default — 0 would instead
      // zero every repeat.
      item.housingDiminishingReturnMultiplier = i.HousingDiminishingReturnMultiplier ?? 1
      item.housingPropertyDiminishingMultiplier =
        i.HousingDiminishingMultiplierAcrossFullProperty ?? 1
      if (i.HousingPowerType) {
        item.housingPowerType = i.HousingPowerType
        item.housingPowerWatts = i.HousingPowerWatts ?? 0
      }
    }
    // Tier 0 is a real tier, so presence is a separate boolean.
    if (i.BuildingBlockTier != null) {
      item.isBuildingMaterial = true
      item.buildingBlockTier = i.BuildingBlockTier
    }
    items.push(item)
    addLocalizedNames(localizedNames, 'item', itemId, i.LocalizedName)

    if (i.RequiredParts) {
      for (const part of i.RequiredParts) {
        pendingItemParts.push({ itemId, partName: part.Name, quantity: part.Quantity })
      }
    }

    // Salvage names other items (the scrap an item breaks into), which may not
    // be in itemIdByName yet — resolve after the item loop, like parts.
    for (const s of i.SalvageCost ?? []) {
      pendingSalvage.push({ itemId, garbageName: s.ItemOrTag, quantity: s.Quantity })
    }

    if (i.IsCraftingTable) {
      const ctId = generateId()
      craftingTableIdByName.set(i.Name, ctId)
      craftingTables.push({ id: ctId, datasetId, name: i.Name })
      addLocalizedNames(localizedNames, 'craftingTable', ctId, i.LocalizedName)
    }

    // Both dataset module shapes are resolved here, once, into the unified
    // bonus rows. Nothing downstream of this line knows which version it came
    // from. The gate is `IsPluginModule` alone — normalizeModuleBonuses decides
    // which shape it is looking at.
    if (i.IsPluginModule) {
      const normalized = normalizeModuleBonuses(i)
      const pmId = generateId()
      pluginModules.push({
        id: pmId,
        datasetId,
        name: i.Name,
        slot: normalized.slot,
        isDeprecated: i.IsDeprecated === true,
      })
      normalized.bonuses.forEach((b, idx) => {
        pluginModuleBonuses.push({
          id: generateId(),
          datasetId,
          pluginModuleId: pmId,
          bonusIndex: idx,
          action: b.action,
          effectType: b.effectType,
          value: b.value,
          // Skill *names* → ids. A name that doesn't resolve is dropped rather
          // than kept as a dangling id: an unresolvable scope would otherwise
          // match nothing and silently turn a scoped effect into a no-op that
          // still suppresses the unscoped fallback in `moduleFactor`.
          skillIds: b.skillTypes
            .map((n) => skillIdByName.get(n))
            .filter((id): id is string => id != null),
        })
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

  // Resolve item part requirements now that all item ids are known.
  for (const pending of pendingItemParts) {
    const partItemId = itemIdByName.get(pending.partName)
    if (partItemId) {
      itemParts.push({
        id: generateId(),
        datasetId,
        itemId: pending.itemId,
        partItemId,
        quantity: pending.quantity,
      })
    }
  }

  // Resolve each crop's seed item link now that all item ids are known.
  for (const pending of pendingCropSeeds) {
    const seedItemId = itemIdByName.get(pending.seedName)
    if (seedItemId) pending.crop.seedItemId = seedItemId
  }

  // Resolve salvage costs now that all item ids are known. validateDatasetJson
  // already rejects unresolvable names, so a miss here means a custom/partial
  // dataset; dropping the row is right — garbage is display-only and a dangling
  // id would render as a blank row.
  for (const pending of pendingSalvage) {
    const garbageItemId = itemIdByName.get(pending.garbageName)
    if (garbageItemId) {
      itemSalvage.push({
        id: generateId(),
        datasetId,
        itemId: pending.itemId,
        garbageItemId,
        quantity: pending.quantity,
      })
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

    recipeIdByName.set(r.Name, recipeId)

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

    // Explicit garbage. Items are fully parsed by now, so this resolves inline.
    for (const g of r.GarbageOutputs ?? []) {
      const garbageItemId = itemIdByName.get(g.ItemOrTag)
      if (garbageItemId) {
        recipeGarbage.push({
          id: generateId(),
          datasetId,
          recipeId,
          garbageItemId,
          quantity: g.Quantity,
        })
      }
    }

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

  // Resolve deferred Unlock bonuses now that recipe ids exist. Unresolved
  // names (e.g. scopes pointing to mod recipes that didn't ship in this
  // dataset) are silently dropped.
  for (const pu of pendingUnlocks) {
    for (const recipeName of pu.recipeNames) {
      const recipeId = recipeIdByName.get(recipeName)
      if (!recipeId) continue
      recipeUnlocks.push({
        id: generateId(),
        datasetId,
        recipeId,
        talentId: pu.talentId,
      })
    }
  }

  // Gathering tools. Skill and talent names are resolved to row ids here; an
  // unresolvable name becomes '' rather than dropping the tool. That is the
  // mechanism by which the abstract `ToolEfficiencyTalent` — which shovels and
  // bows reference but which is never granted to any skill, so no talent row
  // bears that name — correctly ends up as a no-op.
  for (const gt of data.GatheringTools ?? []) {
    const itemId = itemIdByName.get(gt.Name)
    if (!itemId) continue
    gatheringTools.push({
      id: generateId(),
      datasetId,
      itemId,
      kind: gt.Kind,
      tier: gt.Tier,
      baseCalories: gt.BaseCalories,
      calorieSkillId: skillIdByName.get(gt.CalorieSkill) ?? '',
      baseDamage: gt.BaseDamage,
      damageUsesToolCurve: gt.DamageUsesToolCurve,
      efficiencyTalentId: gt.EfficiencyTalent
        ? (talentIdByName.get(gt.EfficiencyTalent) ?? '')
        : '',
      strengthTalentId: gt.StrengthTalent ? (talentIdByName.get(gt.StrengthTalent) ?? '') : '',
      maxTake: gt.MaxTake ?? 0,
    })
  }

  for (const ts of data.TreeSpecies ?? []) {
    const logItemId = itemIdByName.get(ts.LogItem)
    if (!logItemId) continue
    const speciesId = generateId()
    treeSpecies.push({
      id: speciesId,
      datasetId,
      name: ts.Name,
      logItemId,
      treeHealth: ts.TreeHealth,
      logsPerTreeMin: ts.LogsPerTreeMin,
      logsPerTreeMax: ts.LogsPerTreeMax,
    })
    addLocalizedNames(localizedNames, 'treeSpecies', speciesId, ts.LocalizedName)
  }

  // Housing reference data. Category links (item → category, and category →
  // supporting category) stay as names on purpose: the game itself keys
  // categories by name, and resolving only some of those edges to row ids would
  // leave two keying schemes in one graph. validateDatasetJson enforces that
  // every name resolves.
  for (const rc of data.RoomCategories ?? []) {
    const categoryId = generateId()
    roomCategories.push({
      id: categoryId,
      datasetId,
      name: rc.Name,
      color: rc.Color ?? '',
      index: rc.Index ?? 0,
      affectsPropertyTypes: rc.AffectsPropertyTypes ?? [],
      supportingRoomCategoryNames: rc.SupportingRoomCategoryNames ?? [],
      maxSupportPercentOfPrimary: rc.MaxSupportPercentOfPrimary ?? 1,
      maxSupportPercentOfPrimaryPerCategory: rc.MaxSupportPercentOfPrimaryPerCategory ?? {},
      capToPercentOfRestOfProperty: rc.CapToPercentOfRestOfProperty ?? 0,
      canBeRoomCategory: rc.CanBeRoomCategory ?? true,
      supportForAnyRoomType: rc.SupportForAnyRoomType ?? false,
      shouldCapFromRoomMaterials: rc.ShouldCapFromRoomMaterials ?? true,
      canAutoChooseCategory: rc.CanAutoChooseCategory ?? true,
      negatesValue: rc.NegatesValue ?? false,
    })
    // A distinct entity type, so a category named like an item can't shadow it.
    addLocalizedNames(localizedNames, 'roomCategory', categoryId, rc.LocalizedName)
  }
  for (const rt of data.RoomTiers ?? []) {
    roomTiers.push({
      id: generateId(),
      datasetId,
      tierVal: rt.Tier,
      softCap: rt.SoftCap,
      hardCap: rt.HardCap,
      diminishingReturnPercent: rt.DiminishingReturnPercent,
    })
  }

  return {
    skills,
    talents,
    talentBonuses,
    items,
    itemParts,
    tagItems,
    craftingTables,
    pluginModules,
    pluginModuleBonuses,
    craftingTablePluginModules,
    itemSalvage,
    recipeGarbage,
    recipes,
    recipeElements,
    modifiers,
    recipeUnlocks,
    gatheringTools,
    treeSpecies,
    roomCategories,
    roomTiers,
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
