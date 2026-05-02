import { useMemo } from 'react'
import type { Store } from 'tinybase'

import { useLocalizedName } from '@/hooks/use-localized-name'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { useStores } from '@/stores/providers'

export interface Product {
  userRecipeId: string
  recipeId: string
  recipeName: string
  /** Recipe is user-authored — used to swap its row icon for `pi pi-book`. */
  recipeIsCustom: boolean
  skillId: string
  skillName: string
  skillRawName: string
  craftingTableId: string
  requiredSkillLevel: number
  /** Raw name of this entry's specific product (for the row icon when this
   * entry stands on its own). */
  primaryProductRawName: string
  /** Raw name of the recipe's first product — used for child-row icons inside
   * a multi-recipe group so each recipe is represented by its own primary
   * product, not the group's subject. */
  recipePrimaryProductRawName: string
  productItemIds: string[]
  primaryProductId: string
  primaryProductName: string
  /** Primary product is a user-authored item — used to swap parent-row icons
   * for `pi pi-book`. */
  primaryProductIsCustom: boolean
  /** userPrices row id for this entry's primary product, or '' when none
   * exists yet. Used by single-recipe (flat) rows that have no parent to
   * carry the id. */
  userPriceId: string
  userMarginId: string
  /** Talent ids that unlock this recipe. Empty when the recipe isn't
   * talent-gated (i.e. the v13+ `RequiresTalentUnlock` flag is off, or the
   * dataset has no matching Unlock-action talent bonus). */
  unlockingTalentIds: string[]
}

export interface ProductParent {
  primaryProductId: string
  primaryProductName: string
  primaryProductRawName: string
  /** Primary product is a user-authored item. */
  primaryProductIsCustom: boolean
  /** '' when no userPrices row exists yet — price-cell components tolerate. */
  userPriceId: string
  /** Parent-level margin (from userProductMargins); '' means inherit none. */
  productUserMarginId: string
}

export interface ProductGroup {
  /** null when children.length === 1 (flat single-recipe row). */
  parent: ProductParent | null
  /** Always >= 1; one entry per userRecipe. */
  children: Product[]
}

export interface MarginOption {
  id: string
  name: string
}

/**
 * The default margin id for a build, or '' when none is set. Used as the
 * "implicit" value for a multi-recipe product group's parent margin dropdown
 * before the user explicitly picks one.
 */
export function findDefaultMarginId(buildStore: Store, buildId: string): string {
  for (const mId of buildStore.getRowIds('userMargins')) {
    const m = buildStore.getRow('userMargins', mId)
    if (m.buildId === buildId && m.isDefault) return mId
  }
  return ''
}

/**
 * Single-pass index from recipe ID to the list of its product item IDs,
 * ordered by encounter in `recipeElements`. This is the canonical way to
 * look up a recipe's products when you need to derive anything per-recipe
 * (icon, primary product name, etc.) without re-scanning `recipeElements`
 * for every recipe.
 */
export function buildRecipeProductItemIds(gameDataStore: Store): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const reId of gameDataStore.getRowIds('recipeElements')) {
    const re = gameDataStore.getRow('recipeElements', reId)
    if (!re.isProduct) continue
    const recipeId = re.recipeId as string
    let list = map.get(recipeId)
    if (!list) {
      list = []
      map.set(recipeId, list)
    }
    list.push(re.itemOrTagId as string)
  }
  return map
}

interface RecipeSkillInfo {
  /** '' when the recipe has no skill (some crafting-table recipes are
   * skill-less) or the recipe doesn't exist. */
  skillId: string
  /** Localized name. '' when skillId is ''. */
  skillName: string
  /** Raw name (`skills.name`) — the key SkillIcon uses to load the asset.
   * '' when skillId is ''. */
  skillRawName: string
}

