export interface DatasetJson {
  Version: number
  Skills: SkillJson[]
  Items: ItemJson[]
  Tags: TagJson[]
  Recipes: RecipeJson[]
  // Gathering data (see the Gathering Calculator). Both sections are optional:
  // datasets extracted before gathering support simply omit them, and the
  // calculator degrades to an "update your dataset" state.
  GatheringTools?: GatheringToolJson[]
  TreeSpecies?: TreeSpeciesJson[]
  // Housing data (see the Housing Score tool). Optional for the same reason:
  // datasets extracted before housing support omit them, and the browser shows
  // an "update your dataset" state. Both vary by game version — v11's room
  // tiers diminish at .5, v12's at .35, v13+ at .65 — so they ship per dataset
  // rather than being constants in the app.
  RoomCategories?: RoomCategoryJson[]
  RoomTiers?: RoomTierJson[]
  // Gathering values the game states as literals in its own source rather than
  // as entity data (see the Gathering Calculator). Optional for the same reason
  // as the sections above: datasets extracted before this existed omit it, and
  // consumers fall back to the pre-v14.1 values, which is what those datasets
  // describe anyway.
  GatheringConstants?: GatheringConstantsJson
}

/** Bow and tree values that vary by game version but are not entity data. They
 * ship per dataset rather than as app constants because the game has already
 * changed them once: the bow headshot multiplier was 1.5, doubling to 2.0 with
 * Deadeye, through v14.0.3, and became 1.4 with Deadeye contributing an additive
 * talent bonus in v14.1.0.
 *
 * Deliberately NOT the home for the tool damage/calorie curves or the rubble
 * pickup cost: those are compiled into the server, so the extractor cannot see
 * them and they remain constants in `game-constants.ts`. */
export interface GatheringConstantsJson {
  /** Bow headshot damage multiplier, before any talent bonus. */
  BowHeadshotMultiplier: number
  /** The multiplier when Deadeye is held, in versions that express Deadeye as a
   * replacement value. Absent from v14.1.0 on, where Deadeye instead carries an
   * additive bonus applied to `BowHeadshotMultiplier`. */
  BowHeadshotMultiplierDeadeye?: number
  /** `TreeEntity.MaxTrunkPickupSize` — the piece size a felled trunk must be
   * sliced down to before any of it can be picked up. */
  MaxTrunkPickupSize: number
}

/** A room category. Categories reference each other by `Name`, which is also
 * the key an item's `HousingCategory` points at. */
export interface RoomCategoryJson {
  Name: string
  LocalizedName: LocalizedNames
  /** '#RRGGBB', or '' when the category has no color of its own. Consumers
   * must tolerate the empty case and fall back to their default text color. */
  Color: string
  /** The game's own category ordering — residence rooms, special types, then
   * support-only categories — so the UI can group the same way. */
  Index: number
  AffectsPropertyTypes: string[]
  /** Categories whose furniture may lend value to a room of this category. */
  SupportingRoomCategoryNames: string[]
  /** When this category acts as a *supporter*, the fraction of the primary
   * category's total it may contribute. */
  MaxSupportPercentOfPrimary: number
  /** Per-primary overrides of the above, e.g. Cultural gives 100% into Outdoor. */
  MaxSupportPercentOfPrimaryPerCategory?: Record<string, number>
  /** 0 = uncapped. Bathrooms are 0.33 of the rest of the property. */
  CapToPercentOfRestOfProperty: number
  /** False for support-only categories (Seating, Decoration, Lighting). */
  CanBeRoomCategory: boolean
  SupportForAnyRoomType: boolean
  ShouldCapFromRoomMaterials: boolean
  CanAutoChooseCategory: boolean
  /** True for Industrial: one such object zeroes its whole room. */
  NegatesValue: boolean
}

/** A room material tier. A room's value below `SoftCap` is untouched; above it
 * the excess diminishes toward `HardCap` without ever reaching it. */
export interface RoomTierJson {
  Tier: number
  SoftCap: number
  HardCap: number
  DiminishingReturnPercent: number
}

/** A tool that gathers a raw material from the world. Kinds map 1:1 onto the
 * abstract `*Item` base classes in Eco's `__core__/Tools/`. */
export interface GatheringToolJson {
  Name: string // item Name, e.g. 'IronPickaxeItem'
  LocalizedName: LocalizedNames
  Kind: string // 'Pickaxe' | 'Shovel' | 'Axe' | 'Bow' | 'Drill'
  Tier: number
  /** `CreateCalorieValue(N, ...)` — scaled by ToolItem's fixed calorie curve. */
  BaseCalories: number
  /** The skill whose *level* indexes that curve (NOT whose strategy is used). */
  CalorieSkill: string
  BaseDamage: number
  /** True when damage came from `CreateDamageValue(N, skill, ...)`, meaning
   * ToolItem's damage curve applies. False for `ConstantValue(N)` (pickaxes). */
  DamageUsesToolCurve: boolean
  /** Omitted when the C# names the abstract `ToolEfficiencyTalent`, which is
   * never granted to any skill and therefore always resolves to a no-op. */
  EfficiencyTalent?: string
  StrengthTalent?: string
  /** Shovels only: the carried-slot stack cap. Informational — it does NOT
   * affect blocks dug per swing. */
  MaxTake?: number
}

