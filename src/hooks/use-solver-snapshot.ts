import { useCallback } from 'react'
import type { Store } from 'tinybase'

import {
  AUTO_REINTEGRATE_SECONDARY_ITEM_NAMES,
  ZERO_SHARE_SECONDARY_ITEM_NAMES,
} from '@/lib/game-constants'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { MODULE_SLOT_CELL_LIST } from '@/lib/module-slots'
import { buildReintegrationOverrides, computeReintegratedProductIds } from '@/lib/reintegration'
import { computeAutoShares } from '@/lib/share-defaults'
import { useStores } from '@/stores/providers'
import type {
  PriceMode,
  SolverInput,
  SolverRecipe,
  SolverModifier,
  SolverModuleEffect,
} from '@/types/solver'

export interface TalentIndexEntry {
  id: string
  name: string
  value: number
  isLevelable: boolean
}

export interface BonusEntry {
  bonusIndex: number
  effectType: string
  value: number
  cap: number
}

export interface RecipeIndexes {
  modifiersByTarget: Map<string, Array<{ targetType: string; mod: SolverModifier }>>
  elementsByRecipeId: Map<string, Array<{ id: string; row: Record<string, unknown> }>>
  talentsBySkillId: Map<string, TalentIndexEntry[]>
  bonusesByTalentId: Map<string, BonusEntry[]>
  getSkill: (skillId: string) => { laborReducePercent: number[] } | null
  getModifiers: (targetType: string, targetId: string) => SolverModifier[]
  computeEffectiveValue: (b: BonusEntry, level: number) => number
  /** Every module's normalized effects, keyed by pluginModuleId. Both dataset
   * versions land here in the same shape. */
  moduleBonusesByModuleId: Map<string, SolverModuleEffect[]>
  /** Item IDs whose raw name is in `ZERO_SHARE_SECONDARY_ITEM_NAMES`
   * (Slag/Tailings/WetTailings). Consumed by `computeAutoShares` so these
   * waste byproducts stay at 0% even when the build's
   * `defaultShareForSecondaryItems` is non-zero. */
  zeroShareSecondaryItemIds: Set<string>
  /** Item IDs whose raw name is in `AUTO_REINTEGRATE_SECONDARY_ITEM_NAMES`
   * (e.g. Barrel). Consumed by `computeReintegratedProductIds` so a non-primary
   * container product defaults to reintegrated (credited against recipe cost). */
  autoReintegrateSecondaryItemIds: Set<string>
}

export interface RecipeBuildState {
  userRecipesById: Map<string, { recipeId: string; roundFactor: number }>
  userSkillsBySkillId: Map<string, { level: number }>
  userTalentsByTalentId: Map<string, { enabled: boolean; level: number }>
  userCraftingTablesByCTId: Map<string, { moduleIds: string[]; costPerMinute: number }>
  userProductSharesByUserRecipeId: Map<string, Map<string, number>>
  /** Explicit per-product reintegration overrides, keyed by userRecipeId then
   * productItemOrTagId. Absence of an item key means "use the default rule"
   * (see `computeReintegratedProductIds`). */
  userReintegratedProductsByUserRecipeId: Map<string, Map<string, boolean>>
  /** Build-level config: % of recipe cost split among non-zero secondaries
   * by default. See `computeAutoShares` in `src/lib/share-defaults.ts`. */
  defaultShareForSecondaryItems: number
}

