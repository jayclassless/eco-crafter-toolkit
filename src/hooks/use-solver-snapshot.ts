import { useCallback } from 'react'
import type { Store } from 'tinybase'

import { useStores } from '@/stores/providers'
import type { PriceMode, SolverInput, SolverRecipe, SolverModifier } from '@/types/solver'

export function buildSolverSnapshot(
  gameDataStore: Store,
  buildStore: Store,
  buildId: string,
  datasetId: string
): SolverInput | null {
  // ---- Build single-pass indexes over the game data store. ----
  // Without these indexes the per-recipe loop below is O(N_userRecipes ×
  // (N_talents + N_modifiers + N_recipeElements)), which on a full Eco
  // dataset (1367 recipes, ~4000 elements, thousands of modifiers) costs
  // ~1 second per mutation. With indexes it's O(N_total + N_userRecipes × k).

  // modifiers grouped by targetId (the targetType can be resolved from the
  // per-modifier row; we index by targetId alone since targetIds are unique
  // per target scope).
  const modifiersByTarget = new Map<string, Array<{ targetType: string; mod: SolverModifier }>>()
  for (const mId of gameDataStore.getRowIds('modifiers')) {
    const m = gameDataStore.getRow('modifiers', mId)
    const targetId = m.targetId as string
    let list = modifiersByTarget.get(targetId)
    if (!list) {
      list = []
      modifiersByTarget.set(targetId, list)
    }
    list.push({
      targetType: m.targetType as string,
      mod: {
        dynamicType: m.dynamicType as SolverModifier['dynamicType'],
        refName: m.refName as string,
      },
    })
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

  // recipeElements grouped by recipeId
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

  // talents grouped by skillId
  interface TalentIndexEntry {
    id: string
    name: string
    value: number
    isLevelable: boolean
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
  interface BonusEntry {
    bonusIndex: number
    effectType: string
    value: number
    cap: number
  }
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

  // ---- Build-store side: partition every row by buildId in one pass per table. ----

  // Get settings
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

  // margins
  const margins: Record<string, { name: string; percent: number }> = {}
  for (const rowId of buildStore.getRowIds('userMargins')) {
    const row = buildStore.getRow('userMargins', rowId)
    if (row.buildId !== buildId) continue
    margins[rowId] = { name: row.name as string, percent: row.percent as number }
  }

  // userRecipes indexed by id (used for both recipeMargins lookup and main loop)
  const userRecipesById = new Map<string, { recipeId: string; roundFactor: number }>()
  for (const urId of buildStore.getRowIds('userRecipes')) {
    const ur = buildStore.getRow('userRecipes', urId)
    if (ur.buildId !== buildId) continue
    userRecipesById.set(urId, {
      recipeId: ur.recipeId as string,
      roundFactor: ur.roundFactor as number,
    })
  }

  // recipeMargins — use userRecipesById lookup instead of a store read per row
  const recipeMargins: Record<string, string> = {}
  for (const urmId of buildStore.getRowIds('userRecipeMargins')) {
    const urm = buildStore.getRow('userRecipeMargins', urmId)
    if (urm.buildId !== buildId) continue
    const ur = userRecipesById.get(urm.userRecipeId as string)
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

  // userProductShares keyed by userRecipeId → Map<productItemOrTagId, sharePercent>.
  // Absence of a userRecipeId key means "no user override — use the default split
  // (primary product = 1.0, others = 0)".
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

  // userSkills by skillId
  const userSkillsBySkillId = new Map<string, { level: number }>()
  for (const rowId of buildStore.getRowIds('userSkills')) {
    const row = buildStore.getRow('userSkills', rowId)
    if (row.buildId !== buildId) continue
    userSkillsBySkillId.set(row.skillId as string, { level: row.level as number })
  }

  // userTalents by talentId — carries both enabled + chosen level. Level 0 on
  // a levelable talent behaves as disabled.
  const userTalentsByTalentId = new Map<string, { enabled: boolean; level: number }>()
  for (const rowId of buildStore.getRowIds('userTalents')) {
    const row = buildStore.getRow('userTalents', rowId)
    if (row.buildId !== buildId) continue
    userTalentsByTalentId.set(row.talentId as string, {
      enabled: row.enabled as boolean,
      level: (row.talentLevel as number) ?? 0,
    })
  }

  // userCraftingTables by craftingTableId
  const userCraftingTablesByCTId = new Map<
    string,
    { pluginModuleId: string; costPerMinute: number }
  >()
  for (const rowId of buildStore.getRowIds('userCraftingTables')) {
    const row = buildStore.getRow('userCraftingTables', rowId)
    if (row.buildId !== buildId) continue
    userCraftingTablesByCTId.set(row.craftingTableId as string, {
      pluginModuleId: row.pluginModuleId as string,
      costPerMinute: row.costPerMinute as number,
    })
  }

  // ---- Main per-recipe loop, now doing only O(k) work per recipe. ----
  const recipes: SolverRecipe[] = []

  for (const [urId, ur] of userRecipesById) {
    void urId
    const recipeId = ur.recipeId
    const recipe = gameDataStore.getRow('recipes', recipeId)
    if (!recipe || recipe.datasetId !== datasetId) continue

    const skillId = recipe.skillId as string
    const skill = skillId ? getSkill(skillId) : null
    const userSkill = skillId ? userSkillsBySkillId.get(skillId) : null
    const laborReducePercent = skill ? skill.laborReducePercent : [1.0]

    // Active talents for this skill (O(k_talents)). Non-bonus talents emit
    // one SolverTalent keyed by talent name; bonus-system talents emit one
    // per bonus, keyed `TalentName:bonusIndex` to match the synthetic
    // modifier refNames written by the extraction script.
    const activeTalents: SolverRecipe['activeTalents'] = []
    if (skillId) {
      const skillTalents = talentsBySkillId.get(skillId)
      if (skillTalents) {
        for (const t of skillTalents) {
          const state = userTalentsByTalentId.get(t.id)
          if (!state) continue
          const bonuses = bonusesByTalentId.get(t.id)
          if (bonuses && bonuses.length > 0) {
            // Levelable talents are "off" when level is 0; non-levelable
            // bonus talents still use the enabled flag.
            const level = t.isLevelable ? state.level : state.enabled ? 1 : 0
            if (level <= 0) continue
            for (const b of bonuses) {
              activeTalents.push({
                name: `${t.name}:${b.bonusIndex}`,
                value: computeEffectiveValue(b, level),
              })
            }
          } else if (state.enabled) {
            activeTalents.push({ name: t.name, value: t.value })
          }
        }
      }
    }

    // Plugin module for crafting table
    const ctId = recipe.craftingTableId as string
    const userCT = userCraftingTablesByCTId.get(ctId)
    let pluginModule: SolverRecipe['pluginModule'] = null
    if (userCT?.pluginModuleId) {
      const pm = gameDataStore.getRow('pluginModules', userCT.pluginModuleId)
      if (pm) {
        pluginModule = {
          percent: pm.percent as number,
          skillId: (pm.skillId as string) || undefined,
          skillPercent: (pm.skillPercent as number) || undefined,
        }
      }
    }

    // Elements (O(k_elements) via index). We also collect ingredient item/tag
    // IDs so products whose item is also consumed by this recipe (e.g. a
    // returned tool, reclaimed scrap) can be flagged isReintegrated and have
    // their value subtracted from the recipe's total cost in solver.ts.
    const ingredients: SolverRecipe['ingredients'] = []
    const products: SolverRecipe['products'] = []
    const ingredientItemIds = new Set<string>()

    const elems = elementsByRecipeId.get(recipeId)
    if (elems) {
      for (const { id: reId, row: re } of elems) {
        const elemMods = getModifiers('elementQuantity', reId)
        const itemOrTagId = re.itemOrTagId as string
        if (re.isProduct) {
          products.push({
            itemOrTagId,
            baseQuantity: re.baseQuantity as number,
            share: 0,
            isReintegrated: false,
            modifiers: elemMods,
          })
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

    // Mark products whose item is also an ingredient as reintegrated; the
    // solver subtracts their cost from the recipe total (see solver.ts:246).
    for (const prod of products) {
      if (ingredientItemIds.has(prod.itemOrTagId)) {
        prod.isReintegrated = true
      }
    }

    // Apply shares. Non-reintegrated products get either user-assigned
    // percentages (userProductShares rows, stored 0–100) or the default of
    // primary=1.0 (first non-reintegrated by recipeElement index) / others=0.
    // Reintegrated products always carry share=0 — they aren't in the priced
    // output at all, just deducted from cost.
    const userShares = userProductSharesByUserRecipeId.get(urId)
    let primaryAssigned = false
    for (const prod of products) {
      if (prod.isReintegrated) continue
      if (userShares) {
        const pct = userShares.get(prod.itemOrTagId) ?? 0
        prod.share = pct / 100
      } else if (!primaryAssigned) {
        prod.share = 1
        primaryAssigned = true
      } else {
        prod.share = 0
      }
    }

    recipes.push({
      id: recipeId,
      skillId: skillId || undefined,
      skillLevel: userSkill?.level ?? 0,
      laborReducePercent,
      activeTalents,
      pluginModule,
      speedPluginModule: null,
      baseCraftTime: recipe.baseCraftTime as number,
      baseLaborCost: recipe.baseLaborCost as number,
      costPerMinute: userCT?.costPerMinute ?? 0,
      roundFactor: ur.roundFactor,
      ingredients,
      products,
      craftMinutesModifiers: getModifiers('craftMinutes', recipeId),
      laborModifiers: getModifiers('labor', recipeId),
    })
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