/** A tree species. Kept separate from the log item because the mapping is
 * many-to-one: Redwood (15 HP, 0-75 logs) and Old-Growth Redwood (300 HP,
 * 700-800 logs) both yield RedwoodLogItem.
 *
 * `TreeSpecies.LogHealth` is deliberately not carried: the property exists in
 * the game but nothing reads it, and slicing a felled trunk is not damage-gated. */
export interface TreeSpeciesJson {
  Name: string
  LocalizedName: LocalizedNames
  LogItem: string
  TreeHealth: number
  /** Yield scales with growth: `Min + (Max - Min) x growthPercent`, so a fully
   * grown tree yields Max. It is NOT the random per-tree size scale. */
  LogsPerTreeMin: number
  LogsPerTreeMax: number
}

export interface LocalizedNames {
  [locale: string]: string
}

export interface SkillJson {
  Name: string
  LocalizedName: LocalizedNames
  Profession?: string
  MaxLevel: number
  LaborReducePercent: number[]
  // Star cost to unlock the skill. Introduced in Eco v13 (`SpecialtyCost` on
  // the generated Skill class); absent in v11/v12 where every skill cost 1.
  SpecialtyCost?: number
  Talents: TalentJson[]
}

export interface TalentJson {
  Name: string
  LocalizedName: LocalizedNames
  LocalizedDescription?: LocalizedNames
  TalentGroupName: string
  Value: number
  Level: number
  Bonuses?: TalentBonusJson[]
}

/** A parsed `new Bonus { … }` from the game's Bonus framework. Shared by talents
 * (`TalentJson.Bonuses`, v13+) and plugin modules (`ItemJson.ModuleBonuses`,
 * v14+) — the two declare bonuses with different C# syntax but the same shape.
 *
 * `Value` carries the effect magnitude regardless of which field the C# spelled
 * it with: every type in `__core__/Benefits` uses `Value =`, while v14's
 * module-only `BonusEffectAdditivePercent` uses `Percent =`. */
export interface TalentBonusJson {
  Action: string
  EffectType: string
  Value: number
  Cap?: number
  LowerIsBetter?: boolean
  Scope: TalentBonusScopeJson
}

/** A flat item + quantity, used by the v14 garbage system. Unlike `ElementJson`
 * the quantity is a plain number: garbage carries no modifiers, and per in-game
 * verification it does not scale with module or talent effects. */
export interface GarbageQuantityJson {
  ItemOrTag: string
  Quantity: number
}

export interface TalentBonusScopeJson {
  Recipes?: string[]
  SkillTypes?: string[]
  CraftStationTypes?: string[]
  ItemTags?: string[]
}

interface PartRequirementJson {
  Name: string
  Quantity: number
}

