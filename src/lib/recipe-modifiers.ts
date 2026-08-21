import type { Store } from 'tinybase'

import {
  assembleSolverRecipe,
  type RecipeBuildState,
  type RecipeIndexes,
} from '@/hooks/use-solver-snapshot'
import type { Compare } from '@/lib/collator'
import {
  applyModifierEffect,
  applyRoundFactor,
  moduleFactor,
  resolveModifiers,
  type ModifierContext,
  type ModifierTargetKind,
} from '@/lib/dynamic-values'
import { MODULE_SLOT_ORDER } from '@/lib/module-slots'
import type { ModuleSlot } from '@/lib/normalize-module-bonuses'
import type { SolverModifier, SolverRecipe } from '@/types/solver'

type MetricKind = 'labor' | 'craftTime' | 'ingredients' | 'products'

export interface AppliedEffect {
  metric: MetricKind
  /** The multiplicative part, as a signed percentage (-10 = a 10% reduction). */
  signedPercent: number
  /** The additive part, as a flat signed delta in the metric's own units —
   * "+1 products" for Mineral Baking. A bonus carrying both parts emits two
   * entries for the metric, one of each kind, because a flat delta has no
   * base-independent percentage. When this is set, `signedPercent` is 0. */
  signedDelta?: number
}

type BonusIcon =
  | { kind: 'skill'; rawName: string }
  | { kind: 'talent'; talentGroupName: string }
  | { kind: 'module'; rawName: string }

export interface AppliedBonus {
  source: 'skill' | 'talent' | 'module'
  icon: BonusIcon
  displayName: string
  effects: AppliedEffect[]
  /** The crafting-table slot a module occupies. Only set for module bonuses;
   * drives their display order so this list matches the module icons shown
   * next to the table. */
  slot?: ModuleSlot
}

interface ResolvedRecipeModifiers {
  solverRecipe: SolverRecipe
  context: ModifierContext
  /** Per-element multiplier (raw, pre-rounding), keyed by recipeElement row id. */
  elementMultipliers: Map<string, number>
  /** Final modified quantity (signed, rounded per recipe.roundFactor). */
  elementModifiedQuantities: Map<string, number>
  craftMultiplier: number
  laborMultiplier: number
  baseCraftTime: number
  baseLaborCost: number
  modifiedCraftTime: number
  modifiedLaborCost: number
  bonuses: AppliedBonus[]
}

export type GetNameFn = (entityType: string, entityId: string) => string

const BONUS_ORDER: AppliedBonus['source'][] = ['skill', 'talent', 'module']
const EFFECT_ORDER: MetricKind[] = ['labor', 'craftTime', 'ingredients', 'products']

function toSignedPercent(multiplier: number): number {
  return Math.round((multiplier - 1) * 1000) / 10
}

function metricToTargetKind(metric: MetricKind): ModifierTargetKind {
  if (metric === 'craftTime') return 'speed'
  if (metric === 'labor') return 'labor'
  return 'resource'
}

interface SourceGroup {
  source: AppliedBonus['source']
  displayName: string
  icon: BonusIcon
  modsByMetric: Map<MetricKind, SolverModifier[]>
}

