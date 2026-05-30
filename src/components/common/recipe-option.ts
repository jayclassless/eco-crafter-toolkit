import type { Store } from 'tinybase'

import type { GetNameFn } from '@/lib/recipe-modifiers'

/**
 * A recipe entry shown in an autocomplete/lookup. Shared by the Add Recipe
 * dialog and the Ad-Hoc Recipe Calculator so both render recipes identically.
 */
export interface RecipeOption {
  id: string
  name: string
  rawName: string
  skillName: string
  isCustom: boolean
}

/**
 * Resolves the localized name of a recipe's owning skill, falling back to the
 * raw game-data name. Returns '' when the recipe has no skill.
 */
export function resolveRecipeSkillName(
  gameDataStore: Store,
  getName: GetNameFn,
  skillId: string
): string {
  if (!skillId) return ''
  return (
    getName('skill', skillId) || ((gameDataStore.getRow('skills', skillId)?.name as string) ?? '')
  )
}