// Without these indexes the per-recipe loop is O(N_userRecipes ×
// (N_talents + N_modifiers + N_recipeElements)), which on a full Eco
// dataset (1367 recipes, ~4000 elements, thousands of modifiers) costs
// ~1 second per mutation. With indexes it's O(N_total + N_userRecipes × k).
export function buildRecipeIndexes(gameDataStore: Store): RecipeIndexes {
  // Skill name → row id. Used below to resolve the skill reference encoded
  // in a Module modifier's refName (e.g. "PotterySkill") to an id we can
  // match against the plugin module's own `skillId` binding.
  const skillIdByName = new Map<string, string>()
  for (const sId of gameDataStore.getRowIds('skills')) {
    const s = gameDataStore.getRow('skills', sId)
    skillIdByName.set(s.name as string, sId)
  }

  // modifiers grouped by targetId (targetType is kept alongside so callers can
  // filter by target scope — targetIds are unique per scope but callers still
  // need the scope tag).
  const modifiersByTarget = new Map<string, Array<{ targetType: string; mod: SolverModifier }>>()
  for (const mId of gameDataStore.getRowIds('modifiers')) {
    const m = gameDataStore.getRow('modifiers', mId)
    const targetId = m.targetId as string
    let list = modifiersByTarget.get(targetId)
    if (!list) {
      list = []
      modifiersByTarget.set(targetId, list)
    }
    const dynamicType = m.dynamicType as SolverModifier['dynamicType']
    const refName = m.refName as string
    const mod: SolverModifier = { dynamicType, refName }
    // Attach resolved skillId for Module-type modifiers that reference a
    // skill by name. The resolver uses this to decide whether the plugin
    // module's skillPercent should apply.
    if (dynamicType === 'Module') {
      const skillId = skillIdByName.get(refName)
      if (skillId) mod.skillId = skillId
    }
    list.push({ targetType: m.targetType as string, mod })
  }
  const getModifiers = (targetType: string, targetId: string): SolverModifier[] => {
    const list = modifiersByTarget.get(targetId)
    if (!list) return []
    const out: SolverModifier[] = []
    for (const entry of list) {
      if (entry.targetType === targetType) out.push(entry.mod)
    }
    return out
  }

  const elementsByRecipeId = new Map<string, Array<{ id: string; row: Record<string, unknown> }>>()
  for (const reId of gameDataStore.getRowIds('recipeElements')) {
    const re = gameDataStore.getRow('recipeElements', reId) as Record<string, unknown>
    const recipeId = re.recipeId as string
    let list = elementsByRecipeId.get(recipeId)
    if (!list) {
      list = []
      elementsByRecipeId.set(recipeId, list)
    }
    list.push({ id: reId, row: re })
  }

  const talentsBySkillId = new Map<string, TalentIndexEntry[]>()
  for (const tId of gameDataStore.getRowIds('talents')) {
    const t = gameDataStore.getRow('talents', tId)
    const skillId = t.skillId as string
    let list = talentsBySkillId.get(skillId)
    if (!list) {
      list = []
      talentsBySkillId.set(skillId, list)
    }
    list.push({
      id: tId,
      name: t.name as string,
      value: t.value as number,
      isLevelable: (t.isLevelable as boolean) ?? false,
    })
  }

  // talentBonuses grouped by talentId — used for bonus-system talents whose
  // per-bonus modifiers (refName "TalentName:bonusIndex") each contribute a
  // distinct SolverTalent with a pre-computed, level-aware effective value.
  const bonusesByTalentId = new Map<string, BonusEntry[]>()
  for (const bId of gameDataStore.getRowIds('talentBonuses')) {
    const b = gameDataStore.getRow('talentBonuses', bId)
    const tid = b.talentId as string
    let list = bonusesByTalentId.get(tid)
    if (!list) {
      list = []
      bonusesByTalentId.set(tid, list)
    }
    list.push({
      bonusIndex: b.bonusIndex as number,
      effectType: b.effectType as string,
      value: b.value as number,
      cap: b.cap as number,
    })
  }

  const computeEffectiveValue = (b: BonusEntry, level: number): number => {
    if (b.effectType === 'CappedMultiplicative') {
      if (level <= 0) return 1
      const raw = Math.pow(b.value, level)
      if (b.value < 1) return Math.max(raw, b.cap)
      if (b.value > 1) return Math.min(raw, b.cap)
      return 1
    }
    // Multiplicative / other non-levelable effects use the raw Value.
    return b.value
  }

  // Skill rows cached by id (laborReducePercent is JSON-parsed once here).
  const skillCache = new Map<string, { laborReducePercent: number[] }>()
  const getSkill = (skillId: string): { laborReducePercent: number[] } | null => {
    let cached = skillCache.get(skillId)
    if (cached) return cached
    const row = gameDataStore.getRow('skills', skillId)
    if (!row) return null
    cached = {
      laborReducePercent: JSON.parse(row.laborReducePercent as string) as number[],
    }
    skillCache.set(skillId, cached)
    return cached
  }

  // Module bonuses, bucketed by module. Built once per dataset rather than
  // re-scanned per recipe: a recipe's table can hold up to four modules and a
  // build can have hundreds of recipes.
  const moduleBonusesByModuleId = new Map<string, SolverModuleEffect[]>()
  for (const bId of gameDataStore.getRowIds('pluginModuleBonuses')) {
    const b = gameDataStore.getRow('pluginModuleBonuses', bId)
    const moduleId = b.pluginModuleId as string
    let list = moduleBonusesByModuleId.get(moduleId)
    if (!list) {
      list = []
      moduleBonusesByModuleId.set(moduleId, list)
    }
    list.push({
      moduleId,
      action: b.action as SolverModuleEffect['action'],
      effectType: b.effectType as SolverModuleEffect['effectType'],
      value: b.value as number,
      skillIds: JSON.parse((b.skillIds as string) || '[]') as string[],
    })
  }

  const zeroShareSecondaryItemIds = new Set<string>()
  const autoReintegrateSecondaryItemIds = new Set<string>()
  for (const itemId of gameDataStore.getRowIds('items')) {
    const name = gameDataStore.getCell('items', itemId, 'name') as string | undefined
    if (!name) continue
    if (ZERO_SHARE_SECONDARY_ITEM_NAMES.has(name)) zeroShareSecondaryItemIds.add(itemId)
    if (AUTO_REINTEGRATE_SECONDARY_ITEM_NAMES.has(name)) autoReintegrateSecondaryItemIds.add(itemId)
  }

  return {
    modifiersByTarget,
    elementsByRecipeId,
    talentsBySkillId,
    bonusesByTalentId,
    getSkill,
    getModifiers,
    computeEffectiveValue,
    moduleBonusesByModuleId,
    zeroShareSecondaryItemIds,
    autoReintegrateSecondaryItemIds,
  }
}

