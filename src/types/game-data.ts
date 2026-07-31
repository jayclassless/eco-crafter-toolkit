export interface Skill {
  id: string
  datasetId: string
  name: string
  profession?: string
  maxLevel: number
  laborReducePercent: number[]
  specialtyCost: number
}

export interface Talent {
  id: string
  datasetId: string
  skillId: string
  name: string
  talentGroupName: string
  value: number
  level: number
  isLevelable: boolean
  maxTalentLevel: number
}

export interface TalentBonus {
  id: string
  datasetId: string
  talentId: string
  bonusIndex: number
  action: string
  effectType: string
  value: number
  cap: number
  lowerIsBetter: boolean
}

export interface Item {
  id: string
  datasetId: string
  name: string
  isTag: boolean
  isPart?: boolean
  isCustom?: boolean
  // Crop growth data, present only on harvested crop items (denormalized from
  // the game's PlantSpecies). `maturityAgeDays > 0` marks a trackable crop.
  maturityAgeDays?: number
  postHarvestingGrowth?: number // 0 = single harvest, 0.5 = regrows from 50%
  pickableAtPercent?: number
  // Yield range of the species' primary resource; drives the first-yield gate.
  // 0/0 means the dataset predates range extraction (see crop-growth.ts).
  primaryResourceMin?: number
  primaryResourceMax?: number
  seedItemId?: string // links to the seed item used to plant this crop
  isTree?: boolean // distinguishes trees from food crops for grouping
  // Gathering data (see src/lib/gathering-calc.ts). Each block of fields is
  // present only on items obtained that way; the four classes are disjoint.
  minableHardness?: number // pickaxe: [Minable(N)] hardness of the source block
  rubbleItemsPerBlock?: number // pickaxe: items yielded per block broken
  rubbleMaxItemsPerBlock?: number // pickaxe: yield under MiningLuckyBreakTalent
  rubbleExtraHitsPerBlock?: number // pickaxe: expected extra swings to split rubble
  requiresShovel?: boolean // shovel: one block, one item, one swing
  animalHealth?: number // bow: health of the species dropping this carcass
  clothingCalorieRate?: number // clothing: UserStatType.CalorieRate, e.g. -0.3
}

/** A world-gathering tool. See `GatheringToolJson` for field semantics — the
 * only difference is that names are resolved to row ids here, with `''` for a
 * name that resolves to nothing (notably the abstract, never-granted
 * `ToolEfficiencyTalent` that shovels and bows reference). */
export interface GatheringTool {
  id: string
  datasetId: string
  itemId: string
  kind: string
  tier: number
  baseCalories: number
  calorieSkillId: string
  baseDamage: number
  damageUsesToolCurve: boolean
  efficiencyTalentId: string
  strengthTalentId: string
  maxTake: number
}

/** A tree species. Many-to-one with the log item it yields. */
export interface TreeSpecies {
  id: string
  datasetId: string
  name: string
  logItemId: string
  treeHealth: number
  logsPerTreeMin: number
  logsPerTreeMax: number
}

export interface ItemPart {
  id: string
  datasetId: string
  itemId: string
  partItemId: string
  quantity: number
}

export interface TagItem {
  id: string
  datasetId: string
  tagId: string
  itemId: string
}

export interface CraftingTable {
  id: string
  datasetId: string
  name: string
}

export interface PluginModule {
  id: string
  datasetId: string
  name: string
  pluginType: 'Resource' | 'Speed' | 'Resource&Speed'
  percent: number
  skillId?: string
  skillPercent?: number
}

export interface CraftingTablePluginModule {
  id: string
  datasetId: string
  craftingTableId: string
  pluginModuleId: string
}

export interface Recipe {
  id: string
  datasetId: string
  name: string
  familyName: string
  skillId?: string
  requiredSkillLevel: number
  isBlueprint: boolean
  isDefault: boolean
  craftingTableId: string
  baseCraftTime: number
  baseLaborCost: number
  isCustom?: boolean
}

export interface RecipeElement {
  id: string
  datasetId: string
  recipeId: string
  itemOrTagId: string
  baseQuantity: number
  isProduct: boolean
  index: number
}

export interface Modifier {
  id: string
  datasetId: string
  targetType: 'craftMinutes' | 'labor' | 'elementQuantity'
  targetId: string
  dynamicType: 'Skill' | 'Talent' | 'Module'
  refName: string
}

export interface RecipeUnlock {
  id: string
  datasetId: string
  recipeId: string
  talentId: string
}

export interface LocalizedName {
  id: string
  entityType: string
  entityId: string
  locale: string
  name: string
}