/**
 * Look up display info for the skill that produces a recipe — id, raw
 * asset-key name, and localized name. Centralises the four-step dance
 * (recipeId → recipe row → skillId → skill row + getName) used by every
 * surface that shows a recipe alongside its skill icon: the dependency
 * graph nodes, MaterialDialog's "Produced by" tab, UsedInRecipesTable
 * rows, and the Products view-model.
 *
 * Returns empty strings when there's no skill — callers handle that the
 * same way they handle missing names.
 */
export function getRecipeSkillInfo(
  gameDataStore: Store,
  recipeId: string,
  getName: (entityType: string, entityId: string) => string
): RecipeSkillInfo {
  if (!recipeId) return { skillId: '', skillName: '', skillRawName: '' }
  const recipeRow = gameDataStore.getRow('recipes', recipeId)
  const skillId = (recipeRow?.skillId as string) ?? ''
  if (!skillId) return { skillId: '', skillName: '', skillRawName: '' }
  const skillRow = gameDataStore.getRow('skills', skillId)
  return {
    skillId,
    skillName: getName('skill', skillId),
    skillRawName: (skillRow?.name as string) ?? '',
  }
}

/**
 * Raw name (i.e. `items.name`, the key used by `EcoIcon`) of a recipe's
 * primary product — the first product element encountered in
 * `recipeElements`. Returns `''` if the recipe has no products or the item
 * row is missing. Callers must first build the index with
 * `buildRecipeProductItemIds` so this stays O(1) per call.
 */
export function getRecipePrimaryProductRawName(
  gameDataStore: Store,
  recipeId: string,
  productItemIdsByRecipeId: Map<string, string[]>
): string {
  const ids = productItemIdsByRecipeId.get(recipeId)
  if (!ids || ids.length === 0) return ''
  const row = gameDataStore.getRow('items', ids[0])
  return row ? (row.name as string) : ''
}

/**
 * Single-pass index from recipe ID to the talent ids that unlock it. Only
 * populated for datasets that carry Unlock-action talent bonuses (v13+); the
 * map is empty for older versions.
 */
export function buildRecipeUnlockingTalents(gameDataStore: Store): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const id of gameDataStore.getRowIds('recipeUnlocks')) {
    const row = gameDataStore.getRow('recipeUnlocks', id)
    const recipeId = row.recipeId as string
    let list = map.get(recipeId)
    if (!list) {
      list = []
      map.set(recipeId, list)
    }
    list.push(row.talentId as string)
  }
  return map
}

/**
 * Single-pass index from item ID to the tag IDs that contain it. Mirrors
 * `buildRecipeProductItemIds` — callers that need per-item tag lookups should
 * build this map once up-front and then look up by item id in O(1).
 */
export function buildTagIdsByItemId(gameDataStore: Store): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const tiId of gameDataStore.getRowIds('tagItems')) {
    const ti = gameDataStore.getRow('tagItems', tiId)
    const itemId = ti.itemId as string
    let list = map.get(itemId)
    if (!list) {
      list = []
      map.set(itemId, list)
    }
    list.push(ti.tagId as string)
  }
  return map
}

/**
 * Single-pass index from recipe ID to the set of its ingredient item/tag IDs.
 * Used to exclude "reintegrated" products — items that are both produced and
 * consumed by the same recipe shouldn't appear as user-facing products.
 */
export function buildRecipeIngredientItemIds(gameDataStore: Store): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const reId of gameDataStore.getRowIds('recipeElements')) {
    const re = gameDataStore.getRow('recipeElements', reId)
    if (re.isProduct) continue
    const recipeId = re.recipeId as string
    let set = map.get(recipeId)
    if (!set) {
      set = new Set()
      map.set(recipeId, set)
    }
    set.add(re.itemOrTagId as string)
  }
  return map
}