export function buildRecipeBuildState(buildStore: Store, buildId: string): RecipeBuildState {
  const userRecipesById = new Map<string, { recipeId: string; roundFactor: number }>()
  for (const urId of buildStore.getRowIds('userRecipes')) {
    const ur = buildStore.getRow('userRecipes', urId)
    if (ur.buildId !== buildId) continue
    userRecipesById.set(urId, {
      recipeId: ur.recipeId as string,
      roundFactor: ur.roundFactor as number,
    })
  }

  const userSkillsBySkillId = new Map<string, { level: number }>()
  for (const rowId of buildStore.getRowIds('userSkills')) {
    const row = buildStore.getRow('userSkills', rowId)
    if (row.buildId !== buildId) continue
    userSkillsBySkillId.set(row.skillId as string, { level: row.level as number })
  }

  // Level 0 on a levelable talent behaves as disabled.
  const userTalentsByTalentId = new Map<string, { enabled: boolean; level: number }>()
  for (const rowId of buildStore.getRowIds('userTalents')) {
    const row = buildStore.getRow('userTalents', rowId)
    if (row.buildId !== buildId) continue
    userTalentsByTalentId.set(row.talentId as string, {
      enabled: row.enabled as boolean,
      level: (row.talentLevel as number) ?? 0,
    })
  }

  const userCraftingTablesByCTId = new Map<string, { moduleIds: string[]; costPerMinute: number }>()
  for (const rowId of buildStore.getRowIds('userCraftingTables')) {
    const row = buildStore.getRow('userCraftingTables', rowId)
    if (row.buildId !== buildId) continue
    // Up to four slots. A legacy build only ever fills Specialty, so this
    // collapses to the single-module behaviour it had before v14.
    const moduleIds: string[] = []
    for (const cell of MODULE_SLOT_CELL_LIST) {
      const id = row[cell] as string
      if (id) moduleIds.push(id)
    }
    userCraftingTablesByCTId.set(row.craftingTableId as string, {
      moduleIds,
      costPerMinute: row.costPerMinute as number,
    })
  }

  // Absence of a userRecipeId key means "no user override — fall back to the
  // build's auto-default split (see `computeAutoShares`)".
  const userProductSharesByUserRecipeId = new Map<string, Map<string, number>>()
  for (const upsId of buildStore.getRowIds('userProductShares')) {
    const ups = buildStore.getRow('userProductShares', upsId)
    if (ups.buildId !== buildId) continue
    const urId = ups.userRecipeId as string
    let inner = userProductSharesByUserRecipeId.get(urId)
    if (!inner) {
      inner = new Map()
      userProductSharesByUserRecipeId.set(urId, inner)
    }
    inner.set(ups.productItemOrTagId as string, ups.sharePercent as number)
  }

  const userReintegratedProductsByUserRecipeId = buildReintegrationOverrides(buildStore, buildId)

  let defaultShareForSecondaryItems = 20
  for (const rowId of buildStore.getRowIds('userSettings')) {
    const row = buildStore.getRow('userSettings', rowId)
    if (row.buildId !== buildId) continue
    defaultShareForSecondaryItems = (row.defaultShareForSecondaryItems as number) ?? 20
    break
  }

  return {
    userRecipesById,
    userSkillsBySkillId,
    userTalentsByTalentId,
    userCraftingTablesByCTId,
    userProductSharesByUserRecipeId,
    userReintegratedProductsByUserRecipeId,
    defaultShareForSecondaryItems,
  }
}

