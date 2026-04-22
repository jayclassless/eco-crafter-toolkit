import type { Store } from 'tinybase'

import {
  assembleSolverRecipe,
  type RecipeBuildState,
  type RecipeIndexes,
} from '@/hooks/use-solver-snapshot'
import {
  applyRoundFactor,
  resolveModifiers,
  type ModifierContext,
  type ModifierTargetKind,
} from '@/lib/dynamic-values'
import type { SolverModifier, SolverRecipe } from '@/types/solver'

export type MetricKind = 'labor' | 'craftTime' | 'ingredients' | 'products'

export interface AppliedEffect {
  metric: MetricKind
  signedPercent: number
}

export type BonusIcon =
  | { kind: 'skill'; rawName: string }
  | { kind: 'talent'; talentGroupName: string }
  | { kind: 'module'; rawName: string }

export interface AppliedBonus {
  source: 'skill' | 'talent' | 'module'
  icon: BonusIcon
  displayName: string
  effects: AppliedEffect[]
}

export interface ResolvedRecipeModifiers {
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

/** Compact display: up to 2 decimals, trailing zeros trimmed. */
export function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
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
  getName: GetNameFn
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
    pluginModule: solverRecipe.pluginModule,
    speedPluginModule: solverRecipe.speedPluginModule,
  }

  const elementMultipliers = new Map<string, number>()
  const elementModifiedQuantities = new Map<string, number>()
  const elems = indexes.elementsByRecipeId.get(recipeId) ?? []
  for (const { id: reId, row: re } of elems) {
    const mods = indexes.getModifiers('elementQuantity', reId)
    const multiplier = resolveModifiers(mods, context, 'resource')
    elementMultipliers.set(reId, multiplier)
    const base = re.baseQuantity as number
    elementModifiedQuantities.set(reId, applyRoundFactor(base * multiplier, roundFactor))
  }

  const craftMultiplier = resolveModifiers(solverRecipe.craftMinutesModifiers, context, 'speed')
  const laborMultiplier = resolveModifiers(solverRecipe.laborModifiers, context, 'labor')

  const skillId = solverRecipe.skillId
  const recipeRow = gameDataStore.getRow('recipes', recipeId)
  const ctId = recipeRow?.craftingTableId as string | undefined
  const pluginModuleId = ctId ? buildState.userCraftingTablesByCTId.get(ctId)?.pluginModuleId : ''

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
        if (!pluginModuleId) return null
        const pmRow = gameDataStore.getRow('pluginModules', pluginModuleId)
        if (!pmRow) return null
        const key = 'module'
        let existing = groups.get(key)
        if (!existing) {
          const rawName = (pmRow.name as string) || ''
          const localizedName = getName('pluginModule', pluginModuleId)
          existing = {
            source: 'module',
            displayName: localizedName || rawName,
            icon: { kind: 'module', rawName },
            modsByMetric: new Map(),
          }
          groups.set(key, existing)
        }
        return existing
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
      const multiplier = resolveModifiers(uniqueMods, context, metricToTargetKind(metric))
      const signedPercent = toSignedPercent(multiplier)
      if (signedPercent === 0) continue
      effects.push({ metric, signedPercent })
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
  bonuses.sort((a, b) => {
    const orderDiff = BONUS_ORDER.indexOf(a.source) - BONUS_ORDER.indexOf(b.source)
    if (orderDiff !== 0) return orderDiff
    return a.displayName.localeCompare(b.displayName)
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
    modifiedCraftTime: solverRecipe.baseCraftTime * craftMultiplier,
    modifiedLaborCost: solverRecipe.baseLaborCost * laborMultiplier,
    bonuses,
  }
}