export function buildProducts(
  buildStore: Store,
  gameDataStore: Store,
  buildId: string,
  getName: (entityType: string, entityId: string) => string
): Product[] {
  // Indexes are immutable per dataset import — pull from the cached bundle
  // instead of scanning ~4500 recipeElements + recipeUnlocks on every change
  // to userRecipes / userMargins / etc.
  const indexes = getGameDataIndexes(gameDataStore)
  const productsByRecipeId = indexes.productItemIdsByRecipeId
  const ingredientsByRecipeId = indexes.ingredientItemIdsByRecipeId
  const unlockingTalentsByRecipeId = indexes.unlockingTalentsByRecipeId

  // Index userRecipeMargins by userRecipeId once (build-scoped).
  const marginByUserRecipeId = new Map<string, string>()
  for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
    const urm = buildStore.getRow('userRecipeMargins', urmId)
    if (urm.buildId !== buildId) continue
    marginByUserRecipeId.set(urm.userRecipeId as string, urm.userMarginId as string)
  }

  // Items the user has moved from Products to Materials. These should not
  // appear as product rows even if a recipe in the build produces them — the
  // user-set price wins on the Materials side. Build the userPrices index in
  // the same pass so per-Product `userPriceId` lookups are O(1).
  const excludedItems = new Set<string>()
  const userPriceIdByItem = new Map<string, string>()
  for (const upId of buildStore.getRowIds('userPrices')) {
    const up = buildStore.getRow('userPrices', upId)
    if (up.buildId !== buildId) continue
    const itemId = up.itemOrTagId as string
    userPriceIdByItem.set(itemId, upId)
    if (up.isOverride && up.priceMode === 'manual') {
      excludedItems.add(itemId)
    }
  }

  const items: Product[] = []

  for (const urId of buildStore.getRowIds('userRecipes')) {
    const ur = buildStore.getRow('userRecipes', urId)
    if (ur.buildId !== buildId) continue

    const recipeId = ur.recipeId as string
    const recipe = gameDataStore.getRow('recipes', recipeId)
    if (!recipe) continue

    const { skillId, skillName, skillRawName } = getRecipeSkillInfo(
      gameDataStore,
      recipeId,
      getName
    )
    const craftingTableId = (recipe.craftingTableId as string) ?? ''
    const requiredSkillLevel = (recipe.requiredSkillLevel as number) ?? 0
    const recipeName = getName('recipe', recipeId)
    const recipeIsCustom = !!recipe.isCustom

    const productItemIds = productsByRecipeId.get(recipeId) ?? []
    const ingredientIds = ingredientsByRecipeId.get(recipeId)
    const userMarginId = marginByUserRecipeId.get(urId) ?? ''
    const unlockingTalentIds = unlockingTalentsByRecipeId.get(recipeId) ?? []

    const recipePrimaryProductRawName = getRecipePrimaryProductRawName(
      gameDataStore,
      recipeId,
      productsByRecipeId
    )

    // Emit one entry per product that is NOT also an ingredient of this
    // recipe — reintegrated byproducts are consumed internally and shouldn't
    // appear in the user's product list.
    for (const productId of productItemIds) {
      if (ingredientIds?.has(productId)) continue
      if (excludedItems.has(productId)) continue
      const productRow = gameDataStore.getRow('items', productId)
      items.push({
        userRecipeId: urId,
        recipeId,
        recipeName,
        recipeIsCustom,
        skillId,
        skillName,
        skillRawName,
        craftingTableId,
        requiredSkillLevel,
        primaryProductRawName: productRow ? (productRow.name as string) : '',
        recipePrimaryProductRawName,
        productItemIds,
        primaryProductId: productId,
        primaryProductName: getName('item', productId),
        primaryProductIsCustom: !!productRow?.isCustom,
        userPriceId: userPriceIdByItem.get(productId) ?? '',
        userMarginId,
        unlockingTalentIds,
      })
    }
  }

  items.sort(
    (a, b) =>
      a.skillName.localeCompare(b.skillName) ||
      a.recipeName.localeCompare(b.recipeName) ||
      a.primaryProductName.localeCompare(b.primaryProductName)
  )

  return items
}

