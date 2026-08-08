import type { SolverModifier, SolverTalent, SolverModuleEffect } from '@/types/solver'

export interface ModifierContext {
  skillLevel: number
  laborReducePercent: number[]
  activeTalents: SolverTalent[]
  /** Every effect from every module on this recipe's table, unfiltered. */
  moduleEffects: readonly SolverModuleEffect[]
}

/** What kind of value these modifiers target. Selects which module action
 * applies: ingredient/product quantities take `ResourceCost`, craft time takes
 * `CraftTime`, labor takes `LaborCost`. */
export type ModifierTargetKind = 'speed' | 'resource' | 'labor'

const ACTION_BY_TARGET = {
  speed: 'CraftTime',
  resource: 'ResourceCost',
  labor: 'LaborCost',
} as const

/**
 * Combine every installed module's effects on one action into a single factor.
 *
 * This one function reproduces both dataset versions:
 *
 * | case                                   | additive              | multiplicative       | factor    |
 * | -------------------------------------- | --------------------- | -------------------- | --------- |
 * | v14, three generic slots, ResourceCost | −0.10 −0.10 −0.15     | 1                    | ×0.65     |
 * | v14, three generic slots, LaborCost    | −0.05 −0.10 −0.10     | 1                    | ×0.75     |
 * | v14, three generic slots, CraftTime    | 0                     | 0.75 × 0.65 × 0.50   | ×0.24375  |
 * | v13, module skill matches              | 0                     | 0.75                 | ×0.75     |
 * | v13, module skill does not match       | 0                     | 0.80                 | ×0.80     |
 *
 * The first three rows are confirmed against a live v14 server (Icebox on a
 * Carpentry Table: 10 HewnLog → 6.5, 12 WoodBoard → 7.8, 60 cal → 45, 2min →
 * ~30s). Note ×0.65, NOT the ×0.6885 that multiplying the resource effects would
 * give — v14 resource and labor effects are ADDITIVE, craft time is
 * multiplicative.
 */
export function moduleFactor(
  effects: readonly SolverModuleEffect[],
  targetKind: ModifierTargetKind,
  scopeSkillId: string | undefined
): number {
  const action = ACTION_BY_TARGET[targetKind]

  // Group by module: the precedence rule below is per-module, not global.
  const byModule = new Map<string, SolverModuleEffect[]>()
  for (const e of effects) {
    if (e.action !== action) continue
    let list = byModule.get(e.moduleId)
    if (!list) {
      list = []
      byModule.set(e.moduleId, list)
    }
    list.push(e)
  }

  let additive = 0
  let multiplicative = 1
  for (const group of byModule.values()) {
    // Within ONE module, a scoped effect that matches supersedes the unscoped
    // ones rather than stacking with them.
    //
    // ⚠️ This looks like dead code if you only read v14 data — no v14 module
    // mixes scoped and unscoped effects for the same action, so the fallback
    // arm is always taken there. It is load-bearing on v11-v13, where 44 of 56
    // modules carry BOTH a general percent and an own-skill percent, and the
    // game's `getPluginModulePercent` returns the own-skill one INSTEAD of the
    // general one. Removing it would silently apply both to every legacy build.
    const scoped = group.filter(
      (e) => e.skillIds.length > 0 && scopeSkillId != null && e.skillIds.includes(scopeSkillId)
    )
    // When nothing matches the scope, fall back to the module's unscoped
    // effects — NOT to "no effect". Confirmed in-game: an unscoped module
    // discounts a skill-less recipe (Participation Trophy, whose ingredient is
    // tagged with the abstract `Skill` base type that no module binds to).
    // Turning this fallback into an early return would silently drop the
    // discount on every skill-less recipe.
    const chosen = scoped.length > 0 ? scoped : group.filter((e) => e.skillIds.length === 0)
    for (const e of chosen) {
      if (e.effectType === 'AdditivePercent') additive += e.value
      else multiplicative *= e.value
    }
  }

  return (1 + additive) * multiplicative
}

export function resolveModifiers(
  modifiers: SolverModifier[],
  context: ModifierContext,
  targetKind: ModifierTargetKind = 'resource'
): number {
  let multiplier = 1

  // `Module` modifiers are DEFERRED rather than multiplied inline. Their meaning
  // changed: a Module row no longer says "apply module.percent", it says "this
  // value is eligible for module effects, and here is the skill it is eligible
  // under". Applying `moduleFactor` per occurrence would double-count if an
  // element ever carried two Module modifiers, so we collect the scope and apply
  // the factor exactly once, after the loop.
  let hasModuleModifier = false
  let moduleScopeSkillId: string | undefined

  for (const mod of modifiers) {
    switch (mod.dynamicType) {
      case 'Skill': {
        const { skillLevel, laborReducePercent } = context
        // An empty table (skill parsed without a multiplicative strategy) or a
        // negative level would index out of bounds and yield `undefined`, which
        // turns `multiplier` into NaN — and NaN silently fails every downstream
        // convergence comparison, poisoning prices without surfacing an error.
        if (laborReducePercent.length === 0) break
        const level = Math.min(Math.max(skillLevel, 0), laborReducePercent.length - 1)
        const factor = laborReducePercent[level]
        if (factor != null) multiplier *= factor
        break
      }
      case 'Talent': {
        const talent = context.activeTalents.find((t) => t.name === mod.refName)
        if (talent) {
          multiplier *= talent.value
        }
        break
      }
      case 'Module': {
        if (!hasModuleModifier) {
          hasModuleModifier = true
          // Rule B — scope against the INGREDIENT's own skill, not the recipe's.
          // Every skill-form ingredient carries its own skill in the game files
          // (`IngredientElement(typeof(NailItem), 32, typeof(BlacksmithSkill))`),
          // and that skill survives here as the modifier's skillId. Rule B
          // preserves v13's numbers exactly and uses strictly more specific data.
          moduleScopeSkillId = mod.skillId
        }
        break
      }
    }
  }

  if (hasModuleModifier) {
    multiplier *= moduleFactor(context.moduleEffects, targetKind, moduleScopeSkillId)
  }

  return multiplier
}

export function applyRoundFactor(value: number, roundFactor: number): number {
  if (roundFactor === 0) return value

  if (value < 0) {
    return Math.floor(value * roundFactor) / roundFactor
  }
  return Math.ceil(value * roundFactor) / roundFactor
}
