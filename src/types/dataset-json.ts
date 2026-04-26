export interface DatasetJson {
  Version: number
  Skills: SkillJson[]
  Items: ItemJson[]
  Tags: TagJson[]
  Recipes: RecipeJson[]
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
  TalentGroupName: string
  Value: number
  Level: number
  Bonuses?: TalentBonusJson[]
}

export interface TalentBonusJson {
  Action: string
  EffectType: string
  Value: number
  Cap?: number
  LowerIsBetter?: boolean
  Scope: TalentBonusScopeJson
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
  PluginType?: string
  PluginModulePercent?: number
  PluginModuleSkill?: string
  PluginModuleSkillPercent?: number
  IsCraftingTable?: boolean
  CraftingTablePluginModules?: string[]
}

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
