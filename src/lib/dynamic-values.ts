import type { SolverModifier, SolverTalent, SolverPluginModule } from '@/types/solver'

export interface ModifierContext {
  skillLevel: number
  laborReducePercent: number[]
  activeTalents: SolverTalent[]
  pluginModule: SolverPluginModule | null
  speedPluginModule: SolverPluginModule | null
  recipeSkillId?: string
}

function getPluginModulePercent(module: SolverPluginModule, recipeSkillId?: string): number {
  if (recipeSkillId && module.skillId === recipeSkillId && module.skillPercent != null) {
    return module.skillPercent
  }
  return module.percent
}

export function resolveModifiers(modifiers: SolverModifier[], context: ModifierContext): number {
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
        if (module) {
          multiplier *= getPluginModulePercent(module, context.recipeSkillId)
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
