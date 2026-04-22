import type { SolverModifier, SolverTalent, SolverPluginModule } from '@/types/solver'

export interface ModifierContext {
  skillLevel: number
  laborReducePercent: number[]
  activeTalents: SolverTalent[]
  pluginModule: SolverPluginModule | null
  speedPluginModule: SolverPluginModule | null
}

/** What kind of value these modifiers target. Drives plugin-module filtering:
 * a Resource-only module must not reduce craft time; a Speed-only module must
 * not reduce labor or ingredient/product quantity. */
export type ModifierTargetKind = 'speed' | 'resource' | 'labor'

function getPluginModulePercent(module: SolverPluginModule, modSkillId?: string): number {
  // skillPercent applies only when the modifier references the same skill
  // the module is bound to — not the recipe's skill. A craft-time modifier
  // for "PotterySkill" on a recipe that has no skill still uses skillPercent
  // if the user's module is pottery-bound.
  if (modSkillId && module.skillId === modSkillId && module.skillPercent != null) {
    return module.skillPercent
  }
  return module.percent
}

function moduleAppliesToTarget(
  module: SolverPluginModule,
  targetKind: ModifierTargetKind
): boolean {
  const t = module.pluginType ?? ''
  const hasResource = t.includes('Resource')
  const hasSpeed = t.includes('Speed')
  // Fallback when the type isn't categorized: apply (permissive, matches
  // pre-fix behavior for older data that lacks pluginType).
  if (!hasResource && !hasSpeed) return true
  if (targetKind === 'speed') return hasSpeed
  // resource & labor both require non-speed capability
  return hasResource
}

export function resolveModifiers(
  modifiers: SolverModifier[],
  context: ModifierContext,
  targetKind: ModifierTargetKind = 'resource'
): number {
  let multiplier = 1

  for (const mod of modifiers) {
    switch (mod.dynamicType) {
      case 'Skill': {
        const { skillLevel, laborReducePercent } = context
        const level = Math.min(skillLevel, laborReducePercent.length - 1)
        multiplier *= laborReducePercent[level]
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
        const module = context.pluginModule
        if (module && moduleAppliesToTarget(module, targetKind)) {
          multiplier *= getPluginModulePercent(module, mod.skillId)
        }
        break
      }
    }
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
