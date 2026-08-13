import type { Store } from 'tinybase'

import { getRecipeSkillInfo } from '@/hooks/use-products'
import type { Compare } from '@/lib/collator'

export interface UsedInRecipe {
  rowKey: string
  recipeId: string
  recipeName: string
  recipeIsCustom: boolean
  recipePrimaryProductRawName: string
  skillId: string
  skillName: string
  skillRawName: string
  quantity: number
  viaTag: { tagId: string; tagName: string; tagRawName: string } | null
  /** True when the consuming recipe is selected in the current build. Drives
   * the Mine/Other/All scope toggle in `UsedInRecipesTable`. */
  inBuild: boolean
}

interface ComputeUsedInRecipesParams {
  itemId: string
  buildId: string
  datasetId: string
  /** True when `itemId` is itself a tag; skips tag-expansion of the match set. */
  isTag?: boolean
  /** Recipe id to omit from results (e.g. the recipe the dialog is showing). */
  excludeRecipeId?: string
  getName: (kind: string, id: string) => string
  /** Display-order comparator for the active locale (`useLocalization().compare`). */
  compare: Compare
}

// Finds every recipe in the dataset that consumes `itemId` as an ingredient —
// either directly by id, or indirectly via a tag that contains the item. Each
// row is flagged with `inBuild` so callers can scope the list to the build's
// own recipes, to the rest of the game, or to both. Shared by `MaterialDialog`
// and `RecipeDialog`, which both need this exact view with only the inputs
// changing.
export function computeUsedInRecipes(
  gameDataStore: Store,
  buildStore: Store,
  params: ComputeUsedInRecipesParams
): UsedInRecipe[] {
  const { itemId, buildId, datasetId, isTag = false, excludeRecipeId, getName, compare } = params

  const buildRecipeIds = new Set<string>()
  for (const urId of buildStore.getRowIds('userRecipes')) {
    const ur = buildStore.getRow('userRecipes', urId)
    if (ur.buildId !== buildId) continue
    buildRecipeIds.add(ur.recipeId as string)
  }

  // Match set: the item itself + any tag that contains it (for non-tag items).
  const matchSet = new Set<string>([itemId])
  const tagInfoById = new Map<string, { tagId: string; tagName: string; tagRawName: string }>()
  if (!isTag) {
    for (const tiId of gameDataStore.getRowIds('tagItems')) {
      const ti = gameDataStore.getRow('tagItems', tiId)
      if (ti.datasetId !== datasetId) continue
      if (ti.itemId !== itemId) continue
      const tagId = ti.tagId as string
      matchSet.add(tagId)
      if (!tagInfoById.has(tagId)) {
        const tagItemRow = gameDataStore.getRow('items', tagId)
        tagInfoById.set(tagId, {
          tagId,
          tagName: getName('item', tagId),
          tagRawName: tagItemRow ? ((tagItemRow.name as string) ?? '') : '',
        })
      }
    }
  }

  // Single pass: collect matching ingredient rows + per-recipe products and
  // ingredient sets (needed to derive each consuming recipe's primary product
  // for the row icon — the first product that isn't also an ingredient).
  const consumingIngredients: Array<{
    reId: string
    recipeId: string
    itemOrTagId: string
    baseQuantity: number
  }> = []
  const recipeProducts = new Map<string, Array<{ itemOrTagId: string; index: number }>>()
  const recipeIngredientSets = new Map<string, Set<string>>()

  for (const reId of gameDataStore.getRowIds('recipeElements')) {
    const re = gameDataStore.getRow('recipeElements', reId)
    if (re.datasetId !== datasetId) continue
    const rId = re.recipeId as string
    if (excludeRecipeId && rId === excludeRecipeId) continue

    if (re.isProduct) {
      let arr = recipeProducts.get(rId)
      if (!arr) {
        arr = []
        recipeProducts.set(rId, arr)
      }
      arr.push({
        itemOrTagId: re.itemOrTagId as string,
        index: (re.index as number) ?? 0,
      })
      continue
    }

    const iot = re.itemOrTagId as string
    let ingSet = recipeIngredientSets.get(rId)
    if (!ingSet) {
      ingSet = new Set()
      recipeIngredientSets.set(rId, ingSet)
    }
    ingSet.add(iot)
    if (!matchSet.has(iot)) continue
    consumingIngredients.push({
      reId,
      recipeId: rId,
      itemOrTagId: iot,
      baseQuantity: re.baseQuantity as number,
    })
  }

  const primaryProductRawNameOf = (rId: string): string => {
    const arr = recipeProducts.get(rId)
    if (!arr || arr.length === 0) return ''
    const ingSet = recipeIngredientSets.get(rId) ?? new Set<string>()
    const sorted = [...arr].sort((a, b) => a.index - b.index)
    const primary = sorted.find((p) => !ingSet.has(p.itemOrTagId)) ?? sorted[0]
    return (gameDataStore.getRow('items', primary.itemOrTagId)?.name as string) ?? ''
  }

  const rows: UsedInRecipe[] = []
  for (const ing of consumingIngredients) {
    const recipeRow = gameDataStore.getRow('recipes', ing.recipeId)
    if (!recipeRow) continue
    const skill = getRecipeSkillInfo(gameDataStore, ing.recipeId, getName)
    const viaTag = ing.itemOrTagId !== itemId ? (tagInfoById.get(ing.itemOrTagId) ?? null) : null

    rows.push({
      rowKey: ing.reId,
      recipeId: ing.recipeId,
      recipeName: getName('recipe', ing.recipeId),
      recipeIsCustom: !!recipeRow.isCustom,
      recipePrimaryProductRawName: primaryProductRawNameOf(ing.recipeId),
      skillId: skill.skillId,
      skillName: skill.skillName,
      skillRawName: skill.skillRawName,
      quantity: Math.abs(ing.baseQuantity),
      viaTag,
      inBuild: buildRecipeIds.has(ing.recipeId),
    })
  }

  rows.sort((a, b) => {
    const s = compare(a.skillName, b.skillName)
    if (s !== 0) return s
    return compare(a.recipeName, b.recipeName)
  })

  return rows
}