/**
 * Group per-recipe Products by their primary product. Multi-recipe groups
 * (2+ children) get a synthesized parent with its userPriceId and
 * product-level margin looked up once. Single-recipe groups keep parent=null
 * and render as a flat row.
 *
 * Sorted by product name (with single-recipe groups using the recipe name as
 * fallback), then children within each group by skillName,recipeName.
 */
export function buildProductGroups(
  buildStore: Store,
  gameDataStore: Store,
  buildId: string,
  getName: (entityType: string, entityId: string) => string
): ProductGroup[] {
  const flat = buildProducts(buildStore, gameDataStore, buildId, getName)

  // userPrices indexed by itemOrTagId for this build.
  const userPriceByItemId = new Map<string, string>()
  for (const upId of buildStore.getRowIds('userPrices')) {
    const up = buildStore.getRow('userPrices', upId)
    if (up.buildId !== buildId) continue
    userPriceByItemId.set(up.itemOrTagId as string, upId)
  }

  // userProductMargins indexed by productId for this build.
  const productMarginByItemId = new Map<string, string>()
  for (const upmId of buildStore.getRowIds('userProductMargins')) {
    const upm = buildStore.getRow('userProductMargins', upmId)
    if (upm.buildId !== buildId) continue
    productMarginByItemId.set(upm.itemOrTagId as string, upm.userMarginId as string)
  }

  // Bucket by primaryProductId, keeping first-encounter order for stability.
  const byProductId = new Map<string, Product[]>()
  for (const p of flat) {
    const key = p.primaryProductId || p.recipeId
    let list = byProductId.get(key)
    if (!list) {
      list = []
      byProductId.set(key, list)
    }
    list.push(p)
  }

  const groups: ProductGroup[] = []
  for (const [productId, children] of byProductId) {
    if (children.length === 1) {
      groups.push({ parent: null, children })
      continue
    }
    children.sort(
      (a, b) => a.skillName.localeCompare(b.skillName) || a.recipeName.localeCompare(b.recipeName)
    )
    const first = children[0]
    groups.push({
      parent: {
        primaryProductId: productId,
        primaryProductName: first.primaryProductName,
        primaryProductRawName: first.primaryProductRawName,
        primaryProductIsCustom: first.primaryProductIsCustom,
        userPriceId: userPriceByItemId.get(productId) ?? '',
        productUserMarginId: productMarginByItemId.get(productId) ?? '',
      },
      children,
    })
  }

  groups.sort((a, b) => {
    const an = a.parent ? a.parent.primaryProductName : a.children[0].primaryProductName
    const bn = b.parent ? b.parent.primaryProductName : b.children[0].primaryProductName
    return an.localeCompare(bn)
  })

  return groups
}

export function buildMarginOptions(buildStore: Store, buildId: string): MarginOption[] {
  const result: MarginOption[] = []
  for (const rowId of buildStore.getRowIds('userMargins')) {
    const row = buildStore.getRow('userMargins', rowId)
    if (row.buildId === buildId) {
      result.push({ id: rowId, name: row.name as string })
    }
  }
  return result
}

/**
 * Derived view-model hook for the Products panel. Joins userRecipes with
 * game data and recipe-margin links to produce a list of ProductGroups plus
 * the margin options for the dropdown. Prices are intentionally NOT part of
 * this view-model — cells subscribe to a separate `PriceSignal` so the full
 * DataTable doesn't rebuild on every solver result.
 */
export function useProducts(buildId: string): { groups: ProductGroup[]; margins: MarginOption[] } {
  const { buildStore, gameDataStore } = useStores()
  const datasetId = (buildStore.getCell('builds', buildId, 'datasetId') as string) ?? ''
  const { getName } = useLocalizedName(datasetId)

  return useMemo(
    () => ({
      groups: buildProductGroups(buildStore, gameDataStore, buildId, getName),
      margins: buildMarginOptions(buildStore, buildId),
    }),
    [buildStore, gameDataStore, buildId, getName]
  )
}