export function assembleSolverRecipe(
  gameDataStore: Store,
  recipeId: string,
  userRecipeId: string,
  roundFactor: number,
  datasetId: string,
  indexes: RecipeIndexes,
  buildState: RecipeBuildState
): SolverRecipe | null {
  const recipe = gameDataStore.getRow('recipes', recipeId)
  if (!recipe || recipe.datasetId !== datasetId) return null

  const skillId = recipe.skillId as string
  const skill = skillId ? indexes.getSkill(skillId) : null
  const userSkill = skillId ? buildState.userSkillsBySkillId.get(skillId) : null
  const laborReducePercent = skill ? skill.laborReducePercent : [1.0]

  // Active talents for this skill. Non-bonus talents emit one SolverTalent
  // keyed by talent name; bonus-system talents emit one per bonus, keyed
  // `TalentName:bonusIndex` to match the synthetic modifier refNames written
  // by the extraction script.
  const activeTalents: SolverRecipe['activeTalents'] = []
  if (skillId) {
    const skillTalents = indexes.talentsBySkillId.get(skillId)
    if (skillTalents) {
      for (const t of skillTalents) {
        const state = buildState.userTalentsByTalentId.get(t.id)
        if (!state) continue
        const bonuses = indexes.bonusesByTalentId.get(t.id)
        if (bonuses && bonuses.length > 0) {
          // Levelable talents are "off" when level is 0; non-levelable
          // bonus talents still use the enabled flag.
          const level = t.isLevelable ? state.level : state.enabled ? 1 : 0
          if (level <= 0) continue
          for (const b of bonuses) {
            activeTalents.push({
              name: `${t.name}:${b.bonusIndex}`,
              value: indexes.computeEffectiveValue(b, level),
            })
          }
        } else if (state.enabled) {
          activeTalents.push({ name: t.name, value: t.value })
        }
      }
    }
  }

  const ctId = recipe.craftingTableId as string
  const userCT = buildState.userCraftingTablesByCTId.get(ctId)
  // Every effect from every module installed on this recipe's table, emitted
  // UNFILTERED. Scope is resolved at apply time by `moduleFactor`, so the skill
  // ids must survive into the solver rather than being pre-filtered away here.
  const moduleEffects: SolverRecipe['moduleEffects'] = []
  for (const moduleId of userCT?.moduleIds ?? []) {
    for (const bonus of indexes.moduleBonusesByModuleId.get(moduleId) ?? []) {
      moduleEffects.push(bonus)
    }
  }

  // Elements. We also collect ingredient item/tag IDs and the products in
  // recipeElement `index` order so `computeReintegratedProductIds` can decide
  // which products are reintegrated (their value is subtracted from the
  // recipe's total cost in solver.ts rather than priced as a co-product).
  const ingredients: SolverRecipe['ingredients'] = []
  const products: SolverRecipe['products'] = []
  const ingredientItemIds = new Set<string>()
  const productOrder: { itemOrTagId: string; index: number }[] = []

  const elems = indexes.elementsByRecipeId.get(recipeId)
  if (elems) {
    for (const { id: reId, row: re } of elems) {
      const elemMods = indexes.getModifiers('elementQuantity', reId)
      const itemOrTagId = re.itemOrTagId as string
      if (re.isProduct) {
        products.push({
          itemOrTagId,
          baseQuantity: re.baseQuantity as number,
          share: 0,
          isReintegrated: false,
          modifiers: elemMods,
        })
        productOrder.push({ itemOrTagId, index: (re.index as number) ?? 0 })
      } else {
        ingredientItemIds.add(itemOrTagId)
        ingredients.push({
          itemOrTagId,
          baseQuantity: re.baseQuantity as number,
          modifiers: elemMods,
        })
      }
    }
  }

  const orderedProductItemIds = productOrder
    .sort((a, b) => a.index - b.index)
    .map((p) => p.itemOrTagId)
  const reintegratedIds = computeReintegratedProductIds({
    orderedProductItemIds,
    ingredientItemIds,
    autoReintegrateSecondaryItemIds: indexes.autoReintegrateSecondaryItemIds,
    userOverrides: userRecipeId
      ? buildState.userReintegratedProductsByUserRecipeId.get(userRecipeId)
      : undefined,
  })
  for (const prod of products) {
    if (reintegratedIds.has(prod.itemOrTagId)) {
      prod.isReintegrated = true
    }
  }

  // Apply shares. Non-reintegrated products get either user-assigned
  // percentages (userProductShares rows, stored 0–100) or the build's
  // auto-default split (see `computeAutoShares`). Reintegrated products
  // always carry share=0 — they aren't in the priced output at all, just
  // deducted from cost.
  const userShares = userRecipeId
    ? buildState.userProductSharesByUserRecipeId.get(userRecipeId)
    : undefined
  if (userShares) {
    for (const prod of products) {
      if (prod.isReintegrated) continue
      const pct = userShares.get(prod.itemOrTagId) ?? 0
      prod.share = pct / 100
    }
  } else {
    const nonReintegratedIds: string[] = []
    for (const prod of products) {
      if (!prod.isReintegrated) nonReintegratedIds.push(prod.itemOrTagId)
    }
    const auto = computeAutoShares(
      nonReintegratedIds,
      indexes.zeroShareSecondaryItemIds,
      buildState.defaultShareForSecondaryItems
    )
    for (const prod of products) {
      if (prod.isReintegrated) continue
      prod.share = (auto.get(prod.itemOrTagId) ?? 0) / 100
    }
  }

  return {
    id: recipeId,
    skillId: skillId || undefined,
    skillLevel: userSkill?.level ?? 0,
    laborReducePercent,
    activeTalents,
    moduleEffects,
    baseCraftTime: recipe.baseCraftTime as number,
    baseLaborCost: recipe.baseLaborCost as number,
    costPerMinute: userCT?.costPerMinute ?? 0,
    roundFactor,
    ingredients,
    products,
    craftMinutesModifiers: indexes.getModifiers('craftMinutes', recipeId),
    laborModifiers: indexes.getModifiers('labor', recipeId),
  }
}

