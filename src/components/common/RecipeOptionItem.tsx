import { RecipeIcon } from '@/components/common/RecipeIcon'

import type { RecipeOption } from './recipe-option'

interface Props {
  option: RecipeOption
}

/**
 * Renders a single recipe entry for an autocomplete suggestion list: the
 * primary-product icon, the recipe name, and (right-aligned) the owning skill.
 */
export function RecipeOptionItem({ option }: Props) {
  return (
    <div className="flex align-items-center gap-2">
      {(option.rawName || option.isCustom) && (
        <RecipeIcon primaryProduct={{ name: option.rawName, isCustom: option.isCustom }} />
      )}
      <span>{option.name}</span>
      {option.skillName && (
        <span className="ml-auto font-italic text-color-secondary">{option.skillName}</span>
      )}
    </div>
  )
}