export interface ItemJson {
  Name: string
  LocalizedName: LocalizedNames
  IsPart?: boolean
  RequiredParts?: PartRequirementJson[]
  IsPluginModule?: boolean
  // --- Legacy module shape (v11–v13 only) ---
  // Read from the `base(ModuleTypes.X, pct, typeof(Skill), skillPct)` ctor.
  // Normalized into the unified bonus shape at import time; never written
  // alongside ModuleBonuses (the extractor gates on the `Bonuses` override).
  PluginType?: string
  PluginModulePercent?: number
  PluginModuleSkill?: string
  PluginModuleSkillPercent?: number
  // --- v14 module shape ---
  /** Which of a crafting table's four core slots this module occupies. Read from
   * the `[Tag("<slot>Module")]` attribute, never inferred from the class name —
   * the Mining specialty modules are named *Basic/Advanced/Modern* but are all
   * tagged SpecialtyModule. Absent only on deprecated tier-ladder modules. */
  ModuleSlot?: 'Basic' | 'Advanced' | 'Modern' | 'Specialty'
  ModuleBonuses?: TalentBonusJson[]
  /** `[LocDescription("This is a deprecated item…")]`. Deprecated modules stay in
   * the dataset (existing builds may reference them) but are hidden from pickers
   * and exempt from the slot-tag requirement. */
  IsDeprecated?: boolean
  /** `[SalvageCost(typeof(Mat), qty, …)]`, with each garbage material already
   * resolved to the real item it yields. Multiplied by `CRAFT_GARBAGE_RATIO`
   * when computing a recipe's garbage; not part of pricing. New in v14. */
  SalvageCost?: GarbageQuantityJson[]
  IsCraftingTable?: boolean
  CraftingTablePluginModules?: string[]
  // Crop growth data, merged onto the harvested crop item during extraction
  // (see scripts/extract-eco-dataset.ts). Absent for non-crop items.
  MaturityAgeDays?: number
  PostHarvestingGrowth?: number // 0 = single harvest, 0.5 = regrows from 50%
  PickableAtPercent?: number
  // Yield range of the species' primary resource (ResourceList[0]). Gates when
  // the plant first yields anything; absent in datasets extracted before v13.
  PrimaryResourceMin?: number
  PrimaryResourceMax?: number
  SeedItem?: string // item Name link to the seed
  PlantName?: LocalizedNames // the in-world species name (e.g. "Oak" vs item "Oak Log")
  IsTree?: boolean
  // Gathering data, merged onto the item the source yields during extraction.
  // Absent for items that can't be gathered from the world.
  /** `[Minable(N)]` on the block this item represents. Mined with a pickaxe. */
  MinableHardness?: number
  /** Pickupable rubble objects a single block breaks into (4 in v11-v13). */
  RubbleItemsPerBlock?: number
  /** Yield when `MiningLuckyBreakTalent` forces the max-chunk rubble set. */
  RubbleMaxItemsPerBlock?: number
  /** Expected extra pickaxe swings to split `MinableRubble` chunks (0.75 in
   * v11-v13: 3 of the 4 spawn sets contain one splittable chunk). */
  RubbleExtraHitsPerBlock?: number
  /** `[RequiresTool(typeof(ShovelItem))]` — dug, one block per swing. */
  RequiresShovel?: boolean
  /** `AnimalSpecies.Health`, merged onto the carcass the species drops. */
  AnimalHealth?: number
  AnimalName?: LocalizedNames // the in-world species name, mirroring PlantName
  /** `flatStats[UserStatType.CalorieRate]`, e.g. -0.3. Clothing only. */
  ClothingCalorieRate?: number
  // Housing furnishing value, from the item's own `new HomeFurnishingValue()`.
  // Present together or not at all; `HousingCategory` is the presence gate and
  // names a `RoomCategories[].Name`.
  HousingCategory?: string
  HousingBaseValue?: number
  /** Groups repeats within a room ("Chair", "Bed"). '' = ungrouped. */
  HousingTypeForRoomLimit?: string
  /** Each additional copy of the same type in one room is worth this multiple
   * of the previous one. 1 = no penalty. */
  HousingDiminishingReturnMultiplier?: number
  /** Same, but counted across the whole property. 1 = no penalty. */
  HousingDiminishingMultiplierAcrossFullProperty?: number
  /** Which power grid the furnishing draws from, or absent when it needs none
   * (the large majority). Absence is the gate — never `HousingPowerWatts`,
   * which is legitimately fractional. */
  HousingPowerType?: HousingPowerTypeJson
  /** Watts consumed. Present exactly when `HousingPowerType` is; values run
   * from 0.2 to 2500, so this is a float, not an int. */
  HousingPowerWatts?: number
  /** Highest `[BlockTier(N)]` among the room-material blocks this item places.
   * **Tier 0 is a real tier** (Mortared Basalt), so test presence with
   * `!= null`, never truthiness. */
  BuildingBlockTier?: number
}

/** The power grids a furnishing can draw from. Not exported: the app-side
 * equivalent is `PowerType` in the housing-score section. */
type HousingPowerTypeJson = 'Heat' | 'Mechanical' | 'Electric'

export interface TagJson {
  Name: string
  LocalizedName: LocalizedNames
  AssociatedItems: string[]
}

export interface RecipeJson {
  Name: string
  LocalizedName: LocalizedNames
  FamilyName: string
  CraftMinutes: DynamicValueJson
  RequiredSkill: string
  RequiredSkillLevel: number
  IsBlueprint: boolean
  IsDefault: boolean
  Labor: DynamicValueJson
  CraftingTable: string
  Ingredients: ElementJson[]
  Products: ElementJson[]
  /** Waste this recipe emits outright, from the `garbages:` argument of
   * `recipe.Init(...)`. These are LITERAL quantities — unlike the salvage-derived
   * half of a recipe's garbage they are not scaled by `CRAFT_GARBAGE_RATIO`.
   * Confirmed to have zero overlap with `Products`, so no double-counting.
   * New in v14; omitted when empty. */
  GarbageOutputs?: GarbageQuantityJson[]
}

export interface DynamicValueJson {
  BaseValue: number
  Modifiers: ModifierJson[]
}

export interface ModifierJson {
  DynamicType: 'Skill' | 'Talent' | 'Module'
  Item: string
  ValueType?: string
}

export interface ElementJson {
  ItemOrTag: string
  Quantity: DynamicValueJson
}
