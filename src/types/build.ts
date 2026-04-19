export type MarginType = 'markup' | 'grossMargin'

export interface Build {
  id: string
  datasetId: string
  name: string
  createdAt: string
}

export interface UserSkill {
  id: string
  buildId: string
  skillId: string
  level: number
}

export interface UserTalent {
  id: string
  buildId: string
  talentId: string
  enabled: boolean
}

export interface UserCraftingTable {
  id: string
  buildId: string
  craftingTableId: string
  pluginModuleId?: string
  costPerMinute: number
}

export interface UserRecipe {
  id: string
  buildId: string
  recipeId: string
  roundFactor: number
}

export interface UserPrice {
  id: string
  buildId: string
  itemOrTagId: string
  price?: number
  isOverride: boolean
  primaryItemId?: string
}

export interface UserMargin {
  id: string
  buildId: string
  name: string
  percent: number
}

export interface UserRecipeMargin {
  id: string
  buildId: string
  userRecipeId: string
  userMarginId: string
}

export interface UserSettings {
  id: string
  buildId: string
  marginType: MarginType
  calorieCost: number
  showUnskilledRecipes: boolean
  onlyLevelAccessible: boolean
  applyMarginBetweenSkills: boolean
}

export interface ComputedPrice {
  id: string
  buildId: string
  itemOrTagId: string
  costPrice: number
  salePrice: number
  recipeId: string
}
