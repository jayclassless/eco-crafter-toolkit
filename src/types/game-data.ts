export interface Dataset {
  id: string
  name: string
  version: number
  bundledId?: string
  installedRevision?: number
  importedAt: string
  updatedAt: string
  isCustom: boolean
}

export interface Skill {
  id: string
  datasetId: string
  name: string
  profession?: string
  maxLevel: number
  laborReducePercent: number[]
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
