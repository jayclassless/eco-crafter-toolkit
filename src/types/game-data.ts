import type { ModuleAction, ModuleEffectType, ModuleSlot } from '@/lib/normalize-module-bonuses'

export type { ModuleSlot }

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
  // Housing furnishing value. `housingCategory` is the presence gate and holds
  // a RoomCategory.name (categories reference each other by name, so the link
  // is deliberately not resolved to a row id).
  housingCategory?: string
  housingBaseValue?: number
  housingTypeForRoomLimit?: string
  housingDiminishingReturnMultiplier?: number // 1 = no in-room repeat penalty
  housingPropertyDiminishingMultiplier?: number // 1 = no property-wide penalty
  /** Which power grid the furnishing needs, or '' when it needs none. This, not
   * `housingPowerWatts`, is the presence gate — wattages are fractional. */
  housingPowerType?: string
  housingPowerWatts?: number
  /** Presence gate for buildingBlockTier — tier 0 is a real tier, so there is
   * no usable numeric sentinel. */
  isBuildingMaterial?: boolean
  buildingBlockTier?: number
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

/** A room category. Categories reference each other by `name`, which is also
 * the key items use in `Item.housingCategory`. */
export interface RoomCategory {
  id: string
  datasetId: string
  name: string
  /** '#RRGGBB', or '' when the category has no color of its own. */
  color: string
  index: number // the game's own category ordering
  affectsPropertyTypes: string[]
  supportingRoomCategoryNames: string[]
  maxSupportPercentOfPrimary: number
  maxSupportPercentOfPrimaryPerCategory: Record<string, number>
  capToPercentOfRestOfProperty: number
  canBeRoomCategory: boolean
  supportForAnyRoomType: boolean
  shouldCapFromRoomMaterials: boolean
  canAutoChooseCategory: boolean
  /** True for Industrial: one such object zeroes its whole room. */
  negatesValue: boolean
}

/** Soft/hard housing-value caps imposed by a room's material tier. */
export interface RoomTier {
  id: string
  datasetId: string
  tierVal: number
  softCap: number
  hardCap: number
  diminishingReturnPercent: number
}

/** Bow and tree values the game states as literals rather than as entity data.
 * One row per dataset; absent for datasets extracted before the section existed,
 * in which case consumers use the pre-v14.1 defaults those datasets describe. */
export interface GatheringConstants {
  id: string
  datasetId: string
  bowHeadshotMultiplier: number
  /** 0 when Deadeye contributes an additive talent bonus rather than replacing
   * the multiplier outright (v14.1.0 onward). */
  bowHeadshotMultiplierDeadeye: number
  maxTrunkPickupSize: number
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
  slot: ModuleSlot
  isDeprecated: boolean
}

/** One module effect, in the unified shape both dataset versions normalize to.
 * Mirrors `TalentBonus`, plus the skill scope modules can carry. */
export interface PluginModuleBonus {
  id: string
  datasetId: string
  pluginModuleId: string
  bonusIndex: number
  action: ModuleAction
  effectType: ModuleEffectType
  value: number
  /** Skill ids; empty means unscoped (applies wherever the action applies). */
  skillIds: string[]
}

export interface CraftingTablePluginModule {
  id: string
  datasetId: string
  craftingTableId: string
  pluginModuleId: string
}

/** What one unit of an item breaks down into. Scaled by `CRAFT_GARBAGE_RATIO`
 * when computing a recipe's garbage. Empty on v11–v13. */
export interface ItemSalvage {
  id: string
  datasetId: string
  itemId: string
  garbageItemId: string
  quantity: number
}

/** Garbage a recipe emits outright. Literal quantities — not ratio-scaled. */
export interface RecipeGarbage {
  id: string
  datasetId: string
  recipeId: string
  garbageItemId: string
  quantity: number
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