export function resolveRecipeModifiers(
  gameDataStore: Store,
  recipeId: string,
  userRecipeId: string,
  roundFactor: number,
  datasetId: string,
  indexes: RecipeIndexes,
  buildState: RecipeBuildState,
  getName: GetNameFn,
  compare: Compare
): ResolvedRecipeModifiers | null {
  const solverRecipe = assembleSolverRecipe(
    gameDataStore,
    recipeId,
    userRecipeId,
    roundFactor,
    datasetId,
    indexes,
    buildState
  )
  if (!solverRecipe) return null

  const context: ModifierContext = {
    skillLevel: solverRecipe.skillLevel,
    laborReducePercent: solverRecipe.laborReducePercent,
    activeTalents: solverRecipe.activeTalents,
    moduleEffects: solverRecipe.moduleEffects,
  }

  const elementMultipliers = new Map<string, number>()
  const elementModifiedQuantities = new Map<string, number>()
  const elems = indexes.elementsByRecipeId.get(recipeId) ?? []
  for (const { id: reId, row: re } of elems) {
    const mods = indexes.getModifiers('elementQuantity', reId)
    const effect = resolveModifiers(mods, context, 'resource')
    elementMultipliers.set(reId, effect.multiplier)
    const base = re.baseQuantity as number
    elementModifiedQuantities.set(
      reId,
      applyRoundFactor(applyModifierEffect(base, effect), roundFactor)
    )
  }

  const craftEffect = resolveModifiers(solverRecipe.craftMinutesModifiers, context, 'speed')
  const craftMultiplier = craftEffect.multiplier
  // Labor mirrors solver.ts: the module factor is applied at the RECIPE level
  // (Rule A, scoped against the recipe's skill), because no dataset version
  // emits a `Module` modifier on a recipe's Labor value.
  const laborEffect = resolveModifiers(solverRecipe.laborModifiers, context, 'labor')
  const laborModuleFactor = moduleFactor(solverRecipe.moduleEffects, 'labor', solverRecipe.skillId)
  const laborMultiplier = laborEffect.multiplier * laborModuleFactor

  const skillId = solverRecipe.skillId
  const recipeRow = gameDataStore.getRow('recipes', recipeId)
  const ctId = recipeRow?.craftingTableId as string | undefined
  const installedModuleIds = ctId
    ? (buildState.userCraftingTablesByCTId.get(ctId)?.moduleIds ?? [])
    : []

  const groups = new Map<string, SourceGroup>()

  const getOrMakeGroup = (mod: SolverModifier): SourceGroup | null => {
    switch (mod.dynamicType) {
      case 'Skill': {
        if (!skillId) return null
        const key = 'skill'
        let existing = groups.get(key)
        if (!existing) {
          const skillRow = gameDataStore.getRow('skills', skillId)
          const rawName = (skillRow?.name as string) || ''
          const localizedName = getName('skill', skillId)
          const baseName = localizedName || rawName
          existing = {
            source: 'skill',
            displayName: `${baseName} (Level ${solverRecipe.skillLevel})`,
            icon: { kind: 'skill', rawName },
            modsByMetric: new Map(),
          }
          groups.set(key, existing)
        }
        return existing
      }
      case 'Module': {
        // Module groups are built separately, from `moduleEffects` — a table can
        // hold up to four modules, so one modifier no longer maps to one group.
        // The `Module` modifier now only marks a value as module-ELIGIBLE (and
        // carries the skill that eligibility is scoped under); see moduleFactor.
        return null
      }
      case 'Talent': {
        if (!skillId) return null
        // Skip if this specific refName isn't in activeTalents (disabled talent).
        if (!solverRecipe.activeTalents.some((at) => at.name === mod.refName)) return null
        const parentName = mod.refName.includes(':')
          ? mod.refName.substring(0, mod.refName.indexOf(':'))
          : mod.refName
        const skillTalents = indexes.talentsBySkillId.get(skillId)
        const parent = skillTalents?.find((t) => t.name === parentName)
        if (!parent) return null
        const key = `talent:${parent.id}`
        let existing = groups.get(key)
        if (!existing) {
          const talentRow = gameDataStore.getRow('talents', parent.id)
          const rawGroupName = (talentRow?.talentGroupName as string) || ''
          const localizedName = getName('talent', parent.id)
          const baseName = localizedName || parent.name
          const level = buildState.userTalentsByTalentId.get(parent.id)?.level ?? 0
          const displayName = parent.isLevelable ? `${baseName} (Level ${level})` : baseName
          existing = {
            source: 'talent',
            displayName,
            icon: { kind: 'talent', talentGroupName: rawGroupName },
            modsByMetric: new Map(),
          }
          groups.set(key, existing)
        }
        return existing
      }
    }
  }

  const addMod = (mod: SolverModifier, metric: MetricKind) => {
    const group = getOrMakeGroup(mod)
    if (!group) return
    let list = group.modsByMetric.get(metric)
    if (!list) {
      list = []
      group.modsByMetric.set(metric, list)
    }
    list.push(mod)
  }

  for (const { id: reId, row: re } of elems) {
    const metric: MetricKind = (re.isProduct as boolean) ? 'products' : 'ingredients'
    for (const mod of indexes.getModifiers('elementQuantity', reId)) {
      addMod(mod, metric)
    }
  }
  for (const mod of solverRecipe.craftMinutesModifiers) addMod(mod, 'craftTime')
  for (const mod of solverRecipe.laborModifiers) addMod(mod, 'labor')

  const bonuses: AppliedBonus[] = []
  for (const group of groups.values()) {
    const effects: AppliedEffect[] = []
    for (const [metric, mods] of group.modsByMetric) {
      // Dedupe by refName so a talent/module modifier hitting multiple elements
      // contributes its multiplier once (modules and skills deduplicate to one;
      // talents dedupe per synthetic refName — "Name:0" and "Name:1" stay
      // distinct because they can have different per-bonus values).
      const seen = new Set<string>()
      const uniqueMods: SolverModifier[] = []
      for (const m of mods) {
        if (!seen.has(m.refName)) {
          seen.add(m.refName)
          uniqueMods.push(m)
        }
      }
      const effect = resolveModifiers(uniqueMods, context, metricToTargetKind(metric))
      const signedPercent = toSignedPercent(effect.multiplier)
      if (signedPercent !== 0) effects.push({ metric, signedPercent })
      // A flat delta has no base-independent percentage (Mineral Baking's +1 is
      // +100% on a base of 1 but +25% on a base of 4), so it gets its own entry
      // rather than being folded into `signedPercent`. The game shows these the
      // same way: a signed count for a flat bonus, a percentage for a scaling
      // one.
      if (effect.addend !== 0)
        effects.push({ metric, signedPercent: 0, signedDelta: effect.addend })
    }
    if (effects.length === 0) continue
    effects.sort((a, b) => EFFECT_ORDER.indexOf(a.metric) - EFFECT_ORDER.indexOf(b.metric))
    bonuses.push({
      source: group.source,
      icon: group.icon,
      displayName: group.displayName,
      effects,
    })
  }
  // ---- Module groups -------------------------------------------------------
  //
  // Built from `moduleEffects` rather than from modifiers, one group per
  // installed module. Crucially this calls the SAME `moduleFactor` the solver
  // calls — these are separate code paths and nothing else forces them to agree,
  // so a reimplementation here would drift silently (the display would show one
  // discount while prices used another). A cross-path test pins that.
  //
  // Scope mirrors the solver exactly: ingredients/products/craftTime use the
  // skill on that metric's `Module` modifier (Rule B); labor uses the recipe's
  // skill (Rule A). A metric with no `Module` modifier is not module-eligible at
  // all and is skipped — that is what keeps static ingredients undiscounted.
  const moduleScope = (mods: SolverModifier[]): { eligible: boolean; skillId?: string } => {
    for (const m of mods) {
      if (m.dynamicType === 'Module') return { eligible: true, skillId: m.skillId }
    }
    return { eligible: false }
  }
  const ingredientMods: SolverModifier[] = []
  const productMods: SolverModifier[] = []
  for (const { id: reId, row: re } of elems) {
    const target = (re.isProduct as boolean) ? productMods : ingredientMods
    target.push(...indexes.getModifiers('elementQuantity', reId))
  }
  const scopeByMetric: Record<MetricKind, { eligible: boolean; skillId?: string }> = {
    ingredients: moduleScope(ingredientMods),
    products: moduleScope(productMods),
    craftTime: moduleScope(solverRecipe.craftMinutesModifiers),
    // Labor is always eligible and never carries a Module modifier.
    labor: { eligible: true, skillId: solverRecipe.skillId },
  }

  for (const moduleId of installedModuleIds) {
    const pmRow = gameDataStore.getRow('pluginModules', moduleId)
    if (!pmRow?.name) continue
    const own = solverRecipe.moduleEffects.filter((e) => e.moduleId === moduleId)
    if (own.length === 0) continue

    const effects: AppliedEffect[] = []
    for (const metric of EFFECT_ORDER) {
      const scope = scopeByMetric[metric]
      if (!scope.eligible) continue
      const factor = moduleFactor(own, metricToTargetKind(metric), scope.skillId)
      const signedPercent = toSignedPercent(factor)
      if (signedPercent === 0) continue
      effects.push({ metric, signedPercent })
    }
    if (effects.length === 0) continue

    const rawName = (pmRow.name as string) || ''
    bonuses.push({
      source: 'module',
      icon: { kind: 'module', rawName },
      displayName: getName('pluginModule', moduleId) || rawName,
      effects,
      slot: (pmRow.slot as ModuleSlot) ?? 'Specialty',
    })
  }

  bonuses.sort((a, b) => {
    const orderDiff = BONUS_ORDER.indexOf(a.source) - BONUS_ORDER.indexOf(b.source)
    if (orderDiff !== 0) return orderDiff
    // Module bonuses follow the crafting-table slot order (Basic → Advanced →
    // Modern → Specialty) so this list matches the module icons shown next to
    // the table. Skills and talents fall back to alphabetical.
    if (a.source === 'module' && b.source === 'module') {
      const slotDiff =
        MODULE_SLOT_ORDER.indexOf(a.slot ?? 'Specialty') -
        MODULE_SLOT_ORDER.indexOf(b.slot ?? 'Specialty')
      if (slotDiff !== 0) return slotDiff
    }
    return compare(a.displayName, b.displayName)
  })

  return {
    solverRecipe,
    context,
    elementMultipliers,
    elementModifiedQuantities,
    craftMultiplier,
    laborMultiplier,
    baseCraftTime: solverRecipe.baseCraftTime,
    baseLaborCost: solverRecipe.baseLaborCost,
    // Mirrors solver.ts `prepareRecipe`: multiplicative effects (the module
    // factor included) fold into the base first, then the additive channel.
    modifiedCraftTime: applyModifierEffect(solverRecipe.baseCraftTime, craftEffect),
    modifiedLaborCost: applyModifierEffect(
      solverRecipe.baseLaborCost * laborModuleFactor,
      laborEffect
    ),
    bonuses,
  }
}