export function buildSolverSnapshot(
  gameDataStore: Store,
  buildStore: Store,
  buildId: string,
  datasetId: string
): SolverInput | null {
  const indexes = getGameDataIndexes(gameDataStore).recipeIndexes
  const buildState = buildRecipeBuildState(buildStore, buildId)

  // ---- Build-store side: partition remaining snapshot-only tables. ----

  let settings: Record<string, unknown> | null = null
  for (const rowId of buildStore.getRowIds('userSettings')) {
    const row = buildStore.getRow('userSettings', rowId)
    if (row.buildId === buildId) {
      settings = row
      break
    }
  }
  if (!settings) return null

  // userPrices → prices/overrides/primaryTagItems/primaryRecipeIds/priceModes
  const prices: Record<string, number> = {}
  const overrides: Record<string, number> = {}
  const primaryTagItems: Record<string, string> = {}
  const primaryRecipeIds: Record<string, string> = {}
  const priceModes: Record<string, PriceMode> = {}
  // Items the user has moved from Products to Materials. The solver must not
  // emit a candidate for these — their price comes from `overrides` instead,
  // so downstream recipes consume them at the user-set price.
  const excludedItems = new Set<string>()
  for (const rowId of buildStore.getRowIds('userPrices')) {
    const row = buildStore.getRow('userPrices', rowId)
    if (row.buildId !== buildId) continue
    const itemId = row.itemOrTagId as string
    // primaryItemId is polymorphic: itemId for tags, recipeId for multi-recipe
    // products. We populate both maps — the resolver only reads the one that
    // matches the context it's in, so stray entries are harmless.
    if (row.primaryItemId) {
      primaryTagItems[itemId] = row.primaryItemId as string
      primaryRecipeIds[itemId] = row.primaryItemId as string
    }
    const mode = (row.priceMode as PriceMode) || 'min'
    if (mode !== 'manual') priceModes[itemId] = mode
    if (row.isOverride && mode === 'manual') {
      excludedItems.add(itemId)
    }
    const price = row.price as number
    if (!price) continue
    // Non-manual modes ignore any stored `price` value — switching from
    // manual to min/max/avg/mirror must not leave the stale manual number
    // seeded into costPrices (the solver's short-circuit would return it
    // before ever consulting the mode).
    if (mode !== 'manual') continue
    if (row.isOverride) {
      overrides[itemId] = price
    } else {
      prices[itemId] = price
    }
  }

  const margins: Record<string, { name: string; percent: number }> = {}
  for (const rowId of buildStore.getRowIds('userMargins')) {
    const row = buildStore.getRow('userMargins', rowId)
    if (row.buildId !== buildId) continue
    margins[rowId] = { name: row.name as string, percent: row.percent as number }
  }

  // recipeMargins — use userRecipesById lookup instead of a store read per row
  const recipeMargins: Record<string, string> = {}
  for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
    const urm = buildStore.getRow('userRecipeMargins', urmId)
    if (urm.buildId !== buildId) continue
    const ur = buildState.userRecipesById.get(urm.userRecipeId as string)
    if (ur) recipeMargins[ur.recipeId] = urm.userMarginId as string
  }

  // productMargins keyed by productId; supersedes recipeMargins on the solver
  // side when a multi-recipe product's parent row sets its own margin.
  const productMargins: Record<string, string> = {}
  for (const upmId of buildStore.getRowIds('userProductMargins')) {
    const upm = buildStore.getRow('userProductMargins', upmId)
    if (upm.buildId !== buildId) continue
    productMargins[upm.itemOrTagId as string] = upm.userMarginId as string
  }

  // tagItems (game-data side — filter by datasetId once)
  const tagItems: Record<string, string[]> = {}
  for (const rowId of gameDataStore.getRowIds('tagItems')) {
    const row = gameDataStore.getRow('tagItems', rowId)
    if (row.datasetId !== datasetId) continue
    const tagId = row.tagId as string
    let list = tagItems[tagId]
    if (!list) {
      list = []
      tagItems[tagId] = list
    }
    list.push(row.itemId as string)
  }

  const recipes: SolverRecipe[] = []
  for (const [urId, ur] of buildState.userRecipesById) {
    const solverRecipe = assembleSolverRecipe(
      gameDataStore,
      ur.recipeId,
      urId,
      ur.roundFactor,
      datasetId,
      indexes,
      buildState
    )
    if (!solverRecipe) continue
    if (excludedItems.size > 0) {
      // Drop excluded items from the recipe's products so the solver doesn't
      // emit a candidate for them. Reintegrated entries stay (they're
      // ingredients accounted as cost credits, not sale candidates), and the
      // remaining products keep their original shares — the excluded item's
      // share is intentionally "lost" from the recipe's price attribution.
      solverRecipe.products = solverRecipe.products.filter(
        (p) => p.isReintegrated || !excludedItems.has(p.itemOrTagId)
      )
    }
    recipes.push(solverRecipe)
  }

  return {
    recipes,
    prices,
    overrides,
    settings: {
      marginType: settings.marginType as 'markup' | 'grossMargin',
      calorieCost: settings.calorieCost as number,
      applyMarginBetweenSkills: settings.applyMarginBetweenSkills as boolean,
    },
    margins,
    recipeMargins,
    productMargins,
    tagItems,
    primaryTagItems,
    primaryRecipeIds,
    priceModes,
  }
}

export function useSolverSnapshot() {
  const { gameDataStore, buildStore } = useStores()

  const buildSnapshot = useCallback(
    (buildId: string, datasetId: string): SolverInput | null =>
      buildSolverSnapshot(gameDataStore, buildStore, buildId, datasetId),
    [gameDataStore, buildStore]
  )

  return { buildSnapshot }
}
